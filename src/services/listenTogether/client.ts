/**
 * Listen Together connection — a port of Echo Music's ListenTogetherClient:
 * one WebSocket to the room server, protobuf envelopes (codec.ts), a 25s ping, reconnect with
 * exponential backoff (1s → 2min, 15 tries) that resumes the room through the
 * session token, and a pending create/join that runs once the socket opens.
 *
 * It keeps room state in `listenTogetherStore` and hands playback events to
 * whoever subscribes (sync.ts drives the player from them).
 */
import { AppState } from 'react-native';
import { fetchJson } from '../net/fetchWithTimeout';
import { decodeFrame, encodeFrame } from './codec';
import { isServerUrl, useListenTogetherStore } from '../../store/listenTogetherStore';
import {
  BufferCompletePayload,
  BufferWaitPayload,
  ErrorPayload,
  HostChangedPayload,
  JoinApprovedPayload,
  JoinRejectedPayload,
  JoinRequestPayload,
  KickedPayload,
  MessageTypes,
  PlaybackActionPayload,
  PlaybackActions,
  ReconnectedPayload,
  RoomCreatedPayload,
  RoomSettingsPayload,
  SuggestionReceivedPayload,
  SyncStatePayload,
  UserPayload,
} from './protocol';

// Echo reads the live server from its repo, falling back to Metrolist's.
const SERVER_JSON_URL = 'https://raw.githubusercontent.com/EchoMusicApp/Echo-Music/refs/heads/main/app/server.json';
const FALLBACK_SERVER = 'wss://metroserverx.meowery.eu/ws';

const MAX_RECONNECT_ATTEMPTS = 15;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 120_000;
const PING_INTERVAL_MS = 25_000;
/** A saved session older than this is not worth resuming (Echo: 10 min). */
const SESSION_GRACE_PERIOD_MS = 10 * 60 * 1000;

export type ListenTogetherEvent =
  | { kind: 'room_created'; roomCode: string }
  | { kind: 'join_approved'; payload: JoinApprovedPayload }
  | { kind: 'reconnected'; payload: ReconnectedPayload }
  | { kind: 'playback'; payload: PlaybackActionPayload }
  | { kind: 'sync_state'; payload: SyncStatePayload }
  | { kind: 'buffer_complete'; trackId: string }
  | { kind: 'user_joined'; userId: string; username: string }
  | { kind: 'host_changed'; newHostId: string }
  | { kind: 'room_settings_changed' }
  | { kind: 'left' };

type Listener = (event: ListenTogetherEvent) => void;

const listeners = new Set<Listener>();
export const onListenTogetherEvent = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const emit = (event: ListenTogetherEvent) => {
  listeners.forEach(l => {
    try { l(event); } catch (e) { if (__DEV__) console.warn('[ListenTogether] listener failed', e); }
  });
};

let socket: WebSocket | null = null;
let serverUrl: string | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let pingSentAt = 0;
let pendingAction: { kind: 'create'; username: string } | { kind: 'join'; roomCode: string; username: string } | null = null;
/** Set by leave/disconnect so a closing socket doesn't try to come back. */
let intentionalClose = false;

const store = () => useListenTogetherStore.getState();
const patch = (p: Partial<ReturnType<typeof store>>) => useListenTogetherStore.setState(p);

/** The servers Settings offers: Echo's published one, or the Metrolist default. */
export const KNOWN_SERVERS = [{ name: 'Metrolist server', url: FALLBACK_SERVER }] as const;

const resolveServer = async (): Promise<string> => {
  // Settings → Listen together → Server. Takes effect on the next connection.
  const chosen = store().serverUrl;
  if (chosen && isServerUrl(chosen)) return chosen;
  if (serverUrl) return serverUrl;
  const json = await fetchJson<{ serverUrl?: string }>(SERVER_JSON_URL, { timeoutMs: 5000 });
  const url = json?.serverUrl;
  serverUrl = url && /^wss?:\/\//.test(url) ? url : FALLBACK_SERVER;
  return serverUrl;
};

