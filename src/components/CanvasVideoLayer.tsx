/**
 * Full-bleed looping motion artwork (the "canvas") behind the player.
 *
 * Decorative only: muted, never takes audio focus from the music player,
 * pointer-transparent, and cross-fades in on its first rendered frame so a
 * slow network never shows a black rectangle, and fades out (rather than
 * vanishing) when the song changes. When the song is paused the loop
 * pauses too; with Reduce Motion on it holds the first frame instead of moving.
 *
 * The reveal waits for the video to be really moving, not just for its first
 * frame: first frame, the clip's size known (so the view never resizes under
 * the fade — on Android a TextureView resize shows a black frame), and a
 * quarter second of playback past the start (a stream's first frames can be
 * dark or stall). Then one 900ms ease-in-out dissolve from the cover, so the
 * move from still to motion reads as the cover coming alive, not a swap.
 *
 * The layer has no backing of its own. Whatever sits under it (the cover in
 * the player, the card art in Luvs) is what shows before the first frame and
 * through any frame the decoder hasn't filled yet — a dark backing here used
 * to fade in ahead of the video and read as a black flash. The loop is left to
 * the player's own repeat, which holds the last frame until the first one is
 * ready; the old "dip" at the seam faded the clip out and back every loop.
 *
 * Cover fit is done here, not by `contentFit`: on Android the native cover
 * mode could lose to the video's own aspect, so a 4:5 canvas drew at full
 * width and stopped with a hard edge halfway down the screen. We read the
 * track's real size, then size and centre the view so it overfills the box
 * (the parent clips the overflow). Android renders into a TextureView so the
 * video honours the fade, the rounded clips and the player sheet's drag — a
 * SurfaceView punches through all three.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { requireOptionalNativeModule } from 'expo';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { VideoTrack } from 'expo-video';
import { CanvasArtwork } from '../services/canvas/types';
import { Motion } from '../constants/allegraTheme';
import { diag } from '../utils/diag';

// expo-video needs its native module, which Android only gets if it is listed
// in android/app/src/main/java/expo/modules/ExpoModulesPackageList.kt. A build
// without it used to throw at import time and leave the whole app on a grey
// screen; the canvas is decoration, so it now switches itself off instead.
type ExpoVideo = typeof import('expo-video');
const videoLib: ExpoVideo | null = requireOptionalNativeModule('ExpoVideo')
  ? (require('expo-video') as ExpoVideo)
  : null;

interface CanvasVideoLayerProps {
  canvas: CanvasArtwork | null;
  playing: boolean;
  /** Extra darkening for text contrast. 0 = none, 1 = heavy. */
  scrimStrength?: number;
  onVisibleChange?: (visible: boolean) => void;
  /**
   * Drawn over the video inside the same fade, so it comes and goes at
   * exactly the video's opacity (the player's veil). A separately timed
   * overlay shaded the still cover a second time while the two fades
   * disagreed — a dark band that came and went.
   */
  overlay?: React.ReactNode;
}

/** How long a canvas takes to leave (song change, feature off). */
const FADE_OUT_MS = 520;
/** Playback past the first frame before the dissolve starts (seconds). */
const REVEAL_AFTER_S = 0.25;
/** Never wait longer than this after the first frame (a paused or slow clip). */
const REVEAL_MAX_MS = 1500;
/** How often the reveal checks the clip's progress. */
const REVEAL_POLL_MS = 80;
/** Same shape within this (a quality switch): keep the laid-out size. */
const ASPECT_TOLERANCE = 0.01;
const NO_FULLSCREEN = { enable: false };

