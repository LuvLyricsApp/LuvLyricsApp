import { useEffect, useState } from 'react';
import { CanvasService } from '../services/canvas/CanvasService';
import { CanvasArtwork } from '../services/canvas/types';
import { useSettingsStore } from '../store/settingsStore';

interface CanvasSongLike {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
}

/**
 * Looks up the motion canvas for the current song. Returns null while loading,
 * when the feature is off, or when no provider has one — callers fall back to
 * the artwork-driven ambient layer in every one of those cases.
 */
export const useCanvasArtwork = (song: CanvasSongLike | null | undefined): CanvasArtwork | null => {
  const canvasEnabled = useSettingsStore(s => s.canvasEnabled);
  const appleMusicToken = useSettingsStore(s => s.appleMusicToken);
  const tidalToken = useSettingsStore(s => s.tidalToken);
  const [canvas, setCanvas] = useState<CanvasArtwork | null>(null);

  const title = song?.title ?? '';
  const artist = song?.artist ?? '';
  const album = song?.album;
  const duration = song?.duration;

  useEffect(() => {
    setCanvas(null);
    if (!canvasEnabled || !title || !artist) return;

    // A skip mid-lookup must not paint the previous song's canvas.
    let cancelled = false;
    CanvasService.resolve({ title, artist, album, duration }, { appleMusicToken, tidalToken })
      .then(result => {
        if (!cancelled) setCanvas(result);
      })
      .catch(() => {
        // resolve() never rejects by contract; the ambient fallback stays.
      });
    return () => {
      cancelled = true;
    };
  }, [canvasEnabled, title, artist, album, duration, appleMusicToken, tidalToken]);

  return canvas;
};
