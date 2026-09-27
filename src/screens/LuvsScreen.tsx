/**
 * Luvs Screen - Full-screen immersive TikTok/Instagram-style feed
 *
 * The tab bar and the mini player are both suppressed for this route (see
 * TabNavigator + RootNavigator), so the feed genuinely owns the screen and exits
 * through its own back button.
 *
 * On Android the paging is handled by LuvsPagerView, a native ViewPager2. iOS keeps
 * the paging FlatList — see the fallback branch at the bottom.
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  Dimensions,
  StyleSheet,
  Pressable,
  Text,
  StatusBar,
  Share,
  ActivityIndicator,
  ViewToken,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useDerivedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLuvsFeedStore } from '../store/luvsFeedStore';
import { luvsBufferManager } from '../services/LuvsBufferManager';
import { LuvCard } from '../components/LuvCard';
import {
  LuvsPager,
  LuvsPagerHandle,
  LuvsPagerScrollState,
  isNativePagerAvailable,
  luvsPageStyle,
} from '../components/LuvsPager';
import { luvsEngine } from '../services/luvsEngine';
import { useLuvsPreferencesStore } from '../store/luvsPreferencesStore';
import { usePlayerStore } from '../store/playerStore';
import { UnifiedSong } from '../types/song';
import { LuvsVaultModal } from '../components/LuvsVaultModal';
import { PerformanceHUD } from '../components/PerformanceHUD';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { StreamService } from '../services/stream/StreamService';
import { streamIdFor } from '../services/stream/streamSong';
import { hookOffsetSeconds } from '../services/luvsHook';
import { useSettingsStore } from '../store/settingsStore';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Full screen - no tab bar deduction
const LUV_HEIGHT = SCREEN_HEIGHT;

// Under 3 seconds on a card counts as a skip when training the recommender.
const SKIP_THRESHOLD_SECONDS = 3;

const LuvsScreen: React.FC = () => {
  const navigation = useNavigation();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const colors = useThemeColors();
  const isDark = useIsDark();

  // Field selectors, not the whole store. Destructuring the store re-rendered this
  // screen — and with it every mounted card — whenever any unrelated field moved.
  const feedSongs = useLuvsFeedStore(s => s.feedSongs);
  const currentIndex = useLuvsFeedStore(s => s.currentIndex);
  const vault = useLuvsFeedStore(s => s.vault);
  const isLoading = useLuvsFeedStore(s => s.isLoading);
  const setCurrentIndex = useLuvsFeedStore(s => s.setCurrentIndex);
  const addToVault = useLuvsFeedStore(s => s.addToVault);
  const removeFromVault = useLuvsFeedStore(s => s.removeFromVault);
  const isInVault = useLuvsFeedStore(s => s.isInVault);

  const insets = useSafeAreaInsets();

  const viewTrackingRef = useRef(-1);
  const currentIndexRef = useRef(currentIndex);
  const flatListRef = useRef<FlatList>(null);
  const pagerRef = useRef<LuvsPagerHandle>(null);
  const [showVault, setShowVault] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false); // Start paused by default
  const [isScrubbing, setIsScrubbing] = useState(false);
  const viewStartTimeRef = useRef<number>(Date.now());

  // Keep ref in sync so useFocusEffect can read latest index without a dep on it
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const loadFromStorage = useLuvsPreferencesStore(s => s.loadFromStorage);

  const scrollY = useSharedValue(0);
  const currentIndexSV = useDerivedValue(() => {
    'worklet';
    return scrollY.value / LUV_HEIGHT;
  });

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollY.value = event.contentOffset.y;
    },
  });

  // Restore scroll position when screen becomes focused.
  // Stable deps [] so the cleanup (stopAll) only fires on actual screen blur,
  // not on every swipe or feed load — those were causing spurious auto-resumes.
  useFocusEffect(
    useCallback(() => {
      StatusBar.setHidden(true);

      const idx = currentIndexRef.current;
      if (idx > 0) {
        setTimeout(() => {
          if (isNativePagerAvailable) {
            pagerRef.current?.setPage(idx, false);
          } else {
            flatListRef.current?.scrollToIndex({ index: idx, animated: false });
          }
        }, 100);
      }

      return () => {
        StatusBar.setHidden(false);
        setIsPlaying(false);
        luvsBufferManager.stopAll();
        // Swipes defer ranking/persistence in Kotlin — push them out on the way out.
        luvsEngine.flush();
      };
    }, [])
  );

  // Load initial feed using recommendation engine
  const loadInitialFeed = useCallback(async () => {
    if (feedSongs.length > 0) return; // Already loaded via prefetch
    await luvsEngine.refresh();
  }, [feedSongs.length]);

  // Reload Feed Button Logic
  const handleReload = async () => {
    if (__DEV__) console.log('[Luvs] 🔄 Reloading feed...');
    setIsPlaying(false);
    await luvsBufferManager.stopAll(); // Stop audio first
    await luvsEngine.refresh();
    setIsPlaying(true); // Auto-play after reload
  };

  // Initialize: Load preferences and enter reels mode
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Load saved preferences
      await loadFromStorage();

      // Engine now auto-seeds from song library on first query
      await luvsBufferManager.enterLuvsMode();

      if (feedSongs.length === 0 && mounted) {
        await loadInitialFeed();
      }
    };

    init();

    return () => {
      mounted = false;
      luvsBufferManager.exitLuvsMode();
    };
  }, [loadFromStorage, loadInitialFeed, feedSongs.length]);

  // Ensure we start playing when screen is focused
  useEffect(() => {
    if (isFocused) {
      setIsPlaying(true);
    }
  }, [isFocused]);

  // Luvs owns a separate audio pool, so the library player has to yield or both
  // play at once. Routed through requestPlayback per the store's play/pause contract.
  const silenceMainPlayer = useCallback(() => {
    if (usePlayerStore.getState().isPlaying) {
      usePlayerStore.getState().requestPlayback(false);
    }
  }, []);

  const hasFeedSongs = feedSongs.length > 0;
  useEffect(() => {
    luvsBufferManager.setSuspended(!isFocused);

    if (isFocused && hasFeedSongs) {
      // If we are coming BACK to the screen, we might want to respect autoPlay
      // But usually isPlaying state is what we want to maintain during a session.
      if (isPlaying) {
        silenceMainPlayer();
        luvsBufferManager.resume();
      }
    } else if (!isFocused) {
      luvsBufferManager.pause();
    }
  }, [isFocused, hasFeedSongs, isPlaying, silenceMainPlayer]);

  // Load more songs using recommendation engine
  const loadMoreSongs = useCallback(async () => {
    if (isLoading) return;
    await luvsEngine.loadMore();
  }, [isLoading]);

  /**
   * Single commit point for "the feed moved to a new card", shared by the native
   * pager and the iOS FlatList. Records how long the previous card was watched,
   * swaps the audio, and tops the feed up when the end is in sight.
   */
  const commitIndexChange = useCallback(
    (newIndex: number) => {
      if (newIndex == null || newIndex === viewTrackingRef.current) return;

      // Record interaction for PREVIOUS song
      const prevIndex = viewTrackingRef.current;
      const prevSong = feedSongs[prevIndex];
      if (prevSong) {
        const watchDuration = (Date.now() - viewStartTimeRef.current) / 1000;
        const skipped = watchDuration < SKIP_THRESHOLD_SECONDS;

        const interaction = {
          songId: prevSong.id,
          title: prevSong.title,
          artist: prevSong.artist || 'Unknown',
          timestamp: Date.now(),
          watchDuration,
          totalDuration: prevSong.duration || 180,
          liked: isInVault(prevSong.id),
          skipped,
        };
        // Kotlin is the only thing that scores interactions now, and it defers the
        // ranking off the JS thread — a swipe never waits on it.
        luvsEngine.recordInteraction(interaction);

        if (__DEV__) {
          const verb = skipped ? '⏭️ Skipped' : '👀 Watched';
          console.log(`[Luvs] ${verb}: ${prevSong.title} (${watchDuration.toFixed(1)}s)`);
        }
      }

      // Reset timer for new song
      viewStartTimeRef.current = Date.now();
      viewTrackingRef.current = newIndex;
      setCurrentIndex(newIndex);
      luvsEngine.setCurrentIndex(newIndex);
      // ALWAYS FORCE PLAY ON SWIPE
      setIsPlaying(true);
      const nextSong = feedSongs[newIndex];
      luvsBufferManager.updateActiveIndex(newIndex, feedSongs, true)
        .then(() => {
          // Spotify-style: open the clip on the hook, not the intro. Skipped if
          // the listener already swiped on while the track was loading.
          if (!useSettingsStore.getState().luvsStartAtHook) return;
          if (viewTrackingRef.current !== newIndex) return;
          const offset = hookOffsetSeconds(nextSong?.duration);
          if (offset > 0) luvsBufferManager.seekTo(offset * 1000);
        })
        .catch(() => {});

      if (newIndex >= feedSongs.length - 2) {
        loadMoreSongs();
      }
    },
    [feedSongs, isInVault, loadMoreSongs, setCurrentIndex]
  );

  /**
   * ViewPager2 picks the winning page the moment the fling is committed, well
   * before it finishes settling — so the next track starts under the animation
   * instead of after it. The old FlatList path fired at 50% visibility, which meant
   * audio switched while your finger was still on the screen and then switched back
   * if you dragged the card home again.
   */
  const handleNativePageSelected = useCallback(
    (event: { nativeEvent: { position: number } }) => {
      commitIndexChange(event.nativeEvent.position);
    },
    [commitIndexChange]
  );

  const handleNativeScrollState = useCallback(
    (event: { nativeEvent: { state: LuvsPagerScrollState } }) => {
      if (event.nativeEvent.state === 'dragging') {
        Haptics.selectionAsync().catch(() => {});
      }
    },
    []
  );

  // Handle viewable items change + track interactions (iOS FlatList path)
  const handleViewableChange = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!viewableItems || viewableItems.length === 0) return;
      const newIndex = viewableItems[0]?.index;
      if (newIndex != null) commitIndexChange(newIndex);
    },
    [commitIndexChange]
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const handleLikePress = useCallback((song: UnifiedSong) => {
    if (isInVault(song.id)) {
      removeFromVault(song.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      addToVault(song);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [isInVault, addToVault, removeFromVault]);

  const handleSharePress = useCallback(async (song: UnifiedSong) => {
    try {
      await Share.share({
        message: `🎵 Check out "${song.title}" by ${song.artist || 'Unknown Artist'}!`,
      });
    } catch {
      if (__DEV__) console.log('Share cancelled');
    }
  }, []);

  // "Save" downloads the song into the library (it then plays offline from
  // Downloads). "Luv" stays the lightweight vault bookmark.
  const handleDownloadPress = useCallback((song: UnifiedSong) => {
    if (savedIds.has(song.id)) return;
    StreamService.save(song);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSavedIds(prev => new Set(prev).add(song.id));
  }, [savedIds]);

  // Spotify's "play full song": hand the clip to the main player with the rest
  // of the feed as the queue, then open Now Playing.
  const handlePlayFullPress = useCallback(async (song: UnifiedSong) => {
    const idx = feedSongs.findIndex(s => s.id === song.id);
    await luvsBufferManager.pause();
    setIsPlaying(false);
    StreamService.play(idx >= 0 ? feedSongs.slice(idx) : [song], 0);
    rootNavigation.navigate('NowPlaying', { songId: streamIdFor(song) });
  }, [feedSongs, rootNavigation]);

  const handlePlayPause = useCallback(async () => {
    if (isPlaying) {
      await luvsBufferManager.pause();
      setIsPlaying(false);
    } else {
      silenceMainPlayer();
      await luvsBufferManager.resume();
      setIsPlaying(true);
    }
  }, [isPlaying, silenceMainPlayer]);

  const handleGoBack = useCallback(() => {
    // The tab bar is hidden on this route, so this button is the only way out —
    // fall back to Home when there is no tab history to pop.
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home' as never);
    }
  }, [navigation]);

  const renderCard = useCallback(
    (item: UnifiedSong, index: number) => {
      const isActive = index === currentIndex;
      return (
        <LuvCard
          song={item}
          isActive={isActive}
          isNearActive={Math.abs(index - currentIndex) <= 1}
          // Beyond this the card is a plain black view — with the whole feed mounted
          // as pager children, keeping every card's artwork alive would cost a
          // full-screen bitmap per song.
          isMounted={Math.abs(index - currentIndex) <= 2}
          isLiked={isInVault(item.id)}
          isPlaying={isActive && isPlaying}
          onLike={handleLikePress}
          onShare={handleSharePress}
          onDownload={handleDownloadPress}
          onPlayFull={handlePlayFullPress}
          isSaved={savedIds.has(item.id)}
          onPlayPause={handlePlayPause}
          onScrubStateChange={setIsScrubbing}
          luvHeight={LUV_HEIGHT}
          index={index}
          currentIndex={currentIndexSV}
          // The native pager runs the scale/fade in its own PageTransformer; running
          // the JS interpolation too would compound both transforms.
          nativeDepth={isNativePagerAvailable}
        />
      );
    },
    [currentIndex, isPlaying, isInVault, handleLikePress, handleSharePress, handleDownloadPress, handlePlayFullPress, savedIds, handlePlayPause, currentIndexSV]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: UnifiedSong; index: number }) => renderCard(item, index),
    [renderCard]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: LUV_HEIGHT,
      offset: LUV_HEIGHT * index,
      index,
    }),
    []
  );

  const renderFeed = () => {
    if (isNativePagerAvailable) {
      return (
        <LuvsPager
          ref={pagerRef}
          style={StyleSheet.absoluteFill}
          onPageSelected={handleNativePageSelected}
          onPageScrollStateChanged={handleNativeScrollState}
          offscreenPages={2}
          depthEffect
          hapticsOnSettle
          // ViewPager2 intercepts drags before RNGH sees them, so a scrub on the
          // timeline reads as a page swipe. Disable paging for the drag's duration.
          scrollEnabled={!isScrubbing}
        >
          {feedSongs.map((song, index) => (
            <View key={song.id} style={luvsPageStyle} collapsable={false}>
              {renderCard(song, index)}
            </View>
          ))}
        </LuvsPager>
      );
    }

    return (
      <Animated.FlatList
        ref={flatListRef as any}
        data={feedSongs}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        snapToInterval={LUV_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        windowSize={5}
        maxToRenderPerBatch={2}
        removeClippedSubviews={false}
        initialNumToRender={2}
        updateCellsBatchingPeriod={50}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={handleViewableChange}
        getItemLayout={getItemLayout}
        extraData={vault}
        onScrollToIndexFailed={(info) => {
          if (__DEV__) console.warn('[Luvs] Scroll to index failed:', info.index);
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: Math.min(info.index, feedSongs.length - 1),
              animated: false,
            });
          }, 100);
        }}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : colors.background }]}>
      {feedSongs.length > 0 ? (
        renderFeed()
      ) : (
        !isLoading && (
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes-outline" size={80} color={isDark ? 'rgba(255,255,255,0.3)' : colors.textMuted} />
            <Text style={[styles.emptyText, { color: isDark ? '#fff' : colors.textPrimary }]}>No luvs available</Text>
            <Text style={[styles.emptySubtext, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
              Pull down to refresh or check your connection
            </Text>
          </View>
        )
      )}

      {/* Scrim behind the controls — the icons sat directly on the artwork before,
          and a bright cover made them disappear. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']}
        style={[styles.topScrim, { height: insets.top + 76 }]}
        pointerEvents="none"
      />

      <View style={[styles.topBar, { top: insets.top + 12 }]} pointerEvents="box-none">
        <Pressable
          style={styles.iconButton}
          onPress={handleGoBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>

        <View style={styles.topBarRight}>
          <Pressable
            style={styles.iconButton}
            onPress={handleReload}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Reload feed"
          >
            <Ionicons name="refresh" size={22} color="#fff" />
          </Pressable>

          <Pressable
            style={styles.iconButton}
            onPress={() => setShowVault(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Vault, ${vault.length} saved`}
          >
            <MaterialCommunityIcons name="heart-multiple" size={22} color="#fff" />
            {vault.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{vault.length}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Loading Indicator */}
      {isLoading && (
        <View style={[styles.loadingContainer, { top: insets.top + 72 }]}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.loadingText}>  Loading...</Text>
        </View>
      )}

      {/* Luvs Vault Modal */}
      <LuvsVaultModal visible={showVault} onClose={() => setShowVault(false)} />

      {/* Performance HUD (Dev only) */}
      <PerformanceHUD />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 90,
  },
  topBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF2D55',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  loadingContainer: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 100,
  },
  loadingText: {
    color: '#fff',
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default LuvsScreen;