const backoff = (attempt: number): number => {
  const exp = Math.min(MAX_RECONNECT_DELAY_MS, INITIAL_RECONNECT_DELAY_MS * 2 ** (attempt - 1));
  // Jitter so a room full of phones doesn't reconnect in lockstep.
  return Math.round(exp * (0.8 + Math.random() * 0.4));
};

const send = (type: string, payload?: Record<string, unknown>): boolean => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(encodeFrame(type, payload));
    return true;
  } catch {
    return false;
  }
};

const stopPing = () => {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
};

const startPing = () => {
  stopPing();
  pingTimer = setInterval(() => {
    pingSentAt = Date.now();
    send(MessageTypes.PING);
  }, PING_INTERVAL_MS);
};

const clearSession = () => {
  patch({
    session: null,
    room: null,
    role: 'none',
    userId: null,
    joinRequests: [],
    suggestions: [],
    bufferingUsers: [],
    pendingJoinCode: null,
  });
};

const executePending = () => {
  const action = pendingAction;
  pendingAction = null;
  if (!action) return;
  if (action.kind === 'create') send(MessageTypes.CREATE_ROOM, { username: action.username });
  else send(MessageTypes.JOIN_ROOM, { room_code: action.roomCode.toUpperCase(), username: action.username });
};

const scheduleReconnect = (reason: string) => {
  stopPing();
  const { session, room } = store();
  const shouldReconnect = !intentionalClose && (session !== null || room !== null || pendingAction !== null);
  if (!shouldReconnect) {
    patch({ connection: 'disconnected' });
    return;
  }
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    patch({ connection: 'error' });
    store().announce(`Lost the room connection (${reason})`);
    return;
  }
  reconnectAttempts += 1;
  patch({ connection: 'reconnecting' });
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    const c = store().connection;
    if (c === 'reconnecting' || c === 'disconnected') connect();
  }, backoff(reconnectAttempts));
};

