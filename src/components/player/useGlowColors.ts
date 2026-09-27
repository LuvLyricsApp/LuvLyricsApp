import { useEffect, useState } from 'react';
import { extractGlowColors } from '../../services/NativePalette';

const cache = new Map<string, string[]>();

/**
 * Echo's glow palette for a cover. Keeps the previous song's colours until
 * the new ones are read (the glow cross-fades), and retries a failed read.
 */
export const useGlowColors = (uri: string | null | undefined): string[] => {
  const [colors, setColors] = useState<string[]>(() => (uri && cache.get(uri)) || []);
  useEffect(() => {
    if (!uri) return;
    const hit = cache.get(uri);
    if (hit) {
      setColors(hit);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = (left: number) => extractGlowColors(uri).then(next => {
      if (cancelled) return;
      if (next.length > 0) {
        cache.set(uri, next);
        setColors(next);
      } else if (left > 0) {
        timer = setTimeout(() => attempt(left - 1), 1500);
      }
    });
    attempt(2);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [uri]);
  return colors;
};
