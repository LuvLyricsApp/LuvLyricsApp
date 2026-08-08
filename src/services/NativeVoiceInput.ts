import { Platform } from 'react-native';
import { getNativeModule, nativeAddListener } from './nativeModule';

export interface VoiceResultEvent { transcript: string }
export interface VoiceAudioLevelEvent { level: number }
export interface VoiceErrorEvent { code: string; message?: string }

type VoiceNative = {
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  cancelListening: () => Promise<void>;
  addListener: (event: string, cb: (data: any) => void) => { remove: () => void };
};

const VoiceInputModule = getNativeModule<VoiceNative>('VoiceInput');

export const NativeVoiceInput = {
  isAvailable(): boolean {
    return Platform.OS === 'android' && VoiceInputModule !== null;
  },

  async startListening(): Promise<void> {
    if (!this.isAvailable() || !VoiceInputModule) return;
    return await VoiceInputModule.startListening();
  },

  async stopListening(): Promise<void> {
    if (!this.isAvailable() || !VoiceInputModule) return;
    return await VoiceInputModule.stopListening();
  },

  async cancelListening(): Promise<void> {
    if (!this.isAvailable() || !VoiceInputModule) return;
    return await VoiceInputModule.cancelListening();
  },

  onStart(cb: () => void) {
    return nativeAddListener(VoiceInputModule, 'onStart', cb);
  },
  onResult(cb: (e: VoiceResultEvent) => void) {
    return nativeAddListener(VoiceInputModule, 'onResult', cb);
  },
  onPartialResult(cb: (e: VoiceResultEvent) => void) {
    return nativeAddListener(VoiceInputModule, 'onPartialResult', cb);
  },
  onAudioLevel(cb: (e: VoiceAudioLevelEvent) => void) {
    return nativeAddListener(VoiceInputModule, 'onAudioLevel', cb);
  },
  onEnd(cb: (e: VoiceResultEvent) => void) {
    return nativeAddListener(VoiceInputModule, 'onEnd', cb);
  },
  onError(cb: (e: VoiceErrorEvent) => void) {
    return nativeAddListener(VoiceInputModule, 'onError', cb);
  },
};
