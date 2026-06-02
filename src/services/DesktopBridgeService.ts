/* eslint-disable no-bitwise */
/**
 * DesktopBridgeService.ts
 *
 * Bridges the LuvLyrics mobile app with the LuvLyrics Desktop app.
 *
 * What this service does:
 *  1. Starts a WebSocket server on WiFi IP port 8765 — desktop connects here.
 *  2. Starts an HTTP file server on port 8766 — desktop fetches /audio, /cover, /ping.
 *  3. Broadcasts playerStore STATE on every change.
 *  4. Broadcasts downloadQueueStore DOWNLOAD_PROGRESS on every queue item change.
 *  5. Handles CMD messages from desktop (PLAY, PAUSE, NEXT, PREV, SEEK, SET_VOLUME, SET_SOURCE, DOWNLOAD).
 *  6. Advertises the service via Zeroconf/mDNS (_luvlyrics._tcp.local).
 *
 * Dependencies to install:
 *   npx expo install react-native-tcp-socket
 *   npx expo install react-native-zeroconf   (or react-native-mdns)
 *
 * Permissions (AndroidManifest.xml additions):
 *   <uses-permission android:name="android.permission.INTERNET" />
 *   <uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
 */

import { AppState, AppStateStatus, NativeModules, Platform } from 'react-native';
import { Buffer } from 'buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Zeroconf, { ImplType } from 'react-native-zeroconf';
import nacl from 'tweetnacl';
import { usePlayerStore, playerControls } from '../store/playerStore';
import { usePositionStore } from '../store/positionStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { useDesktopBridgeSettingsStore } from '../store/desktopBridgeSettingsStore';
import { trustedPairingService } from './TrustedPairingService';

// ── Types ────────────────────────────────────────────────────────────────────

interface WsClient {
  socket: any;
  handshaken: boolean;
  buffer: Buffer;
  protoVersion: number;
  trusted: boolean;
  desktopDeviceId: string | null;
}

interface TcpSocketModule {
  createServer: (handler: (socket: any) => void) => any;
}

type ZeroconfImplType = (typeof ImplType)[keyof typeof ImplType];
type BridgeSource = 'phone' | 'desktop';
type HandoffReason = 'unload_signal' | 'socket_close' | 'heartbeat_timeout' | 'network_loss';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WS_PORT = 8765;
const HTTP_PORT = 8766;
const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PROTO_VERSION = 2;

let cachedTcpSocket: TcpSocketModule | null | undefined;

function loadTcpSocket(): TcpSocketModule | null {
  if (cachedTcpSocket !== undefined) {
    return cachedTcpSocket;
  }

  try {
    const moduleName = 'react-native-tcp-socket';
    const loaded = require(moduleName);
    cachedTcpSocket = loaded?.default ?? loaded;
  } catch (error) {
    console.warn(
      '[DesktopBridge] react-native-tcp-socket is not installed; desktop bridge is disabled.',
      error
    );
    cachedTcpSocket = null;
  }

  return cachedTcpSocket;
}

// ── WebSocket frame helpers ──────────────────────────────────────────────────

function encodeFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;

  let header: Buffer;
  if (len <= 125) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + opcode text
    header[1] = len;
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    // Write 64-bit big-endian length (only lower 32 bits needed for reasonable payloads)
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload]);
}

function decodeFrames(buf: Buffer): { messages: string[]; remaining: Buffer } {
  const messages: string[] = [];
  let offset = 0;

  while (offset + 2 <= buf.length) {
    const firstByte = buf[offset];
    const secondByte = buf[offset + 1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;
    let headerLen = 2;

    if (payloadLen === 126) {
      if (offset + 4 > buf.length) break;
      payloadLen = buf.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (offset + 10 > buf.length) break;
      payloadLen = buf.readUInt32BE(offset + 6); // ignore upper 32 bits
      headerLen = 10;
    }

    const maskLen = masked ? 4 : 0;
    const frameLen = headerLen + maskLen + payloadLen;
    if (offset + frameLen > buf.length) break;

    if (opcode === 0x8) {
      // Connection close frame — caller handles
      messages.push('__CLOSE__');
      offset += frameLen;
      continue;
    }

    if (opcode === 0x1 || opcode === 0x0) {
      // Text or continuation
      const maskStart = offset + headerLen;
      const dataStart = maskStart + maskLen;
      const rawPayload = buf.slice(dataStart, dataStart + payloadLen);

      if (masked) {
        const mask = buf.slice(maskStart, maskStart + 4);
        for (let i = 0; i < rawPayload.length; i++) {
          rawPayload[i] ^= mask[i % 4];
        }
      }

      messages.push(rawPayload.toString('utf8'));
    }

    offset += frameLen;
  }

  return { messages, remaining: buf.slice(offset) };
}

// Inline SHA-1 for the WebSocket handshake (avoids native module requirement for crypto)
function sha1Base64(input: string): string {
  // Use the built-in global TextEncoder + SubtleCrypto if available,
  // otherwise fall back to a pure-JS SHA-1.
  // In React Native we use a pure-JS implementation.
  const bytes = strToBytes(input);
  const hash = sha1(bytes);
  return btoa(String.fromCharCode(...hash));
}

function strToBytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    out.push(str.charCodeAt(i) & 0xff);
  }
  return out;
}

