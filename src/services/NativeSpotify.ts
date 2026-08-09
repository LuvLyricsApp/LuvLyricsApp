import { getNativeModule } from './nativeModule';

/**
 * Typed surface over the Kotlin `Spotify` module.
 *
 * The native side owns OAuth, the tokens (which never cross this bridge) and
 * the link store that makes re-sync incremental. Playlist/track payloads come
 * back as JSON strings because the Expo bridge has no clean mapping for nested
 * heterogeneous arrays — parsing here keeps the Kotlin side free of a second
 * modelling layer.
 *
 * Android-only, like every other native module here: `getNativeModule` returns
 * null elsewhere and every function below degrades to a no-op / empty result.
 */

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
  imageUrl: string | null;
  ownerName: string | null;
  snapshotId: string | null;
}

export interface SpotifyTrackRef {
  uri: string;
  spotifyId: string | null;
  name: string;
  artists: string;
  durationMs: number;
  album: string;
  coverUrl: string | null;
  isrc: string | null;
}

interface SpotifyNativeModule {
  redirectUri: string;
  dashboardUrl: string;
  likedSongsId: string;

  getClientId: () => string;
  setCredentials: (clientId: string, clientSecret: string | null) => void;

  isSignedIn: () => boolean;
  getDisplayName: () => string | null;
  signIn: () => void;
  signOut: () => void;
  completePendingAuth: () => Promise<boolean>;

  listPlaylists: () => Promise<string>;
  getPlaylistSummary: (playlistId: string) => Promise<string>;
  getPlaylistTracks: (playlistId: string) => Promise<string>;

  getLocalPlaylistId: (spotifyPlaylistId: string) => string | null;
  setLocalPlaylistId: (spotifyPlaylistId: string, localPlaylistId: string) => void;
  getSpotifyPlaylistId: (localPlaylistId: string) => string | null;
  getSnapshot: (spotifyPlaylistId: string) => string | null;
  setSnapshot: (spotifyPlaylistId: string, snapshot: string | null) => void;
  getTrackMap: (spotifyPlaylistId: string) => Record<string, string>;
  setTrackMap: (spotifyPlaylistId: string, map: Record<string, string>) => void;
  unlink: (spotifyPlaylistId: string) => void;
}

const mod = getNativeModule<SpotifyNativeModule>('Spotify');

export const isSpotifyAvailable = (): boolean => !!mod;

export const spotifyRedirectUri = (): string => mod?.redirectUri ?? '';
export const spotifyDashboardUrl = (): string =>
  mod?.dashboardUrl ?? 'https://developer.spotify.com/dashboard';
export const spotifyLikedSongsId = (): string => mod?.likedSongsId ?? 'liked_songs';

export const getSpotifyClientId = (): string => mod?.getClientId() ?? '';
export const setSpotifyCredentials = (clientId: string, clientSecret = ''): void => {
  mod?.setCredentials(clientId, clientSecret);
};

export const isSpotifySignedIn = (): boolean => mod?.isSignedIn() ?? false;
export const spotifyDisplayName = (): string | null => mod?.getDisplayName() ?? null;
export const spotifySignIn = (): void => mod?.signIn();
export const spotifySignOut = (): void => mod?.signOut();

/** Resolves true when a redirect was waiting and tokens were obtained. */
export const completeSpotifyAuth = async (): Promise<boolean> => {
  if (!mod) return false;
  return mod.completePendingAuth();
};

export const listSpotifyPlaylists = async (): Promise<SpotifyPlaylistSummary[]> => {
  if (!mod) return [];
  return JSON.parse(await mod.listPlaylists()) as SpotifyPlaylistSummary[];
};

export const getSpotifyPlaylistSummary = async (
  playlistId: string,
): Promise<SpotifyPlaylistSummary | null> => {
  if (!mod) return null;
  return JSON.parse(await mod.getPlaylistSummary(playlistId)) as SpotifyPlaylistSummary;
};

/** Full track list, already in Spotify's own playlist order. */
export const getSpotifyPlaylistTracks = async (
  playlistId: string,
): Promise<SpotifyTrackRef[]> => {
  if (!mod) return [];
  return JSON.parse(await mod.getPlaylistTracks(playlistId)) as SpotifyTrackRef[];
};

export const spotifyLinks = {
  getLocalPlaylistId: (id: string) => mod?.getLocalPlaylistId(id) ?? null,
  setLocalPlaylistId: (id: string, localId: string) => mod?.setLocalPlaylistId(id, localId),
  getSpotifyPlaylistId: (localId: string) => mod?.getSpotifyPlaylistId(localId) ?? null,
  getSnapshot: (id: string) => mod?.getSnapshot(id) ?? null,
  setSnapshot: (id: string, snapshot: string | null) => mod?.setSnapshot(id, snapshot),
  getTrackMap: (id: string): Record<string, string> => mod?.getTrackMap(id) ?? {},
  setTrackMap: (id: string, map: Record<string, string>) => mod?.setTrackMap(id, map),
  unlink: (id: string) => mod?.unlink(id),
};
