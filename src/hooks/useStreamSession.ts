import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { StreamService } from '../services/stream/StreamService';

/**
 * Mount once (RootNavigator). Whenever a streamed song becomes current —
 * from a tap, auto-next or a gapless Media3 advance — record it, fetch its
 * lyrics and keep the radio queue topped up.
 */
export const useStreamSession = (): void => {
  useEffect(() => {
    StreamService.onSongChanged(usePlayerStore.getState().currentSongId).catch(() => {});
    return usePlayerStore.subscribe((state, prev) => {
      if (state.currentSongId !== prev.currentSongId) {
        StreamService.onSongChanged(state.currentSongId).catch(() => {});
      }
    });
  }, []);
};
