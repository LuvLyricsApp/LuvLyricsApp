import { makeMutable } from 'react-native-reanimated';

/**
 * The microphone's live loudness, 0–1. The recognizer reports it 20–50 times
 * a second; writing it to React state re-rendered the mic and the voice card
 * on every report, which made the mic stutter. Animations read this on the
 * UI thread instead.
 */
export const voiceLevel = makeMutable(0);
