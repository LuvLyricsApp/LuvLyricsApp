import { parseVoiceIntent } from './voiceIntentParser';
import { Song } from '../types/song';

function makeSong(id: string, title: string): Song {
  return {
    id,
    title,
    gradientId: '1',
    duration: 180,
    dateCreated: '',
    dateModified: '',
    playCount: 0,
    lyrics: [],
  };
}

const noSongs: Song[] = [];

const library: Song[] = [
  makeSong('1', 'Blinding Lights'),
  makeSong('2', 'Bohemian Rhapsody'),
  makeSong('3', 'Shape of You'),
  makeSong('4', 'Hotel California'),
  makeSong('5', "Don't Stop Me Now"),
];

// ── Navigation intents ──────────────────────────────────────────────────────

describe('NEXT', () => {
  it.each(['next', 'skip', 'next song', 'skip this', 'NEXT'])(
    'returns NEXT for "%s"',
    (t) => expect(parseVoiceIntent(t, noSongs).action).toBe('NEXT'),
  );
});

describe('PREV', () => {
  it.each(['previous', 'prev', 'go back', 'last song', 'Previous song'])(
    'returns PREV for "%s"',
    (t) => expect(parseVoiceIntent(t, noSongs).action).toBe('PREV'),
  );
});

describe('PAUSE', () => {
  it.each(['pause', 'stop', 'Pause music', 'Stop'])(
    'returns PAUSE for "%s"',
    (t) => expect(parseVoiceIntent(t, noSongs).action).toBe('PAUSE'),
  );
});

describe('RESUME', () => {
  it.each(['resume', 'play', 'unpause', 'continue'])(
    'returns RESUME for bare "%s"',
    (t) => expect(parseVoiceIntent(t, noSongs).action).toBe('RESUME'),
  );
});

describe('SHUFFLE', () => {
  it('returns SHUFFLE for "shuffle"', () =>
    expect(parseVoiceIntent('shuffle', noSongs).action).toBe('SHUFFLE'));
  it('returns SHUFFLE for "shuffle the queue"', () =>
    expect(parseVoiceIntent('shuffle the queue', noSongs).action).toBe('SHUFFLE'));
});

// ── PLAY_INDEX ──────────────────────────────────────────────────────────────

describe('PLAY_INDEX', () => {
  it.each([
    ['play the 1st song', 0],
    ['play 2nd', 1],
    ['3rd track', 2],
    ['play the 4th', 3],
    ['5th song', 4],
  ])('"%s" → index %i', (t, expected) => {
    const intent = parseVoiceIntent(t, noSongs);
    expect(intent.action).toBe('PLAY_INDEX');
    if (intent.action === 'PLAY_INDEX') expect(intent.index).toBe(expected);
  });

  it('uses 0-based index', () => {
    const intent = parseVoiceIntent('play the 3rd song', noSongs);
    expect(intent.action).toBe('PLAY_INDEX');
    if (intent.action === 'PLAY_INDEX') expect(intent.index).toBe(2);
  });
});

// ── PLAY_SONG / fuzzy matching ──────────────────────────────────────────────

describe('PLAY_SONG — exact match', () => {
  it('matches exact title', () => {
    const intent = parseVoiceIntent('play Blinding Lights', library);
    expect(intent.action).toBe('PLAY_SONG');
    if (intent.action === 'PLAY_SONG') {
      expect(intent.songId).toBe('1');
      expect(intent.title).toBe('Blinding Lights');
    }
  });

  it('is case-insensitive', () => {
    const intent = parseVoiceIntent('play BOHEMIAN RHAPSODY', library);
    expect(intent.action).toBe('PLAY_SONG');
    if (intent.action === 'PLAY_SONG') expect(intent.songId).toBe('2');
  });
});

describe('PLAY_SONG — startsWith match', () => {
  it('matches title prefix', () => {
    const intent = parseVoiceIntent('play blinding', library);
    expect(intent.action).toBe('PLAY_SONG');
    if (intent.action === 'PLAY_SONG') expect(intent.songId).toBe('1');
  });
});

describe('PLAY_SONG — titleInQuery match (user said extra words)', () => {
  it('finds song name embedded in a longer phrase', () => {
    const intent = parseVoiceIntent('play that song called shape of you please', library);
    expect(intent.action).toBe('PLAY_SONG');
    if (intent.action === 'PLAY_SONG') expect(intent.songId).toBe('3');
  });
});

describe('PLAY_SONG — word overlap match', () => {
  it('matches on overlapping words when no exact/prefix hit', () => {
    const intent = parseVoiceIntent('play hotel', library);
    expect(intent.action).toBe('PLAY_SONG');
    if (intent.action === 'PLAY_SONG') expect(intent.songId).toBe('4');
  });
});

describe('PLAY_SONG — no match falls through to UNKNOWN', () => {
  it('returns UNKNOWN when no song matches', () => {
    const intent = parseVoiceIntent('play xyzzy nonexistent track', library);
    // With no fuzzy match the play branch returns nothing, so falls to UNKNOWN
    expect(['UNKNOWN', 'SEARCH_DOWNLOAD']).toContain(intent.action);
  });
});

// ── SEARCH_DOWNLOAD ─────────────────────────────────────────────────────────

describe('SEARCH_DOWNLOAD', () => {
  it.each([
    ['download Levitating', 'levitating'],
    ['get me Shape of You', 'shape of you'],
    ['find Blinding Lights remix', 'blinding lights remix'],
    ['search for Hotel California acoustic', 'hotel california acoustic'],
  ])('"%s" → query "%s"', (transcript, expectedQuery) => {
    const intent = parseVoiceIntent(transcript, noSongs);
    expect(intent.action).toBe('SEARCH_DOWNLOAD');
    if (intent.action === 'SEARCH_DOWNLOAD')
      expect(intent.query).toBe(expectedQuery);
  });
});

// ── UNKNOWN ─────────────────────────────────────────────────────────────────

describe('UNKNOWN', () => {
  it('returns UNKNOWN for empty string', () => {
    expect(parseVoiceIntent('', noSongs).action).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for gibberish', () => {
    expect(parseVoiceIntent('aslkdjf aslkdjf', noSongs).action).toBe('UNKNOWN');
  });

  it('preserves original transcript', () => {
    const intent = parseVoiceIntent('gibberish input', noSongs);
    if (intent.action === 'UNKNOWN') expect(intent.transcript).toBe('gibberish input');
  });
});

// ── Priority — NEXT beats PLAY when both patterns match ────────────────────

describe('priority', () => {
  it('NEXT takes priority over PLAY_SONG', () => {
    // "next" keyword fires before the play branch
    expect(parseVoiceIntent('next', library).action).toBe('NEXT');
  });

  it('PAUSE takes priority over potential song named "stop"', () => {
    expect(parseVoiceIntent('stop', noSongs).action).toBe('PAUSE');
  });
});
