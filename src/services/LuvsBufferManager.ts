/**
 * Luvs Buffer Manager
 * Manages bi-directional audio buffer for instant swipe playback.
 * On Android, uses custom high-performance Kotlin LuvsPlayer pool to bypass JS bridge.
 * On iOS, uses a standard expo-audio sliding window player.
 */

import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { UnifiedSong } from '../types/song';
import { getNativeModule, nativeAddListener } from './nativeModule';

// Module is already an EventEmitter on Expo SDK 52+ — do not wrap with EventEmitter.
const LuvsPlayerModule = getNativeModule<any>('LuvsPlayer');

// iOS Sliding Window limits
const BUFFER_BEHIND = 1; 
const BUFFER_AHEAD = 4; 

interface AudioSlot {
  sound: AudioPlayer | null;
  song: UnifiedSong | null;
  isLoaded: boolean;
  // expo-av had a settable onPlaybackStatusUpdate; expo-audio uses addListener,
  // so each slot has to hold its subscription in order to detach it later.
  sub: { remove: () => void } | null;
}

// expo-av's stopAsync() has no expo-audio equivalent — pause and rewind.
const stopPlayer = (player: AudioPlayer) => {
  try {
    player.pause();
    player.seekTo(0);
  } catch {
    // player already released
  }
};

class LuvsBufferManager {
  // iOS properties
  private slots: Map<number, AudioSlot> = new Map();
  private activeIndex: number = -1;
  private isInitialized: boolean = false;
  private loadingPromises: Map<number, Promise<void>> = new Map();
  private activeStatusCallback: ((status: any) => void) | null = null;
  private isSuspended: boolean = false;

  // Android property
  private nativeStatusSub: any = null;

  /**
   * Enter Luvs Mode - Set up audio focus for independent playback
   */
  async enterLuvsMode() {
    if (Platform.OS === 'android' && LuvsPlayerModule) {
      await LuvsPlayerModule.enterLuvsMode();
      this.isInitialized = true;
      if (__DEV__) console.log('[LuvsBuffer] Entered native Luvs mode');
      return;
    }

    if (this.isInitialized) return;
    if (__DEV__) console.log('[LuvsBuffer] Entering Luvs mode, setting up audio focus');
    
    try {
      await setAudioModeAsync({
        shouldPlayInBackground: false,
        interruptionModeAndroid: 'duckOthers',
        shouldRouteThroughEarpiece: false,
        playsInSilentMode: true,
      });
      
      this.isInitialized = true;
    } catch (error) {
      console.error('[LuvsBuffer] Failed to set audio mode:', error);
    }
  }

  /**
   * Exit Luvs Mode - Clean up all sounds and reset audio mode
   */
  async exitLuvsMode() {
    if (Platform.OS === 'android' && LuvsPlayerModule) {
      this.nativeStatusSub?.remove();
      this.nativeStatusSub = null;
      await LuvsPlayerModule.exitLuvsMode();
      this.isInitialized = false;
      this.activeIndex = -1;
      this.activeStatusCallback = null;
      return;
    }

    if (__DEV__) console.log('[LuvsBuffer] Exiting Luvs mode, cleaning up');
    
    const slotsToCleanup = Array.from(this.slots.entries());
    this.slots.clear();
    this.loadingPromises.clear();

    for (const [index, slot] of slotsToCleanup) {
      if (slot.sound) {
        try {
          slot.sub?.remove();
          slot.sub = null;
          slot.sound.remove();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (!errorMsg.includes('Player does not exist')) {
            console.warn(`[LuvsBuffer] Unload failed for slot ${index}:`, errorMsg);
          }
        }
      }
    }
    
    this.slots.clear();
    this.activeIndex = -1;
    this.isInitialized = false;
    this.activeStatusCallback = null;
    
    try {
      await setAudioModeAsync({
        shouldPlayInBackground: true,
        interruptionModeAndroid: 'doNotMix',
        shouldRouteThroughEarpiece: false,
        playsInSilentMode: true,
      });
    } catch (error) {
      console.error('[LuvsBuffer] Failed to reset audio mode:', error);
    }
  }

