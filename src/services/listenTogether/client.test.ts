jest.mock('react-native', () => ({ AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../net/fetchWithTimeout', () => ({ fetchJson: jest.fn(async () => ({ serverUrl: 'wss://rooms.test/ws' })) }));

import { decodeFrame, encodeFrame } from './codec';
import { approveJoin, blockUser, connect, createRoom, disconnect, joinRoom, onListenTogetherEvent } from './client';
import { useListenTogetherStore } from '../../store/listenTogetherStore';

/** Stands in for the platform WebSocket: records frames, lets the test answer. */
class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 0;
  binaryType = 'blob';
  sent: { type: string; payload: Record<string, unknown> | null }[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.last = this; }
  send(data: Uint8Array) { this.sent.push(decodeFrame(data)); }
  close() { this.readyState = 3; }
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  receive(type: string, payload: Record<string, unknown>) {
    const bytes = encodeFrame(type, payload);
    this.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  }
}

const flush = () => new Promise(r => setTimeout(r, 0));

beforeAll(() => { (global as unknown as { WebSocket: unknown }).WebSocket = FakeSocket; });
afterEach(() => {
  disconnect();
  useListenTogetherStore.setState({ room: null, role: 'none', session: null, joinRequests: [], pendingJoinCode: null, autoApprove: false, connection: 'disconnected', blocked: [], serverUrl: '' });
});

describe('listen together client', () => {
  it('creates a room once the socket opens and becomes host', async () => {
    const events: string[] = [];
    const off = onListenTogetherEvent(e => events.push(e.kind));
    createRoom('Ann');
    await flush();
    const ws = FakeSocket.last!;
    expect(ws.url).toBe('wss://rooms.test/ws');
    expect(ws.binaryType).toBe('arraybuffer');
    ws.open();
    expect(ws.sent[0]).toEqual({ type: 'create_room', payload: { username: 'Ann' } });

    ws.receive('room_created', { room_code: 'ABC123', user_id: 'u1', session_token: 'tok' });
    const s = useListenTogetherStore.getState();
    expect(s.role).toBe('host');
    expect(s.room?.room_code).toBe('ABC123');
    expect(s.session?.token).toBe('tok');
    expect(events).toContain('room_created');

    // A join request waits for the host, then approving sends approve_join.
    ws.receive('join_request', { user_id: 'u2', username: 'Ben' });
    expect(useListenTogetherStore.getState().joinRequests).toHaveLength(1);
    approveJoin('u2');
    expect(ws.sent.at(-1)).toEqual({ type: 'approve_join', payload: { user_id: 'u2' } });
    expect(useListenTogetherStore.getState().joinRequests).toHaveLength(0);
    off();
  });

  it('joins by code as a guest and adopts the room state', async () => {
    joinRoom(' abc123 ', 'Ben');
    await flush();
    const ws = FakeSocket.last!;
    ws.open();
    expect(ws.sent[0]).toEqual({ type: 'join_room', payload: { room_code: 'ABC123', username: 'Ben' } });
    expect(useListenTogetherStore.getState().pendingJoinCode).toBe('ABC123');

    ws.receive('join_approved', {
      room_code: 'ABC123',
      user_id: 'u2',
      session_token: 't2',
      state: { room_code: 'ABC123', host_id: 'u1', users: [{ user_id: 'u1', username: 'Ann', is_host: true }], is_playing: true, position: 42000, last_update: 1 },
    });
    const s = useListenTogetherStore.getState();
    expect(s.role).toBe('guest');
    expect(s.pendingJoinCode).toBeNull();
    expect(s.room?.users[0].username).toBe('Ann');
  });

  it('turns away a blocked name, now and on every later request', async () => {
    createRoom('Ann');
    await flush();
    const ws = FakeSocket.last!;
    ws.open();
    ws.receive('room_created', { room_code: 'ABC123', user_id: 'u1', session_token: 'tok' });

    ws.receive('join_request', { user_id: 'u3', username: 'Cal' });
    blockUser('Cal');
    expect(ws.sent.at(-1)).toEqual({ type: 'reject_join', payload: { user_id: 'u3', reason: 'You are blocked' } });
    expect(useListenTogetherStore.getState().joinRequests).toHaveLength(0);

    ws.receive('join_request', { user_id: 'u4', username: 'Cal' });
    expect(ws.sent.at(-1)).toEqual({ type: 'reject_join', payload: { user_id: 'u4', reason: 'You are blocked' } });
    expect(useListenTogetherStore.getState().joinRequests).toHaveLength(0);
    expect(useListenTogetherStore.getState().blocked).toEqual(['Cal']);
  });

  it('connects to the server chosen in Settings', async () => {
    useListenTogetherStore.getState().setServerUrl('wss://my.rooms/ws');
    createRoom('Ann');
    await flush();
    expect(FakeSocket.last!.url).toBe('wss://my.rooms/ws');
  });

  it('ignores a server address that is not ws or wss', () => {
    useListenTogetherStore.getState().setServerUrl('https://not.a.socket');
    expect(useListenTogetherStore.getState().serverUrl).toBe('');
  });

  it('resumes a saved session with reconnect instead of joining again', async () => {
    useListenTogetherStore.setState({ session: { token: 'saved', roomCode: 'ROOM1', wasHost: false, startedAt: Date.now() } });
    connect();
    await flush();
    const ws = FakeSocket.last!;
    ws.open();
    expect(ws.sent[0]).toEqual({ type: 'reconnect', payload: { session_token: 'saved' } });
  });
});
