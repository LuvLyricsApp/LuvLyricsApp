/**
 * Player menu modes that live beside the queue: repeat-one and Echo's
 * "Advanced" tempo & pitch. Android applies them natively (Media3); iOS reads
 * `repeatOne` in PlayerContext (expo-audio's loop). Not persisted — like Echo,
 * a fresh launch plays at normal speed.
 */
import { create } from 'zustand';
import { NativeAudioPlayer } from '../services/NativeAudioPlayer';

/** Echo's tempo/pitch steps. */
export const TEMPO_STEPS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
export const PITCH_STEPS = [0.75, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.25] as const;

interface PlaybackModesState {
  repeatOne: boolean;
  tempo: number;
  pitch: number;
  setRepeatOne: (on: boolean) => void;
  setTempoPitch: (tempo: number, pitch: number) => void;
}

export const usePlaybackModesStore = create<PlaybackModesState>(set => ({
  repeatOne: false,
  tempo: 1,
  pitch: 1,
  setRepeatOne: on => {
    NativeAudioPlayer.setRepeatOne(on);
    set({ repeatOne: on });
  },
  setTempoPitch: (tempo, pitch) => {
    NativeAudioPlayer.setPlaybackParameters(tempo, pitch);
    set({ tempo, pitch });
  },
}));
