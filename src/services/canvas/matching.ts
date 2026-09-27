/**
 * Title/artist matching shared by the canvas providers. Ported from the
 * scoring Echo Music uses so a "Deluxe" or a DJ-mix never steals a canvas
 * that belongs to the studio release.
 */

const ARTIST_SPLIT = /\s*,\s*|\s*&\s*|\s+×\s+|\s+x\s+|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b/i;

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

export const splitArtists = (artist: string): string[] =>
  artist.split(ARTIST_SPLIT).map(norm).filter(Boolean);

/** Any requested artist overlaps any returned artist (substring either way). */
export const artistsOverlap = (requested: string, returned: string): boolean => {
  const req = splitArtists(requested);
  const res = splitArtists(returned);
  if (req.length === 0 || res.length === 0) return false;
  return req.some(a => res.some(b => a.includes(b) || b.includes(a)));
};

export const fuzzyContains = (a: string, b: string): boolean => {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
};

/** Compilations, playlists and sessions carry editorial motion that is not the album's. */
const BLACKLIST = [
  'playlist',
  'set list',
  'essentials',
  'dj mix',
  'mixed',
  'apple music',
  "today's hits",
  'session',
];

export const isBlacklistedCollection = (...names: (string | undefined)[]): boolean =>
  names.some(n => {
    const lower = (n ?? '').toLowerCase();
    return BLACKLIST.some(word => lower.includes(word));
  });

const EDITION_WORDS = ['deluxe', 'expanded', 'remastered', 'remix', 'version', 'edit', 'mix', 'bonus'];

export interface ScoreInput {
  term: string;
  artist: string;
  album?: string;
  resultName: string;
  resultArtist: string;
  resultCollection?: string;
}

/**
 * Returns null when the artist doesn't match at all (hard reject), otherwise a
 * score where >= MIN_MATCH_SCORE is trusted enough to show.
 */
export const scoreResult = ({ term, artist, album, resultName, resultArtist, resultCollection }: ScoreInput): number | null => {
  if (!artistsOverlap(artist, resultArtist) && !fuzzyContains(artist, resultArtist)) return null;

  let score = norm(resultArtist) === norm(artist) ? 10 : 5;

  if (norm(resultName) === norm(term)) score += 15;
  else if (fuzzyContains(resultName, term)) score += 7;
  else score -= 10;

  const termLower = term.toLowerCase();
  const nameLower = resultName.toLowerCase();
  for (const word of EDITION_WORDS) {
    const inTerm = termLower.includes(word);
    const inResult = nameLower.includes(word);
    if (inTerm && inResult) score += 5;
    else if (inResult && !inTerm) score -= 3;
  }

  if (album && resultCollection) {
    if (norm(album) === norm(resultCollection)) score += 20;
    else if (fuzzyContains(album, resultCollection)) score += 10;
  }

  return score;
};

export const MIN_MATCH_SCORE = 12;
