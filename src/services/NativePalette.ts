import { getNativeModule } from './nativeModule';

interface Swatch {
  color: string;
  titleTextColor: string;
  bodyTextColor: string;
}

export interface AlbumPalette {
  dominant?: Swatch;
  vibrant?: Swatch;
  darkVibrant?: Swatch;
  muted?: Swatch;
  darkMuted?: Swatch;
  lightVibrant?: Swatch;
  lightMuted?: Swatch;
}

const mod = getNativeModule<{
  extractColors: (uri: string) => Promise<string | null>;
  extractGlowColors?: (uri: string, fallback: string) => Promise<string[]>;
}>('Palette');

export async function extractAlbumColors(imageUri: string | null | undefined): Promise<AlbumPalette | null> {
  if (!mod || !imageUri) return null;
  try {
    const json: string | null = await mod.extractColors(imageUri);
    return json ? (JSON.parse(json) as AlbumPalette) : null;
  } catch {
    return null;
  }
}

/**
 * Echo Music's glow colours for a cover: vibrant, light vibrant, dark vibrant,
 * muted, light muted, dark muted (missing ones become `fallback`), distinct.
 * Falls back to the regular swatches on an older native build.
 */
export async function extractGlowColors(imageUri: string | null | undefined, fallback = '#141218'): Promise<string[]> {
  if (!mod || !imageUri) return [];
  try {
    if (mod.extractGlowColors) return await mod.extractGlowColors(imageUri, fallback);
    const p = await extractAlbumColors(imageUri);
    if (!p) return [];
    const list = [p.vibrant, p.lightVibrant, p.darkVibrant, p.muted, p.lightMuted, p.darkMuted].map(s => s?.color ?? fallback);
    return [...new Set(list)];
  } catch {
    return [];
  }
}