const handleMessage = (data: ArrayBuffer) => {
  let msg: { type: string; payload: unknown };
  try {
    msg = decodeFrame(new Uint8Array(data));
  } catch (e) {
    if (__DEV__) console.warn('[ListenTogether] bad frame', e);
    return;
  }
  const p = msg.payload;
  switch (msg.type) {
    case MessageTypes.ROOM_CREATED: {
      const pl = p as RoomCreatedPayload;
      const username = store().username;
      patch({
        userId: pl.user_id,
        role: 'host',
        session: { token: pl.session_token, roomCode: pl.room_code, wasHost: true, startedAt: Date.now() },
        room: {
          room_code: pl.room_code,
          host_id: pl.user_id,
          users: [{ user_id: pl.user_id, username, is_host: true, is_connected: true }],
          is_playing: false,
          position: 0,
          last_update: Date.now(),
          volume: 1,
          queue: [],
          allow_participant_control: false,
        },
      });
      store().announce(`Room ${pl.room_code} is open`);
      emit({ kind: 'room_created', roomCode: pl.room_code });
      break;
    }
    case MessageTypes.JOIN_REQUEST: {
      const pl = p as JoinRequestPayload;
      if (store().role !== 'host') break;
      // Echo: a blocked name is turned away before anyone sees the request.
      if (store().blocked.includes(pl.username)) {
        rejectJoin(pl.user_id, 'You are blocked');
        break;
      }
      if (store().autoApprove) {
        approveJoin(pl.user_id);
        break;
      }
      patch({ joinRequests: [...store().joinRequests.filter(r => r.user_id !== pl.user_id), pl] });
      break;
    }
    case MessageTypes.JOIN_APPROVED: {
      const pl = p as JoinApprovedPayload;
      patch({
        userId: pl.user_id,
        role: 'guest',
        session: { token: pl.session_token, roomCode: pl.room_code, wasHost: false, startedAt: Date.now() },
        room: pl.state,
        pendingJoinCode: null,
      });
      store().announce(`You're in room ${pl.room_code}`);
      emit({ kind: 'join_approved', payload: pl });
      break;
    }
    case MessageTypes.JOIN_REJECTED: {
      const pl = p as JoinRejectedPayload;
      patch({ pendingJoinCode: null });
      store().announce(pl.reason ? `Join declined: ${pl.reason}` : 'The host declined');
      break;
    }
    case MessageTypes.USER_JOINED: {
      const pl = p as UserPayload;
      const room = store().room;
      if (room) {
        patch({
          room: { ...room, users: [...room.users.filter(u => u.user_id !== pl.user_id), { user_id: pl.user_id, username: pl.username, is_host: false, is_connected: true }] },
          joinRequests: store().joinRequests.filter(r => r.user_id !== pl.user_id),
        });
      }
      store().announce(`${pl.username} joined`);
      emit({ kind: 'user_joined', userId: pl.user_id, username: pl.username });
      break;
    }
    case MessageTypes.USER_LEFT: {
      const pl = p as UserPayload;
      const room = store().room;
      if (room) patch({ room: { ...room, users: room.users.filter(u => u.user_id !== pl.user_id) } });
      store().announce(`${pl.username} left`);
      break;
    }
    case MessageTypes.USER_DISCONNECTED:
    case MessageTypes.USER_RECONNECTED: {
      const pl = p as UserPayload;
      const room = store().room;
      const connected = msg.type === MessageTypes.USER_RECONNECTED;
      if (room) patch({ room: { ...room, users: room.users.map(u => (u.user_id === pl.user_id ? { ...u, is_connected: connected } : u)) } });
      break;
    }
    case MessageTypes.HOST_CHANGED: {
      const pl = p as HostChangedPayload;
      const room = store().room;
      if (room) {
        patch({
          room: { ...room, host_id: pl.new_host_id, users: room.users.map(u => ({ ...u, is_host: u.user_id === pl.new_host_id })) },
        });
      }
      const me = store().userId;
      if (pl.new_host_id === me) patch({ role: 'host' });
      else if (store().role === 'host') patch({ role: 'guest' });
      store().announce(pl.new_host_id === me ? 'You are the host now' : `${pl.new_host_name} is the host now`);
      emit({ kind: 'host_changed', newHostId: pl.new_host_id });
      break;
    }
    case MessageTypes.KICKED: {
      const pl = p as KickedPayload;
      clearSession();
      store().announce(pl.reason ? `Removed from the room: ${pl.reason}` : 'You were removed from the room');
      emit({ kind: 'left' });
      break;
    }
    case MessageTypes.SYNC_PLAYBACK: {
      const pl = p as PlaybackActionPayload;
      const room = store().room;
      if (room) {
        let next = room;
        switch (pl.action) {
          case PlaybackActions.PLAY: next = { ...room, is_playing: true, position: pl.position ?? room.position }; break;
          case PlaybackActions.PAUSE: next = { ...room, is_playing: false, position: pl.position ?? room.position }; break;
          case PlaybackActions.SEEK: next = { ...room, position: pl.position ?? room.position }; break;
          case PlaybackActions.CHANGE_TRACK: next = { ...room, current_track: pl.track_info ?? room.current_track, is_playing: false, position: 0, queue: pl.queue ?? room.queue }; break;
          default: break;
        }
        if (next !== room) patch({ room: next });
      }
      emit({ kind: 'playback', payload: pl });
      break;
    }
    case MessageTypes.BUFFER_WAIT: {
      patch({ bufferingUsers: (p as BufferWaitPayload).waiting_for ?? [] });
      break;
    }
    case MessageTypes.BUFFER_COMPLETE: {
      patch({ bufferingUsers: [] });
      emit({ kind: 'buffer_complete', trackId: (p as BufferCompletePayload).track_id });
      break;
    }
    case MessageTypes.SYNC_STATE: {
      emit({ kind: 'sync_state', payload: p as SyncStatePayload });
      break;
    }
    case MessageTypes.RECONNECTED: {
      const pl = p as ReconnectedPayload;
      reconnectAttempts = 0;
      patch({
        userId: pl.user_id,
        role: pl.is_host ? 'host' : 'guest',
        room: pl.state,
        session: { ...(store().session ?? { token: '', startedAt: Date.now() }), roomCode: pl.room_code, wasHost: pl.is_host },
      });
      emit({ kind: 'reconnected', payload: pl });
      break;
    }
    case MessageTypes.SUGGESTION_RECEIVED: {
      const pl = p as SuggestionReceivedPayload;
      if (store().role !== 'host' || store().blocked.includes(pl.from_username)) break;
      patch({ suggestions: [...store().suggestions, pl] });
      store().announce(`${pl.from_username} suggested ${pl.track_info.title}`);
      break;
    }
    case MessageTypes.ROOM_SETTINGS_CHANGED: {
      const pl = p as RoomSettingsPayload;
      const room = store().room;
      if (room) patch({ room: { ...room, allow_participant_control: pl.allow_participant_control } });
      emit({ kind: 'room_settings_changed' });
      break;
    }
    case MessageTypes.PONG: {
      if (pingSentAt > 0) patch({ rttMs: Date.now() - pingSentAt });
      pingSentAt = 0;
      // Keep the saved session's clock fresh, so a relaunch knows it's resumable.
      const session = store().session;
      if (session) patch({ session: { ...session, startedAt: Date.now() } });
      break;
    }
    case MessageTypes.ERROR: {
      const pl = p as ErrorPayload;
      const { session, username } = store();
      if (pl.code === 'session_not_found') {
        // The server forgot us. A guest asks to join again; a host's room is gone.
        if (session && !session.wasHost && username) {
          const code = session.roomCode;
          clearSession();
          setTimeout(() => joinRoom(code, username), 500);
        } else {
          clearSession();
          emit({ kind: 'left' });
        }
      } else if (pl.code === 'room_not_found' || /not found|invalid/i.test(pl.message ?? '')) {
        patch({ pendingJoinCode: null });
      }
      store().announce(pl.message || 'Listen together: something went wrong');
      break;
    }
    default:
      break;
  }
};

