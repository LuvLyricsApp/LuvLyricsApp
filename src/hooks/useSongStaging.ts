import { useState, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { NativeSearchService } from '../services/NativeSearchService';
import { downloadManager } from '../services/DownloadManager';
import { useSongsStore } from '../store/songsStore';
import { LyricaResult, lyricaService } from '../services/LyricaService';
import { ImageSearchService } from '../services/ImageSearchService';
import { MultiSourceSearchService } from '../services/MultiSourceSearchService';
import { UnifiedSong } from '../types/song';
import { MultiSourceLyricsService, getLyricsFriendlyError } from '../services/MultiSourceLyricsService';

// AudioOption interface (was previously from AudioExtractorService)
export interface AudioOption {
  label: string;
  bitrate: number;
  format: string;
  size: string | number;
  url: string;
}

export interface StagingSong {
  id: string; 
  title: string;
  artist: string;
  album?: string;
  duration: number;
  qualityOptions: AudioOption[];
  selectedQuality?: AudioOption; 
  coverOptions: string[]; 
  lyricOptions: LyricaResult[] | null; // null = loading, [] = empty
  selectedCoverUri?: string;
  selectedLyrics?: string;
  selectedLyricIndex?: number;
  status: 'idle' | 'searching' | 'ready' | 'downloading' | 'completed' | 'error';
  progress: number;
  error?: string;
}


export const useSongStaging = () => {
    const [lyricFetchError, setLyricFetchError] = useState<string | null>(null);
    const [staging, setStaging] = useState<StagingSong | null>(null);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const addSong = useSongsStore(state => state.addSong);
    const fetchSongs = useSongsStore(state => state.fetchSongs);
  
  // Cleanup sound
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const togglePreview = useCallback(async () => {
      if (!staging?.selectedQuality) return;

      // YTDL returns direct URLs, so we don't need to block youtube.com anymore
      // unless it failed and returned raw URL.
      // But let's assume AudioExtractor always returns playable streams.
      
      try {
          if (sound) {
              if (isPlaying) {
                  await sound.pauseAsync();
                  setIsPlaying(false);
              } else {
                  await sound.playAsync();
                  setIsPlaying(true);
              }
          } else {
              // For Cobalt, the URL is direct and ready
              const { sound: newSound } = await Audio.Sound.createAsync(
                  { uri: staging.selectedQuality.url },
                  { shouldPlay: true }
              );
              setSound(newSound);
              setIsPlaying(true);
              
              newSound.setOnPlaybackStatusUpdate((status) => {
                  if (status.isLoaded && status.didJustFinish) {
                      setIsPlaying(false);
                      newSound.setPositionAsync(0);
                  }
              });
          }
      } catch (e) {
          console.warn('Preview failed', e);
      }
  }, [staging, sound, isPlaying]);

  /* 
   * "Zero-Friction" Async Staging 
   * Shows cover art INSTANTLY, then fetches lyrics in background
   */
  const stageSong = useCallback(async (song: UnifiedSong) => {
    // 1. Reset Sound State
    if (sound) {
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
    }

    const tempId = Date.now().toString(); 
    
    console.log(`[Staging] 🎨 Fetching iTunes cover art for: ${song.title} - ${song.artist}`);
    
    // 2. Fetch iTunes Cover Art (fast, professional quality)
    let coverArtUrls: string[] = [];
    
    // Helper to clean search terms
    const cleanTerm = (text: string) => text
        .replace(/\([^)]*\)/g, '') // Remove (...)
        .replace(/\[[^\]]*\]/g, '') // Remove [...]
        .replace(/\b(ft|feat|featuring|official|video|audio|lyrics)\b.*/gi, '') // Remove "ft. X" etc
        .trim();

    try {
        // Strategy 1: Full raw search
        let query = `${song.title} ${song.artist}`;
        coverArtUrls = await ImageSearchService.searchItunes(query);
        
        // Strategy 2: Cleaned search if raw failed
        if (coverArtUrls.length === 0) {
            const cleanTitle = cleanTerm(song.title);
            const cleanArtist = cleanTerm(song.artist);
            const cleanQuery = `${cleanTitle} ${cleanArtist}`;
            
            console.log(`[Staging] Raw search failed. Retrying with: ${cleanQuery}`);
            if (cleanQuery !== query) {
                 coverArtUrls = await ImageSearchService.searchItunes(cleanQuery);
            }
        }
        
        console.log(`[Staging] ✓ Got ${coverArtUrls.length} iTunes cover options`);
    } catch (e) {
        console.warn('[Staging] iTunes fetch failed, using source artwork', e);
    }
    
    // Use first iTunes result or fallback to source art (Saavn/SC)
    // IMPORTANT: Source art is often low-res or 404, so iTunes is critical.
    if (coverArtUrls.length === 0 && song.highResArt) {
        coverArtUrls = [song.highResArt];
    }
    
    const selectedCover = coverArtUrls[0] || song.highResArt;
    
    // 3. Set Staging State IMMEDIATELY with iTunes cover art
    setStaging({
        id: tempId,
        title: song.title,
        artist: song.artist,
        duration: (song.duration || 180), // Keep in seconds, default 3min
        
        // Direct download URL from race engine
        qualityOptions: [{
            label: `${song.source} (High Quality)`,
            bitrate: 320,
            format: 'mp3',
            size: '~8MB',
            url: song.downloadUrl
        }],
        selectedQuality: {
            label: `${song.source} (High Quality)`,
            bitrate: 320,
            format: 'mp3',
            size: '~8MB',
            url: song.downloadUrl
        },
        
        // iTunes High Res Art - INSTANT!
        coverOptions: coverArtUrls.length > 0 ? coverArtUrls : [song.highResArt],
        selectedCoverUri: selectedCover,

                lyricOptions: null, // null indicates "fetching"
                selectedLyrics: undefined,
                selectedLyricIndex: -1,

                status: 'ready', // INSTANTLY READY
                progress: 0,
            });
            
            console.log(`[Staging] ✓ Staged instantly with iTunes art: ${song.title}`);

            // 4. Fetch lyrics in background (Parallel Sources)
            // Use a reference to track validity
            let isActive = true;
            
            const fetchLyrics = async () => {
                try {
                    console.log('[Staging-V2] 🔄 Fetching lyrics in background (Multi-Source)...');
                    
                    // Using Static Import now
                    const lyricResults = await MultiSourceLyricsService.fetchLyricsParallel(song.title, song.artist, song.duration);
                    
                    if (!isActive) return;
                    
                    console.log(`[Staging-V2] Lyrics found: ${lyricResults.length} options`);
                    setLyricFetchError(null);
                    
                    if (lyricResults.length > 0) {
                        setStaging(prev => {
                            // Safety check: Ensure we are updating the CORRECT song staging
                            if (!prev || prev.id !== tempId) return prev;
                            
                            console.log('[Staging] ✓ Updating staging with lyrics');
                            return {
                                ...prev,
                                lyricOptions: lyricResults,
                                selectedLyrics: lyricResults[0].lyrics,
                                selectedLyricIndex: 0
                            };
                        });
                    } else {
                        console.log('[Staging] ⚠️ No lyrics found for this song');
                        setLyricFetchError('No lyrics found for this song. Try title/artist edit and retry.');
                        setStaging(prev => {
                            if (!prev || prev.id !== tempId) return prev;
                            return {
                                ...prev,
                                lyricOptions: [],
                                selectedLyrics: undefined,
                                selectedLyricIndex: -1
                            };
                        });
                    }
                } catch(e) {
                    if (!isActive) return;
                    console.error('[Staging] ❌ Lyrics fetch failed:', e);
                    setLyricFetchError(getLyricsFriendlyError(e)); 
                    setStaging(prev => {
                        if (!prev || prev.id !== tempId) return prev;
                        return {
                            ...prev,
                            lyricOptions: [],
                            selectedLyrics: undefined,
                            selectedLyricIndex: -1
                        };
                    });
                }
            };
            
    // Execute immediately
    fetchLyrics();

  }, [sound]);

  // Deprecated: Kept for legacy support if needed
  const initFromBrowser = useCallback(async () => {}, []);

  const updateSelection = useCallback(async (updates: Partial<StagingSong>) => {
      console.log('[StagingHook] updateSelection called with:', updates);
      console.log('[StagingHook] Current staging:', staging);
      
      setStaging(prev => {
        const newStaging = prev ? ({ ...prev, ...updates }) : null;
        console.log('[StagingHook] New staging after update:', newStaging);
        return newStaging;
      });

      if (updates.selectedQuality) {
           if (sound) {
              await sound.unloadAsync();
              setSound(null);
              setIsPlaying(false);
          }
      }
  }, [sound, staging]);

  const finalizeDownload = useCallback(async () => {
    if (!staging || !staging.selectedQuality) return;

    try {
      setStaging(prev => prev ? ({ ...prev, status: 'downloading', progress: 0.1 }) : null);

      // DELEGATE TO MANAGER
      const newSong = await downloadManager.finalizeDownload(staging, (progress) => {
          setStaging(prev => prev ? ({ ...prev, progress }) : null);
      });

      await addSong(newSong);
      await fetchSongs(); 
      
      setStaging(prev => prev ? ({ ...prev, status: 'completed', progress: 1.0 }) : null);

    } catch (error: any) {
       console.error('Download Failed:', error);
       setStaging(prev => prev ? ({ ...prev, status: 'error', error: error.message }) : null);
    }
  }, [staging, addSong, fetchSongs]);

  const retryLyrics = useCallback(async () => {
    if (!staging) return;

    console.log('[Staging] 🔄 Retrying lyrics fetch...');
    setLyricFetchError(null); 
    setStaging(prev => prev ? ({ ...prev, lyricOptions: null }) : null);

    try {
        const lyricResults = await MultiSourceLyricsService.fetchLyricsParallel(staging.title, staging.artist, staging.duration);
        
        console.log(`[Staging] Retry results: ${lyricResults.length}`);
        if (lyricResults.length === 0) {
            setLyricFetchError('No lyrics found for this song. Try title/artist edit and retry.');
        }
        
        setStaging(prev => {
            if (!prev || prev.id !== staging.id) return prev;
            return {
                ...prev,
                lyricOptions: lyricResults.length > 0 ? lyricResults : [],
                selectedLyrics: lyricResults.length > 0 ? lyricResults[0].lyrics : undefined,
                selectedLyricIndex: lyricResults.length > 0 ? 0 : -1
            };
        });
    } catch (e) {
        console.error('[Staging] Retry failed:', e);
        setLyricFetchError(getLyricsFriendlyError(e)); 
        setStaging(prev => prev ? ({ ...prev, lyricOptions: [], selectedLyricIndex: -1 }) : null);
    }
  }, [staging]);

  const selectLyrics = useCallback((index: number) => {
    setStaging(prev => {
        if (!prev || !prev.lyricOptions || !prev.lyricOptions[index]) return prev;
        return {
            ...prev,
            selectedLyrics: prev.lyricOptions[index].lyrics,
            selectedLyricIndex: index
        };
    });
  }, []);

  return {
    staging,
    stageSong,
    initFromBrowser,
    updateSelection,
    finalizeDownload,
    togglePreview,
    isPlaying,
    retryLyrics,
    selectLyrics,
    lyricFetchError
  };
};
