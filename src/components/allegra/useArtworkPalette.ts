import { useEffect, useState } from 'react';
import { extractAlbumColors } from '../../services/NativePalette';
import { AuraPalette, DEFAULT_AURA, paletteFromColors } from './palette';

const cache = new Map<string, AuraPalette>();
const RETRY_MS = 1500;

/**
 * The artwork's Allegra palette. Android extracts swatches natively; elsewhere
 * (or while extracting) it falls back to `fallback` colours — e.g. the song's
 * gradient — and finally to Allegra's default room.
 */
export const useArtworkPalette = (uri: string | null | undefined, fallback?: string[]): AuraPalette => {
  const fallbackKey = fallback?.join(',') ?? '';
  const [palette, setPalette] = useState<AuraPalette>(() =>
    (uri && cache.get(uri)) || (fallback?.length ? paletteFromColors(fallback) : DEFAULT_AURA),
  );

  useEffect(() => {
    const base = fallbackKey ? paletteFromColors(fallbackKey.split(',')) : DEFAULT_AURA;
    if (!uri) {
      setPalette(base);
      return;
    }
    const hit = cache.get(uri);
    if (hit) {
      setPalette(hit);
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const attempt = (triesLeft: number) => extractAlbumColors(uri).then(swatches => {
      if (cancelled) return;
      if (!swatches) {
        // A cover still downloading or a flaky connection: try again shortly
        // rather than leaving this song on the default colours for good.
        if (triesLeft > 0) retry = setTimeout(() => attempt(triesLeft - 1), RETRY_MS);
        else setPalette(base);
        return;
      }
      // Vivid first, then the muted ones — the order Allegra ranks bins in.
      const next = paletteFromColors([
        swatches.vibrant?.color,
        swatches.darkVibrant?.color,
        swatches.lightVibrant?.color,
        swatches.dominant?.color,
        swatches.muted?.color,
        swatches.darkMuted?.color,
      ]);
      cache.set(uri, next);
      setPalette(next);
    });
    attempt(2);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [uri, fallbackKey]);

  return palette;
};
