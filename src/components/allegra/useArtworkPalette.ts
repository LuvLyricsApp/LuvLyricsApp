import { useEffect, useState } from 'react';
import { extractAlbumColors } from '../../services/NativePalette';
import { AuraPalette, DEFAULT_AURA, paletteFromColors } from './palette';

const cache = new Map<string, AuraPalette>();

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
    extractAlbumColors(uri).then(swatches => {
      if (cancelled) return;
      if (!swatches) {
        setPalette(base);
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
    return () => {
      cancelled = true;
    };
  }, [uri, fallbackKey]);

  return palette;
};
