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
  refreshStatus?: () => void;
  setPlaybackParameters?: (speed: number, pitch: number) => boolean;
  setRepeatOne?: (on: boolean) => boolean;
  openEqualizer?: () => boolean;
  setRingtone?: (path: string, title: string) => Promise<RingtoneResult>;
  addListener: (event: string, cb: (data: any) => void) => { remove: () => void };
};

const MainPlayerModule = getNativeModule<MainPlayerNative>('MainPlayer');

export type RingtoneResult = 'ok' | 'permission' | 'unsupported' | 'missing' | 'error';

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

  /** Ask native to re-send the playback status (app back in the foreground). */
  refreshStatus() {
    if (!this.isAvailable() || !MainPlayerModule?.refreshStatus) return;
    try { MainPlayerModule.refreshStatus(); } catch { /* older native build */ }
  },

  /** Opens the system output picker (speaker / Bluetooth / cast). */
  openOutputSwitcher(): boolean {
    if (!this.isAvailable() || !MainPlayerModule?.openOutputSwitcher) return false;
    try { return MainPlayerModule.openOutputSwitcher(); } catch { return false; }
  },

  /** Tempo and pitch (1 = normal). False on a build without the native call. */
  setPlaybackParameters(speed: number, pitch: number): boolean {
    if (!this.isAvailable() || !MainPlayerModule?.setPlaybackParameters) return false;
    try { return MainPlayerModule.setPlaybackParameters(speed, pitch); } catch { return false; }
  },

  /** Loop the current song natively (Media3 REPEAT_MODE_ONE). */
  setRepeatOne(on: boolean): boolean {
    if (!this.isAvailable() || !MainPlayerModule?.setRepeatOne) return false;
    try { return MainPlayerModule.setRepeatOne(on); } catch { return false; }
  },

  /** The phone's equalizer panel for our audio session. False when there is none. */
  openEqualizer(): boolean {
    if (!this.isAvailable() || !MainPlayerModule?.openEqualizer) return false;
    try { return MainPlayerModule.openEqualizer(); } catch { return false; }
  },

  /** Copies a saved song into Ringtones and makes it the phone's ringtone. */
  async setRingtone(path: string, title: string): Promise<RingtoneResult> {
    if (!this.isAvailable() || !MainPlayerModule?.setRingtone) return 'unsupported';
    try { return await MainPlayerModule.setRingtone(path, title); } catch { return 'error'; }
  },

  addListener(
    eventName: 'onPlaybackStatus' | 'onRemoteCommand' | 'onTrackAdvanced' | 'onVolumeChanged',
    callback: (data: any) => void,
  ) {
    if (!this.isAvailable()) return EMPTY_SUB;
    return nativeAddListener(MainPlayerModule, eventName, callback);
  },
};