// Pure-JS SHA-1 (RFC 3174)
function sha1(msg: number[]): number[] {
  // Pre-processing
  const bitLen = msg.length * 8;
  msg.push(0x80);
  while ((msg.length % 64) !== 56) msg.push(0x00);
  msg.push(0, 0, 0, 0); // high 32 bits of length (always 0)
  msg.push((bitLen >>> 24) & 0xff);
  msg.push((bitLen >>> 16) & 0xff);
  msg.push((bitLen >>> 8) & 0xff);
  msg.push(bitLen & 0xff);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;

  for (let i = 0; i < msg.length; i += 64) {
    const w: number[] = [];
    for (let j = 0; j < 16; j++) {
      w[j] = (msg[i + j * 4] << 24) | (msg[i + j * 4 + 1] << 16) | (msg[i + j * 4 + 2] << 8) | msg[i + j * 4 + 3];
    }
    for (let j = 16; j < 80; j++) {
      const n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = (n << 1) | (n >>> 31);
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4;

    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = temp;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }

  return [
    (h0 >>> 24) & 0xff, (h0 >>> 16) & 0xff, (h0 >>> 8) & 0xff, h0 & 0xff,
    (h1 >>> 24) & 0xff, (h1 >>> 16) & 0xff, (h1 >>> 8) & 0xff, h1 & 0xff,
    (h2 >>> 24) & 0xff, (h2 >>> 16) & 0xff, (h2 >>> 8) & 0xff, h2 & 0xff,
    (h3 >>> 24) & 0xff, (h3 >>> 16) & 0xff, (h3 >>> 8) & 0xff, h3 & 0xff,
    (h4 >>> 24) & 0xff, (h4 >>> 16) & 0xff, (h4 >>> 8) & 0xff, h4 & 0xff,
  ];
}

// ── DesktopBridgeService class ────────────────────────────────────────────────

class DesktopBridgeService {
  private static readonly DEVICE_ID_KEY = '@desktop_bridge_device_id';
  private static readonly INSTANCE_ID_KEY = '@desktop_bridge_instance_id';
  private static readonly PUBLIC_KEY_KEY = '@desktop_bridge_phone_public_key';
  private static readonly PRIVATE_KEY_KEY = '@desktop_bridge_phone_private_key';
  private wsServer: any = null;
  private httpServer: any = null;
  private clients: Map<number, WsClient> = new Map();
  private clientCounter = 0;
  private playerUnsubscribe: (() => void) | null = null;
  private downloadUnsubscribe: (() => void) | null = null;
  private zeroconf: any = null;
  private running = false;
  private bridgeSource: BridgeSource = 'phone';
  private sourceTransitionInFlight = false;
  private desktopConnected = false;
  private lastDesktopHeartbeatAt = 0;
  private lastHeartbeatLogAt = 0;
  private heartbeatCheckTimer: NodeJS.Timeout | null = null;
  private pendingHandoffTimer: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_TIMEOUT_MS = 3000;
  private readonly HANDOFF_GRACE_MS = 1800;
  private latestDesktopPosition: number | null = null;
  private desktopWasPlaying = false;
  private appStateSub: { remove: () => void } | null = null;
  private ipWatchTimer: NodeJS.Timeout | null = null;
  private lastKnownIp: string | null = null;
  private deviceId: string | null = null;
  private deviceName = 'LuvLyrics Phone';
  private mdnsPublishLogAt = 0;
  private pingLogAt = 0;
  private coverLogAt = 0;
  private instanceId: string | null = null;
  private phonePublicKey: string | null = null;
  private phonePrivateKey: string | null = null;
  private stateVersion = 0;
  private seenNonIdempotentIds = new Set<string>();
  private controlPort = DEFAULT_WS_PORT;
  private logServerError(tag: string, err: unknown): void {
    if (err instanceof Error) {
      console.error(`[DesktopBridge] ${tag} server error: ${err.message}`, err);
      return;
    }
    if (typeof err === 'string') {
      console.error(`[DesktopBridge] ${tag} server error: ${err}`);
      return;
    }
    try {
      console.error(`[DesktopBridge] ${tag} server error:`, JSON.stringify(err));
    } catch {
      console.error(`[DesktopBridge] ${tag} server error:`, err);
    }
  }

  private logDesktopEvent(event: string, extra?: Record<string, unknown>): void {
    if (extra) {
      console.log(`[DesktopBridge] ${event}`, JSON.stringify(extra));
      return;
    }
    console.log(`[DesktopBridge] ${event}`);
  }

  private clearPendingHandoff(): void {
    if (this.pendingHandoffTimer) {
      clearTimeout(this.pendingHandoffTimer);
      this.pendingHandoffTimer = null;
    }
  }

  private markDesktopConnected(): void {
    this.desktopConnected = true;
    this.lastDesktopHeartbeatAt = Date.now();
    this.clearPendingHandoff();
    // this.logDesktopEvent('desktop_connected');
  }

  private markDesktopHeartbeat(): void {
    this.desktopConnected = true;
    this.lastDesktopHeartbeatAt = Date.now();
    if (Date.now() - this.lastHeartbeatLogAt > 1500) {
      this.lastHeartbeatLogAt = Date.now();
      this.logDesktopEvent('desktop_heartbeat');
    }
  }

  private scheduleHandoffToPhone(reason: HandoffReason): void {
    this.clearPendingHandoff();
    this.pendingHandoffTimer = setTimeout(() => {
      this.transitionSource('phone', reason);
    }, this.HANDOFF_GRACE_MS);
  }

  private handleDesktopDisconnected(reason: HandoffReason): void {
    if (this.clients.size > 0) return;
    this.desktopConnected = false;
    this.logDesktopEvent('desktop_disconnected', { reason });
    this.scheduleHandoffToPhone(reason);
  }

  private startHeartbeatWatchdog(): void {
    this.stopHeartbeatWatchdog();
    this.heartbeatCheckTimer = setInterval(() => {
      if (!this.running || this.bridgeSource !== 'desktop' || !this.desktopConnected) return;
      const staleFor = Date.now() - this.lastDesktopHeartbeatAt;
      if (staleFor > this.HEARTBEAT_TIMEOUT_MS) {
        this.desktopConnected = false;
        this.logDesktopEvent('desktop_stale', { staleForMs: staleFor });
        this.scheduleHandoffToPhone('heartbeat_timeout');
      }
    }, 1000);
  }

  private stopHeartbeatWatchdog(): void {
    if (this.heartbeatCheckTimer) {
      clearInterval(this.heartbeatCheckTimer);
      this.heartbeatCheckTimer = null;
    }
  }

  private startIpWatchdog(): void {
    this.stopIpWatchdog();
    this.ipWatchTimer = setInterval(async () => {
      if (!this.running) return;
      const ip = await this.getLocalIp();
      if (ip !== this.lastKnownIp) {
        this.lastKnownIp = ip;
        this.refreshMdnsAdvertisement('ip_change');
      }
    }, 5000);
  }

  private stopIpWatchdog(): void {
    if (this.ipWatchTimer) {
      clearInterval(this.ipWatchTimer);
      this.ipWatchTimer = null;
    }
  }

  private transitionSource(nextSource: BridgeSource, reason?: HandoffReason): void {
    if (this.bridgeSource === nextSource || this.sourceTransitionInFlight) return;
    this.sourceTransitionInFlight = true;
    try {
      if (reason) {
        this.logDesktopEvent('source_handoff_to_phone(reason)', { reason });
      }
      this.bridgeSource = nextSource;
    } finally {
      this.sourceTransitionInFlight = false;
    }
  }

  private handleAppStateChange = (state: AppStateStatus): void => {
    if (state !== 'active') return;
    this.refreshMdnsAdvertisement('foreground');
    if (this.bridgeSource === 'desktop' && !this.desktopConnected) {
      this.scheduleHandoffToPhone('network_loss');
    }
  };

  private generateDeviceId(): string {
    try {
      if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
        return (crypto as any).randomUUID();
      }
    } catch {
      // ignore
    }
    return `ll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private inferDeviceName(): string {
    const constants = Platform.constants as Record<string, unknown> | undefined;
    const model =
      (constants?.Model as string | undefined) ||
      (constants?.model as string | undefined) ||
      (constants?.Brand as string | undefined);
    if (model && model.trim()) return model.trim();
    return Platform.OS === 'android' ? 'Android Phone' : 'iPhone';
  }

  private async ensureDeviceIdentity(): Promise<void> {
    if (!this.deviceName || this.deviceName === 'LuvLyrics Phone') {
      this.deviceName = this.inferDeviceName();
    }
    if (!this.deviceId) {
      const existing = await AsyncStorage.getItem(DesktopBridgeService.DEVICE_ID_KEY);
      if (existing && existing.trim()) {
        this.deviceId = existing;
      } else {
        const created = this.generateDeviceId();
        this.deviceId = created;
        await AsyncStorage.setItem(DesktopBridgeService.DEVICE_ID_KEY, created);
      }
    }

    const existingInstance = await AsyncStorage.getItem(DesktopBridgeService.INSTANCE_ID_KEY);
    if (existingInstance && existingInstance.trim()) {
      this.instanceId = existingInstance;
    } else {
      this.instanceId = this.generateDeviceId();
      await AsyncStorage.setItem(DesktopBridgeService.INSTANCE_ID_KEY, this.instanceId);
    }

    const existingPublicKey = await AsyncStorage.getItem(DesktopBridgeService.PUBLIC_KEY_KEY);
    const existingPrivateKey = await AsyncStorage.getItem(DesktopBridgeService.PRIVATE_KEY_KEY);
    const hasPemPublic = Boolean(existingPublicKey?.includes('BEGIN PUBLIC KEY'));
    const hasPemPrivate = Boolean(existingPrivateKey?.includes('BEGIN PRIVATE KEY'));
    if (hasPemPublic && hasPemPrivate) {
      this.phonePublicKey = existingPublicKey!;
      this.phonePrivateKey = existingPrivateKey!;
      return;
    }

    const seed = new Uint8Array(32);
    const cryptoObj = (globalThis as any).crypto;
    if (cryptoObj?.getRandomValues) {
      cryptoObj.getRandomValues(seed);
    } else {
      for (let i = 0; i < seed.length; i++) {
        seed[i] = Math.floor(Math.random() * 256);
      }
    }
    const pair = nacl.sign.keyPair.fromSeed(seed);
    const publicKey = pair.publicKey;

    const privatePem = ed25519SeedToPrivateKeyPem(seed);
    const publicPem = ed25519PublicKeyToPem(publicKey);
    this.phonePrivateKey = privatePem;
    this.phonePublicKey = publicPem;
    await AsyncStorage.multiSet([
      [DesktopBridgeService.PRIVATE_KEY_KEY, privatePem],
      [DesktopBridgeService.PUBLIC_KEY_KEY, publicPem],
    ]);
  }

  async updateControlPort(nextPort: number): Promise<void> {
    const normalized = Math.max(1024, Math.min(65535, Math.floor(nextPort)));
    if (normalized === this.controlPort) return;
    const wasRunning = this.running;
    this.controlPort = normalized;
    if (wasRunning) {
      this.stop();
      await this.start();
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    const tcpSocket = loadTcpSocket();
    if (!tcpSocket) {
      this.running = false;
      return;
    }
    try {
      await this.ensureDeviceIdentity();
      await this.startWsServer(tcpSocket);
      await this.startHttpServer(tcpSocket);
    } catch (error) {
      this.running = false;
      this.wsServer?.close?.();
      this.wsServer = null;
      this.httpServer?.close?.();
      this.httpServer = null;
      this.clients.clear();
      this.logServerError('Bridge startup', error);
      return;
    }
    this.running = true;
    this.startHeartbeatWatchdog();
    this.startIpWatchdog();
    this.appStateSub = AppState.addEventListener('change', this.handleAppStateChange);
    await this.startMdns('restart');
    this.subscribeToStores();
  }

  stop(): void {
    this.running = false;
    this.stopHeartbeatWatchdog();
    this.stopIpWatchdog();
    this.clearPendingHandoff();
    this.desktopConnected = false;
    this.lastDesktopHeartbeatAt = 0;
    this.bridgeSource = 'phone';
    this.latestDesktopPosition = null;
    this.desktopWasPlaying = false;
    this.appStateSub?.remove?.();
    this.appStateSub = null;
    this.playerUnsubscribe?.();
    this.playerUnsubscribe = null;
    this.downloadUnsubscribe?.();
    this.downloadUnsubscribe = null;
    this.wsServer?.close();
    this.wsServer = null;
    this.httpServer?.close();
    this.httpServer = null;
    const nativeLan = (NativeModules as any)?.LuvLyricsLanDiscovery;
    if (nativeLan?.stop) {
      nativeLan.stop();
    }
    if (this.zeroconf) {
      try {
        if (Platform.OS === 'android') {
          this.zeroconf.unpublishService(this.deviceName, ImplType.DNSSD);
        } else {
          this.zeroconf.unpublishService(this.deviceName);
        }
      } catch {
        // ignore
      }
      this.zeroconf.removeDeviceListeners?.();
      this.zeroconf = null;
    }
    this.clients.clear();
  }

  // ── WebSocket server ──────────────────────────────────────────────────────

  private startWsServer(tcpSocket: TcpSocketModule): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      this.wsServer = tcpSocket.createServer((socket: any) => {
      const id = ++this.clientCounter;
      const client: WsClient = {
        socket,
        handshaken: false,
        buffer: Buffer.alloc(0),
        protoVersion: 1,
        trusted: false,
        desktopDeviceId: null,
      };
      this.clients.set(id, client);

      socket.on('data', (data: Buffer) => {
        client.buffer = Buffer.concat([client.buffer, data]);

        if (!client.handshaken) {
          this.tryHandshake(id, client);
        } else {
          const { messages, remaining } = decodeFrames(client.buffer);
          client.buffer = remaining;
          for (const msg of messages) {
            if (msg === '__CLOSE__') {
              this.clients.delete(id);
              this.handleDesktopDisconnected('socket_close');
              socket.destroy();
              return;
            }
            this.handleMessage(msg, id);
          }
        }
      });

      socket.on('close', () => {
        this.clients.delete(id);
        this.handleDesktopDisconnected('socket_close');
        console.log('[DesktopBridge] Client disconnected:', id);
      });

      socket.on('error', () => {
        this.clients.delete(id);
        this.handleDesktopDisconnected('network_loss');
      });

    });

      this.wsServer.on('error', (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err);
          return;
        }
        this.logServerError('WS', err);
      });

      this.wsServer.listen(this.controlPort, '0.0.0.0', () => {
        if (!settled) {
          settled = true;
          resolve();
        }
        console.log('[DesktopBridge] WS server listening on', this.controlPort);
      });
    });
  }

  private tryHandshake(id: number, client: WsClient): void {
    const str = client.buffer.toString('utf8');
    if (!str.includes('\r\n\r\n')) return; // not enough data yet

    const keyMatch = str.match(/Sec-WebSocket-Key: ([^\r\n]+)/);
    if (!keyMatch) {
      client.socket.destroy();
      this.clients.delete(id);
      return;
    }

    const key = keyMatch[1].trim();
    const acceptKey = sha1Base64(key + MAGIC);

    const response =
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
      '\r\n';

    client.socket.write(Buffer.from(response, 'utf8'));
    client.handshaken = true;
    // Clear the HTTP request bytes from buffer
    client.buffer = Buffer.alloc(0);

    this.sendPresenceToClient(client);
    this.markDesktopConnected();
  }

  private sendToClient(client: WsClient, msg: string): void {
    if (!client.handshaken) return;
    try {
      client.socket.write(encodeFrame(msg));
    } catch {
      // socket may have closed
    }
  }

  private broadcast(msg: string, legacyMsg?: string): void {
    const frame = encodeFrame(msg);
    const legacyFrame = legacyMsg ? encodeFrame(legacyMsg) : null;
    for (const client of this.clients.values()) {
      if (client.handshaken) {
        try {
          client.socket.write(frame);
          if (legacyFrame && client.protoVersion < PROTO_VERSION) {
            client.socket.write(legacyFrame);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // ── HTTP file server ──────────────────────────────────────────────────────

  private startHttpServer(tcpSocket: TcpSocketModule): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      this.httpServer = tcpSocket.createServer((socket: any) => {
      let buf = Buffer.alloc(0);

      socket.on('data', (data: Buffer) => {
        buf = Buffer.concat([buf, data]);
        const str = buf.toString('utf8');
        if (!str.includes('\r\n\r\n')) return;

        const firstLine = str.split('\r\n')[0];
        const method = firstLine.split(' ')[0];
        const rawPath = firstLine.split(' ')[1];
        const [path, queryString = ''] = rawPath.split('?');
        const queryParams: Record<string, string> = {};
        if (queryString) {
          for (const part of queryString.split('&')) {
            if (!part) continue;
            const [k, v = ''] = part.split('=');
            queryParams[decodeURIComponent(k)] = decodeURIComponent(v);
          }
        }

        if (path === '/ping') {
          if (method !== 'GET') {
            socket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
            socket.destroy();
            return;
          }
          const now = Date.now();
          if (now - this.pingLogAt > 3000) {
            this.pingLogAt = now;
            console.log('[DesktopBridge] ping request');
          }
          const payload = JSON.stringify({
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            pairingCapable: true,
            controlPort: this.controlPort,
            protoVersion: PROTO_VERSION,
            instanceId: this.instanceId,
            ts: now,
          });
          socket.write(
            `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(payload, 'utf8')}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\n\r\n${payload}`
          );
          socket.destroy();
          return;
        }

        if (path === '/pair/callback') {
          if (method !== 'POST') {
            socket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
            socket.destroy();
            return;
          }
          const jsonStart = str.indexOf('\r\n\r\n');
          const body = jsonStart >= 0 ? str.slice(jsonStart + 4) : '{}';
          let parsed: any = null;
          try {
            parsed = JSON.parse(body || '{}');
          } catch {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
            socket.destroy();
            return;
          }
          if (!parsed?.desktopDeviceId) {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
            socket.destroy();
            return;
          }
          trustedPairingService
            .markSeen(parsed.desktopDeviceId)
            .catch(() => undefined);
          socket.write(
            'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\n\r\n{"ok":true}'
          );
          socket.destroy();
          return;
        }

        if (method !== 'GET') {
          socket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
          socket.destroy();
          return;
        }

        const state = usePlayerStore.getState();

        if (path === '/audio') {
          const audioUri = state.currentSong?.audioUri;
          if (!audioUri) {
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
          }
          this.serveFile(socket, audioUri, 'audio/mpeg');
          return;
        }

        if (path === '/cover') {
          const requestedSongId = queryParams.songId;
          const targetSong =
            requestedSongId && state.playlistQueue
              ? state.playlistQueue.find((s: any) => s.id === requestedSongId) ?? state.currentSong
              : state.currentSong;
          const coverUri = targetSong?.coverImageUri;
          const etag = `"${targetSong?.id ?? 'none'}-${targetSong?.dateModified ?? 0}"`;
          const currentSongId = state.currentSong?.id ?? null;
          if (Date.now() - this.coverLogAt > 1200) {
            this.coverLogAt = Date.now();
            console.log(
              '[DesktopBridge] cover resolution',
              JSON.stringify({
                requestedSongId,
                resolvedSongId: targetSong?.id ?? null,
                currentSongId,
              })
            );
          }
          if (!coverUri) {
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
          }
          this.serveFile(socket, coverUri, 'image/jpeg', etag);
          return;
        }

        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
      });

      socket.on('error', () => socket.destroy());
    });

      this.httpServer.on('error', (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err);
          return;
        }
        this.logServerError('HTTP', err);
      });

      this.httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
        if (!settled) {
          settled = true;
          resolve();
        }
        console.log('[DesktopBridge] HTTP server listening on', HTTP_PORT);
      });
    });
  }

  private async serveFile(
    socket: any,
    fileUri: string,
    contentType: string,
    etag?: string
  ): Promise<void> {
    try {
      const FileSystem = require('expo-file-system');
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = Buffer.from(base64, 'base64');

      const headers =
        `HTTP/1.1 200 OK\r\n` +
        `Content-Type: ${contentType}\r\n` +
        `Content-Length: ${bytes.length}\r\n` +
        `Access-Control-Allow-Origin: *\r\n` +
        `Cache-Control: no-store, max-age=0, must-revalidate\r\n` +
        (etag ? `ETag: ${etag}\r\n` : '') +
        `\r\n`;

      socket.write(Buffer.from(headers, 'utf8'));
      socket.write(bytes);
      socket.destroy();
    } catch {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }

  // ── mDNS advertisement ───────────────────────────────────────────────────

  private async getLocalIp(): Promise<string | null> {
    const tcpSocket = loadTcpSocket();
    if (!tcpSocket) return null;

    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      try {
        // Connecting to a public IP forces the OS to route via WiFi, which
        // sets localAddress on the socket — no data is actually sent.
        const sock = (tcpSocket as any).createConnection(
          { host: '8.8.8.8', port: 53, timeout: 2500 },
          () => {
            clearTimeout(timer);
            const ip: string | undefined = sock.localAddress;
            sock.destroy();
            resolve(ip && ip !== '0.0.0.0' && ip !== '::' ? ip : null);
          }
        );
        sock.on('error', () => { clearTimeout(timer); resolve(null); });
        sock.on('timeout', () => { clearTimeout(timer); sock.destroy(); resolve(null); });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  private async refreshMdnsAdvertisement(reason: 'foreground' | 'ip_change' | 'restart'): Promise<void> {
    if (!this.running) return;
    await this.startMdns(reason);
  }

  private async startMdns(reason: 'foreground' | 'ip_change' | 'restart' = 'restart'): Promise<void> {
    try {
      await this.ensureDeviceIdentity();
      const localIp = await this.getLocalIp();
      this.lastKnownIp = localIp;
      if (localIp) {
        console.log('[DesktopBridge] Local WiFi IP:', localIp);
      } else {
        console.warn('[DesktopBridge] Could not determine local IP; mDNS may not include address');
      }

      if (!this.zeroconf) {
        this.zeroconf = new Zeroconf();
        this.zeroconf.on('published', (service: any) => {
          console.log('[DesktopBridge] mDNS published:', JSON.stringify(service));
        });
        this.zeroconf.on('error', (error: Error) => {
          console.error('[DesktopBridge] mDNS error:', error);
        });
      }

      const txt: Record<string, string> = {
        deviceId: this.deviceId ?? '',
        deviceName: this.deviceName,
        protoVersion: String(PROTO_VERSION),
        controlPort: String(this.controlPort),
        instanceId: this.instanceId ?? '',
        pairingCapable: 'true',
      };

      const nativeLan = (NativeModules as any)?.LuvLyricsLanDiscovery;
      if (nativeLan?.publishService) {
        await nativeLan.publishService({
          type: '_luvlyrics._tcp',
          port: this.controlPort,
          txt,
          serviceName: this.deviceName,
        });
        return;
      }

      const implType: ZeroconfImplType | undefined =
        Platform.OS === 'android' ? ImplType.DNSSD : undefined;

      try {
        if (Platform.OS === 'android') {
          this.zeroconf.unpublishService(this.deviceName, ImplType.DNSSD);
        } else {
          this.zeroconf.unpublishService(this.deviceName);
        }
      } catch {
        // ignore when no existing publication
      }

      this.zeroconf.publishService(
        'luvlyrics',
        'tcp',
        'local.',
        this.deviceName,
        this.controlPort,
        txt,
        implType
      );
      if (Date.now() - this.mdnsPublishLogAt > 800) {
        this.mdnsPublishLogAt = Date.now();
        console.log(
          '[DesktopBridge] mDNS publish payload',
          JSON.stringify({
            reason,
            service: '_luvlyrics._tcp.local',
            name: this.deviceName,
            port: this.controlPort,
            txtKeys: Object.keys(txt),
            impl: Platform.OS === 'android' ? ImplType.DNSSD : Platform.OS,
          })
        );
      }
    } catch (e) {
      console.warn('[DesktopBridge] mDNS not available (react-native-zeroconf not installed):', e);
    }
  }

  // ── Store subscriptions ──────────────────────────────────────────────────

  private subscribeToStores(): void {
    // Subscribe to player state changes
    this.playerUnsubscribe = usePlayerStore.subscribe((state) => {
      if (!this.running || this.clients.size === 0) return;
      const msg = this.buildStateMessage(state, true);
      this.broadcast(msg, this.buildLegacyStateMessage(state));
    });

    // Subscribe to download queue changes
    this.downloadUnsubscribe = useDownloadQueueStore.subscribe((state) => {
      if (!this.running || this.clients.size === 0) return;
      for (const item of state.queue) {
        const msg = JSON.stringify({
          type: 'DOWNLOAD_PROGRESS',
          id: item.id,
          progress: item.progress,
          status: item.status,
          stageStatus: item.stageStatus,
          error: item.error,
        });
        this.broadcast(msg);
      }
    });
  }

  private sendSnapshotToClient(client: WsClient): void {
    const state = usePlayerStore.getState();
    this.sendToClient(client, this.buildStateMessage(state, true));
    if (client.protoVersion < PROTO_VERSION) {
      this.sendToClient(client, this.buildLegacyStateMessage(state));
    }
  }

  private sendPresenceToClient(client: WsClient): void {
    this.sendToClient(
      client,
      JSON.stringify({
        type: 'presence',
        protoVersion: PROTO_VERSION,
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        instanceId: this.instanceId,
      })
    );
  }

  private buildStateMessage(state: any, mutateVersion = false): string {
    if (mutateVersion) this.stateVersion += 1;
    const current = state.currentSong;
    const palette = {
      gradientId: current?.gradientId ?? 'dynamic',
      coverImageUri: current?.coverImageUri ?? null,
    };
    return JSON.stringify({
      type: 'state',
      protoVersion: PROTO_VERSION,
      stateVersion: this.stateVersion,
      track: current
        ? {
            id: current.id,
            title: current.title,
            artist: current.artist ?? '',
            album: current.album ?? '',
            duration: current.duration,
            coverImageUri: current.coverImageUri ?? null,
          }
        : null,
      playback: {
        position: state.position ?? 0,
        positionMs: Math.max(0, Math.floor((state.position ?? 0) * 1000)),
        duration: state.duration ?? 0,
        durationMs: Math.max(0, Math.floor((state.duration ?? 0) * 1000)),
        isPlaying: Boolean(state.isPlaying),
        source: this.bridgeSource,
        audioSource: this.bridgeSource,
      },
      queue: (state.playlistQueue ?? []).slice(0, 100).map((s: any) => ({
        id: s.id,
        title: s.title,
        artist: s.artist ?? '',
        duration: s.duration,
        coverImageUri: s.coverImageUri ?? null,
      })),
      currentQueueIndex: state.currentQueueIndex,
      lyrics: (current?.lyrics ?? []).map((l: any) => ({
        timestamp: l.timestamp,
        text: l.text,
        lineOrder: l.lineOrder,
      })),
      palette,
    });
  }

  private buildLegacyStateMessage(state: any): string {
    return JSON.stringify({
      type: 'STATE',
      payload: {
        currentSong: state.currentSong
          ? {
              id: state.currentSong.id,
              title: state.currentSong.title,
              artist: state.currentSong.artist ?? '',
              album: state.currentSong.album ?? '',
              gradientId: state.currentSong.gradientId,
              duration: state.currentSong.duration,
              coverImageUri: state.currentSong.coverImageUri,
            }
          : null,
        position: state.position,
        duration: state.duration,
        isPlaying: state.isPlaying,
        volume: 0.8,
        audioSource: this.bridgeSource,
        queue: (state.playlistQueue ?? []).slice(0, 20).map((s: any) => ({
          id: s.id,
          title: s.title,
          artist: s.artist ?? '',
          gradientId: s.gradientId,
          duration: s.duration,
        })),
        currentQueueIndex: state.currentQueueIndex,
        lyrics: (state.currentSong?.lyrics ?? []).map((l: any) => ({
          timestamp: l.timestamp,
          text: l.text,
          lineOrder: l.lineOrder,
        })),
      },
    });
  }

  // ── Command handler ──────────────────────────────────────────────────────

  private handleMessage(raw: string, _clientId?: number): void {
    try {
      const msg = JSON.parse(raw);
      const client = _clientId ? this.clients.get(_clientId) : null;
      this.markDesktopHeartbeat();
      if (msg?.protoVersion && Number.isFinite(msg.protoVersion) && _clientId) {
        if (client) client.protoVersion = Number(msg.protoVersion);
      }
      if (msg.type === 'presence' && client) {
        const desktopDeviceId = typeof msg.deviceId === 'string' ? msg.deviceId : null;
        client.desktopDeviceId = desktopDeviceId;
        if (desktopDeviceId) {
          trustedPairingService
            .listTrustedDesktops()
            .then((records) => {
              client.trusted = records.some((r) => r.desktopDeviceId === desktopDeviceId);
              if (client.trusted) {
                trustedPairingService.markSeen(desktopDeviceId).catch(() => undefined);
                this.sendSnapshotToClient(client);
              } else {
                client.socket.destroy();
              }
            })
            .catch(() => {
              client.socket.destroy();
            });
        } else {
          client.socket.destroy();
        }
        return;
      }
      if (msg.type === 'HEARTBEAT' || msg.action === 'HEARTBEAT') return;
      if (msg.type === 'SYNC_REQUEST' || (msg.type === 'cmd' && msg.action === 'SYNC_REQUEST')) {
        if (client && client.trusted) this.sendSnapshotToClient(client);
        return;
      }
      const isV2Command = msg?.type === 'cmd';
      const isLegacyCommand = msg?.type === 'CMD';
      if (!isV2Command && !isLegacyCommand) return;

      const settings = useDesktopBridgeSettingsStore.getState();
      if (!settings.desktopConnectEnabled) return;
      if (client && !client.trusted) return;

      const playerStore = usePlayerStore.getState();
      const action = msg.action;
      const commandId = typeof msg.id === 'string' ? msg.id : '';
      const requiresAck = Boolean(msg.requiresAck || isV2Command);
      const payload = msg.payload ?? msg;

      if ((action === 'NEXT' || action === 'PREV') && commandId) {
        if (this.seenNonIdempotentIds.has(commandId)) {
          if (requiresAck) this.sendAck(_clientId, commandId, true);
          return;
        }
        this.seenNonIdempotentIds.add(commandId);
        if (this.seenNonIdempotentIds.size > 300) {
          const first = this.seenNonIdempotentIds.values().next().value;
          if (first) this.seenNonIdempotentIds.delete(first);
        }
      }

      switch (action) {
        case 'PLAY':
          this.desktopWasPlaying = true;
          if (!playerStore.isPlaying) playerControls.play();
          break;

        case 'PAUSE':
          this.desktopWasPlaying = false;
          if (playerStore.isPlaying) playerControls.pause();
          break;

        case 'NEXT':
          playerStore.nextInPlaylist().catch(() => {});
          break;

        case 'PREV':
          playerStore.previousInPlaylist();
          break;

        case 'SEEK':
          if (typeof payload.position === 'number') {
            this.latestDesktopPosition = payload.position;
            const epsilon = 0.15;
            if (Math.abs((usePositionStore.getState().position ?? 0) - payload.position) > epsilon) {
              playerControls.seekTo(payload.position);
            }
          }
          break;

        case 'SET_VOLUME':
          // Volume control via AVPlayer is handled by the PlayerContext
          // Expose it through a new action if needed; for now ignore
          break;

        case 'SET_SOURCE':
          if (payload.source === 'desktop') {
            this.transitionSource('desktop');
          } else {
            this.transitionSource('phone', 'unload_signal');
          }
          break;

        case 'DOWNLOAD':
          if (!settings.allowDesktopDownloads) return;
          if (payload.song) {
            useDownloadQueueStore.getState().addToQueue([payload.song]);
          }
          break;

        default:
          console.warn('[DesktopBridge] Unknown action:', action);
      }
      if (requiresAck && commandId) {
        this.sendAck(_clientId, commandId, true);
      }
    } catch (e) {
      console.warn('[DesktopBridge] Failed to parse message:', e);
    }
  }

  private sendAck(clientId: number | undefined, commandId: string, ok: boolean): void {
    if (!clientId) return;
    const client = this.clients.get(clientId);
    if (!client) return;
    this.sendToClient(
      client,
      JSON.stringify({
        id: commandId,
        type: 'ack',
        ok,
        appliedPositionMs: Math.max(0, Math.floor((usePositionStore.getState().position ?? 0) * 1000)),
        stateVersion: this.stateVersion,
      })
    );
  }

  getPairingContext(): {
    phoneDeviceId: string | null;
    phoneDisplayName: string;
    phonePublicKey: string | null;
    controlPort: number;
    protoVersion: number;
    instanceId: string | null;
  } {
    return {
      phoneDeviceId: this.deviceId,
      phoneDisplayName: this.deviceName,
      phonePublicKey: this.phonePublicKey,
      controlPort: this.controlPort,
      protoVersion: PROTO_VERSION,
      instanceId: this.instanceId,
    };
  }

  async pairFromQrPayload(qrPayloadRaw: string): Promise<void> {
    await this.ensureDeviceIdentity();
    const ctx = this.getPairingContext();
    if (!ctx.phoneDeviceId || !ctx.phonePublicKey || !ctx.instanceId) {
      throw new Error('Phone identity is not ready');
    }
    if (!this.phonePrivateKey) {
      throw new Error('Phone private key unavailable');
    }
    await trustedPairingService.pairWithDesktop(qrPayloadRaw, {
      phoneDeviceId: ctx.phoneDeviceId,
      phoneDisplayName: ctx.phoneDisplayName,
      phonePublicKey: ctx.phonePublicKey,
      controlPort: ctx.controlPort,
      protoVersion: ctx.protoVersion,
      instanceId: ctx.instanceId,
      phonePrivateKey: this.phonePrivateKey,
    });
  }
}

function toPem(label: string, derBytes: Uint8Array): string {
  const base64 = Buffer.from(derBytes).toString('base64');
  const lines = base64.match(/.{1,64}/g)?.join('\n') ?? base64;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function ed25519SeedToPrivateKeyPem(seed: Uint8Array): string {
  // PKCS#8 DER prefix for Ed25519 + 32-byte seed
  const prefix = Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
  ]);
  const der = new Uint8Array(prefix.length + seed.length);
  der.set(prefix, 0);
  der.set(seed, prefix.length);
  return toPem('PRIVATE KEY', der);
}

function ed25519PublicKeyToPem(publicKey: Uint8Array): string {
  // SPKI DER prefix for Ed25519 + 32-byte public key
  const prefix = Uint8Array.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);
  const der = new Uint8Array(prefix.length + publicKey.length);
  der.set(prefix, 0);
  der.set(publicKey, prefix.length);
  return toPem('PUBLIC KEY', der);
}

export const desktopBridgeService = new DesktopBridgeService();
