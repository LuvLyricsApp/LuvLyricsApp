/**
 * LyricFlow - Sync Lyrics Screen
 *
 * Fixes the single most common lyric problem: the source file timestamps the
 * first line at 0s, but the recording opens with an instrumental intro, so every
 * line highlights seconds early. The relative timings are usually correct — only
 * the start is wrong — so one per-song offset repairs the whole song.
 *
 * Two modes:
 *
 * · Quick — one offset for the whole song, stored as `Song.lyricsOffset` and
 *   applied at playback time. Timestamps on disk are never rewritten, so
 *   re-fetching lyrics from a provider cannot silently lose the user's work.
 *   Right answer when only the start is wrong.
 *
 * · Line by line — play the song and tap once per line to stamp its real time.
 *   This rewrites the timestamps, so it also repairs lyrics whose *pacing* is
 *   wrong (badly estimated LRCs), which no single offset can fix.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';

import { RootStackScreenProps } from '../types/navigation';
import { Song } from '../types/song';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { usePlayer } from '../contexts/PlayerContext';
import { usePlaybackQueue } from '../hooks/usePlaybackQueue';
import { positionSV } from '../playback/positionBus';
import { getCurrentLineIndex } from '../utils/timestampParser';
import { formatTime } from '../utils/formatters';
import { Colors } from '../constants/colors';

/** Matches the slider bounds. Long orchestral intros stay inside this. */
const OFFSET_LIMIT = 30;
const NUDGE_STEP = 0.1;

const clampOffset = (value: number) =>
  Math.min(OFFSET_LIMIT, Math.max(-OFFSET_LIMIT, Math.round(value * 10) / 10));

type SyncMode = 'quick' | 'line';

