/**
 * The room server speaks protobuf (Metrolist's metroserver; Echo's
 * listentogether.proto) — JSON frames are not understood. This is a small
 * schema-driven proto3 encoder/decoder for exactly those messages, so no
 * generated code or protobuf runtime is needed.
 *
 * Frames are an `Envelope { type = 1; payload = 2 (bytes); compressed = 3 }`.
 * The server gzips payloads over 100 bytes (`compressed = true`); fflate
 * inflates them.
 */
import { gunzipSync, strFromU8, strToU8 } from 'fflate';

type Scalar = 'string' | 'int64' | 'bool' | 'float' | 'bytes';
interface Field {
  no: number;
  name: string;
  type: Scalar | Schema;
  repeated?: boolean;
}
export type Schema = readonly Field[];

// ── Schemas (field numbers from listentogether.proto) ──────────────────────
const TrackInfo: Schema = [
  { no: 1, name: 'id', type: 'string' },
  { no: 2, name: 'title', type: 'string' },
  { no: 3, name: 'artist', type: 'string' },
  { no: 4, name: 'album', type: 'string' },
  { no: 5, name: 'duration', type: 'int64' },
  { no: 6, name: 'thumbnail', type: 'string' },
  { no: 7, name: 'suggested_by', type: 'string' },
];
const UserInfo: Schema = [
  { no: 1, name: 'user_id', type: 'string' },
  { no: 2, name: 'username', type: 'string' },
  { no: 3, name: 'is_host', type: 'bool' },
  { no: 4, name: 'is_connected', type: 'bool' },
];
export const ROOM_STATE_SCHEMA: Schema = [
  { no: 1, name: 'room_code', type: 'string' },
  { no: 2, name: 'host_id', type: 'string' },
  { no: 3, name: 'users', type: UserInfo, repeated: true },
  { no: 4, name: 'current_track', type: TrackInfo },
  { no: 5, name: 'is_playing', type: 'bool' },
  { no: 6, name: 'position', type: 'int64' },
  { no: 7, name: 'last_update', type: 'int64' },
  { no: 8, name: 'volume', type: 'float' },
  { no: 9, name: 'queue', type: TrackInfo, repeated: true },
  { no: 10, name: 'allow_participant_control', type: 'bool' },
];
const PlaybackAction: Schema = [
  { no: 1, name: 'action', type: 'string' },
  { no: 2, name: 'track_id', type: 'string' },
  { no: 3, name: 'position', type: 'int64' },
  { no: 4, name: 'track_info', type: TrackInfo },
  { no: 5, name: 'insert_next', type: 'bool' },
  { no: 6, name: 'queue', type: TrackInfo, repeated: true },
  { no: 7, name: 'queue_title', type: 'string' },
  { no: 8, name: 'volume', type: 'float' },
  { no: 9, name: 'server_time', type: 'int64' },
];
const UserPair: Schema = [
  { no: 1, name: 'user_id', type: 'string' },
  { no: 2, name: 'username', type: 'string' },
];
const UserReason: Schema = [
  { no: 1, name: 'user_id', type: 'string' },
  { no: 2, name: 'reason', type: 'string' },
];
const Reason: Schema = [{ no: 1, name: 'reason', type: 'string' }];
const TrackId: Schema = [{ no: 1, name: 'track_id', type: 'string' }];
const SuggestionReason: Schema = [
  { no: 1, name: 'suggestion_id', type: 'string' },
  { no: 2, name: 'reason', type: 'string' },
];