const CanvasVideo: React.FC<CanvasVideoLayerProps & { lib: ExpoVideo }> = ({
  lib,
  canvas: incoming,
  playing,
  scrimStrength = 0.6,
  onVisibleChange,
  overlay,
}) => {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0);

  // The canvas on screen trails the requested one: when it changes or goes
  // away, the old clip fades out first instead of vanishing mid-frame.
  const [canvas, setCanvas] = useState<CanvasArtwork | null>(incoming);
  const latest = useRef(incoming);
  latest.current = incoming;
  const adoptLatest = useCallback(() => setCanvas(latest.current), []);
  useEffect(() => {
    if (incoming?.url === canvas?.url) {
      // Came back to the same clip mid-fade (skip, then back): fade it in again.
      if (canvas) opacity.value = withTiming(1, { duration: Motion.duration.base });
      return;
    }
    if (!canvas) { setCanvas(incoming); return; }
    opacity.value = withTiming(0, { duration: FADE_OUT_MS, easing: Motion.ease.accelerate }, done => {
      if (done) runOnJS(adoptLatest)();
    });
  // Only the requested url drives this.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.url]);

  const source = canvas ? { uri: canvas.url, contentType: canvas.isHls ? ('hls' as const) : ('auto' as const) } : null;
  const player = lib.useVideoPlayer(source, p => {
    p.loop = true;
    p.muted = true;
    // The canvas must never duck, pause or steal focus from the music.
    p.audioMixingMode = 'mixWithOthers';
    p.showNowPlayingNotification = false;
    p.staysActiveInBackground = false;
  });

  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [video, setVideo] = useState<{ width: number; height: number } | null>(null);

  // New canvas: hide until it is ready to show, forget the old track size.
  const [firstFrame, setFirstFrame] = useState(false);
  // The clip already dissolved in. A clip reveals once: a pause, or the song
  // changing under it, must never replay the reveal — that cancelled the
  // outgoing clip's fade-out and brought it back over the next song.
  const revealedUrl = useRef<string | null>(null);
  useEffect(() => {
    opacity.value = 0;
    revealedUrl.current = null;
    setVideo(null);
    setFirstFrame(false);
    onVisibleChange?.(false);
  }, [canvas?.url, opacity, onVisibleChange]);

  // The real pixel size of what is playing. HLS can switch variants mid-loop,
  // so keep listening rather than reading it once.
  useEffect(() => {
    const adopt = (track: VideoTrack | null | undefined) => {
      const w = track?.size?.width ?? 0;
      const h = track?.size?.height ?? 0;
      // A quality switch keeps the shape: resizing the view for it would
      // flash a black frame on Android, so only a new aspect lays it out again.
      if (w > 0 && h > 0) {
        setVideo(v => (v && Math.abs(v.width / v.height - w / h) < ASPECT_TOLERANCE ? v : { width: w, height: h }));
      }
    };
    const onLoad = player.addListener('sourceLoad', e => {
      const largest = [...e.availableVideoTracks].sort((a, b) => b.size.width * b.size.height - a.size.width * a.size.height)[0];
      adopt(largest);
    });
    const onTrack = player.addListener('videoTrackChange', e => adopt(e.videoTrack));
    return () => {
      onLoad.remove();
      onTrack.remove();
    };
  }, [player]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox(b => (b && b.width === width && b.height === height ? b : { width, height }));
  }, []);

  useEffect(() => {
    if (!canvas) return;
    const sub = player.addListener('statusChange', e => {
      if (e.status === 'error') diag('canvas', `video error: ${e.error?.message ?? 'unknown'} (${canvas.url})`);
    });
    return () => sub.remove();
  }, [canvas, player]);

  useEffect(() => {
    if (!canvas) return;
    if (playing && !reduceMotion) player.play();
    else player.pause();
  }, [canvas, playing, reduceMotion, player]);

  // ── The reveal ─────────────────────────────────────────────────────────
  // After the first frame, poll the clip until it has its size and has
  // actually played a little, then dissolve in once. A paused song (or Reduce
  // Motion) holds a still frame, so it only waits for the size.
  const sizeKnown = video !== null;
  useEffect(() => {
    if (!canvas || !firstFrame || revealedUrl.current === canvas.url) return;
    let done = false;
    const startedAt = Date.now();
    const startTime = player.currentTime;
    const moving = playing && !reduceMotion;
    const reveal = () => {
      if (done) return;
      done = true;
      clearInterval(timer);
      // On its way out (song changed, lyrics opened): let the fade-out finish.
      if (latest.current?.url !== canvas.url) return;
      revealedUrl.current = canvas.url;
      diag('canvas', `revealed after ${Date.now() - startedAt}ms: ${canvas.url}`);
      opacity.value = withTiming(1, {
        duration: reduceMotion ? Motion.duration.fast : Motion.duration.crossfade,
        easing: Motion.ease.standard,
      });
      onVisibleChange?.(true);
    };
    const check = () => {
      const waited = Date.now() - startedAt;
      if (waited >= REVEAL_MAX_MS) { reveal(); return; }
      if (!sizeKnown) return;
      if (!moving || player.currentTime - startTime >= REVEAL_AFTER_S) reveal();
    };
    const timer = setInterval(check, REVEAL_POLL_MS);
    check();
    return () => { done = true; clearInterval(timer); };
  // Re-evaluated when the size lands; the opacity and callbacks are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas?.url, firstFrame, sizeKnown, playing, reduceMotion, player]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!canvas) return null;

  // Scale the video so its shorter side meets the box, centred. Exact aspect,
  // so 'fill' below is a true cover. Until the size is known, fall back to
  // the native cover mode over the whole box.
  let videoStyle: React.ComponentProps<ExpoVideo['VideoView']>['style'] = StyleSheet.absoluteFill;
  if (box && video) {
    const scale = Math.max(box.width / video.width, box.height / video.height);
    const width = Math.ceil(video.width * scale) + 2;
    const height = Math.ceil(video.height * scale) + 2;
    videoStyle = {
      position: 'absolute',
      width,
      height,
      left: (box.width - width) / 2,
      top: (box.height - height) / 2,
    };
  }

  const scrimTop = `rgba(7, 8, 11, ${0.25 * scrimStrength})`;
  const scrimBottom = `rgba(7, 8, 11, ${0.9 * scrimStrength})`;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.clip, fadeStyle]} pointerEvents="none" onLayout={onLayout}>
      <lib.VideoView
        player={player}
        style={videoStyle}
        contentFit={box && video ? 'fill' : 'cover'}
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
        nativeControls={false}
        fullscreenOptions={NO_FULLSCREEN}
        allowsPictureInPicture={false}
        onFirstFrameRender={() => {
          diag('canvas', `first frame: ${canvas.url}`);
          // Not shown yet — the reveal effect waits until the clip is moving.
          setFirstFrame(true);
        }}
      />
      <LinearGradient
        colors={[scrimTop, 'rgba(7, 8, 11, 0)', scrimBottom]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      {overlay}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});

if (!videoLib) diag('canvas', 'expo-video native module missing: canvas disabled');

export const CanvasVideoLayer: React.FC<CanvasVideoLayerProps> = props =>
  (videoLib ? <CanvasVideo {...props} lib={videoLib} /> : null);

export default React.memo(CanvasVideoLayer);