export const SyncLyricsScreen: React.FC<RootStackScreenProps<'SyncLyrics'>> = ({
  route,
  navigation,
}) => {
  const { songId } = route.params;
  const insets = useSafeAreaInsets();

  const getSong = useSongsStore(state => state.getSong);
  const songs = useSongsStore(state => state.songs);
  const setLyricsOffset = useSongsStore(state => state.setLyricsOffset);
  const currentSong = usePlayerStore(state => state.currentSong);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const requestPlayback = usePlayerStore(state => state.requestPlayback);
  const lyricsDelay = useSettingsStore(state => state.lyricsDelay);
  const player = usePlayer();
  const playSong = usePlaybackQueue({});

  const updateSongInStore = useSongsStore(state => state.updateSong);

  const [song, setSong] = useState<Song | null>(null);
  const [mode, setMode] = useState<SyncMode>('quick');
  const [offset, setOffset] = useState(0);
  const [saving, setSaving] = useState(false);
  /**
   * Line-by-line captures. Index === lyric line index, so `taps.length` is both
   * the number of lines done and the index of the line awaiting a tap. Kept
   * separate from `song.lyrics` so nothing is committed until Save.
   */
  const [taps, setTaps] = useState<number[]>([]);
  // Whole tenths only — this drives a Text node, and re-rendering it at the
  // position bus's native tick rate would be pure waste.
  const [positionTenths, setPositionTenths] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getSong(songId).then((loaded) => {
      if (cancelled || !loaded) return;
      setSong(loaded);
      setOffset(clampOffset(loaded.lyricsOffset ?? 0));
    });
    return () => { cancelled = true; };
  }, [getSong, songId]);

  // positionSV is written on the UI thread by the position bus; hop to JS only
  // when the displayed tenth actually changes.
  useAnimatedReaction(
    () => Math.round(positionSV.value * 10),
    (next, previous) => {
      if (next !== previous) runOnJS(setPositionTenths)(next);
    },
  );

  const position = positionTenths / 10;
  const isThisSongLoaded = currentSong?.id === songId;
  const firstLine = song?.lyrics?.[0];
  const hasLyrics = !!song?.lyrics?.length;

  const previewIndex = useMemo(() => {
    if (!song?.lyrics?.length) return -1;
    return getCurrentLineIndex(song.lyrics, position + lyricsDelay + offset);
  }, [song, position, lyricsDelay, offset]);

  /**
   * Anchor the first line to this instant.
   *
   * Effective time is `position + lyricsDelay + offset`. Solving for the offset
   * that makes the first line active *right now* means subtracting the global
   * delay too — otherwise the highlight would land `lyricsDelay` seconds away
   * from where the user tapped and the calibration would feel broken.
   */
  const handleTapSync = useCallback(() => {
    if (!firstLine) return;
    const tappedAt = positionSV.value;
    setOffset(clampOffset(firstLine.timestamp - tappedAt - lyricsDelay));
  }, [firstLine, lyricsDelay]);

  const nudge = useCallback((delta: number) => {
    setOffset(previous => clampOffset(previous + delta));
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (!song) return;
    if (!isThisSongLoaded) {
      playSong(song, songs, songs);
      return;
    }
    requestPlayback(!isPlaying);
  }, [song, isThisSongLoaded, playSong, songs, requestPlayback, isPlaying]);

  /** Jump to a few seconds before the first line so the intro can be re-heard. */
  const handleReplayIntro = useCallback(async () => {
    if (!player || !firstLine || !isThisSongLoaded) return;
    const target = Math.max(0, firstLine.timestamp - offset - 5);
    const wasPlaying = usePlayerStore.getState().isPlaying;
    await player.seekTo(target);
    if (wasPlaying) player.play();
  }, [player, firstLine, offset, isThisSongLoaded]);

  const lineCount = song?.lyrics?.length ?? 0;
  const tapIndex = taps.length;
  const lineModeDone = lineCount > 0 && tapIndex >= lineCount;

  /** Stamp the line currently awaiting a tap and advance. */
  const handleTapLine = useCallback(() => {
    if (!isThisSongLoaded || lineModeDone) return;
    const at = positionSV.value;
    setTaps(previous => [...previous, at]);
  }, [isThisSongLoaded, lineModeDone]);

  /**
   * Drop the last capture and rewind to it, so the line can simply be retaken
   * on the next pass rather than forcing a restart.
   */
  const handleUndoLine = useCallback(async () => {
    if (!taps.length) return;
    const removed = taps[taps.length - 1];
    setTaps(previous => previous.slice(0, -1));
    if (!player || !isThisSongLoaded) return;
    const wasPlaying = usePlayerStore.getState().isPlaying;
    await player.seekTo(Math.max(0, removed - 2));
    if (wasPlaying) player.play();
  }, [taps, player, isThisSongLoaded]);

  const handleRestartLines = useCallback(async () => {
    setTaps([]);
    if (!player || !isThisSongLoaded) return;
    const wasPlaying = usePlayerStore.getState().isPlaying;
    await player.seekTo(0);
    if (wasPlaying) player.play();
  }, [player, isThisSongLoaded]);

  const handleSave = useCallback(async () => {
    if (!song) return;
    setSaving(true);

    if (mode === 'line' && taps.length) {
      // Lines the user never reached keep their relative pacing but ride along
      // with the correction already measured, so the list stays in ascending
      // order — a non-monotonic timestamp would break the binary search that
      // picks the active line.
      const lastIndex = taps.length - 1;
      const delta = taps[lastIndex] - song.lyrics[lastIndex].timestamp;
      const retimed = song.lyrics.map((line, index) => ({
        ...line,
        timestamp: index < taps.length ? taps[index] : line.timestamp + delta,
      }));
      // Timestamps are now absolute truth; any earlier quick-sync correction
      // would double-count, so it is cleared in the same write.
      await updateSongInStore({ ...song, lyrics: retimed, lyricsOffset: 0 });
      await setLyricsOffset(songId, 0);
    } else {
      await setLyricsOffset(songId, offset);
    }

    setSaving(false);
    navigation.goBack();
  }, [song, mode, taps, updateSongInStore, setLyricsOffset, songId, offset, navigation]);

  if (!song) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const offsetLabel = `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sync Lyrics</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={Colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
        <Text style={styles.songArtist} numberOfLines={1}>{song.artist || 'Unknown Artist'}</Text>

        {!hasLyrics ? (
          <View style={styles.emptyState}>
            <Ionicons name="musical-note-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              This song has no timed lyrics yet, so there is nothing to sync.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.modeToggle}>
              {([
                ['quick', 'Quick fix'],
                ['line', 'Line by line'],
              ] as const).map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => setMode(value)}
                  style={[styles.modeTab, mode === value && styles.modeTabActive]}
                >
                  <Text style={[styles.modeTabText, mode === value && styles.modeTabTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.transport}>
              <Pressable onPress={handleTogglePlay} hitSlop={12} style={styles.transportBtn}>
                <Ionicons
                  name={isThisSongLoaded && isPlaying ? 'pause' : 'play'}
                  size={26}
                  color={Colors.textPrimary}
                />
              </Pressable>
              <Text style={styles.clock}>
                {isThisSongLoaded ? formatTime(position) : '--:--'}
              </Text>
              <Pressable
                onPress={handleReplayIntro}
                hitSlop={12}
                style={[styles.transportBtn, !isThisSongLoaded && styles.disabled]}
              >
                <Ionicons name="play-back" size={22} color={Colors.textPrimary} />
              </Pressable>
            </View>

            {!isThisSongLoaded && (
              <Text style={styles.hint}>Press play to start this song, then sync.</Text>
            )}

            {mode === 'line' ? (
              <>
                <View style={styles.offsetRow}>
                  <Text style={styles.sectionLabel}>PROGRESS</Text>
                  <Text style={styles.offsetValue}>{tapIndex} / {lineCount}</Text>
                </View>

                <View style={styles.lineStack}>
                  <Text style={styles.lineDone} numberOfLines={1}>
                    {tapIndex > 0 ? song.lyrics[tapIndex - 1]?.text : ' '}
                  </Text>
                  <Text style={styles.lineCurrent} numberOfLines={3}>
                    {lineModeDone ? 'All lines synced 🎉' : song.lyrics[tapIndex]?.text}
                  </Text>
                  <Text style={styles.lineNext} numberOfLines={1}>
                    {song.lyrics[tapIndex + 1]?.text ?? ' '}
                  </Text>
                </View>

                <Pressable
                  onPress={handleTapLine}
                  disabled={!isThisSongLoaded || lineModeDone}
                  style={({ pressed }) => [
                    styles.tapTarget,
                    pressed && styles.tapTargetPressed,
                    (!isThisSongLoaded || lineModeDone) && styles.disabled,
                  ]}
                >
                  <Text style={styles.tapTargetText}>
                    {lineModeDone ? 'DONE — HIT SAVE' : 'TAP ON EACH LINE'}
                  </Text>
                </Pressable>

                <View style={styles.nudgeRow}>
                  <Pressable
                    onPress={handleUndoLine}
                    disabled={!taps.length}
                    style={[styles.nudgeBtn, !taps.length && styles.disabled]}
                  >
                    <Text style={styles.nudgeText}>Undo</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleRestartLines}
                    disabled={!taps.length}
                    style={[styles.nudgeBtn, !taps.length && styles.disabled]}
                  >
                    <Text style={styles.nudgeText}>Restart</Text>
                  </Pressable>
                </View>

                <Text style={styles.explainer}>
                  Play the song and tap once the moment each line begins. Undo steps
                  back a line and rewinds so you can retake it. Saving rewrites the
                  real timestamps, so this also fixes lyrics whose pacing drifts —
                  not just a late start. Any lines you don&apos;t reach shift along
                  with your last tap.
                </Text>
              </>
            ) : (
              <>
            <Text style={styles.sectionLabel}>FIRST LINE</Text>
            <Text style={styles.firstLine} numberOfLines={3}>{firstLine?.text}</Text>

            <Pressable
              onPress={handleTapSync}
              disabled={!isThisSongLoaded}
              style={({ pressed }) => [
                styles.tapTarget,
                pressed && styles.tapTargetPressed,
                !isThisSongLoaded && styles.disabled,
              ]}
            >
              <Text style={styles.tapTargetText}>TAP WHEN THIS</Text>
              <Text style={styles.tapTargetText}>LINE STARTS</Text>
            </Pressable>

            <View style={styles.offsetRow}>
              <Text style={styles.sectionLabel}>OFFSET</Text>
              <Text style={styles.offsetValue}>{offsetLabel}</Text>
            </View>

            <Slider
              style={styles.slider}
              minimumValue={-OFFSET_LIMIT}
              maximumValue={OFFSET_LIMIT}
              step={NUDGE_STEP}
              value={offset}
              onValueChange={(value) => setOffset(clampOffset(value))}
              minimumTrackTintColor={Colors.primary}
              maximumTrackTintColor={Colors.cardHover}
              thumbTintColor={Colors.primary}
            />

            <View style={styles.nudgeRow}>
              <Pressable onPress={() => nudge(-NUDGE_STEP)} style={styles.nudgeBtn}>
                <Text style={styles.nudgeText}>-0.1s</Text>
              </Pressable>
              <Pressable onPress={() => setOffset(0)} style={styles.nudgeBtn}>
                <Text style={styles.nudgeText}>Reset</Text>
              </Pressable>
              <Pressable onPress={() => nudge(NUDGE_STEP)} style={styles.nudgeBtn}>
                <Text style={styles.nudgeText}>+0.1s</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>PREVIEW</Text>
            <View style={styles.preview}>
              {previewIndex < 0 ? (
                <Text style={styles.previewIdle}>
                  {isThisSongLoaded ? 'Waiting for the first line…' : 'Start playback to preview'}
                </Text>
              ) : (
                <Text style={styles.previewActive} numberOfLines={3}>
                  {song.lyrics[previewIndex]?.text}
                </Text>
              )}
            </View>

            <Text style={styles.explainer}>
              Negative values hold the lyrics back — use this when the song opens with
              an instrumental intro. Fixing the first line realigns the whole song.
            </Text>
              </>
            )}
          </>
        )}
      </ScrollView>

      {hasLyrics && (
        <View style={[styles.footer, { paddingBottom: 20 + insets.bottom }]}>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, saving && styles.disabled]}
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },
  // Clears the pinned Save footer plus the docked mini player, which floats over
  // this screen so the song stays audible while syncing.
  body: { paddingHorizontal: 20, paddingBottom: 260 },
  songTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '600' },
  songArtist: { color: Colors.textSecondary, fontSize: 14, marginTop: 2, marginBottom: 24 },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  modeTabActive: { backgroundColor: Colors.cardHover },
  modeTabText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  modeTabTextActive: { color: Colors.textPrimary },
  lineStack: {
    marginTop: 16,
    marginBottom: 4,
    minHeight: 132,
    justifyContent: 'center',
    gap: 8,
  },
  lineDone: { color: Colors.textMuted, fontSize: 14 },
  lineCurrent: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700', lineHeight: 30 },
  lineNext: { color: Colors.textMuted, fontSize: 14, opacity: 0.7 },
  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  firstLine: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 24,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginBottom: 8,
  },
  transportBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardHover,
  },
  clock: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    minWidth: 60,
  },
  hint: { color: Colors.textMuted, fontSize: 13, marginBottom: 12 },
  tapTarget: {
    marginTop: 16,
    paddingVertical: 28,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: Colors.cardHover,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  tapTargetPressed: { backgroundColor: '#2E2E2E' },
  tapTargetText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  disabled: { opacity: 0.4 },
  offsetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
  },
  offsetValue: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  slider: { width: '100%', height: 40 },
  nudgeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  nudgeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.cardHover,
  },
  nudgeText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  preview: {
    marginTop: 8,
    marginBottom: 20,
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.card,
  },
  previewIdle: { color: Colors.textMuted, fontSize: 14 },
  previewActive: { color: Colors.textPrimary, fontSize: 17, fontWeight: '600' },
  explainer: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    backgroundColor: Colors.background,
  },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  saveText: { color: Colors.background, fontSize: 16, fontWeight: '700' },
});

export default SyncLyricsScreen;
