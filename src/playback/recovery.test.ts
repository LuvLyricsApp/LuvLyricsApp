// The DB layer is stubbed only so the player store's module graph loads under
// testEnvironment 'node' — nothing here reads or writes SQLite.
jest.mock('../database/queries', () => ({
  getSongById: jest.fn().mockResolvedValue(null),
}));
jest.mock('../store/songsStore', () => ({
  useSongsStore: { getState: () => ({ songs: [], setCurrentSong: jest.fn() }) },
}));
jest.mock('../store/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ updatePlaylistHistory: jest.fn() }) },
}));
jest.mock('./positionBus', () => ({ positionSV: { value: 0 }, durationSV: { value: 0 }, isSeeking: { value: false } }));
jest.mock('../services/NativeAudioPlayer', () => ({
  NativeAudioPlayer: { isAvailable: () => false, prepareNext: jest.fn(), seekToNextIfReady: jest.fn() },
}));

import { planRecovery, pickSameSong, MAX_AUTO_RESUMES } from './recovery';
import { resumeNextLoadAt, takeResumePosition } from '../store/playerStore';
import type { UnifiedSong } from '../types/song';

const catalogSong = (over: Partial<UnifiedSong>): UnifiedSong => ({
  id: 'x',
  title: 'Hukum',
  artist: 'Anirudh Ravichander',
  highResArt: '',
  downloadUrl: 'https://cdn.example/x.mp4',
  source: 'Saavn',
  ...over,
});

describe('planRecovery', () => {
  it('fetches a fresh link and resumes when a stream link is refused', () => {
    expect(planRecovery('expired', true, MAX_AUTO_RESUMES)).toEqual({ refreshLink: true, resume: true });
  });

  it('reloads a song on the phone without a link refresh', () => {
    expect(planRecovery('stall', false, MAX_AUTO_RESUMES)).toEqual({ refreshLink: false, resume: true });
  });

  it('stops resuming on its own once the per-song budget is spent', () => {
    expect(planRecovery('network', true, 0).resume).toBe(false);
  });

  it('always reloads when the listener taps play on a player that is gone', () => {
    expect(planRecovery('tapped', true, 0)).toEqual({ refreshLink: false, resume: true });
  });

  it('waits for a tap after the service is released or a decoder error', () => {
    expect(planRecovery('released', true, MAX_AUTO_RESUMES).resume).toBe(false);
    expect(planRecovery('error', true, MAX_AUTO_RESUMES).resume).toBe(false);
  });
});

describe('pickSameSong', () => {
  const song = { id: 'stream:saavn:abc', title: 'Hukum', artist: 'Anirudh Ravichander, Super Subu' };

  it('prefers the exact provider id', () => {
    const results = [catalogSong({ id: 'zzz' }), catalogSong({ id: 'abc', downloadUrl: 'https://cdn.example/fresh.mp4' })];
    expect(pickSameSong(song, results)?.downloadUrl).toBe('https://cdn.example/fresh.mp4');
  });

  it('falls back to the same title by the same lead artist', () => {
    const results = [catalogSong({ id: 'other', title: 'Hukum (Lofi)' }), catalogSong({ id: 'new' })];
    expect(pickSameSong(song, results)?.id).toBe('new');
  });

  it('refuses a different song', () => {
    expect(pickSameSong(song, [catalogSong({ id: 'q', title: 'Kaavaalaa' })])).toBeNull();
  });
});

describe('resume position hand-off', () => {
  it('is taken once, only by the song it was set for', () => {
    resumeNextLoadAt('a', 42);
    expect(takeResumePosition('b')).toBeNull();
    expect(takeResumePosition('a')).toBe(42);
    expect(takeResumePosition('a')).toBeNull();
  });

  it('ignores a start at zero', () => {
    resumeNextLoadAt('a', 0);
    expect(takeResumePosition('a')).toBeNull();
  });
});
