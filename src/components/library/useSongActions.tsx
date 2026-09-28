/**
 * Everything you can do to a library song from a long press: change or
 * remove its cover, swap the audio version, edit its title / artist, find
 * lyrics, share the file, hide it or delete it.
 *
 * Moved out of the old Home screen so the Library (the Downloads layout) has
 * the same powers. Call `open(song)` from a row's long press and render
 * `element` once in the screen.
 */
import React, { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import LibraryBottomSheet from '../LibraryBottomSheet';
import LibraryEditModal from '../LibraryEditModal';
import { ModernDeleteModal } from '../ModernDeleteModal';
import { SongVersionSearchModal } from '../SongVersionSearchModal';
import { Toast } from '../Toast';
import { CoverArtSearchScreen } from '../../screens/CoverArtSearchScreen';
import { useSongsStore } from '../../store/songsStore';
import { useArtHistoryStore } from '../../store/artHistoryStore';
import { useLyricsScanQueueStore } from '../../store/lyricsScanQueueStore';
import { Signal } from '../../constants/allegraTheme';
import { songCanUpgradeToSyncedLyrics } from '../../utils/lyricsState';
import { Song } from '../../types/song';
import * as Haptics from '../../utils/haptics';

const SHEET_COLORS = { primary: Signal.wave };

type ToastState = { message: string; type: 'success' | 'error' | 'info' } | null;

export const useSongActions = () => {
  const updateSong = useSongsStore(s => s.updateSong);
  const fetchSongs = useSongsStore(s => s.fetchSongs);
  const deleteSong = useSongsStore(s => s.deleteSong);
  const hideSong = useSongsStore(s => s.hideSong);
  const recentArts = useArtHistoryStore(s => s.recentArts);
  const addRecentArt = useArtHistoryStore(s => s.addRecentArt);
  const addToScanQueue = useLyricsScanQueueStore(s => s.addToQueue);

  const [song, setSong] = useState<Song | null>(null);
  const [sheet, setSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [coverSearch, setCoverSearch] = useState(false);
  const [versions, setVersions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [toast, setToast] = useState<ToastState>(null);

  const open = useCallback((s: Song) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSong(s);
    setSheet(true);
  }, []);

  /** Queue a lyrics search (or a retry for synced lyrics) for a song. */
  const findLyrics = useCallback((s: Song) => {
    const existing = useLyricsScanQueueStore.getState().queue[s.id];
    const plain = (existing?.status === 'completed' && existing?.resultType === 'plain') || (!existing && songCanUpgradeToSyncedLyrics(s));
    if (existing && existing.status !== 'failed' && !plain) {
      setToast({ message: `Already searching for "${s.title}"`, type: 'info' });
      return;
    }
    addToScanQueue(s, plain);
    Haptics.vibrate(50);
    setToast({ message: plain ? `Looking for synced lyrics: "${s.title}"` : `Searching lyrics for "${s.title}"`, type: 'success' });
  }, [addToScanQueue]);

  const setCover = useCallback(async (uri: string | undefined, message?: string) => {
    if (!song) return;
    try {
      await updateSong({ ...song, coverImageUri: uri, dateModified: new Date().toISOString() });
      if (uri) addRecentArt(uri);
      await fetchSongs();
      if (message) setToast({ message, type: 'success' });
    } catch {
      setToast({ message: 'Could not save the cover', type: 'error' });
    }
  }, [song, updateSong, addRecentArt, fetchSongs]);

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0]?.uri) {
        setSheet(false);
        await setCover(result.assets[0].uri);
      }
    } catch {
      setToast({ message: 'Could not save the cover', type: 'error' });
    }
  }, [setCover]);

  const share = useCallback(async () => {
    if (!song?.audioUri) {
      setToast({ message: 'No audio file to share', type: 'error' });
      return;
    }
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setToast({ message: 'Sharing is not available on this device', type: 'error' });
        return;
      }
      setSheet(false);
      let uri = song.audioUri;
      if (uri.startsWith('content://')) {
        const temp = `${FileSystem.cacheDirectory}share_${Date.now()}.${uri.includes('m4a') ? 'm4a' : 'mp3'}`;
        await FileSystem.copyAsync({ from: uri, to: temp }).then(() => { uri = temp; }).catch(() => {});
      }
      await Sharing.shareAsync(uri, { dialogTitle: `Share "${song.title}"`, mimeType: 'audio/mpeg', UTI: 'public.audio' });
    } catch {
      setToast({ message: 'Could not share the song', type: 'error' });
    }
  }, [song]);

  const later = (fn: () => void) => { setSheet(false); setTimeout(fn, 300); };

  const element = (
    <>
      <LibraryBottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        selectedSong={song}
        onShare={share}
        onOpenVersionSearch={() => later(() => setVersions(true))}
        onPickImage={pickImage}
        onOpenCoverSearch={() => { setSheet(false); setCoverSearch(true); }}
        recentArts={recentArts}
        onSelectRecentArt={uri => { setSheet(false); setCover(uri); }}
        onRemoveCover={() => { setSheet(false); setCover(undefined, 'Cover removed'); }}
        onHideSong={async () => {
          setSheet(false);
          if (!song) return;
          try {
            await hideSong(song.id, true);
            setToast({ message: 'Hidden from your library', type: 'success' });
          } catch {
            setToast({ message: 'Could not hide the song', type: 'error' });
          }
        }}
        onEditInfo={() => later(() => { setEditTitle(song?.title ?? ''); setEditArtist(song?.artist ?? ''); setEditing(true); })}
        onDelete={() => later(() => setConfirmDelete(true))}
        colors={SHEET_COLORS}
      />
      <ModernDeleteModal
        visible={confirmDelete}
        title="Delete song"
        message={`Delete "${song?.title}"? This cannot be undone.`}
        onConfirm={async () => {
          if (!song) return;
          try {
            await deleteSong(song.id);
            setConfirmDelete(false);
            setToast({ message: 'Song deleted', type: 'success' });
          } catch {
            setToast({ message: 'Could not delete the song', type: 'error' });
          }
        }}
        onCancel={() => setConfirmDelete(false)}
      />
      <SongVersionSearchModal
        visible={versions}
        targetSong={song}
        onClose={() => setVersions(false)}
        onSuccess={() => { fetchSongs(); setToast({ message: 'Song updated', type: 'success' }); }}
      />
      <CoverArtSearchScreen
        visible={coverSearch}
        initialQuery={song ? `${song.title} ${song.artist ?? ''}` : ''}
        onClose={() => setCoverSearch(false)}
        onSelect={uri => { setCoverSearch(false); setCover(uri, 'Cover updated'); }}
      />
      <LibraryEditModal
        visible={editing}
        onClose={() => setEditing(false)}
        title={editTitle}
        onTitleChange={setEditTitle}
        artist={editArtist}
        onArtistChange={setEditArtist}
        onSave={async () => {
          if (!song || !editTitle.trim()) return;
          try {
            await updateSong({ ...song, title: editTitle.trim(), artist: editArtist.trim(), dateModified: new Date().toISOString() });
            await fetchSongs();
            setEditing(false);
            setToast({ message: 'Song info updated', type: 'success' });
          } catch {
            setToast({ message: 'Could not update the song', type: 'error' });
          }
        }}
        primaryColor={Signal.wave}
      />
      {toast ? <Toast visible message={toast.message} type={toast.type} onDismiss={() => setToast(null)} /> : null}
    </>
  );

  return { open, findLyrics, element };
};
