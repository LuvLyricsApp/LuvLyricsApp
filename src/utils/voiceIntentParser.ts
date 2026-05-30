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

  if (/\b(next|skip)\b/.test(t)) return { action: 'NEXT' };
  if (/\b(prev(ious)?|go\s+back|last\s+song)\b/.test(t)) return { action: 'PREV' };
  if (/\b(pause|stop)\b/.test(t)) return { action: 'PAUSE' };
  if (/\b(shuffle)\b/.test(t)) return { action: 'SHUFFLE' };
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
