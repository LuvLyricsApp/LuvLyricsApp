import { Song } from '../types/song';

export type VoiceIntent =
  | { action: 'NEXT' }
  | { action: 'PREV' }
  | { action: 'PAUSE' }
  | { action: 'RESUME' }
  | { action: 'SHUFFLE' }
  | { action: 'PLAY_INDEX'; index: number }
  | { action: 'PLAY_SONG'; songId: string; title: string }
  | { action: 'SEARCH_DOWNLOAD'; query: string }
  | { action: 'UNKNOWN'; transcript: string };

export function parseVoiceIntent(transcript: string, songs: Song[]): VoiceIntent {
  const t = transcript.toLowerCase().trim();
  if (!t) return { action: 'UNKNOWN', transcript };

  // Transport commands only when that's the whole utterance, so a song called
  // "Don't Stop Me Now" or "Skip to My Lou" is searched, not obeyed.
  if (/^(next|skip)(\s+(song|track|this|it|one))?$/.test(t)) return { action: 'NEXT' };
  if (/^(prev(ious)?|go\s+back|last\s+song)(\s+(song|track|one))?$/.test(t)) return { action: 'PREV' };
  if (/^(pause|stop)(\s+(music|song|it|this|playback|playing))?$/.test(t)) return { action: 'PAUSE' };
  if (/^shuffle(\s+(it|this|all|songs|the\s+queue|my\s+queue))?$/.test(t)) return { action: 'SHUFFLE' };
  // bare "play"/"resume" with nothing after → resume
  if (/^(resume|play|unpause|continue)$/.test(t)) return { action: 'RESUME' };

  // "play the 4th song" / "3rd track" / "play 2nd"
  const indexMatch = t.match(/(?:play\s+)?(?:the\s+)?(\d+)(?:st|nd|rd|th)?\s*(?:song|track)?/);
  if (indexMatch && /\d/.test(t)) {
    const n = parseInt(indexMatch[1], 10);
    if (!isNaN(n) && n > 0) return { action: 'PLAY_INDEX', index: n - 1 };
  }

  // "play <song name>"
  const playMatch = t.match(/^(?:play|put on|open)\s+(.+)/);
  if (playMatch) {
    const query = playMatch[1].trim();
    const match = fuzzyFindSong(query, songs);
    if (match) return { action: 'PLAY_SONG', songId: match.id, title: match.title };
  }

  // "download <song name>" / "get me <song>" / "find <song>" / "search for <song>"
  const downloadMatch = t.match(/(?:download|get me|find|search for)\s+(.+)/);
  if (downloadMatch) {
    return { action: 'SEARCH_DOWNLOAD', query: downloadMatch[1].trim() };
  }

  return { action: 'UNKNOWN', transcript };
}

const FILLER = /^(?:(?:please|hey|can you|could you|i want to|i wanna|let'?s)\s+)*(?:play|put on|open|download|get me|find|search for|search|listen to)?\s*(?:the\s+)?(?:song\s+)?(?:called\s+)?/i;

/**
 * What to search for when an utterance is a song request: the transcript minus
 * "play", "download", "search for", "the song called", a trailing "please".
 */
export function songQueryOf(transcript: string): string {
  return transcript
    .trim()
    .replace(FILLER, '')
    .replace(/\s+(?:please|now|for me)$/i, '')
    .replace(/\s+(?:song|track)$/i, '')
    .trim();
}

/**
 * Library songs that match a spoken query, best first. Title agreement counts
 * most; an artist named in the query breaks ties ("tum hi ho arijit").
 */
export function rankSongs(query: string, songs: Song[], limit = 3): Song[] {
  const q = normalize(query);
  if (!q) return [];
  const qWords = q.split(' ').filter(w => w.length > 1);
  const scored: { song: Song; score: number }[] = [];
  for (const song of songs) {
    const title = normalize(song.title);
    if (!title) continue;
    const artist = normalize(song.artist ?? '');
    let score = 0;
    if (title === q) score = 100;
    else if (title.startsWith(q)) score = 80;
    else if (title.length > 2 && q.includes(title)) score = 75;
    else if (title.includes(q)) score = 60;
    else {
      const titleWords = title.split(' ');
      const overlap = qWords.filter(qw => titleWords.some(tw => tw === qw || (qw.length > 3 && tw.startsWith(qw)))).length;
      if (overlap >= 2 || (overlap === 1 && qWords.length === 1)) score = 20 + overlap * 10;
    }
    if (score === 0) continue;
    if (artist && qWords.some(w => w.length > 2 && artist.includes(w))) score += 8;
    scored.push({ song, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || b.song.playCount - a.song.playCount)
    .slice(0, limit)
    .map(x => x.song);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function fuzzyFindSong(query: string, songs: Song[]): Song | null {
  const q = normalize(query);
  if (!q || songs.length === 0) return null;

  // 1. Exact title match
  const exact = songs.find(s => normalize(s.title) === q);
  if (exact) return exact;

  // 2. Title starts with query
  const startsWith = songs.find(s => normalize(s.title).startsWith(q));
  if (startsWith) return startsWith;

  // 3. Query contains title (user said extra words around song name)
  const titleInQuery = songs.find(s => {
    const norm = normalize(s.title);
    return norm.length > 2 && q.includes(norm);
  });
  if (titleInQuery) return titleInQuery;

  // 4. Title contains query
  const queryInTitle = songs.find(s => normalize(s.title).includes(q));
  if (queryInTitle) return queryInTitle;

  // 5. Word overlap scoring — find song with most matching words
  const qWords = q.split(' ').filter(w => w.length > 1);
  let bestScore = 0;
  let bestSong: Song | null = null;
  for (const song of songs) {
    const titleWords = normalize(song.title).split(' ');
    const score = qWords.filter(qw =>
      titleWords.some(tw => tw.includes(qw) || qw.includes(tw))
    ).length;
    if (score > bestScore) {
      bestScore = score;
      bestSong = song;
    }
  }
  if (bestScore >= 2 || (bestScore === 1 && qWords.length === 1)) return bestSong;

  return null;
}