  /**
   * Set suspension state
   */
  setSuspended(suspended: boolean) {
    if (__DEV__) console.log(`[LuvsBuffer] Suspension changed: ${this.isSuspended} → ${suspended}`);
    this.isSuspended = suspended;
    if (Platform.OS === 'android' && LuvsPlayerModule) {
      if (suspended) {
        LuvsPlayerModule.pause();
      } else {
        LuvsPlayerModule.resume();
      }
    }
  }

  /**
   * Update active index - shifts buffer window, loads/unloads as needed
   */
  /**
   * The taste map: play `song` and keep `warm` ready (what a swipe can reach
   * next). Addressed by URL on Android, so moving between lanes never plays
   * the wrong song from a stale index.
   */
  async activate(song: UnifiedSong, warm: UnifiedSong[], shouldPlay: boolean = true, startAtHook: boolean = false) {
    const url = song.streamUrl || song.downloadUrl || '';
    if (!url) return;
    if (Platform.OS === 'android' && LuvsPlayerModule?.activateUrl) {
      const warmUrls = warm.map(s => s.streamUrl || s.downloadUrl || '').filter(Boolean);
      // On Android the player opens the clip on its hook itself, from the real length.
      await LuvsPlayerModule.activateUrl(url, warmUrls, shouldPlay, startAtHook);
      return;
    }
    // Index-keyed pools (iOS, an older Android build): start a fresh list each time.
    if (Platform.OS !== 'android') {
      await this.stopAll();
      for (const index of [...this.slots.keys()]) await this.unloadSlot(index);
    }
    this.activeIndex = -1;
    await this.updateActiveIndex(0, [song, ...warm], shouldPlay);
  }

  async updateActiveIndex(newIndex: number, feedSongs: UnifiedSong[], shouldPlay: boolean = true) {
    if (Platform.OS === 'android' && LuvsPlayerModule) {
      this.activeIndex = newIndex;
      const urls = feedSongs.map(s => s.streamUrl || s.downloadUrl || '');
      await LuvsPlayerModule.updateActiveIndex(newIndex, urls, shouldPlay);
      return;
    }

    const lastIndex = this.activeIndex;
    if (newIndex === lastIndex) return;
    this.activeIndex = newIndex;
    
    if (lastIndex !== -1) {
        const lastSlot = this.slots.get(lastIndex);
        if (lastSlot?.sound) {
            try {
                lastSlot.sub?.remove();
                lastSlot.sub = null;
                stopPlayer(lastSlot.sound);
            } catch {}
        }
    }

    await this.playActiveSlot(newIndex, feedSongs, shouldPlay);
    
    this.manageBuffer(newIndex, feedSongs).catch(e => 
        console.error('[LuvsBuffer] Buffer management failed:', e)
    );
  }

  private async playActiveSlot(index: number, feedSongs: UnifiedSong[], shouldPlay: boolean = true) {
    const song = feedSongs[index];
    if (!song) return;
    
    if (!this.slots.has(index)) {
      await this.loadSlot(index, song);
    }
    
    if (this.activeIndex !== index) return;

    const activeSlot = this.slots.get(index);
    if (activeSlot?.sound) {
      try {
        if (this.activeStatusCallback) {
            activeSlot.sub?.remove();
            activeSlot.sub = activeSlot.sound.addListener(
                'playbackStatusUpdate',
                this.activeStatusCallback
            );
        }

        if (!activeSlot.sound.isLoaded) return;
        if (this.isSuspended) return;

        if (this.activeIndex === index) {
            activeSlot.sound.seekTo(0);
            if (shouldPlay) {
                activeSlot.sound.play();
            }
        }
      } catch {}
    }
  }

