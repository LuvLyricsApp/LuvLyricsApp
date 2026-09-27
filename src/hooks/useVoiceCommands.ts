import { useEffect, useRef, useCallback, useState } from 'react';
import { NativeVoiceInput } from '../services/NativeVoiceInput';
import { parseVoiceIntent, songQueryOf } from '../utils/voiceIntentParser';
import { usePlayerStore } from '../store/playerStore';
import { useSongsStore } from '../store/songsStore';
import { useVoiceSearchStore } from '../store/voiceSearchStore';
import { searchOfficial } from '../services/stream/officialSearch';
import { UnifiedSong } from '../types/song';

const catalog = (query: string): Promise<UnifiedSong[]> => searchOfficial(query, 10);
const voice = () => useVoiceSearchStore.getState();

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
      if (voice().phase !== 'listening') voice().listen();
    });

    const subPartial = NativeVoiceInput.onPartialResult(({ transcript }) => {
      setState(s => ({ ...s, partialTranscript: transcript }));
      voice().hear(transcript, catalog, songQueryOf);
    });

    const subLevel = NativeVoiceInput.onAudioLevel(({ level }) => {
      setState(s => ({ ...s, audioLevel: level }));
      voice().setLevel(level);
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
      voice().notify(msg);
    });

    return () => {
      subStart?.remove();
      subPartial?.remove();
      subLevel?.remove();
      subResult?.remove();
      subEnd?.remove();
      subError?.remove();
    };
    // dispatch is stable (useCallback with empty deps) and doesn't need to be a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = useCallback((message: string) => {
    setState(s => ({ ...s, lastCommand: message }));
    voice().notify(message);
  }, []);

  const dispatch = useCallback((transcript: string) => {
    const songs = useSongsStore.getState().songs;
    const intent = parseVoiceIntent(transcript, songs);
    const store = usePlayerStore.getState();

    switch (intent.action) {
      case 'NEXT':
        store.nextInPlaylist();
        confirm('Next song');
        break;

      case 'PREV':
        store.previousInPlaylist();
        confirm('Previous song');
        break;

      case 'PAUSE':
        store.requestPlayback(false);
        confirm('Paused');
        break;

      case 'RESUME':
        store.requestPlayback(true);
        confirm('Playing');
        break;

      case 'SHUFFLE': {
        const queue = store.playlistQueue;
        if (queue && queue.length > 1) {
          const shuffled = [...queue].sort(() => Math.random() - 0.5);
          store.updateQueue(shuffled);
        }
        confirm('Shuffled');
        break;
      }

      case 'PLAY_INDEX': {
        const queue = store.playlistQueue;
        if (queue && intent.index >= 0 && intent.index < queue.length) {
          const song = queue[intent.index];
          store.loadSong(song.id);
          store.requestPlayback(true);
          confirm(`Playing ${song.title}`);
        } else {
          voice().notify('No song at that position');
        }
        break;
      }

      // Anything that names a song opens the result card instead of playing
      // blind: library matches first, streamable ones as they arrive.
      case 'PLAY_SONG':
      case 'UNKNOWN': {
        const query = songQueryOf(transcript);
        if (!query) { voice().notify("Didn't catch that"); break; }
        voice().search(query, { songs, catalog, transcript });
        break;
      }

      case 'SEARCH_DOWNLOAD':
        voice().search(intent.query, { songs, catalog, wantsDownload: true, transcript });
        break;
    }
  }, [confirm]);

  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;
    isListeningRef.current = true;
    setState(s => ({ ...s, isListening: true, error: null, lastCommand: null }));
    if (!NativeVoiceInput.isAvailable()) {
      setState(s => ({ ...s, isListening: false, error: 'Voice not available on this device' }));
      isListeningRef.current = false;
      voice().notify("Voice search isn't available on this device yet");
      return;
    }
    voice().listen();
    try {
      await NativeVoiceInput.startListening();
    } catch (e) {
      isListeningRef.current = false;
      const msg = e instanceof Error ? e.message : 'Voice start failed';
      setState(s => ({ ...s, isListening: false, error: msg }));
      voice().notify("Couldn't start the microphone");
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
    voice().dismiss();
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
