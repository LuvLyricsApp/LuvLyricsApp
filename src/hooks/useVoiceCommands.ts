import { useEffect, useRef, useCallback, useState } from 'react';
import { NativeVoiceInput } from '../services/NativeVoiceInput';
import { parseVoiceIntent } from '../utils/voiceIntentParser';
import { usePlayerStore, playerControls } from '../store/playerStore';
import { useSongsStore } from '../store/songsStore';
import { useSettingsStore } from '../store/settingsStore';
import { navigationRef } from '../utils/navigationService';

export interface VoiceCommandsState {
  isListening: boolean;
  audioLevel: number;
  partialTranscript: string;
  lastCommand: string | null;
  error: string | null;
}

export function useVoiceCommands() {
  const [state, setState] = useState<VoiceCommandsState>({
    isListening: false,
    audioLevel: 0,
    partialTranscript: '',
    lastCommand: null,
    error: null,
  });

  const isListeningRef = useRef(false);

  useEffect(() => {
    if (!NativeVoiceInput.isAvailable()) return;

    const subStart = NativeVoiceInput.onStart(() => {
      isListeningRef.current = true;
      setState(s => ({ ...s, isListening: true, error: null, partialTranscript: '' }));
    });

    const subPartial = NativeVoiceInput.onPartialResult(({ transcript }) => {
      setState(s => ({ ...s, partialTranscript: transcript }));
    });

    const subLevel = NativeVoiceInput.onAudioLevel(({ level }) => {
      setState(s => ({ ...s, audioLevel: level }));
    });

    const subResult = NativeVoiceInput.onResult(({ transcript }) => {
      if (!transcript.trim()) return;
      dispatch(transcript);
    });

    const subEnd = NativeVoiceInput.onEnd(() => {
      isListeningRef.current = false;
      setState(s => ({ ...s, isListening: false, audioLevel: 0, partialTranscript: '' }));
    });

    const subError = NativeVoiceInput.onError(({ code }) => {
      isListeningRef.current = false;
      const msg = code === 'no_match' ? 'Didn\'t catch that' :
                  code === 'timeout' ? 'No speech detected' :
                  code === 'permission_denied' ? 'Microphone permission denied' :
                  code === 'not_available' ? 'Voice not available on this device' :
                  code === 'busy' ? 'Voice is busy — try again' :
                  'Something went wrong';
      setState(s => ({ ...s, isListening: false, audioLevel: 0, error: msg }));
    });

    return () => {
      subStart?.remove();
      subPartial?.remove();
      subLevel?.remove();
      subResult?.remove();
      subEnd?.remove();
      subError?.remove();
    };
  }, []);

  const dispatch = useCallback((transcript: string) => {
    const songs = useSongsStore.getState().songs;
    const intent = parseVoiceIntent(transcript, songs);
    const store = usePlayerStore.getState();

    switch (intent.action) {
      case 'NEXT':
        store.nextInPlaylist();
        setState(s => ({ ...s, lastCommand: 'Next song' }));
        break;

      case 'PREV':
        store.previousInPlaylist();
        setState(s => ({ ...s, lastCommand: 'Previous song' }));
        break;

      case 'PAUSE':
        playerControls.pause();
        setState(s => ({ ...s, lastCommand: 'Paused' }));
        break;

      case 'RESUME':
        playerControls.play();
        setState(s => ({ ...s, lastCommand: 'Playing' }));
        break;

      case 'SHUFFLE': {
        const queue = store.playlistQueue;
        if (queue && queue.length > 1) {
          const shuffled = [...queue].sort(() => Math.random() - 0.5);
          store.updateQueue(shuffled);
        }
        setState(s => ({ ...s, lastCommand: 'Shuffled' }));
        break;
      }

      case 'PLAY_INDEX': {
        const queue = store.playlistQueue;
        if (queue && intent.index >= 0 && intent.index < queue.length) {
          const song = queue[intent.index];
          store.loadSong(song.id);
          playerControls.play();
          setState(s => ({ ...s, lastCommand: `Playing ${song.title}` }));
        } else {
          setState(s => ({ ...s, error: 'Song not found at that position' }));
        }
        break;
      }

      case 'PLAY_SONG':
        store.loadSong(intent.songId);
        playerControls.play();
        setState(s => ({ ...s, lastCommand: `Playing ${intent.title}` }));
        break;

      case 'SEARCH_DOWNLOAD':
        navigationRef.current?.navigate('AudioDownloader', {
          voiceQuery: intent.query,
          autoDownload: true,
        });
        setState(s => ({ ...s, lastCommand: `Finding ${intent.query}` }));
        break;

      case 'UNKNOWN':
        setState(s => ({ ...s, error: `Didn't understand: "${transcript}"` }));
        break;
    }
  }, []);

  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;
    isListeningRef.current = true;
    setState(s => ({ ...s, isListening: true, error: null, lastCommand: null }));
    if (!NativeVoiceInput.isAvailable()) {
      setState(s => ({ ...s, isListening: false, error: 'Voice not available on this device' }));
      isListeningRef.current = false;
      return;
    }
    try {
      await NativeVoiceInput.startListening();
    } catch (e) {
      isListeningRef.current = false;
      const msg = e instanceof Error ? e.message : 'Voice start failed';
      setState(s => ({ ...s, isListening: false, error: msg }));
    }
  }, []);

  const stopListening = useCallback(async () => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    setState(s => ({ ...s, isListening: false, audioLevel: 0, partialTranscript: '' }));
    if (!NativeVoiceInput.isAvailable()) return;
    try {
      await NativeVoiceInput.stopListening();
    } catch {
      // swallow — onEnd/onError will handle state
    }
  }, []);

  const cancelListening = useCallback(async () => {
    isListeningRef.current = false;
    setState(s => ({ ...s, isListening: false, audioLevel: 0, partialTranscript: '' }));
    if (!NativeVoiceInput.isAvailable()) return;
    try {
      await NativeVoiceInput.cancelListening();
    } catch {
      // swallow
    }
  }, []);

  return { ...state, startListening, stopListening, cancelListening };
}
