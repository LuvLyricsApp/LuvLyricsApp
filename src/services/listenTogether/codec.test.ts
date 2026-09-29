import { gzipSync, strToU8 } from 'fflate';
import { decodeFrame, decodeMessage, encodeFrame, encodeMessage, ROOM_STATE_SCHEMA, SCHEMAS } from './codec';

const hex = (u: Uint8Array) => Array.from(u, b => b.toString(16).padStart(2, '0')).join(' ');

describe('listen together protobuf codec', () => {
  it('encodes a bare envelope like protoc does', () => {
    // Envelope { type = "ping" } → field 1, wire 2, len 4, "ping"
    expect(hex(encodeFrame('ping'))).toBe('0a 04 70 69 6e 67');
  });

  it('encodes create_room with its payload', () => {
    // payload CreateRoomPayload { username = "Ann" } = 0a 03 41 6e 6e
    expect(hex(encodeFrame('create_room', { username: 'Ann' }))).toBe(
      '0a 0b 63 72 65 61 74 65 5f 72 6f 6f 6d 12 05 0a 03 41 6e 6e',
    );
  });

  it('writes int64 varints and float32 volume', () => {
    const bytes = encodeMessage({ action: 'play', position: 200000, volume: 1 }, SCHEMAS.playback_action);
    // action "play", position 200000 (c0 9a 0c), volume 1.0f little-endian
    expect(hex(bytes)).toBe('0a 04 70 6c 61 79 18 c0 9a 0c 45 00 00 80 3f');
  });

  it('round-trips a server sync with a nested track and a ms timestamp', () => {
    const payload = {
      action: 'change_track',
      track_info: { id: 'dQw4w9WgXcQ', title: 'Café ✨', artist: 'A, B', duration: 213000 },
      server_time: 1_759_000_000_123,
      queue: [{ id: 'x', title: 't', artist: 'a', duration: 1 }],
    };
    const frame = encodeFrame('sync_playback', payload);
    const { type, payload: back } = decodeFrame(frame);
    expect(type).toBe('sync_playback');
    expect(back).toMatchObject(payload);
  });

  it('inflates gzip-compressed payloads', () => {
    const body = encodeMessage({ room_code: 'ABC123', user_id: 'u1', session_token: 's'.repeat(120) }, SCHEMAS.room_created);
    const env = encodeMessage({ type: 'room_created', payload: gzipSync(body), compressed: true }, [
      { no: 1, name: 'type', type: 'string' },
      { no: 2, name: 'payload', type: 'bytes' },
      { no: 3, name: 'compressed', type: 'bool' },
    ]);
    expect(decodeFrame(env).payload).toMatchObject({ room_code: 'ABC123', user_id: 'u1' });
  });

  it('decodes room state with repeated users and skips unknown fields', () => {
    const state = encodeMessage(
      { room_code: 'R', host_id: 'h', users: [{ user_id: 'h', username: 'Host', is_host: true }, { user_id: 'g', username: 'Guest' }], is_playing: true, position: 5000 },
      ROOM_STATE_SCHEMA,
    );
    // Append an unknown varint field 15 (future server addition).
    const withExtra = new Uint8Array([...state, 0x78, 0x01]);
    const decoded = decodeMessage(withExtra, ROOM_STATE_SCHEMA);
    expect(decoded.users).toHaveLength(2);
    expect(decoded).toMatchObject({ room_code: 'R', is_playing: true, position: 5000 });
  });

  it('returns a null payload for message types it does not know', () => {
    const env = encodeMessage({ type: 'server_capabilities', payload: strToU8('x') }, [
      { no: 1, name: 'type', type: 'string' },
      { no: 2, name: 'payload', type: 'bytes' },
    ]);
    expect(decodeFrame(env)).toEqual({ type: 'server_capabilities', payload: null });
  });
});
