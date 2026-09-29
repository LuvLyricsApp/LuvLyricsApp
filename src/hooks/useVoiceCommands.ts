import { useEffect, useRef, useCallback, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { NativeVoiceInput } from '../services/NativeVoiceInput';
import { parseVoiceIntent, songQueryOf } from '../utils/voiceIntentParser';
import { usePlayerStore } from '../store/playerStore';
import { useSongsStore } from '../store/songsStore';
import { useVoiceSearchStore } from '../store/voiceSearchStore';
import { searchOfficial } from '../services/stream/officialSearch';
import { UnifiedSong } from '../types/song';
import { isQuietVoiceEnd, voiceErrorMessage } from '../utils/voiceErrors';
import { voiceLevel } from '../playback/voiceLevel';

const catalog = (query: string): Promise<UnifiedSong[]> => searchOfficial(query, 10);
const voice = () => useVoiceSearchStore.getState();

/**
 * The microphone is a runtime permission on Android 6+; without it the
 * recognizer fails every time. True when it's already granted. When it had
 * to be asked, the press that asked doesn't also start listening (the finger
 * has usually lifted by the time the dialog closes).
 */
const micReady = async (): Promise<'granted' | 'asked' | 'denied'> => {
  if (Platform.OS !== 'android') return 'granted';
  const mic = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(mic).catch(() => false)) return 'granted';
  const result = await PermissionsAndroid.request(mic, {
    title: 'Search by voice',
    message: 'LuvLyrics listens only while you hold the mic, to find the song you say.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  }).catch(() => PermissionsAndroid.RESULTS.DENIED);
  return result === PermissionsAndroid.RESULTS.GRANTED ? 'asked' : 'denied';
};

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

    // Straight to the UI thread; no React render per report.
    const subLevel = NativeVoiceInput.onAudioLevel(({ level }) => {
      voiceLevel.value = level;
    });

    const subResult = NativeVoiceInput.onResult(({ transcript }) => {
      if (!transcript.trim()) return;
      dispatch(transcript);
    });

    const subEnd = NativeVoiceInput.onEnd(() => {
      isListeningRef.current = false;
      voiceLevel.value = 0;
      setState(s => ({ ...s, isListening: false, audioLevel: 0, partialTranscript: '' }));
    });

    const subError = NativeVoiceInput.onError(({ code }) => {
      isListeningRef.current = false;
      const msg = voiceErrorMessage(code);
      // Letting go before saying anything isn't a fault: no error shake.
      setState(s => ({ ...s, isListening: false, audioLevel: 0, error: isQuietVoiceEnd(code) ? null : msg }));
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
      setState(s => ({ ...s, isListening: false, error: null }));
      isListeningRef.current = false;
      voice().notify('Voice search works on Android for now');
      return;
    }
    const mic = await micReady();
    if (mic !== 'granted') {
      isListeningRef.current = false;
      setState(s => ({ ...s, isListening: false }));
      voice().notify(mic === 'asked' ? 'Microphone on — hold the mic and say a song' : voiceErrorMessage('permission_denied'));
      return;
    }
    voice().listen();
    try {
      await NativeVoiceInput.startListening();
    } catch (e) {
      isListeningRef.current = false;
      const msg = e instanceof Error ? e.message : 'Voice start failed';
      setState(s => ({ ...s, isListening: false, error: msg }));
      voice().notify(voiceErrorMessage('audio_error'));
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
