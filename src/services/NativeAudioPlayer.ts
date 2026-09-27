import { Platform } from 'react-native';
import { EMPTY_SUB, getNativeModule, nativeAddListener } from './nativeModule';

type MainPlayerNative = {
  load: (uri: string, metadata: PlayerMetadata) => Promise<void>;
  prepareNext: (uri: string, metadata: PlayerMetadata, mediaId: string) => void;
  seekToNextIfReady: (mediaId: string) => Promise<boolean>;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  updateMetadata: (metadata: PlayerMetadata) => void;
  destroy: () => void;
  getVolume?: () => number;
  setVolume?: (level: number) => void;
  openOutputSwitcher?: () => boolean;
  addListener: (event: string, cb: (data: any) => void) => { remove: () => void };
};

const MainPlayerModule = getNativeModule<MainPlayerNative>('MainPlayer');

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
    if (!this.isAvailable() || !MainPlayerModule) return;
    return await MainPlayerModule.load(uri, metadata);
  },

  /** Stage the following track so Media3 can auto-advance without a JS reload. */
  prepareNext(uri: string, metadata: PlayerMetadata, mediaId: string) {
    if (!this.isAvailable() || !MainPlayerModule || !mediaId) return;
    MainPlayerModule.prepareNext(uri, metadata, mediaId);
  },

  /**
   * Seek to the prepared next item if its mediaId matches.
   * True → JS must not call load(); false → fall back to full load.
   */
  async seekToNextIfReady(mediaId: string): Promise<boolean> {
    if (!this.isAvailable() || !MainPlayerModule || !mediaId) return false;
    return !!(await MainPlayerModule.seekToNextIfReady(mediaId));
  },

  play() {
    if (!this.isAvailable() || !MainPlayerModule) return;
    MainPlayerModule.play();
  },

  pause() {
    if (!this.isAvailable() || !MainPlayerModule) return;
    MainPlayerModule.pause();
  },

  seekTo(seconds: number) {
    if (!this.isAvailable() || !MainPlayerModule) return;
    MainPlayerModule.seekTo(seconds);
  },

  updateMetadata(metadata: PlayerMetadata) {
    if (!this.isAvailable() || !MainPlayerModule) return;
    MainPlayerModule.updateMetadata(metadata);
  },

  destroy() {
    if (!this.isAvailable() || !MainPlayerModule) return;
    MainPlayerModule.destroy();
  },

  /** System media volume, 0..1 (null where the platform has no control). */
  getVolume(): number | null {
    if (!this.isAvailable() || !MainPlayerModule?.getVolume) return null;
    try { return MainPlayerModule.getVolume(); } catch { return null; }
  },

  setVolume(level: number) {
    if (!this.isAvailable() || !MainPlayerModule?.setVolume) return;
    try { MainPlayerModule.setVolume(Math.max(0, Math.min(1, level))); } catch { /* no volume control */ }
  },

  /** Opens the system output picker (speaker / Bluetooth / cast). */
  openOutputSwitcher(): boolean {
    if (!this.isAvailable() || !MainPlayerModule?.openOutputSwitcher) return false;
    try { return MainPlayerModule.openOutputSwitcher(); } catch { return false; }
  },

  addListener(
    eventName: 'onPlaybackStatus' | 'onRemoteCommand' | 'onTrackAdvanced' | 'onVolumeChanged',
    callback: (data: any) => void,
  ) {
    if (!this.isAvailable()) return EMPTY_SUB;
    return nativeAddListener(MainPlayerModule, eventName, callback);
  },
};
