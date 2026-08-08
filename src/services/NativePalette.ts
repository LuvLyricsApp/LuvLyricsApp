import { getNativeModule } from './nativeModule';

export interface AlbumSwatch {
  color: string;
  titleTextColor: string;
  bodyTextColor: string;
  /** Number of sampled artwork pixels represented by this swatch. */
  population?: number;
}

export interface AlbumPalette {
  dominant?: AlbumSwatch;
  vibrant?: AlbumSwatch;
  darkVibrant?: AlbumSwatch;
  muted?: AlbumSwatch;
  darkMuted?: AlbumSwatch;
  lightVibrant?: AlbumSwatch;
}

const mod = getNativeModule<{ extractColors: (uri: string) => Promise<string | null> }>('Palette');

export async function extractAlbumColors(imageUri: string | null | undefined): Promise<AlbumPalette | null> {
  if (!mod || !imageUri) return null;
  try {
    const json: string | null = await mod.extractColors(imageUri);
    return json ? (JSON.parse(json) as AlbumPalette) : null;
  } catch {
    return null;
  }
}
