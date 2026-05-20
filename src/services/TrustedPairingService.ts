import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import nacl from 'tweetnacl';

export interface DesktopPairingQrPayload {
  v: number;
  sessionId: string;
  pairingToken: string;
  desktopDeviceId: string;
  desktopDisplayName: string;
  desktopPublicKey: string;
  callbackUrl: string;
  expiresAt: string | number;
}

export interface TrustedDesktopRecord {
  desktopDeviceId: string;
  desktopDisplayName: string;
  desktopPublicKey: string;
  trustedAt: string;
  lastSeenAt: string;
  protoVersion: number;
}

interface PairRequestBody {
  phoneDeviceId: string;
  phoneDisplayName: string;
  phonePublicKey: string;
  controlPort: number;
  protoVersion: number;
  instanceId: string;
  phonePrivateKey: string;
}

const TRUSTED_DESKTOPS_KEY = '@desktop_bridge_trusted_desktops_v2';

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(Buffer.from(body, 'base64'));
}

function extractEd25519SeedFromPrivateKeyPem(privateKeyPem: string): Uint8Array {
  const der = pemToDer(privateKeyPem);
  if (der.length < 32) {
    throw new Error('Invalid Ed25519 private key PEM');
  }
  return der.slice(der.length - 32);
}

function buildSigningPayloadJson(payload: {
  sessionId: string;
  pairingToken: string;
  phoneDeviceId: string;
  phoneDisplayName: string;
  phonePublicKey: string;
  controlPort: number;
  protoVersion: number;
  instanceId: string;
}): string {
  // Keep exact key order per desktop verification contract.
  return JSON.stringify({
    sessionId: payload.sessionId,
    pairingToken: payload.pairingToken,
    phoneDeviceId: payload.phoneDeviceId,
    phoneDisplayName: payload.phoneDisplayName,
    phonePublicKey: payload.phonePublicKey,
    controlPort: payload.controlPort,
    protoVersion: payload.protoVersion,
    instanceId: payload.instanceId,
  });
}

class TrustedPairingService {
  private isLocalCallbackUrl(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      const host = url.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return true;
      if (/^10\./.test(host)) return true;
      if (/^192\.168\./.test(host)) return true;
      if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
      return false;
    } catch {
      return false;
    }
  }

  parsePayload(raw: string): DesktopPairingQrPayload {
    const parsed = JSON.parse(raw) as DesktopPairingQrPayload;
    const required: Array<keyof DesktopPairingQrPayload> = [
      'v',
      'sessionId',
      'pairingToken',
      'desktopDeviceId',
      'desktopDisplayName',
      'desktopPublicKey',
      'callbackUrl',
      'expiresAt',
    ];
    for (const key of required) {
      if (parsed[key] === undefined || parsed[key] === null || parsed[key] === '') {
        throw new Error(`Invalid QR payload: missing ${key}`);
      }
    }
    return parsed;
  }

  validateExpiry(expiresAt: string | number): void {
    const ts =
      typeof expiresAt === 'number'
        ? expiresAt
        : Date.parse(expiresAt);
    if (!Number.isFinite(ts)) throw new Error('Invalid QR payload: expiresAt is not a valid date');
    if (Date.now() > ts) throw new Error('Pairing QR has expired');
  }

  async pairWithDesktop(
    qrPayloadRaw: string,
    request: PairRequestBody
  ): Promise<TrustedDesktopRecord> {
    const payload = this.parsePayload(qrPayloadRaw);
    this.validateExpiry(payload.expiresAt);
    if (!this.isLocalCallbackUrl(payload.callbackUrl)) {
      throw new Error('Pairing callback URL must be on local network');
    }

    const response = await fetch(payload.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify((() => {
        const pairingPayload = {
          sessionId: payload.sessionId,
          pairingToken: payload.pairingToken,
          phoneDeviceId: request.phoneDeviceId,
          phoneDisplayName: request.phoneDisplayName,
          phonePublicKey: request.phonePublicKey,
          controlPort: request.controlPort,
          protoVersion: request.protoVersion,
          instanceId: request.instanceId,
        };
        const signingJson = buildSigningPayloadJson(pairingPayload);
        const seed = extractEd25519SeedFromPrivateKeyPem(request.phonePrivateKey);
        const keyPair = nacl.sign.keyPair.fromSeed(seed);
        const signatureBytes = nacl.sign.detached(
          Buffer.from(signingJson, 'utf8'),
          keyPair.secretKey
        );
        const signature = Buffer.from(signatureBytes).toString('base64');
        return {
          ...pairingPayload,
          signature,
        };
      })()),
    });

    if (!response.ok) {
      throw new Error(`Pairing callback failed (${response.status})`);
    }

    const record: TrustedDesktopRecord = {
      desktopDeviceId: payload.desktopDeviceId,
      desktopDisplayName: payload.desktopDisplayName,
      desktopPublicKey: payload.desktopPublicKey,
      trustedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      protoVersion: request.protoVersion,
    };
    await this.saveTrustedDesktop(record);
    return record;
  }

  async listTrustedDesktops(): Promise<TrustedDesktopRecord[]> {
    const raw = await AsyncStorage.getItem(TRUSTED_DESKTOPS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as TrustedDesktopRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async saveTrustedDesktop(record: TrustedDesktopRecord): Promise<void> {
    const all = await this.listTrustedDesktops();
    const next = [
      record,
      ...all.filter((d) => d.desktopDeviceId !== record.desktopDeviceId),
    ];
    await AsyncStorage.setItem(TRUSTED_DESKTOPS_KEY, JSON.stringify(next));
  }

  async markSeen(desktopDeviceId: string): Promise<void> {
    const all = await this.listTrustedDesktops();
    const next = all.map((d) =>
      d.desktopDeviceId === desktopDeviceId
        ? { ...d, lastSeenAt: new Date().toISOString() }
        : d
    );
    await AsyncStorage.setItem(TRUSTED_DESKTOPS_KEY, JSON.stringify(next));
  }
}

export const trustedPairingService = new TrustedPairingService();
