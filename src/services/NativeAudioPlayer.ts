import { Platform } from 'react-native';

let MainPlayerModule: any = null;
let eventEmitter: any = null;

if (Platform.OS === 'android') {
  try {
    const { requireNativeModule, EventEmitter } = require('expo-modules-core');
    MainPlayerModule = requireNativeModule('MainPlayer');
    eventEmitter = new EventEmitter(MainPlayerModule);
  } catch {
    // MainPlayer native module not available — expo-audio fallback active
  }
}

export type PlayerMetadata = {
  title: string;
  artist: string;
  album: string;
  artworkUri: string;
  mediaId?: string;
};

export const NativeAudioPlayer = {
  isAvailable(): boolean {
    return Platform.OS === 'android' && MainPlayerModule !== null;
  },

  async load(uri: string, metadata: PlayerMetadata) {
    if (!this.isAvailable()) return;
    return await MainPlayerModule.load(uri, metadata);
  },

  /** Stage the following track so Media3 can auto-advance without a JS reload. */
  prepareNext(uri: string, metadata: PlayerMetadata, mediaId: string) {
    if (!this.isAvailable() || !mediaId) return;
    MainPlayerModule.prepareNext(uri, metadata, mediaId);
  },

  /**
   * Seek to the prepared next item if its mediaId matches.
   * True → JS must not call load(); false → fall back to full load.
   */
  async seekToNextIfReady(mediaId: string): Promise<boolean> {
    if (!this.isAvailable() || !mediaId) return false;
    return !!(await MainPlayerModule.seekToNextIfReady(mediaId));
  },

  play() {
    if (!this.isAvailable()) return;
    MainPlayerModule.play();
  },

  pause() {
    if (!this.isAvailable()) return;
    MainPlayerModule.pause();
  },

  seekTo(seconds: number) {
    if (!this.isAvailable()) return;
    MainPlayerModule.seekTo(seconds);
  },

  updateMetadata(metadata: PlayerMetadata) {
    if (!this.isAvailable()) return;
    MainPlayerModule.updateMetadata(metadata);
  },

  destroy() {
    if (!this.isAvailable()) return;
    MainPlayerModule.destroy();
  },

  addListener(
    eventName: 'onPlaybackStatus' | 'onRemoteCommand' | 'onTrackAdvanced',
    callback: (data: any) => void,
  ) {
    if (!this.isAvailable() || !eventEmitter) {
      return { remove: () => {} };
    }
    return eventEmitter.addListener(eventName, callback);
  },
};