/** Payload schema per message type, both directions. */
export const SCHEMAS: Record<string, Schema> = {
  // client → server
  create_room: [{ no: 1, name: 'username', type: 'string' }],
  join_room: [
    { no: 1, name: 'room_code', type: 'string' },
    { no: 2, name: 'username', type: 'string' },
  ],
  approve_join: [{ no: 1, name: 'user_id', type: 'string' }],
  reject_join: UserReason,
  playback_action: PlaybackAction,
  buffer_ready: TrackId,
  kick_user: UserReason,
  transfer_host: [{ no: 1, name: 'new_host_id', type: 'string' }],
  suggest_track: [{ no: 1, name: 'track_info', type: TrackInfo }],
  approve_suggestion: [{ no: 1, name: 'suggestion_id', type: 'string' }],
  reject_suggestion: SuggestionReason,
  reconnect: [{ no: 1, name: 'session_token', type: 'string' }],
  update_room_settings: [{ no: 1, name: 'allow_participant_control', type: 'bool' }],
  // server → client
  room_created: [
    { no: 1, name: 'room_code', type: 'string' },
    { no: 2, name: 'user_id', type: 'string' },
    { no: 3, name: 'session_token', type: 'string' },
  ],
  join_request: UserPair,
  join_approved: [
    { no: 1, name: 'room_code', type: 'string' },
    { no: 2, name: 'user_id', type: 'string' },
    { no: 3, name: 'session_token', type: 'string' },
    { no: 4, name: 'state', type: ROOM_STATE_SCHEMA },
  ],
  join_rejected: Reason,
  user_joined: UserPair,
  user_left: UserPair,
  user_reconnected: UserPair,
  user_disconnected: UserPair,
  sync_playback: PlaybackAction,
  buffer_wait: [
    { no: 1, name: 'track_id', type: 'string' },
    { no: 2, name: 'waiting_for', type: 'string', repeated: true },
  ],
  buffer_complete: TrackId,
  error: [
    { no: 1, name: 'code', type: 'string' },
    { no: 2, name: 'message', type: 'string' },
  ],
  host_changed: [
    { no: 1, name: 'new_host_id', type: 'string' },
    { no: 2, name: 'new_host_name', type: 'string' },
  ],
  kicked: Reason,
  sync_state: [
    { no: 1, name: 'current_track', type: TrackInfo },
    { no: 2, name: 'is_playing', type: 'bool' },
    { no: 3, name: 'position', type: 'int64' },
    { no: 4, name: 'last_update', type: 'int64' },
    { no: 5, name: 'queue', type: TrackInfo, repeated: true },
    { no: 6, name: 'volume', type: 'float' },
  ],
  reconnected: [
    { no: 1, name: 'room_code', type: 'string' },
    { no: 2, name: 'user_id', type: 'string' },
    { no: 3, name: 'state', type: ROOM_STATE_SCHEMA },
    { no: 4, name: 'is_host', type: 'bool' },
  ],
  suggestion_received: [
    { no: 1, name: 'suggestion_id', type: 'string' },
    { no: 2, name: 'from_user_id', type: 'string' },
    { no: 3, name: 'from_username', type: 'string' },
    { no: 4, name: 'track_info', type: TrackInfo },
  ],
  suggestion_approved: [
    { no: 1, name: 'suggestion_id', type: 'string' },
    { no: 2, name: 'track_info', type: TrackInfo },
  ],
  suggestion_rejected: SuggestionReason,
  room_settings_changed: [{ no: 1, name: 'allow_participant_control', type: 'bool' }],
};

const ENVELOPE: Schema = [
  { no: 1, name: 'type', type: 'string' },
  { no: 2, name: 'payload', type: 'bytes' },
  { no: 3, name: 'compressed', type: 'bool' },
];

// ── Writer ─────────────────────────────────────────────────────────────────
class Writer {
  private bytes: number[] = [];

  varint(value: number) {
    // Non-negative integers up to 2^53 (positions, timestamps, lengths).
    let v = Math.max(0, Math.floor(value));
    while (v >= 0x80) {
      this.bytes.push((v % 0x80) + 0x80);
      v = Math.floor(v / 0x80);
    }
    this.bytes.push(v);
  }

  tag(no: number, wire: number) { this.varint(no * 8 + wire); }

  raw(data: Uint8Array) { for (let i = 0; i < data.length; i++) this.bytes.push(data[i]); }

  lengthDelimited(no: number, data: Uint8Array) {
    this.tag(no, 2);
    this.varint(data.length);
    this.raw(data);
  }

  float(no: number, value: number) {
    this.tag(no, 5);
    const buf = new DataView(new ArrayBuffer(4));
    buf.setFloat32(0, value, true);
    this.raw(new Uint8Array(buf.buffer));
  }

  finish(): Uint8Array { return Uint8Array.from(this.bytes); }
}

