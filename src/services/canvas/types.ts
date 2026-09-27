/**
 * Canvas = the looping motion artwork shown behind the player (Spotify-style
 * canvas / Apple Music motion artwork / Tidal video cover).
 */

export type CanvasSource = 'EchoCanvas' | 'ArtistVideo' | 'Tidal' | 'AppleMusic';

export interface CanvasArtwork {
  /** Playable video URL — mp4 or an HLS (.m3u8) playlist. */
  url: string;
  source: CanvasSource;
  /** HLS playlists need a different player content type on some devices. */
  isHls: boolean;
  name?: string;
  artist?: string;
  albumName?: string;
  /** Static still that pairs with the motion (used as the poster). */
  poster?: string;
}

export interface CanvasQuery {
  title: string;
  artist: string;
  album?: string;
  /** Seconds. */
  duration?: number;
}

export interface CanvasCredentials {
  /** User-supplied Apple MusicKit developer token (JWT). Optional. */
  appleMusicToken?: string;
  /** User-supplied Tidal client token. Optional. */
  tidalToken?: string;
  /** Two-letter storefront / country code. Defaults to "us". */
  storefront?: string;
}

export const isHlsUrl = (url: string): boolean => /\.m3u8(\?|$)/i.test(url);

export const toArtwork = (
  url: string,
  source: CanvasSource,
  extra: Partial<Omit<CanvasArtwork, 'url' | 'source' | 'isHls'>> = {},
): CanvasArtwork => ({ url, source, isHls: isHlsUrl(url), ...extra });
