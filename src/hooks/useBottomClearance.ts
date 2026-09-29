import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PILL_STACK_GAP, TAB_BAR_CLEARANCE } from '../navigation/tabs';
import { PILL_PLAYER_HEIGHT } from '../components/PillPlayer';
import { usePlayerStore } from '../store/playerStore';

/**
 * Bottom padding a scrolling screen needs so its last row clears the floating
 * chrome: the tab bar, plus the mini player pill while a song is loaded.
 * `extra` adds breathing room below the last item.
 */
export const useBottomClearance = (extra = 24): number => {
  const insets = useSafeAreaInsets();
  const hasSong = usePlayerStore(s => s.currentSong != null);
  return insets.bottom + TAB_BAR_CLEARANCE + (hasSong ? PILL_PLAYER_HEIGHT + PILL_STACK_GAP : 0) + extra;
};
