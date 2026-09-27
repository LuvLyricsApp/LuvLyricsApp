/**
 * Hold the mic, say a song, let go: a card in the middle of the screen shows
 * the best match with a Play button.
 *
 * Library matches are ranked synchronously, so they show the instant speech
 * ends. The catalog search starts earlier — on the partial transcript while
 * you are still talking — and the final result reuses that request when the
 * words didn't change, so the stream match is usually there on release too.
 */
import { create } from 'zustand';
import { Song, UnifiedSong } from '../types/song';
import { rankSongs } from '../utils/voiceIntentParser';

export type VoicePhase = 'idle' | 'listening' | 'searching' | 'results' | 'empty' | 'notice';

export type VoicePick =
  | { kind: 'local'; song: Song }
  | { kind: 'stream'; song: UnifiedSong };

type CatalogSearch = (query: string) => Promise<UnifiedSong[]>;

interface VoiceSearchState {
  phase: VoicePhase;
  /** What was heard so far (live while listening). */
  transcript: string;
  /** The song query extracted from the transcript. */
  query: string;
  level: number;
  picks: VoicePick[];
  /** Index into picks of the one the Play button plays. */
  selected: number;
  /** Short confirmation or error ("Next song", "Didn't catch that"). */
  notice: string | null;
  /** The request asked to download ("download …"), so lead with that action. */
  wantsDownload: boolean;

  listen: () => void;
  hear: (partial: string, catalog: CatalogSearch, queryOf: (t: string) => string) => void;
  setLevel: (level: number) => void;
  search: (query: string, opts: { songs: Song[]; catalog: CatalogSearch; wantsDownload?: boolean; transcript?: string }) => Promise<void>;
  select: (index: number) => void;
  notify: (message: string) => void;
  dismiss: () => void;
}

const PREFETCH_DEBOUNCE_MS = 350;
const MAX_STREAM_PICKS = 4;
const MAX_LOCAL_PICKS = 3;

const key = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

// The in-flight catalog request for the latest partial, reused by the final search.
let prefetched: { key: string; request: Promise<UnifiedSong[]> } | null = null;
let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let searchSeq = 0;

const catalogFor = (query: string, catalog: CatalogSearch): Promise<UnifiedSong[]> => {
  const k = key(query);
  if (prefetched?.key === k) return prefetched.request;
  const request = catalog(query).catch(() => [] as UnifiedSong[]);
  prefetched = { key: k, request };
  return request;
};

const clearTimers = () => {
  if (prefetchTimer) clearTimeout(prefetchTimer);
  if (noticeTimer) clearTimeout(noticeTimer);
  prefetchTimer = null;
  noticeTimer = null;
};

export const useVoiceSearchStore = create<VoiceSearchState>((set, get) => ({
  phase: 'idle',
  transcript: '',
  query: '',
  level: 0,
  picks: [],
  selected: 0,
  notice: null,
  wantsDownload: false,

  listen: () => {
    clearTimers();
    searchSeq++;
    set({ phase: 'listening', transcript: '', query: '', level: 0, picks: [], selected: 0, notice: null, wantsDownload: false });
  },

  hear: (partial, catalog, queryOf) => {
    if (get().phase !== 'listening') return;
    set({ transcript: partial });
    if (prefetchTimer) clearTimeout(prefetchTimer);
    const q = queryOf(partial);
    if (q.length < 3) return;
    prefetchTimer = setTimeout(() => { catalogFor(q, catalog); }, PREFETCH_DEBOUNCE_MS);
  },

  setLevel: level => {
    if (get().phase === 'listening') set({ level });
  },

  search: async (query, { songs, catalog, wantsDownload = false, transcript }) => {
    clearTimers();
    const seq = ++searchSeq;
    const local: VoicePick[] = rankSongs(query, songs, MAX_LOCAL_PICKS).map(song => ({ kind: 'local', song }));
    set({
      phase: local.length > 0 ? 'results' : 'searching',
      query,
      transcript: transcript ?? query,
      level: 0,
      picks: local,
      selected: 0,
      notice: null,
      wantsDownload,
    });

    const found = await catalogFor(query, catalog);
    if (seq !== searchSeq) return; // dismissed, or a newer request won

    // Songs already in the library are shown once, as the library copy.
    const have = new Set(local.map(p => `${key(p.song.title)}|${key(p.song.artist ?? '')}`));
    const stream: VoicePick[] = found
      .filter(s => !have.has(`${key(s.title)}|${key(s.artist)}`))
      .slice(0, MAX_STREAM_PICKS)
      .map(song => ({ kind: 'stream', song }));
    // A "download …" request leads with the streamable copy — that's the one it can save.
    const picks = wantsDownload ? [...stream, ...local] : [...local, ...stream];
    set({ phase: picks.length > 0 ? 'results' : 'empty', picks, selected: 0 });
  },

  select: index => set({ selected: index }),

  notify: message => {
    clearTimers();
    searchSeq++;
    set({ phase: 'notice', notice: message, level: 0, picks: [] });
    noticeTimer = setTimeout(() => {
      if (get().phase === 'notice') set({ phase: 'idle', notice: null });
    }, 1400);
  },

  dismiss: () => {
    clearTimers();
    searchSeq++;
    set({ phase: 'idle', transcript: '', query: '', level: 0, picks: [], selected: 0, notice: null });
  },
}));