type Obj = Record<string, unknown>;

export const encodeMessage = (obj: Obj | null | undefined, schema: Schema): Uint8Array => {
  const w = new Writer();
  if (!obj) return w.finish();
  for (const f of schema) {
    const value = obj[f.name];
    if (value === undefined || value === null) continue;
    const values = f.repeated ? (value as unknown[]) : [value];
    for (const v of values) {
      if (v === undefined || v === null) continue;
      if (typeof f.type !== 'string') {
        w.lengthDelimited(f.no, encodeMessage(v as Obj, f.type));
        continue;
      }
      switch (f.type) {
        case 'string':
          if (v === '' && !f.repeated) break; // proto3 default is not written
          w.lengthDelimited(f.no, strToU8(String(v)));
          break;
        case 'bytes':
          w.lengthDelimited(f.no, v as Uint8Array);
          break;
        case 'int64':
          if (Number(v) === 0) break;
          w.tag(f.no, 0);
          w.varint(Number(v));
          break;
        case 'bool':
          if (!v) break;
          w.tag(f.no, 0);
          w.varint(1);
          break;
        case 'float':
          if (Number(v) === 0) break;
          w.float(f.no, Number(v));
          break;
      }
    }
  }
  return w.finish();
};

// ── Reader ─────────────────────────────────────────────────────────────────
class Reader {
  pos = 0;
  constructor(private buf: Uint8Array) {}
  get done() { return this.pos >= this.buf.length; }

  varint(): number {
    let result = 0;
    let scale = 1;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.buf.length) throw new Error('truncated varint');
      const b = this.buf[this.pos++];
      // Past 2^53 precision is lost; ms timestamps and positions stay well below.
      result += (b % 0x80) * scale;
      if (b < 0x80) return result;
      scale *= 0x80;
    }
    throw new Error('varint too long');
  }

  bytes(): Uint8Array {
    const len = this.varint();
    if (this.pos + len > this.buf.length) throw new Error('truncated field');
    const out = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  fixed32(): Uint8Array {
    const out = this.buf.subarray(this.pos, this.pos + 4);
    this.pos += 4;
    return out;
  }

  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.bytes();
    else if (wire === 5) this.pos += 4;
    else throw new Error(`unknown wire type ${wire}`);
  }
}

export const decodeMessage = (data: Uint8Array, schema: Schema): Obj => {
  const out: Obj = {};
  for (const f of schema) if (f.repeated) out[f.name] = [];
  const byNo = new Map(schema.map(f => [f.no, f]));
  const r = new Reader(data);
  while (!r.done) {
    const key = r.varint();
    const no = Math.floor(key / 8);
    const wire = key % 8;
    const f = byNo.get(no);
    if (!f) { r.skip(wire); continue; }
    let value: unknown;
    if (typeof f.type !== 'string') {
      value = decodeMessage(r.bytes(), f.type);
    } else {
      switch (f.type) {
        case 'string': value = strFromU8(r.bytes()); break;
        case 'bytes': value = r.bytes(); break;
        case 'int64': value = r.varint(); break;
        case 'bool': value = r.varint() !== 0; break;
        case 'float': {
          const b = r.fixed32();
          value = new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true);
          break;
        }
      }
    }
    if (f.repeated) (out[f.name] as unknown[]).push(value);
    else out[f.name] = value;
  }
  return out;
};

// ── Envelopes ──────────────────────────────────────────────────────────────
export const encodeFrame = (type: string, payload?: Obj | null): Uint8Array => {
  const schema = SCHEMAS[type];
  const body = payload && schema ? encodeMessage(payload, schema) : undefined;
  return encodeMessage({ type, payload: body && body.length > 0 ? body : undefined }, ENVELOPE);
};

export const decodeFrame = (data: Uint8Array): { type: string; payload: Obj | null } => {
  const env = decodeMessage(data, ENVELOPE);
  const type = String(env.type ?? '');
  let body = env.payload as Uint8Array | undefined;
  if (body && env.compressed) body = gunzipSync(body);
  const schema = SCHEMAS[type];
  if (!schema) return { type, payload: null };
  return { type, payload: decodeMessage(body ?? new Uint8Array(0), schema) };
};
