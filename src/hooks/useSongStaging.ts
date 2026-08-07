import { useState, useCallback, useEffect, useRef } from 'react';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { downloadManager } from '../services/DownloadManager';
import { useSongsStore } from '../store/songsStore';
import { useSettingsStore } from '../store/settingsStore';
import { LyricaResult } from '../services/LyricaService';
import { UnifiedSong } from '../types/song';
import { fetchCoverArt, fetchStagingLyrics } from '../services/stagingOrchestrator';

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
    const [sound, setSound] = useState<AudioPlayer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const addSong = useSongsStore(state => state.addSong);
    const fetchSongs = useSongsStore(state => state.fetchSongs);
    const abortRef = useRef<AbortController | null>(null);
  
  // Cleanup sound
  useEffect(() => {
    return () => {
      if (sound) {
        sound.remove();
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
                  sound.pause();
                  setIsPlaying(false);
              } else {
                  sound.play();
                  setIsPlaying(true);
              }
          } else {
              // For Cobalt, the URL is direct and ready
              const newSound = createAudioPlayer({ uri: staging.selectedQuality.url });
              setSound(newSound);
              newSound.play();
              setIsPlaying(true);

              newSound.addListener('playbackStatusUpdate', (status) => {
                  if (status.isLoaded && status.didJustFinish) {
                      setIsPlaying(false);
                      newSound.seekTo(0);
                  }
              });
          }
      } catch (e) {
          if (__DEV__) console.warn('Preview failed', e);
      }
  }, [staging, sound, isPlaying]);

  const stageSong = useCallback(async (song: UnifiedSong) => {
    // Cancel any in-flight lyrics fetch from a previous staging
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    if (sound) {
        sound.remove();
        setSound(null);
        setIsPlaying(false);
    }

    const tempId = Date.now().toString();

    const coverArtUrls = await fetchCoverArt(song);
    const selectedCover = coverArtUrls[0] ?? song.highResArt;

    setStaging({
        id: tempId,
        title: song.title,
        artist: song.artist,
        duration: song.duration || 180,
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
        coverOptions: coverArtUrls.length > 0 ? coverArtUrls : [song.highResArt],
        selectedCoverUri: selectedCover,
        lyricOptions: null,
        selectedLyrics: undefined,
        selectedLyricIndex: -1,
        status: 'ready',
        progress: 0,
    });

    // Fetch lyrics in background â€” cancelled if user stages a different song
    const { results, error } = await fetchStagingLyrics(
        song.title,
        song.artist,
        song.duration || 180,
        abort.signal
    );

    if (abort.signal.aborted) return;

    setLyricFetchError(error);
    setStaging(prev => {
        if (!prev || prev.id !== tempId) return prev;
        return {
            ...prev,
            lyricOptions: results,
            selectedLyrics: results[0]?.lyrics,
            selectedLyricIndex: results.length > 0 ? 0 : -1,
        };
    });
  }, [sound]);

  // Deprecated: Kept for legacy support if needed
  const initFromBrowser = useCallback(async () => {}, []);

  const updateSelection = useCallback(async (updates: Partial<StagingSong>) => {
      if (__DEV__) {
        console.log('[StagingHook] updateSelection called with:', updates);
        console.log('[StagingHook] Current staging:', staging);
      }
      
      setStaging(prev => {
        const newStaging = prev ? ({ ...prev, ...updates }) : null;
        if (__DEV__) console.log('[StagingHook] New staging after update:', newStaging);
        return newStaging;
      });

      if (updates.selectedQuality) {
           if (sound) {
              sound.remove();
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
      const newSong = await downloadManager.finalizeDownload(
        staging,
        (progress) => { setStaging(prev => prev ? ({ ...prev, progress }) : null); },
        useSettingsStore.getState().downloadDirectoryUri
      );

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

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setLyricFetchError(null);
    setStaging(prev => prev ? ({ ...prev, lyricOptions: null }) : null);

    const { results, error } = await fetchStagingLyrics(
        staging.title,
        staging.artist,
        staging.duration,
        abort.signal
    );

    if (abort.signal.aborted) return;

    setLyricFetchError(error);
    setStaging(prev => {
        if (!prev || prev.id !== staging.id) return prev;
        return {
            ...prev,
            lyricOptions: results,
            selectedLyrics: results[0]?.lyrics,
            selectedLyricIndex: results.length > 0 ? 0 : -1,
        };
    });
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
