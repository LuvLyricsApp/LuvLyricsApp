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