  private async loadSlot(index: number, song: UnifiedSong): Promise<void> {
    const audioUrl = song.streamUrl || song.downloadUrl;
    if (!audioUrl) return;
    if (this.slots.has(index)) return;
    if (this.loadingPromises.has(index)) {
        return this.loadingPromises.get(index);
    }

    const localTargetIndex = index;
    const loadPromise = (async () => {
        try {
            // updateInterval is milliseconds — same 100ms cadence as before.
            const sound = createAudioPlayer({ uri: audioUrl }, { updateInterval: 100 });

            const isNeighbor = Math.abs(this.activeIndex - localTargetIndex) <= BUFFER_AHEAD;

            if (this.loadingPromises.has(localTargetIndex) && isNeighbor) {
                const slot: AudioSlot = { sound, song, isLoaded: true, sub: null };
                if (localTargetIndex === this.activeIndex && this.activeStatusCallback) {
                    slot.sub = sound.addListener('playbackStatusUpdate', this.activeStatusCallback);
                }
                this.slots.set(localTargetIndex, slot);
            } else {
                sound.remove();
            }
        } catch {
            this.slots.set(localTargetIndex, { sound: null, song, isLoaded: false, sub: null });
        } finally {
            this.loadingPromises.delete(localTargetIndex);
        }
    })();

    this.loadingPromises.set(index, loadPromise);
    return loadPromise;
  }

  private async unloadSlot(index: number) {
    const slot = this.slots.get(index);
    this.slots.delete(index);
    
    if (slot?.sound) {
      try {
        slot.sub?.remove();
        slot.sub = null;
        slot.sound.remove();
      } catch {}
    }
  }

  private async manageBuffer(currentIndex: number, feedSongs: UnifiedSong[]) {
    const startIndex = Math.max(0, currentIndex - BUFFER_BEHIND);
    const endIndex = Math.min(feedSongs.length - 1, currentIndex + BUFFER_AHEAD);
    
    const slotsToRemove: number[] = [];
    this.slots.forEach((_, index) => {
        if (index < startIndex || index > endIndex) {
            slotsToRemove.push(index);
        }
    });
    
    for (const index of slotsToRemove) {
        await this.unloadSlot(index);
    }

    for (let i = startIndex; i <= endIndex; i++) {
        if (this.activeIndex !== currentIndex) return;

        if (!this.slots.has(i) && feedSongs[i]) {
            await new Promise(resolve => setTimeout(resolve, 500));
            if (this.activeIndex !== currentIndex) return;
            await this.loadSlot(i, feedSongs[i]);
        }
    }
  }
  
  async pause() {
    if (Platform.OS === 'android' && LuvsPlayerModule) {
      LuvsPlayerModule.pause();
      return;
    }

    if (this.activeIndex < 0) return;
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        if (slot.sound.isLoaded) slot.sound.pause();
      } catch {}
    }
  }

  async stopAll() {
    if (Platform.OS === 'android' && LuvsPlayerModule) {
      LuvsPlayerModule.pause();
      return;
    }

    for (const [, slot] of this.slots.entries()) {
        if (slot.sound) {
            try {
                stopPlayer(slot.sound);
                slot.sub?.remove();
                slot.sub = null;
            } catch {}
        }
    }
  }

  async resume() {
    if (Platform.OS === 'android' && LuvsPlayerModule) {
      LuvsPlayerModule.resume();
      return;
    }

    if (this.activeIndex < 0) return;
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        if (slot.sound.isLoaded && !this.isSuspended) slot.sound.play();
      } catch {}
    }
  }
  
  async seekTo(millis: number) {
    if (Platform.OS === 'android' && LuvsPlayerModule) {
      LuvsPlayerModule.seekTo(millis);
      return;
    }

    if (this.activeIndex < 0) return;
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        // expo-av took milliseconds; expo-audio's seekTo takes seconds.
        if (slot.sound.isLoaded) slot.sound.seekTo(millis / 1000);
      } catch {}
    }
  }

  async setStatusUpdateCallback(callback: (status: any) => void) {
    this.activeStatusCallback = callback;

    if (Platform.OS === 'android' && LuvsPlayerModule) {
      this.nativeStatusSub?.remove();
      this.nativeStatusSub = nativeAddListener(LuvsPlayerModule, 'onLuvsStatus', (event: any) => {
        if (this.activeStatusCallback) {
          this.activeStatusCallback({
            positionMillis: event.position,
            durationMillis: event.duration,
            isPlaying: event.isPlaying,
            isBuffering: event.isBuffering,
            didJustFinish: event.didJustFinish,
            isLoaded: true
          });
        }
      });
      return;
    }

    if (this.activeIndex < 0) return;
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        slot.sub?.remove();
        slot.sub = slot.sound.addListener('playbackStatusUpdate', callback);
      } catch {}
    }
  }
}

export const luvsBufferManager = new LuvsBufferManager();
