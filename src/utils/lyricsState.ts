import { Song } from '../types/song';

export const songHasAnyLyrics = (song: Song) => Array.isArray(song.lyrics) && song.lyrics.length > 0;

export const songHasSyncedLyrics = (song: Song) =>
  songHasAnyLyrics(song) && song.lyrics.some(line => typeof line.timestamp === 'number' && line.timestamp > 0);

export const songCanUpgradeToSyncedLyrics = (song: Song) =>
  songHasAnyLyrics(song) && !songHasSyncedLyrics(song);
