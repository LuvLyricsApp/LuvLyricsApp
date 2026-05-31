/**
 * Luvs Buffer Manager
 * Manages bi-directional audio buffer for instant swipe playback.
 * On Android, uses custom high-performance Kotlin LuvsPlayer pool to bypass JS bridge.
 * On iOS, uses standard expo-av sliding window player.
 */

import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { UnifiedSong } from '../types/song';
import { handleAsyncError } from '../utils/errorHandler';

let LuvsPlayerModule: any = null;
let luvsEventEmitter: any = null;

if (Platform.OS === 'android') {
  try {
    const { requireNativeModule, EventEmitter } = require('expo-modules-core');
    LuvsPlayerModule = requireNativeModule('LuvsPlayer');
    luvsEventEmitter = new EventEmitter(LuvsPlayerModule);
  } catch {
    // LuvsPlayer native module not available — expo-av fallback active
  }
}

// iOS Sliding Window limits
const BUFFER_BEHIND = 1; 
const BUFFER_AHEAD = 4; 

interface AudioSlot {
  sound: Audio.Sound | null;
  song: UnifiedSong | null;
  isLoaded: boolean;
}

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
      await Audio.setAudioModeAsync({
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        playsInSilentModeIOS: true,
      });
      
      this.isInitialized = true;
    } catch (error) {
      handleAsyncError('LuvsBufferManager.setAudioMode', error);
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
          slot.sound.setOnPlaybackStatusUpdate(null);
          await slot.sound.unloadAsync();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (!errorMsg.includes('Player does not exist')) {
            handleAsyncError(`LuvsBufferManager.unloadSlot[${index}]`, error);
          }
        }
      }
    }
    
    this.slots.clear();
    this.activeIndex = -1;
    this.isInitialized = false;
    this.activeStatusCallback = null;
    
    try {
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        playsInSilentModeIOS: true,
      });
    } catch (error) {
      handleAsyncError('LuvsBufferManager.resetAudioMode', error);
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
                lastSlot.sound.setOnPlaybackStatusUpdate(null);
                lastSlot.sound.stopAsync().catch(e => handleAsyncError('LuvsBufferManager.stopLastSlot', e));
            } catch (e) {
              handleAsyncError('LuvsBufferManager.stopLastSlot', e);
            }
        }
    }

    await this.playActiveSlot(newIndex, feedSongs, shouldPlay);
    
    this.manageBuffer(newIndex, feedSongs).catch(e => 
        handleAsyncError('LuvsBufferManager.manageBuffer', e)
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
            activeSlot.sound.setOnPlaybackStatusUpdate(this.activeStatusCallback);
            activeSlot.sound.setStatusAsync({ progressUpdateIntervalMillis: 100 }).catch(e => handleAsyncError('LuvsBufferManager.setStatusAsync', e));
        }

        const status = await activeSlot.sound.getStatusAsync();
        if (!status.isLoaded) return;
        if (this.isSuspended) return;

        if (this.activeIndex === index) {
            await activeSlot.sound.setPositionAsync(0);
            if (shouldPlay) {
                await activeSlot.sound.playAsync();
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
            const { sound } = await Audio.Sound.createAsync(
                { uri: audioUrl },
                { shouldPlay: false, progressUpdateIntervalMillis: 100 },
                null
            );

            const isNeighbor = Math.abs(this.activeIndex - localTargetIndex) <= BUFFER_AHEAD;

            if (this.loadingPromises.has(localTargetIndex) && isNeighbor) { 
                this.slots.set(localTargetIndex, {
                    sound,
                    song,
                    isLoaded: true,
                });
                
                if (localTargetIndex === this.activeIndex && this.activeStatusCallback) {
                    sound.setOnPlaybackStatusUpdate(this.activeStatusCallback);
                }
            } else {
                await sound.unloadAsync().catch(e => handleAsyncError('LuvsBufferManager.unloadAsync', e));
            }
        } catch {
            this.slots.set(localTargetIndex, { sound: null, song, isLoaded: false });
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
        slot.sound.setOnPlaybackStatusUpdate(null);
        await slot.sound.unloadAsync();
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
        const status = await slot.sound.getStatusAsync();
        if (status.isLoaded) await slot.sound.pauseAsync();
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
                await slot.sound.stopAsync().catch(e => handleAsyncError('LuvsBufferManager.stopAsync', e));
                slot.sound.setOnPlaybackStatusUpdate(null);
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
        const status = await slot.sound.getStatusAsync();
        if (status.isLoaded && !this.isSuspended) await slot.sound.playAsync();
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
        const status = await slot.sound.getStatusAsync();
        if (status.isLoaded) await slot.sound.setPositionAsync(millis);
      } catch {}
    }
  }

  async setStatusUpdateCallback(callback: (status: any) => void) {
    this.activeStatusCallback = callback;

    if (Platform.OS === 'android' && LuvsPlayerModule && luvsEventEmitter) {
      this.nativeStatusSub?.remove();
      this.nativeStatusSub = luvsEventEmitter.addListener('onLuvsStatus', (event: any) => {
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
        slot.sound.setOnPlaybackStatusUpdate(callback);
        slot.sound.setStatusAsync({ progressUpdateIntervalMillis: 100 }).catch(e => handleAsyncError('LuvsBufferManager.setStatusAsyncFeed', e));
      } catch {}
    }
  }
}

export const luvsBufferManager = new LuvsBufferManager();
