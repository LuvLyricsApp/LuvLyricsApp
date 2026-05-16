/**
 * Luvs Buffer Manager
 * Manages bi-directional audio buffer for instant swipe playback
 * Uses expo-av (NOT expo-audio) to avoid conflicts with main player
 */

import { Audio } from 'expo-av';
import { UnifiedSong } from '../types/song';

// STRICT SLIDING WINDOW: 1 Behind + 1 Current + 4 Ahead = 6 Total
// This ensures we always have 6 songs loaded in memory, no more, no less.
const BUFFER_BEHIND = 1; // Keep 1 song loaded behind for instant swipe-back
const BUFFER_AHEAD = 4; // Pre-load 4 songs ahead for instant playback

interface AudioSlot {
  sound: Audio.Sound | null;
  song: UnifiedSong | null;
  isLoaded: boolean;
}

class LuvsBufferManager {
  private slots: Map<number, AudioSlot> = new Map();
  private activeIndex: number = -1;
  private isInitialized: boolean = false;
  private loadingPromises: Map<number, Promise<void>> = new Map();
  private activeStatusCallback: ((status: any) => void) | null = null;
  private isSuspended: boolean = false; // Prevent playback when blurred/backgrounded

  /**
   * Enter Luvs Mode - Set up audio focus for independent playback
   */
  async enterLuvsMode() {
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
      if (__DEV__) console.log('[LuvsBuffer] Audio focus configured');
    } catch (error) {
      console.error('[LuvsBuffer] Failed to set audio mode:', error);
    }
  }

  /**
   * Exit Luvs Mode - Clean up all sounds and reset audio mode
   */
  async exitLuvsMode() {
    if (__DEV__) console.log('[LuvsBuffer] Exiting Luvs mode, cleaning up');
    
    // 1. Take a snapshot of slots to unload, then clear the map immediately 
    // to prevent any other logic from touching these slots during async unload
    const slotsToCleanup = Array.from(this.slots.entries());
    this.slots.clear();
    this.loadingPromises.clear(); // Abort pending loads

    // 2. Unload all sounds defensively
    for (const [index, slot] of slotsToCleanup) {
      if (slot.sound) {
        try {
          // Clear status update callback first to prevent events firing during unload
          slot.sound.setOnPlaybackStatusUpdate(null);
          await slot.sound.unloadAsync();
        } catch (error) {
          // If the player is already gone, we don't need to log an error
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
    this.activeStatusCallback = null; // Clear callback
    
    // Reset audio mode to default
    try {
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        playsInSilentModeIOS: true,
      });
      if (__DEV__) console.log('[LuvsBuffer] Audio mode reset to default');
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
  }

  /**
   * Update active index - shifts buffer window, loads/unloads as needed
   */
  async updateActiveIndex(newIndex: number, feedSongs: UnifiedSong[], shouldPlay: boolean = true) {
    // 1. ATOMIC UPDATE: Set index immediately to abort pending loads/plays
    const lastIndex = this.activeIndex;
    if (newIndex === lastIndex) return;
    this.activeIndex = newIndex;
    
    if (__DEV__) console.log(`[LuvsBuffer] Index: ${lastIndex} → ${newIndex}`);
    
    // 2. IMMEDIATE STOP: Synchronously kill current sound to prevent "ghost" playback
    if (lastIndex !== -1) {
        const lastSlot = this.slots.get(lastIndex);
        if (lastSlot?.sound) {
            try {
                lastSlot.sound.setOnPlaybackStatusUpdate(null);
                // Non-awaiting stop for speed
                lastSlot.sound.stopAsync().catch(() => {});
            } catch (e) {}
        }
    }

    // 3. Play new active
    await this.playActiveSlot(newIndex, feedSongs, shouldPlay);
    
    // 4. Background buffer management
    this.manageBuffer(newIndex, feedSongs).catch(e => 
        console.error('[LuvsBuffer] Buffer management failed:', e)
    );
  }

  /**
   * Play the active slot
   */
  private async playActiveSlot(index: number, feedSongs: UnifiedSong[], shouldPlay: boolean = true) {
    const song = feedSongs[index];
    if (!song) return;
    
    // Check if loaded. If not, load it.
    if (!this.slots.has(index)) {
      if (__DEV__) console.log(`[LuvsBuffer] Loading active slot ${index}`);
      await this.loadSlot(index, song);
    }
    
    // CRITICAL GUARD: Ensure we are STILL active after loading
    if (this.activeIndex !== index) {
        if (__DEV__) console.log(`[LuvsBuffer] 🛑 Aborted play for slot ${index} (Stale)`);
        return;
    }

    const activeSlot = this.slots.get(index);
    if (activeSlot?.sound) {
      try {
        if (this.activeStatusCallback) {
            activeSlot.sound.setOnPlaybackStatusUpdate(this.activeStatusCallback);
        }
        
        const status = await activeSlot.sound.getStatusAsync();
        if (!status.isLoaded) return;

        if (this.isSuspended) return;

        // Final check before playback
        if (this.activeIndex === index) {
            // Using playFromPositionAsync for more robust "first play"
            await activeSlot.sound.setPositionAsync(0);
            if (shouldPlay) {
                await activeSlot.sound.playAsync();
                if (__DEV__) console.log(`[LuvsBuffer] ▶️ Playing: ${song.title}`);
            } else {
                if (__DEV__) console.log(`[LuvsBuffer] ⏸️ Loaded but PAUSED: ${song.title}`);
            }
        }
      } catch (error) {
        // Suppress common "sound not loaded" race-condition errors
      }
    }
  }

  /**
   * Load a song into a slot (with deduplication)
   */
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
                { shouldPlay: false },
                null
            );

            // POST-AWAIT GUARD: Did the user scroll past this while it was downloading?
            // We only keep it if it's still current or a neighbor
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
                if (__DEV__) console.log(`[LuvsBuffer] ✅ Loaded slot ${localTargetIndex}`);
            } else {
                await sound.unloadAsync().catch(() => {});
            }
        } catch (error) {
            this.slots.set(localTargetIndex, { sound: null, song, isLoaded: false });
        } finally {
            this.loadingPromises.delete(localTargetIndex);
        }
    })();

    this.loadingPromises.set(index, loadPromise);
    return loadPromise;
  }

  /**
   * Unload a slot
   */
  private async unloadSlot(index: number) {
    const slot = this.slots.get(index);
    // Remove from map FIRST so no other method tries to use it
    this.slots.delete(index);
    
    if (slot?.sound) {
      try {
        slot.sound.setOnPlaybackStatusUpdate(null);
        await slot.sound.unloadAsync();
      } catch (e) {
        // Suppress "Player does not exist" during background cleanup
      }
    }
  }

  /**
   * Manage buffer window (load ahead, unload behind)
   */
  private async manageBuffer(currentIndex: number, feedSongs: UnifiedSong[]) {
    const startIndex = Math.max(0, currentIndex - BUFFER_BEHIND);
    const endIndex = Math.min(feedSongs.length - 1, currentIndex + BUFFER_AHEAD);
    
    // Unload stale slots first
    const slotsToRemove: number[] = [];
    this.slots.forEach((_, index) => {
        if (index < startIndex || index > endIndex) {
            slotsToRemove.push(index);
        }
    });
    
    for (const index of slotsToRemove) {
        await this.unloadSlot(index);
    }

    // Load missing slots in window
    for (let i = startIndex; i <= endIndex; i++) {
        // If we moved index AGAIN while managing buffer, abort current management
        if (this.activeIndex !== currentIndex) return;

        if (!this.slots.has(i) && feedSongs[i]) {
            // Give 500ms lead time to the active reel before loading neighbors
            await new Promise(resolve => setTimeout(resolve, 500));
            if (this.activeIndex !== currentIndex) return;
            await this.loadSlot(i, feedSongs[i]);
        }
    }
  }
  
  /**
   * Pause current playback
   */
  async pause() {
    if (this.activeIndex < 0) return;
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        const status = await slot.sound.getStatusAsync();
        if (status.isLoaded) await slot.sound.pauseAsync();
      } catch (e) {}
    }
  }

  /**
   * Stop ALL sounds
   */
  async stopAll() {
    for (const [index, slot] of this.slots.entries()) {
        if (slot.sound) {
            try {
                // Defensive: stop without getting status first
                await slot.sound.stopAsync().catch(() => {});
                slot.sound.setOnPlaybackStatusUpdate(null);
            } catch (e) {}
        }
    }
  }

  /**
   * Resume current playback
   */
  async resume() {
    if (this.activeIndex < 0) return;
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        const status = await slot.sound.getStatusAsync();
        if (status.isLoaded && !this.isSuspended) await slot.sound.playAsync();
      } catch (e) {}
    }
  }
  
  /**
   * Seek to position
   */
  async seekTo(millis: number) {
    if (this.activeIndex < 0) return;
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        const status = await slot.sound.getStatusAsync();
        if (status.isLoaded) await slot.sound.setPositionAsync(millis);
      } catch (e) {}
    }
  }

  /**
   * Register a callback for playback status updates
   */
  async setStatusUpdateCallback(callback: (status: any) => void) {
    this.activeStatusCallback = callback;
    if (this.activeIndex < 0) return;
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        slot.sound.setOnPlaybackStatusUpdate(callback);
      } catch (e) {}
    }
  }
}

// Singleton instance
export const luvsBufferManager = new LuvsBufferManager();