/** Opens the socket (no-op while one is open or opening). */
export const connect = async (): Promise<void> => {
  const state = store().connection;
  if (state === 'connected' || state === 'connecting') return;
  intentionalClose = false;
  patch({ connection: 'connecting' });
  const url = await resolveServer();
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect('could not open');
    return;
  }
  socket = ws;
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    if (socket !== ws) return;
    reconnectAttempts = 0;
    patch({ connection: 'connected' });
    startPing();
    const { session } = store();
    if (session && !pendingAction) {
      send(MessageTypes.RECONNECT, { session_token: session.token });
    } else {
      executePending();
    }
  };
  ws.onmessage = e => {
    if (socket !== ws) return;
    if (e.data instanceof ArrayBuffer) handleMessage(e.data);
  };
  ws.onerror = () => {
    // onclose follows with the reason; reconnect is decided there.
  };
  ws.onclose = e => {
    if (socket !== ws) return;
    socket = null;
    stopPing();
    patch({ connection: 'disconnected', bufferingUsers: [] });
    if (!intentionalClose) scheduleReconnect(e.reason || `code ${e.code}`);
  };
};

/** Closes the socket; the saved session stays so the room can be resumed. */
export const disconnect = (): void => {
  intentionalClose = true;
  pendingAction = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  stopPing();
  try { socket?.close(1000, 'User disconnected'); } catch { /* already closed */ }
  socket = null;
  patch({ connection: 'disconnected' });
};

const whenConnected = (action: NonNullable<typeof pendingAction>) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    pendingAction = action;
    executePending();
  } else {
    pendingAction = action;
    connect();
  }
};

export const createRoom = (username: string): void => {
  store().setUsername(username);
  patch({ session: null, room: null, role: 'none' });
  whenConnected({ kind: 'create', username: username.trim() });
};

