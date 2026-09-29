import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, View, StyleSheet, useWindowDimensions } from 'react-native';
import * as GestureHandler from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { RootStackScreenProps } from '../types/navigation';
import { usePlayerStore } from '../store/playerStore';
import { positionSV, durationSV, isSeeking } from '../playback/positionBus';
import { CoverArtSearchScreen } from './CoverArtSearchScreen';
import { useNowPlayingLogic } from '../hooks/useNowPlayingLogic';
import NowPlayingBackground from '../components/NowPlayingBackground';
import NowPlayingHeader from '../components/NowPlayingHeader';
import NowPlayingLyricsArea, { CONTROLS_CLEARANCE, HEADER_CLEARANCE, LYRICS_MORPH_MS } from '../components/NowPlayingLyricsArea';
import NowPlayingControls from '../components/NowPlayingControls';
import { navigationRef, safeGoBack } from '../utils/navigationService';
import { DISMISS_DISTANCE, DISMISS_VELOCITY, takeOpenVelocity } from '../navigation/playerSheet';
import { shouldCloseSheet } from '../navigation/sheetClose';
import { playerSheetRest } from '../navigation/tabs';
import { playerSheetProgress } from '../navigation/sheetProgress';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from '../utils/haptics';
import { diag } from '../utils/diag';
import { useCanvasArtwork } from '../hooks/useCanvasArtwork';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { isCardPlayerBackground, useSettingsStore } from '../store/settingsStore';
import { PlayerSheet, SleepTimerList } from '../components/player/PlayerSheet';
import UpNextPanel from '../components/player/UpNextPanel';
import SeekRipple, { SeekPulse } from '../components/player/SeekRipple';
import { isCoverFull, SEEK_STEP_S, seekSide, seekTarget } from '../components/player/coverStage';
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

// Echo Music's sheet springs (Compose's defaults), critically damped — no
// bounce: a tap opens or closes on the softer one (StiffnessMediumLow, 400), a
// flick hands its speed to the firmer one (StiffnessMedium, 1500) so it lands
// fast. Every one starts from where the sheet is with the finger's speed, so a
// grab mid-flight just takes over.
const criticallyDamped = (stiffness: number) => ({ stiffness, damping: 2 * Math.sqrt(stiffness), mass: 1, overshootClamping: true }) as const;
const SOFT_SPRING = criticallyDamped(400);
const FLING_SPRING = criticallyDamped(1500);
const SETTLE_SPRING = { stiffness: 320, damping: 34, mass: 1, overshootClamping: true } as const;
const CLOSE_REST = { restDisplacementThreshold: 0.5, restSpeedThreshold: 8 } as const;
/** A release this fast (px/s) counts as a flick and takes the firmer spring. */
const FLICK = 800;
/** Momentum projection: where a flick would come to rest (deceleration 0.99/ms). */
const projectMomentum = (velocity: number): number => {
  'worklet';
  return (velocity / 1000) * (0.99 / (1 - 0.99));
};
/** Progressive resistance past the top, instead of a hard stop. */
const rubberBand = (overshoot: number, dimension: number): number => {
  'worklet';
  const a = Math.abs(overshoot);
  return Math.sign(overshoot) * ((a * dimension * 0.55) / (dimension + 0.55 * a));
};
// The page underneath only dims while the sheet moves. It used to blur, which
// on Android re-renders the page under it on every frame of the drag and made
// opening and closing the player stutter; a dim costs nothing.
const PAGE_DIM = 0.5;
/** The sheet's top corners while it moves; square once open. */
const SHEET_CORNER = 22;

type Props = RootStackScreenProps<'NowPlaying'>;

const NowPlayingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { songId } = route.params;
  const setMiniPlayerHiddenSource = usePlayerStore(state => state.setMiniPlayerHiddenSource);
  // The screen, not the window: on Android the window leaves out the nav bar,
  // and a sheet parked at the window height would leave a sliver showing.
  const { width: windowW, height: windowH } = useWindowDimensions();
  const screenH = Math.max(windowH, Dimensions.get('screen').height);
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const pillNav = useSettingsStore(s => s.navBarStyle) === 'modern-pill';

  // ── Sheet: grow out of the pill, follow the finger, shrink back ──────────
  // translateY 0 = open; restY = resting on the pill (its top edge), where the
  // sheet is scaled to the pill's width. It starts there, so the first frame
  // never flashes the player at rest.
  const { y: restY } = playerSheetRest(windowW, screenH, insets.bottom, pillNav);
  const sheetY = useSharedValue(restY);
  const progress = useDerivedValue(() => Math.min(1, Math.max(0, 1 - sheetY.value / restY)));
  useAnimatedReaction(() => progress.value, p => { playerSheetProgress.value = p; });
  useEffect(() => () => { playerSheetProgress.value = 0; }, []);

  // Every way out (grabber, hardware back, a programmatic pop) animates first;
  // the route is only removed once the sheet is back on the pill.
  const [holdRoute, setHoldRoute] = useState(true);
  const closing = useSharedValue(false);

  useEffect(() => {
    const velocity = takeOpenVelocity();
    sheetY.value = reduceMotion
      ? withTiming(0, { duration: 200 })
      : withSpring(0, { ...(velocity > FLICK ? FLING_SPRING : SOFT_SPRING), velocity: -velocity });
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
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(finishClose)();
    };
    sheetY.value = reduceMotion
      ? withTiming(restY, { duration: 200, easing: Easing.out(Easing.quad) }, done)
      : withSpring(restY, { ...(velocity > FLICK ? FLING_SPRING : SOFT_SPRING), ...CLOSE_REST, velocity: Math.max(0, velocity) }, done);
  }, [restY, reduceMotion, finishClose, revealPill, closing, sheetY]);

  // Ambient mode (player menu): back leaves ambient first, then the player.
  const [ambient, setAmbient] = useState(false);
  const ambientRef = useRef(false);
  ambientRef.current = ambient;
  // A sheet over the player (timer, menu…). Swiping down or pressing back
  // closes the sheet only; the next swipe or press closes the player.
  type Sheet = 'timer' | 'menu' | 'details' | 'advanced' | 'together';
  const initialSheet = route.params.sheet;
  const [sheet, setSheet] = useState<Sheet | null>(initialSheet && initialSheet !== 'queue' ? initialSheet : null);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  // ── Up next: swipe up and the queue rises under the player (YouTube Music) ──
  // 0 closed .. 1 open. The finger drives it both ways; the title, scrubber and
  // transport ride up above the panel (NowPlayingControls), the rest fades.
  const upNext = useSharedValue(0);
  const [upNextOpen, setUpNextOpen] = useState(false);
  const [upNextMounted, setUpNextMounted] = useState(false);
  const upNextRef = useRef(false);
  upNextRef.current = upNextOpen;
  const upNextShown = useSharedValue(false);
  const frameH = useSharedValue(screenH);
  const [frameHeight, setFrameHeight] = useState(screenH);
  // The panel's top edge: half the player, so the compact transport keeps its room above it.
  const upNextTop = Math.round(frameHeight * 0.5);
  const upNextTravel = Math.max(1, frameHeight - upNextTop);

  const markUpNext = useCallback((open: boolean) => {
    setUpNextOpen(open);
    diag('player', `up next ${open ? 'open' : 'closed'}`);
  }, []);
  const mountUpNext = useCallback(() => setUpNextMounted(true), []);
  const openUpNext = useCallback((velocity = 0) => {
    setUpNextMounted(true);
    upNextShown.value = true;
    upNext.value = withSpring(1, { ...SETTLE_SPRING, velocity: -velocity / upNextTravel });
    markUpNext(true);
  }, [upNext, upNextShown, upNextTravel, markUpNext]);
  const closeUpNext = useCallback((velocity = 0) => {
    upNextShown.value = false;
    upNext.value = withSpring(0, { ...SETTLE_SPRING, velocity: -Math.max(0, velocity) / upNextTravel });
    markUpNext(false);
  }, [upNext, upNextShown, upNextTravel, markUpNext]);

  usePreventRemove(holdRoute, () => {
    if (sheetRef.current) setSheet(null);
    else if (upNextRef.current) closeUpNext(0);
    else if (ambientRef.current) setAmbient(false);
    else animateClose(0);
  });

  // Drag down from anywhere to dismiss. Over the lyrics it only takes over once
  // the list is scrolled to its top — otherwise the drag scrolls the lyrics.
  const lyricsOffset = useSharedValue(0);
  const showLyricsSV = useSharedValue(false);
  const grabY = useSharedValue(0);
  // The lyrics list owns a drag that starts on it; anywhere else a drag down
  // closes the player, even with the lyrics scrolled.
  const lyricsTop = insets.top + HEADER_CLEARANCE;
  // Activation is the handler's own (12pt down, native side): a manual
  // activate() from onTouchesMove could land after a quick flick had already
  // lifted, and the flick did nothing.
  // With Up next open the same drag, started above the panel, lowers the
  // panel instead (the panel's own pan handles drags that start on it).
  const dragUpNext = useSharedValue(false);
  const dismissGesture = Gesture.Pan()
    .enabled(!ambient && sheet === null)
    .activeOffsetY(12)
    .failOffsetY(-10)
    .failOffsetX([-24, 24])
    .onTouchesDown((e, state) => {
      'worklet';
      if (closing.value) {
        state.fail();
        return;
      }
      const y = e.allTouches[0] ? e.allTouches[0].y : 0;
      dragUpNext.value = upNextShown.value;
      if (upNextShown.value) {
        if (y > upNextTop) state.fail();
        return;
      }
      // Only while the lyrics are showing: the hidden (pre-mounted) list keeps
      // scrolling with the song, and must not block the swipe on the cover.
      if (showLyricsSV.value && lyricsOffset.value > 2) {
        if (y > lyricsTop && y < frameH.value - CONTROLS_CLEARANCE) state.fail();
      }
    })
    .onStart(() => {
      'worklet';
      // Grabbed mid-flight: carry on from where the sheet is, not from 0.
      grabY.value = sheetY.value;
    })
    .onUpdate(e => {
      'worklet';
      if (dragUpNext.value) {
        upNext.value = Math.min(1, Math.max(0, 1 - e.translationY / upNextTravel));
        return;
      }
      const y = grabY.value + e.translationY;
      // Past the top it resists instead of detaching; it never goes below the pill.
      sheetY.value = y >= 0 ? Math.min(y, restY) : rubberBand(y, 120);
    })
    .onEnd(e => {
      'worklet';
      if (dragUpNext.value) {
        if (shouldCloseSheet(e.translationY, e.velocityY)) runOnJS(closeUpNext)(e.velocityY);
        else upNext.value = withSpring(1, SETTLE_SPRING);
        return;
      }
      // Decide on where the flick is heading, not where the finger let go.
      const landing = sheetY.value + projectMomentum(e.velocityY);
      const past = landing > screenH * DISMISS_DISTANCE;
      const flung = e.velocityY > DISMISS_VELOCITY;
      if ((past && e.velocityY > -200) || flung) {
        animateClose(e.velocityY);
      } else {
        sheetY.value = withSpring(0, { ...(Math.abs(e.velocityY) > FLICK ? FLING_SPRING : SOFT_SPRING), velocity: e.velocityY });
      }
    });

  // Swipe up anywhere but the lyrics list (which scrolls) to bring up Up next.
  const upNextGesture = Gesture.Pan()
    .enabled(!ambient && sheet === null && !upNextOpen)
    .activeOffsetY(-12)
    .failOffsetY(10)
    .failOffsetX([-24, 24])
    .onTouchesDown((e, state) => {
      'worklet';
      const y = e.allTouches[0] ? e.allTouches[0].y : 0;
      if (closing.value || (showLyricsSV.value && y > lyricsTop && y < frameH.value - CONTROLS_CLEARANCE)) state.fail();
    })
    .onStart(() => {
      'worklet';
      runOnJS(mountUpNext)();
    })
    .onUpdate(e => {
      'worklet';
      upNext.value = Math.min(1, Math.max(0, -e.translationY / upNextTravel));
    })
    .onEnd(e => {
      'worklet';
      const landing = upNext.value - projectMomentum(e.velocityY) / upNextTravel;
      if (landing > 0.4 || e.velocityY < -DISMISS_VELOCITY) {
        // Set here too, before onFinalize runs on this thread.
        upNextShown.value = true;
        runOnJS(openUpNext)(e.velocityY);
      } else {
        upNext.value = withSpring(0, SETTLE_SPRING);
      }
    })
    .onFinalize((_e, success) => {
      'worklet';
      if (!success && !upNextShown.value && upNext.value > 0) upNext.value = withSpring(0, SETTLE_SPRING);
    });
  const playerGesture = Gesture.Race(dismissGesture, upNextGesture);

  // Echo Music's sheet: one full-width sheet that slides with the finger from
  // the mini player's top edge. It is solid from the first point of travel;
  // the pill fades off its top over the first quarter (PillPlayer), and the
  // player itself fades in between 15% and 40%, so the two never overlap. Its
  // top corners round off while it moves and square up once it is open.
  const sheetStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const corner = SHEET_CORNER * (1 - interpolate(p, [0.9, 1], [0, 1], Extrapolation.CLAMP));
    return {
      opacity: reduceMotion ? p : 1,
      borderTopLeftRadius: corner,
      borderTopRightRadius: corner,
      transform: [{ translateY: sheetY.value }] as const,
    };
  });
  const playerFadeStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : interpolate(progress.value, [0.15, 0.4], [0, 1], Extrapolation.CLAMP),
  }));
  // The page underneath dims on Echo's curve: nothing for the first tenth, then fast, then easing off.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: PAGE_DIM * Math.min(1, 1.4 * Math.sqrt(Math.max(0, progress.value - 0.1))),
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
    isCurrentSongSaving,
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
    showLyricsSV.value = showLyrics;
    if (!showLyrics) lyricsOffset.value = 0;
  }, [showLyrics, lyricsOffset, showLyricsSV]);

  // Cover <-> lyrics as one motion: the cover (or record) flies down into the
  // thumbnail at the start of the title while the lines rise in, and back.
  // `dock` is the thumbnail's centre in the player, measured by the controls.
  const lyricsP = useSharedValue(showLyrics ? 1 : 0);
  const dockX = useSharedValue(0);
  const dockY = useSharedValue(0);
  useEffect(() => {
    lyricsP.value = reduceMotion ? (showLyrics ? 1 : 0) : withTiming(showLyrics ? 1 : 0, { duration: LYRICS_MORPH_MS, easing: Easing.bezier(0.32, 0.72, 0, 1) });
  }, [showLyrics, reduceMotion, lyricsP]);

  const canvas = useCanvasArtwork(currentSong);

  // ── The cover stage ──────────────────────────────────────────────────────
  // YouTube Music's cover gestures: tap it to go full-bleed (or back to a
  // card), double-tap the left or right half for 5 seconds back or on, swipe
  // it sideways for the previous or next song (it follows the finger, then the
  // new cover arrives from the other side). Off under lyrics, ambient mode,
  // sheets and Up next (where a tap on the cover just lowers the panel).
  const stageX = useSharedValue(0);
  const stageEnabled = !showLyrics && !ambient && sheet === null && !upNextOpen;

  const toggleCover = useCallback(() => {
    if (upNextRef.current) {
      closeUpNext(0);
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    const s = useSettingsStore.getState();
    const full = isCoverFull(s.playerBackground, s.appleMusicInspired, s.playerCoverFull);
    diag('player', `tap: cover ${full ? 'full -> card' : 'card -> full'}`);
    if (isCardPlayerBackground(s.playerBackground)) s.setPlayerCoverFull(!full);
    else s.setAppleMusicInspired(!full);
  }, [closeUpNext]);

  // Double-taps in a row on the same side add up, as on YouTube: 5, 10, 15…
  const [seekPulse, setSeekPulse] = useState<SeekPulse | null>(null);
  const seekRun = useRef<{ side: -1 | 1; seconds: number; at: number }>({ side: 1, seconds: 0, at: 0 });
  const seekBy = useCallback((x: number) => {
    const side = seekSide(x, windowW);
    const now = Date.now();
    const run = seekRun.current;
    const seconds = run.side === side && now - run.at < 900 ? run.seconds + SEEK_STEP_S : SEEK_STEP_S;
    seekRun.current = { side, seconds, at: now };
    const target = seekTarget(positionSV.value, durationSV.value, side * SEEK_STEP_S);
    diag('player', `double tap ${side < 0 ? 'left' : 'right'}: ${positionSV.value.toFixed(1)}s -> ${target.toFixed(1)}s`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSeekPulse(p => ({ side, seconds, n: (p?.n ?? 0) + 1 }));
    // The bar jumps at once; handleScrub resumes playback if it was playing.
    isSeeking.value = true;
    positionSV.value = target;
    Promise.resolve(handleScrub(target)).finally(() => {
      setTimeout(() => { isSeeking.value = false; }, 280);
    });
  }, [windowW, handleScrub]);

  // dir: -1 = swiped left (next song), 1 = swiped right (previous).
  const swipeSong = useCallback((dir: 1 | -1) => {
    const player = usePlayerStore.getState();
    const queued = player.playlistQueue?.length ?? 0;
    const canSkip = dir < 0 ? queued > 1 || player.currentPlaylistId === 'library' : queued > 1;
    diag('player', `cover swipe ${dir < 0 ? 'left (next)' : 'right (previous)'}: ${canSkip ? 'skipping' : 'nothing to skip to'}`);
    if (!canSkip) {
      // Nothing to go to: the cover springs back instead of leaving.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      stageX.value = withSpring(0, SETTLE_SPRING);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (dir < 0) skipForward().catch(() => {});
    else player.previousInPlaylist();
    stageX.value = withTiming(dir * windowW, { duration: 160, easing: Easing.in(Easing.quad) }, done => {
      'worklet';
      if (!done) return;
      // The next cover comes in from the side the finger did not go to.
      stageX.value = -dir * windowW * 0.5;
      stageX.value = withSpring(0, SOFT_SPRING);
    });
  }, [skipForward, stageX, windowW]);

  const stagePan = Gesture.Pan()
    .enabled(stageEnabled)
    .activeOffsetX([-14, 14])
    .failOffsetY([-16, 16])
    .onUpdate(e => {
      'worklet';
      stageX.value = e.translationX;
    })
    .onEnd(e => {
      'worklet';
      const projected = e.translationX + e.velocityX * 0.12;
      if (Math.abs(projected) > windowW * 0.26) runOnJS(swipeSong)(projected < 0 ? -1 : 1);
      else stageX.value = withSpring(0, SETTLE_SPRING);
    })
    .onFinalize((_e, success) => {
      'worklet';
      if (!success) stageX.value = withSpring(0, SETTLE_SPRING);
    });
  const stageDoubleTap = Gesture.Tap()
    .enabled(stageEnabled)
    .numberOfTaps(2)
    .maxDelay(280)
    .onEnd((e, success) => {
      'worklet';
      if (success) runOnJS(seekBy)(e.x);
    });
  // Waits for the double-tap to fail, so a single tap lands ~280ms late —
  // the price of having both, as on YouTube.
  const stageTap = Gesture.Tap()
    .enabled(stageEnabled || upNextOpen)
    .maxDuration(400)
    .onEnd((_e, success) => {
      'worklet';
      if (success) runOnJS(toggleCover)();
    });
  const stageGesture = Gesture.Race(stagePan, Gesture.Exclusive(stageDoubleTap, stageTap));

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

  // A link can arrive while the player is already open (lyricflow://play?…&lyrics=1,
  // lyricflow://player?sheet=menu, an invite): apply it instead of ignoring it.
  const linkLyrics = route.params.lyrics;
  const linkSheet = route.params.sheet;
  useEffect(() => {
    if (linkLyrics) setShowLyrics(true);
  }, [linkLyrics, route.params.songId, setShowLyrics]);
  useEffect(() => {
    if (linkSheet === 'queue') openUpNext(0);
    else if (linkSheet) setSheet(linkSheet);
  }, [linkSheet, openUpNext]);
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

  // The heart: fills at once, and says where the song went. A streamed song is
  // saved into the library first (isCurrentSongSaving), then lands in Liked songs.
  const onToggleLike = useCallback(async () => {
    if (!currentSong) return;
    const result = await toggleLike(currentSong.id);
    say(
      result === 'liked' ? 'Added to Liked songs'
        : result === 'unliked' ? 'Removed from Liked songs'
        : result === 'saving' ? 'Saving to Liked songs…'
        : 'Couldn’t update Liked songs',
    );
  }, [currentSong, toggleLike, say]);
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
        onToggleLike();
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
  }, [currentSong, navigation, say, showLyrics, setShowLyrics, onToggleLike, repeatOne, setRepeatOne, openArtist]);

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

  // Up next: the cover (or lyrics) steps back and the room darkens a little
  // so the lifted title reads over it.
  const stageBackStyle = useAnimatedStyle(() => ({ opacity: 1 - 0.75 * upNext.value }));
  const upNextShadeStyle = useAnimatedStyle(() => ({ opacity: upNext.value }));

  return (
    <View style={styles.root}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <GestureDetector gesture={playerGesture}>
      <Animated.View
        style={[styles.container, sheetStyle]}
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          frameH.value = h;
          if (h > 0) setFrameHeight(h);
        }}
      >
        <Animated.View style={[styles.playerLayer, playerFadeStyle]}>
        <NowPlayingBackground
          coverImageUri={currentSong?.coverImageUri}
          gradientColors={gradientColors}
          showLyrics={showLyrics}
          canvas={ambient ? null : canvas}
          playing={storePlaying}
          shift={stageX}
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

        <Animated.View style={[styles.contentArea, stageBackStyle]}>
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
            stageX={stageX}
            lyricsP={lyricsP}
            dockX={dockX}
            dockY={dockY}
          />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, upNextShadeStyle]}>
          {/* Deep enough that the lifted title and transport read over a bright cover. */}
          <LinearGradient colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.62)', 'rgba(0,0,0,0.72)']} style={StyleSheet.absoluteFill} />
        </Animated.View>

        {/* Above the cover, below the controls: tap for full-bleed, double-tap a side to seek, swipe sideways to skip. */}
        <GestureDetector gesture={stageGesture}>
          <View
            style={[styles.stageZone, { height: Math.round(screenH * 0.56) }]}
            pointerEvents={stageEnabled || upNextOpen ? 'auto' : 'none'}
            collapsable={false}
          />
        </GestureDetector>
        <SeekRipple pulse={seekPulse} width={windowW} height={Math.round(screenH * 0.56)} />

        <NowPlayingControls
          animatedStyle={animatedStyle}
          controlsVisible={controlsVisible}
          storePlaying={storePlaying}
          currentSongTitle={currentSong?.title}
          currentSongArtist={currentSong?.artist}
          isCurrentSongLiked={isCurrentSongLiked}
          isLikeSaving={isCurrentSongSaving}
          onTogglePlay={togglePlay}
          onSkipForward={skipForward}
          onSkipBackward={skipBackward}
          onToggleLike={onToggleLike}
          onToggleLyrics={() => setShowLyrics(!showLyrics)}
          positionSV={positionSV}
          durationSV={durationSV}
          onSeek={handleScrub}
          showLyrics={showLyrics}
          compact={showLyrics}
          coverImageUri={currentSong?.coverImageUri}
          lyricsP={lyricsP}
          dockX={dockX}
          dockY={dockY}
          onMorePress={() => setSheet('menu')}
          onOpenQueue={() => openUpNext(0)}
          onOpenTimer={() => setSheet('timer')}
          sleepLabel={sleepText}
          onArtistPress={openArtist}
          upNext={upNext}
          upNextTop={upNextTop}
          upNextOpen={upNextOpen}
        />

        {upNextMounted ? (
          <UpNextPanel progress={upNext} top={upNextTop} frameH={frameHeight} open={upNextOpen} onClose={closeUpNext} onNotice={say} />
        ) : null}

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
              onEditLyrics={() => { closeSheet(); navigation.navigate('EditLyrics', { songId: currentSong.id }); }}
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
  playerLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  contentArea: {
    flex: 1,
  },
  // Catches swipes and double-taps on the cover; the transport sits above it.
  stageZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});

export default NowPlayingScreen;
