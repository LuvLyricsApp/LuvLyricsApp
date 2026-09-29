/**
 * Listen Together wire protocol — Echo Music's / Metrolist's, message for
 * message (echo/listentogether/Protocol.kt). Carried as protobuf envelopes
 * (codec.ts); these are the decoded shapes: snake_case fields, times in ms.
 * Speaking the same protocol means a LuvLyrics room works with Echo listeners.
 */

export const MessageTypes = {
  // client → server
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  APPROVE_JOIN: 'approve_join',
  REJECT_JOIN: 'reject_join',
  PLAYBACK_ACTION: 'playback_action',
  BUFFER_READY: 'buffer_ready',
  KICK_USER: 'kick_user',
  TRANSFER_HOST: 'transfer_host',
  PING: 'ping',
  REQUEST_SYNC: 'request_sync',
  RECONNECT: 'reconnect',
  SUGGEST_TRACK: 'suggest_track',
  APPROVE_SUGGESTION: 'approve_suggestion',
  REJECT_SUGGESTION: 'reject_suggestion',
  UPDATE_ROOM_SETTINGS: 'update_room_settings',
  // server → client
  ROOM_CREATED: 'room_created',
  JOIN_REQUEST: 'join_request',
  JOIN_APPROVED: 'join_approved',
  JOIN_REJECTED: 'join_rejected',
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  SYNC_PLAYBACK: 'sync_playback',
  BUFFER_WAIT: 'buffer_wait',
  BUFFER_COMPLETE: 'buffer_complete',
  ERROR: 'error',
  PONG: 'pong',
  HOST_CHANGED: 'host_changed',
  KICKED: 'kicked',
  SYNC_STATE: 'sync_state',
  RECONNECTED: 'reconnected',
  USER_RECONNECTED: 'user_reconnected',
  USER_DISCONNECTED: 'user_disconnected',
  SUGGESTION_RECEIVED: 'suggestion_received',
  SUGGESTION_APPROVED: 'suggestion_approved',
  SUGGESTION_REJECTED: 'suggestion_rejected',
  ROOM_SETTINGS_CHANGED: 'room_settings_changed',
} as const;

export const PlaybackActions = {
  PLAY: 'play',
  PAUSE: 'pause',
  SEEK: 'seek',
  SKIP_NEXT: 'skip_next',
  SKIP_PREV: 'skip_prev',
  CHANGE_TRACK: 'change_track',
  QUEUE_ADD: 'queue_add',
  QUEUE_REMOVE: 'queue_remove',
  QUEUE_CLEAR: 'queue_clear',
  SYNC_QUEUE: 'sync_queue',
  SET_VOLUME: 'set_volume',
} as const;

export type PlaybackAction = typeof PlaybackActions[keyof typeof PlaybackActions];

/** A song on the wire. `id` is a YouTube Music video id in Echo rooms. */
export interface TrackInfo {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  /** Milliseconds. */
  duration: number;
  thumbnail?: string | null;
  suggested_by?: string | null;
}

export interface UserInfo {
  user_id: string;
  username: string;
  is_host: boolean;
  is_connected?: boolean;
}

export interface RoomState {
  room_code: string;
  host_id: string;
  users: UserInfo[];
  current_track?: TrackInfo | null;
  is_playing: boolean;
  position: number;
  last_update: number;
  volume?: number;
  queue?: TrackInfo[];
  allow_participant_control?: boolean;
}

export interface PlaybackActionPayload {
  action: PlaybackAction | string;
  track_id?: string | null;
  position?: number | null;
  track_info?: TrackInfo | null;
  insert_next?: boolean | null;
  queue?: TrackInfo[] | null;
  queue_title?: string | null;
  volume?: number | null;
  server_time?: number | null;
}

export interface SyncStatePayload {
  current_track?: TrackInfo | null;
  is_playing: boolean;
  position: number;
  last_update: number;
  queue?: TrackInfo[] | null;
  volume?: number | null;
}

export interface RoomCreatedPayload { room_code: string; user_id: string; session_token: string }
export interface JoinRequestPayload { user_id: string; username: string }
export interface JoinApprovedPayload { room_code: string; user_id: string; session_token: string; state: RoomState }
export interface JoinRejectedPayload { reason: string }
export interface UserPayload { user_id: string; username: string }
export interface BufferWaitPayload { track_id: string; waiting_for: string[] }
export interface BufferCompletePayload { track_id: string }
export interface ErrorPayload { code: string; message: string }
export interface HostChangedPayload { new_host_id: string; new_host_name: string }
export interface KickedPayload { reason: string }
export interface ReconnectedPayload { room_code: string; user_id: string; state: RoomState; is_host: boolean }
export interface RoomSettingsPayload { allow_participant_control: boolean }
export interface SuggestionReceivedPayload {
  suggestion_id: string;
  from_user_id: string;
  from_username: string;
  track_info: TrackInfo;
}