export const joinRoom = (roomCode: string, username: string): void => {
  const code = roomCode.trim().toUpperCase();
  if (!code) return;
  store().setUsername(username);
  patch({ session: null, room: null, role: 'none', pendingJoinCode: code, inviteCode: null });
  whenConnected({ kind: 'join', roomCode: code, username: username.trim() });
};

export const leaveRoom = (): void => {
  send(MessageTypes.LEAVE_ROOM);
  clearSession();
  emit({ kind: 'left' });
  disconnect();
};

export const approveJoin = (userId: string): void => {
  send(MessageTypes.APPROVE_JOIN, { user_id: userId });
  patch({ joinRequests: store().joinRequests.filter(r => r.user_id !== userId) });
};

export const rejectJoin = (userId: string, reason?: string): void => {
  send(MessageTypes.REJECT_JOIN, { user_id: userId, reason: reason ?? null });
  patch({ joinRequests: store().joinRequests.filter(r => r.user_id !== userId) });
};

/**
 * Echo's block: their pending request is turned away now and every future
 * one automatically; their suggestions stop showing.
 */
export const blockUser = (username: string): void => {
  const pending = store().joinRequests.filter(r => r.username === username);
  pending.forEach(r => rejectJoin(r.user_id, 'You are blocked'));
  store().block(username);
  store().announce(`${username} is blocked`);
};

export const kickUser = (userId: string, reason?: string): void => {
  send(MessageTypes.KICK_USER, { user_id: userId, reason: reason ?? null });
};

export const transferHost = (newHostId: string): void => {
  send(MessageTypes.TRANSFER_HOST, { new_host_id: newHostId });
};

/** Host (or a guest the host lets drive) → everyone. */
export const canControl = (): boolean => {
  const { role, room } = store();
  return role === 'host' || (role === 'guest' && room?.allow_participant_control === true);
};

export const sendPlaybackAction = (payload: PlaybackActionPayload): void => {
  if (!canControl()) return;
  send(MessageTypes.PLAYBACK_ACTION, { ...payload });
};

export const sendBufferReady = (trackId: string): void => {
  send(MessageTypes.BUFFER_READY, { track_id: trackId });
};

export const requestSync = (): void => {
  send(MessageTypes.REQUEST_SYNC);
};

export const approveSuggestion = (suggestionId: string): SuggestionReceivedPayload | undefined => {
  const found = store().suggestions.find(s => s.suggestion_id === suggestionId);
  send(MessageTypes.APPROVE_SUGGESTION, { suggestion_id: suggestionId });
  patch({ suggestions: store().suggestions.filter(s => s.suggestion_id !== suggestionId) });
  return found;
};

export const rejectSuggestion = (suggestionId: string): void => {
  send(MessageTypes.REJECT_SUGGESTION, { suggestion_id: suggestionId, reason: null });
  patch({ suggestions: store().suggestions.filter(s => s.suggestion_id !== suggestionId) });
};

/** Resume a saved room at launch, and reconnect promptly when the app returns. */
export const startListenTogetherClient = (): (() => void) => {
  const resume = () => {
    const { session, connection } = store();
    if (session && Date.now() - session.startedAt > SESSION_GRACE_PERIOD_MS) {
      // Gone too long (Echo: 10 min) — the server has dropped the room.
      clearSession();
      return;
    }
    if (session && (connection === 'disconnected' || connection === 'error')) {
      reconnectAttempts = 0;
      connect();
    }
  };
  // Persisted state may still be loading from AsyncStorage.
  const hydrated = useListenTogetherStore.persist.hasHydrated();
  const unsubHydrate = hydrated ? () => {} : useListenTogetherStore.persist.onFinishHydration(resume);
  if (hydrated) resume();
  const sub = AppState.addEventListener('change', s => { if (s === 'active') resume(); });
  return () => {
    unsubHydrate();
    sub.remove();
  };
};
