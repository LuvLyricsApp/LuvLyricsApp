import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, View, StyleSheet, useWindowDimensions } from 'react-native';
import * as GestureHandler from 'react-native-gesture-handler';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { RootStackScreenProps } from '../types/navigation';
import { usePlayerStore } from '../store/playerStore';
import { positionSV, durationSV } from '../playback/positionBus';
import { CoverArtSearchScreen } from './CoverArtSearchScreen';
import { useNowPlayingLogic } from '../hooks/useNowPlayingLogic';
import NowPlayingBackground from '../components/NowPlayingBackground';
import NowPlayingHeader from '../components/NowPlayingHeader';
import NowPlayingLyricsArea from '../components/NowPlayingLyricsArea';
import NowPlayingControls from '../components/NowPlayingControls';
import { navigationRef, safeGoBack } from '../utils/navigationService';
import { DISMISS_DISTANCE, DISMISS_VELOCITY, takeOpenVelocity } from '../navigation/playerSheet';
import { useCanvasArtwork } from '../hooks/useCanvasArtwork';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSettingsStore } from '../store/settingsStore';
import { PlayerSheet, QueueList, SleepTimerList } from '../components/player/PlayerSheet';
import { sleepLabel, useSleepTimerStore } from '../store/sleepTimerStore';
import PlayerMenu, { PlayerMenuAction } from '../components/player/PlayerMenu';
import { SongDetails, TempoPitch } from '../components/player/PlayerExtras';
import AmbientMode from '../components/player/AmbientMode';
import ListenTogetherPanel from '../components/listenTogether/ListenTogetherPanel';
import { Toast } from '../components/Toast';
import { StreamService } from '../services/stream/StreamService';
import { isStreamSongId } from '../services/stream/streamSong';
import { NativeAudioPlayer } from '../services/NativeAudioPlayer';
import { refetchCurrent, setAsRingtone, shareSong, shuffleUpcoming } from '../services/player/playerMenuActions';
import { usePlaybackModesStore } from '../store/playbackModesStore';
import { useListenTogetherStore } from '../store/listenTogetherStore';

const { Gesture, GestureDetector } = GestureHandler;

// Opening decelerates into place with no bounce; closing accelerates out,
// carrying the flick's speed.
const OPEN_SPRING = { stiffness: 240, damping: 32, mass: 1, overshootClamping: true } as const;
const SETTLE_SPRING = { stiffness: 320, damping: 34, mass: 1, overshootClamping: true } as const;
const CLOSE_EASE = Easing.bezier(0.4, 0, 0.9, 0.6);

type Props = RootStackScreenProps<'NowPlaying'>;

const NowPlayingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { songId } = route.params;
  const setMiniPlayerHiddenSource = usePlayerStore(state => state.setMiniPlayerHiddenSource);
  // The screen, not the window: on Android the window leaves out the nav bar,
  // and a sheet parked at the window height would leave a sliver showing.
  const { height: windowH } = useWindowDimensions();
  const screenH = Math.max(windowH, Dimensions.get('screen').height);
  const reduceMotion = useReducedMotion();

  // ── Sheet: rise in, follow the finger, fall away ────────────────────────
  // translateY 0 = open, screenH = below the screen. Starts off-screen so the
  // first frame never flashes the player at rest.
  const sheetY = useSharedValue(screenH);
  // Every way out (grabber, hardware back, a programmatic pop) animates first;
  // the route is only removed once the sheet is off-screen.
  const [holdRoute, setHoldRoute] = useState(true);
  const closing = useSharedValue(false);

  useEffect(() => {
    const velocity = takeOpenVelocity();
    sheetY.value = reduceMotion
      ? withTiming(0, { duration: 200 })
      : withSpring(0, { ...OPEN_SPRING, velocity: -velocity });
  // Mount only: the sheet opens once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishClose = useCallback(() => setHoldRoute(false), []);
  // Where to go once the sheet is gone (the artist line opens their page).
  const afterClose = useRef<string | null>(null);
  useEffect(() => {
    if (holdRoute) return;
    safeGoBack(navigation);
    const artist = afterClose.current;
    if (artist && navigationRef.isReady()) {
      navigationRef.navigate('Main', { screen: 'Browse', params: { screen: 'Artist', params: { name: artist } } });
    }
  }, [holdRoute, navigation]);

  // The pill comes back as the sheet starts to fall, so it is already in place
  // when the page underneath is revealed.
  const revealPill = useCallback(() => {
    setMiniPlayerHiddenSource('NowPlaying', false);
  }, [setMiniPlayerHiddenSource]);

  const animateClose = useCallback((velocity = 0) => {
    'worklet';
    if (closing.value) return;
    closing.value = true;
    runOnJS(revealPill)();
    const remaining = Math.max(0, screenH - sheetY.value);
    const duration = velocity > 0
      ? Math.max(140, Math.min(300, (remaining / velocity) * 1000))
      : 280;
    sheetY.value = withTiming(screenH, { duration, easing: CLOSE_EASE }, done => {
      if (done) runOnJS(finishClose)();
    });
  }, [screenH, finishClose, revealPill, closing, sheetY]);

  // Ambient mode (player menu): back leaves ambient first, then the player.
  const [ambient, setAmbient] = useState(false);
  const ambientRef = useRef(false);
  ambientRef.current = ambient;
  usePreventRemove(holdRoute, () => {
    if (ambientRef.current) setAmbient(false);
    else animateClose(0);
  });

  // Drag down from anywhere to dismiss. Over the lyrics it only takes over once
  // the list is scrolled to its top — otherwise the drag scrolls the lyrics.
  const lyricsOffset = useSharedValue(0);
  const startY = useSharedValue(0);
  const dismissGesture = Gesture.Pan()
    .enabled(!ambient)
    .manualActivation(true)
    .onTouchesDown((e, state) => {
      'worklet';
      const t = e.allTouches[0];
      if (!t || closing.value) { state.fail(); return; }
      startY.value = t.absoluteY;
    })
    .onTouchesMove((e, state) => {
      'worklet';
      const t = e.allTouches[0];
      if (!t) return;
      const dy = t.absoluteY - startY.value;
      if (dy < -10) { state.fail(); return; }
      if (dy < 12) return;
      if (lyricsOffset.value > 2) { state.fail(); return; }
      state.activate();
    })
    .failOffsetX([-24, 24])
    .onUpdate(e => {
      'worklet';
      // Past the top it resists instead of detaching.
      const y = e.translationY;
      sheetY.value = y > 0 ? y : y * 0.15;
    })
    .onEnd(e => {
      'worklet';
      const past = e.translationY > screenH * DISMISS_DISTANCE;
      const flung = e.velocityY > DISMISS_VELOCITY;
      if ((past && e.velocityY > -200) || flung) {
        animateClose(Math.max(e.velocityY, 0));
      } else {
        sheetY.value = withSpring(0, { ...SETTLE_SPRING, velocity: e.velocityY });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  // The page underneath shows through as the sheet lowers, dimmed until the
  // sheet is mostly gone.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, screenH], [0.6, 0], Extrapolation.CLAMP),
  }));

  // Settings → Playback → Keep screen on: only while this screen is open.
  const keepScreenOn = useSettingsStore(s => s.keepScreenOn);
  useFocusEffect(
    React.useCallback(() => {
      if (!keepScreenOn) return undefined;
      activateKeepAwakeAsync('now-playing').catch(() => {});
      return () => { deactivateKeepAwake('now-playing').catch(() => {}); };
    }, [keepScreenOn])
  );

  useFocusEffect(
    React.useCallback(() => {
      setMiniPlayerHiddenSource('NowPlaying', true);
      return () => {
        setMiniPlayerHiddenSource('NowPlaying', false);
      };
    }, [setMiniPlayerHiddenSource])
  );

  const {
    currentSong,
    isCurrentSongLiked,
    showCoverSearch,
    setShowCoverSearch,
    controlsVisible,
    animatedStyle,
    showLyrics,
    setShowLyrics,
    processedLyrics,
    flatListRef,
    togglePlay,
    skipForward,
    skipBackward,
    handleScrub,
    handleLyricTap,
    gradientColors,
    updateCurrentSong,
    addRecentArt,
    storePlaying,
    toggleLike,
    isUserScrolling,
    scrollTimeoutRef,
  } = useNowPlayingLogic(songId, route.params.lyrics === true);

  // With the lyrics hidden there is nothing to scroll, so a drag always dismisses.
  useEffect(() => {
    if (!showLyrics) lyricsOffset.value = 0;
  }, [showLyrics, lyricsOffset]);

  const canvas = useCanvasArtwork(currentSong);

  // Tap the artist line to open their page (YouTube Music, Echo style).
  const artistName = currentSong?.artist;
  const openArtist = React.useMemo(() => {
    if (!artistName || /^unknown artist$/i.test(artistName)) return undefined;
    return () => {
      // First credited artist ("A, B & C" → "A") — that's whose page to open.
      afterClose.current = artistName.split(/,|&| feat\.? | ft\.? | x /i)[0]?.trim() || artistName;
      animateClose(0);
    };
  }, [artistName, animateClose]);

  const [sheet, setSheet] = React.useState<'queue' | 'timer' | 'menu' | 'details' | 'advanced' | 'together' | null>(route.params.sheet ?? null);

  // A link can arrive while the player is already open (lyricflow://play?…&lyrics=1,
  // lyricflow://player?sheet=menu, an invite): apply it instead of ignoring it.
  const linkLyrics = route.params.lyrics;
  const linkSheet = route.params.sheet;
  useEffect(() => {
    if (linkLyrics) setShowLyrics(true);
  }, [linkLyrics, route.params.songId, setShowLyrics]);
  useEffect(() => {
    if (linkSheet) setSheet(linkSheet);
  }, [linkSheet]);
  const closeSheet = useCallback(() => setSheet(null), []);

  // The sleep timer's remaining time, refreshed while it runs.
  const sleepEndsAt = useSleepTimerStore(s => s.endsAt);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (!sleepEndsAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [sleepEndsAt]);
  const sleepText = sleepEndsAt ? sleepLabel(sleepEndsAt, now) : null;

  // What the ••• menu's actions report, as a toast.
  const [notice, setNotice] = useState<string | null>(null);
  const say = useCallback((text: string) => setNotice(text), []);
  const repeatOne = usePlaybackModesStore(s => s.repeatOne);
  const setRepeatOne = usePlaybackModesStore(s => s.setRepeatOne);
  const roomOpen = useListenTogetherStore(s => s.room !== null);
  const listeners = useListenTogetherStore(s => s.room?.users.length ?? 0);

  const onMenuAction = useCallback(async (action: PlayerMenuAction) => {
    const song = currentSong;
    if (!song) return;
    const stream = isStreamSongId(song.id);
    switch (action) {
      case 'radio': {
        setSheet(null);
        say('Starting a radio from this song…');
        const n = await StreamService.startRadio(song);
        say(n > 0 ? `Radio on — ${n} songs up next` : 'Couldn’t find a radio for this song');
        return;
      }
      case 'add':
        setSheet(null);
        if (stream) say(StreamService.save(song.id) ? 'Downloading — once it’s saved you can add it to a playlist' : 'Couldn’t save this song');
        else navigation.navigate('AddToPlaylist', { songId: song.id });
        return;
      case 'share':
        shareSong(song);
        return;
      case 'cast':
        setSheet(null);
        if (!NativeAudioPlayer.openOutputSwitcher()) say('No other devices found');
        return;
      case 'ambient':
        setSheet(null);
        setAmbient(true);
        return;
      case 'lyrics':
        setSheet(null);
        setShowLyrics(!showLyrics);
        return;
      case 'shuffle':
        setSheet(null);
        say(shuffleUpcoming() > 0 ? 'Shuffled what plays next' : 'Nothing queued to shuffle');
        return;
      case 'download':
        setSheet(null);
        say(StreamService.save(song.id) ? 'Downloading to your library' : 'Couldn’t download this song');
        return;
      case 'like':
        toggleLike(song.id);
        return;
      case 'repeat':
        setRepeatOne(!repeatOne);
        say(repeatOne ? 'Repeat off' : 'Repeating this song');
        return;
      case 'refetch': {
        setSheet(null);
        say('Loading the song again…');
        const ok = await refetchCurrent();
        say(ok ? 'Reloaded' : 'Couldn’t reload the song');
        return;
      }
      case 'artist':
        setSheet(null);
        openArtist?.();
        return;
      case 'ringtone':
        setSheet(null);
        say(await setAsRingtone(song));
        return;
      case 'together':
        setSheet('together');
        return;
      case 'details':
        setSheet('details');
        return;
      case 'equalizer':
        setSheet(null);
        if (!NativeAudioPlayer.openEqualizer()) say('No equalizer on this phone');
        return;
      case 'advanced':
        setSheet('advanced');
        return;
    }
  }, [currentSong, navigation, say, showLyrics, setShowLyrics, toggleLike, repeatOne, setRepeatOne, openArtist]);

  const handleCoverSelect = useCallback(async (uri: string) => {
    setShowCoverSearch(false);
    if (currentSong) {
      const updatedSong = { ...currentSong, coverImageUri: uri };
      updateCurrentSong({ coverImageUri: uri });
      try {
        const queries = await import('../database/queries');
        await queries.updateSong(updatedSong);
        addRecentArt(uri);
      } catch (e) {
        if (__DEV__) console.error('[NowPlaying] Failed to save cover:', e);
      }
    }
  }, [currentSong, updateCurrentSong, addRecentArt, setShowCoverSearch]);

  return (
    <View style={styles.root}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <GestureDetector gesture={dismissGesture}>
      <Animated.View style={[styles.container, sheetStyle]}>
        <NowPlayingBackground
          coverImageUri={currentSong?.coverImageUri}
          gradientColors={gradientColors}
          showLyrics={showLyrics}
          canvas={ambient ? null : canvas}
          playing={storePlaying}
        />

        <NowPlayingHeader
          animatedStyle={animatedStyle}
          controlsVisible={controlsVisible}
          onGoBack={() => animateClose(0)}
          together={roomOpen ? listeners : null}
          onTogetherPress={() => setSheet('together')}
        />

        <CoverArtSearchScreen
          visible={showCoverSearch}
          initialQuery={`${currentSong?.title} ${currentSong?.artist}`}
          onClose={() => setShowCoverSearch(false)}
          onSelect={handleCoverSelect}
        />

        <View style={styles.contentArea}>
          <NowPlayingLyricsArea
            showLyrics={showLyrics}
            processedLyrics={processedLyrics}
            currentTime={positionSV}
            onLyricPress={handleLyricTap}
            songTitle={currentSong?.title}
            isUserScrollingRef={isUserScrolling}
            scrollTimeoutRef={scrollTimeoutRef}
            flatListRef={flatListRef}
            coverImageUri={currentSong?.coverImageUri}
            songArtist={currentSong?.artist}
            scrollOffset={lyricsOffset}
          />
        </View>

        <NowPlayingControls
          animatedStyle={animatedStyle}
          controlsVisible={controlsVisible}
          storePlaying={storePlaying}
          currentSongTitle={currentSong?.title}
          currentSongArtist={currentSong?.artist}
          isCurrentSongLiked={isCurrentSongLiked}
          onTogglePlay={togglePlay}
          onSkipForward={skipForward}
          onSkipBackward={skipBackward}
          onToggleLike={() => currentSong && toggleLike(currentSong.id)}
          onToggleLyrics={() => setShowLyrics(!showLyrics)}
          positionSV={positionSV}
          durationSV={durationSV}
          onSeek={handleScrub}
          showLyrics={showLyrics}
          compact={showLyrics}
          onMorePress={() => setSheet('menu')}
          onOpenQueue={() => setSheet('queue')}
          onOpenTimer={() => setSheet('timer')}
          sleepLabel={sleepText}
          onArtistPress={openArtist}
        />

        <PlayerSheet visible={sheet === 'queue'} title="Playing next" onClose={closeSheet}>
          <QueueList onPicked={closeSheet} />
        </PlayerSheet>
        <PlayerSheet visible={sheet === 'timer'} title="Sleep timer" onClose={closeSheet}>
          <SleepTimerList onPicked={closeSheet} />
        </PlayerSheet>
        <PlayerSheet visible={sheet === 'menu'} tall onClose={closeSheet}>
          {currentSong ? (
            <PlayerMenu song={currentSong} liked={isCurrentSongLiked} showLyrics={showLyrics} onAction={onMenuAction} />
          ) : null}
        </PlayerSheet>
        <PlayerSheet visible={sheet === 'details'} title="Details" onClose={closeSheet}>
          {currentSong ? (
            <SongDetails
              song={currentSong}
              onEditLyrics={() => { closeSheet(); navigation.navigate('AddEditLyrics', { songId: currentSong.id }); }}
              onChangeCover={() => { closeSheet(); setShowCoverSearch(true); }}
            />
          ) : null}
        </PlayerSheet>
        <PlayerSheet visible={sheet === 'advanced'} title="Tempo and pitch" onClose={closeSheet}>
          <TempoPitch />
        </PlayerSheet>
        <PlayerSheet visible={sheet === 'together'} title="Listen together" tall onClose={closeSheet}>
          <ListenTogetherPanel />
        </PlayerSheet>

        {ambient && currentSong ? (
          <AmbientMode song={currentSong} canvas={canvas} playing={storePlaying} onExit={() => setAmbient(false)} />
        ) : null}

        <Toast visible={notice !== null} message={notice ?? ''} type="info" onDismiss={() => setNotice(null)} duration={2600} />
      </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    overflow: 'hidden',
  },
  contentArea: {
    flex: 1,
  },
});

export default NowPlayingScreen;
