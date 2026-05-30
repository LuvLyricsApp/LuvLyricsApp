import { Platform } from 'react-native';

let VoiceInputModule: any = null;
let eventEmitter: any = null;

if (Platform.OS === 'android') {
  try {
    const { requireNativeModule, EventEmitter } = require('expo-modules-core');
    VoiceInputModule = requireNativeModule('VoiceInput');
    eventEmitter = new EventEmitter(VoiceInputModule);
  } catch {
    // VoiceInput native module not available — JS fallback active
  }
}

export interface VoiceResultEvent { transcript: string }
export interface VoiceAudioLevelEvent { level: number }
export interface VoiceErrorEvent { code: string; message?: string }

export const NativeVoiceInput = {
  isAvailable(): boolean {
    return Platform.OS === 'android' && VoiceInputModule !== null;
  },

  async startListening(): Promise<void> {
    if (!this.isAvailable()) return;
    return await VoiceInputModule.startListening();
  },

  async stopListening(): Promise<void> {
    if (!this.isAvailable()) return;
    return await VoiceInputModule.stopListening();
  },

  async cancelListening(): Promise<void> {
    if (!this.isAvailable()) return;
    return await VoiceInputModule.cancelListening();
  },

  onStart(cb: () => void) {
    return eventEmitter?.addListener('onStart', cb);
  },
  onResult(cb: (e: VoiceResultEvent) => void) {
    return eventEmitter?.addListener('onResult', cb);
  },
  onPartialResult(cb: (e: VoiceResultEvent) => void) {
    return eventEmitter?.addListener('onPartialResult', cb);
  },
  onAudioLevel(cb: (e: VoiceAudioLevelEvent) => void) {
    return eventEmitter?.addListener('onAudioLevel', cb);
  },
  onEnd(cb: (e: VoiceResultEvent) => void) {
    return eventEmitter?.addListener('onEnd', cb);
  },
  onError(cb: (e: VoiceErrorEvent) => void) {
    return eventEmitter?.addListener('onError', cb);
  },
};
