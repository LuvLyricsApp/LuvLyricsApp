import { makeMutable } from 'react-native-reanimated';

/**
 * How far the player sheet is open: 0 = resting on the pill, 1 = full screen.
 * NowPlayingScreen writes it every frame (open, drag, close); the pill reads
 * it to hand over to the sheet — it fades as the sheet grows out of it and
 * rides the sheet's top edge, and comes back the same way.
 */
export const playerSheetProgress = makeMutable(0);
