import { makeMutable } from 'react-native-reanimated';

export const positionSV = makeMutable(0);
export const durationSV = makeMutable(0);
// Set to true during scrub/seek to pause position updates from PlayerContext
export const isSeeking = makeMutable(false);
