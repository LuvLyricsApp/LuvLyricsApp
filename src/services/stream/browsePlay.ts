/**
 * Playing what YouTube Music lists (artist top songs, albums, playlists,
 * radio): Echo's model — YouTube Music picks the songs, the catalog plays them.
 *
 * The tapped song resolves first and starts at once; the rest of the list
 * resolves in the background and joins the queue behind it.
 */
import { searchMusic } from '../MultiSourceSearchService';
import { YTMusicClient } from '../ytmusic/YTMusicClient';
import { YTSong } from '../ytmusic/parsers';
import { PlayEndpoint } from '../ytmusic/browse';
import { resolveMany, resolveToCatalog } from '../ytmusic/resolver';
import { StreamService } from './StreamService';
import { UnifiedSong } from '../../types/song';

const REST_LIMIT = 30;
const FIRST_TRIES = 5;

let generation = 0;

const shuffled = <T>(items: T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export interface BrowsePlayDeps {
  resolveOne: (song: YTSong) => Promise<UnifiedSong | null>;
  resolveRest: (songs: YTSong[], limit: number) => Promise<UnifiedSong[]>;
  play: (songs: UnifiedSong[]) => void;
  append: (songs: UnifiedSong[]) => void;
}

const defaultDeps: BrowsePlayDeps = {
  resolveOne: song => resolveToCatalog(song, q => searchMusic(q)),
  resolveRest: (songs, limit) => resolveMany(songs, q => searchMusic(q), limit),
  play: songs => StreamService.play(songs, 0),
  append: songs => StreamService.append(songs),
};

/** Plays `songs` from `index`. Resolves false when nothing near the start has catalog audio. */
export async function playYTSongs(
  songs: YTSong[],
  index = 0,
  opts: { shuffle?: boolean } = {},
  deps: BrowsePlayDeps = defaultDeps,
): Promise<boolean> {
  const mine = ++generation;
  const list = opts.shuffle ? shuffled(songs) : songs.slice(index);
  for (let i = 0; i < Math.min(FIRST_TRIES, list.length); i++) {
    const first = await deps.resolveOne(list[i]).catch(() => null);
    if (mine !== generation) return false; // a newer tap won
    if (!first) continue;
    deps.play([first]);
    const rest = list.slice(i + 1);
    if (rest.length > 0) {
      deps.resolveRest(rest, REST_LIMIT)
        .then(resolved => { if (mine === generation) deps.append(resolved); })
        .catch(() => {});
    }
    return true;
  }
  return false;
}

/** Plays a radio / shuffle / play endpoint (an artist's mix, a playlist). */
export async function playEndpoint(endpoint: PlayEndpoint, opts: { shuffle?: boolean } = {}): Promise<boolean> {
  const songs = await YTMusicClient.endpointSongs(endpoint).catch(() => [] as YTSong[]);
  return songs.length > 0 ? playYTSongs(songs, 0, opts) : false;
}
