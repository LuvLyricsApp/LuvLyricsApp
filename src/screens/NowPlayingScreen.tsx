import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import * as GestureHandler from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackScreenProps } from '../types/navigation';
import { usePlayerStore } from '../store/playerStore';
import { positionSV, durationSV } from '../playback/positionBus';
import { CoverArtSearchScreen } from './CoverArtSearchScreen';
import { useNowPlayingLogic } from '../hooks/useNowPlayingLogic';
import NowPlayingBackground from '../components/NowPlayingBackground';
import NowPlayingHeader from '../components/NowPlayingHeader';
import NowPlayingLyricsArea from '../components/NowPlayingLyricsArea';
import NowPlayingControls from '../components/NowPlayingControls';
import { safeGoBack } from '../utils/navigationService';
import { useCanvasArtwork } from '../hooks/useCanvasArtwork';
import { PlayerSheet, QueueList, SleepTimerList } from '../components/player/PlayerSheet';
import { sleepLabel, useSleepTimerStore } from '../store/sleepTimerStore';

const { GestureDetector } = GestureHandler;

type Props = RootStackScreenProps<'NowPlaying'>;

const NowPlayingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { songId } = route.params;
  const setMiniPlayerHiddenSource = usePlayerStore(state => state.setMiniPlayerHiddenSource);

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
    menuVisible,
    setMenuVisible,
    menuAnchor,
    handleMenuPress,
    showCoverSearch,
    setShowCoverSearch,
    controlsVisible,
    animatedStyle,
    showLyrics,
    setShowLyrics,
    panGesture,
    processedLyrics,
    isLinear,
    flatListRef,
    getActiveLyricIndex,
    togglePlay,
    skipForward,
    skipBackward,
    handleScrub,
    handleLyricTap,
    gradientColors,
    updateCurrentSong,
    addRecentArt,
    autoHideControls,
    setAutoHideControls,
    storePlaying,
    toggleLike,
    isUserScrolling,
    scrollTimeoutRef,
  } = useNowPlayingLogic(songId);

  const canvas = useCanvasArtwork(currentSong);

  // Tap the artist line to open their page (YouTube Music, Echo style).
  const artistName = currentSong?.artist;
  const openArtist = React.useMemo(() => {
    if (!artistName || /^unknown artist$/i.test(artistName)) return undefined;
    return () => navigation.navigate('Main', { screen: 'Browse', params: { screen: 'Artist', params: { name: artistName } } });
  }, [artistName, navigation]);

  const [sheet, setSheet] = React.useState<'queue' | 'timer' | null>(null);
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

  const menuOptions = React.useMemo<React.ComponentProps<typeof NowPlayingHeader>['menuOptions']>(() => [
    {
      label: showLyrics ? 'Hide lyrics' : 'Show lyrics',
      icon: showLyrics ? 'eye-off-outline' : 'eye-outline',
      onPress: () => {
        setMenuVisible(false);
        setShowLyrics(!showLyrics);
      }
    },
    {
      label: 'Go to current lyric',
      icon: 'locate-outline',
      onPress: () => {
        setMenuVisible(false);
        const activeLyricIndex = getActiveLyricIndex();
        if (flatListRef.current && activeLyricIndex !== -1 && !isLinear) {
          flatListRef.current.scrollToIndex({
            index: activeLyricIndex,
            animated: true,
            viewPosition: 0.3,
          });
        }
      }
    },
    {
      label: 'Edit lyrics',
      icon: 'create-outline',
      onPress: () => {
        setMenuVisible(false);
        if (currentSong?.id) navigation.navigate('AddEditLyrics', { songId: currentSong.id });
      }
    },
    {
      label: 'Sync lyrics',
      icon: 'timer-outline',
      onPress: () => {
        setMenuVisible(false);
        if (currentSong?.id) navigation.navigate('AddEditLyrics', { songId: currentSong.id });
      }
    },
    {
      label: autoHideControls ? 'Keep controls visible' : 'Hide controls when idle',
      icon: autoHideControls ? 'eye-outline' : 'eye-off-outline',
      onPress: () => {
        setMenuVisible(false);
        setAutoHideControls(!autoHideControls);
      }
    },
    {
      label: 'Change cover',
      icon: 'image-outline',
      onPress: () => {
        setMenuVisible(false);
        setShowCoverSearch(true);
      }
    },
  ], [showLyrics, setShowLyrics, getActiveLyricIndex, isLinear, currentSong?.id, autoHideControls, setAutoHideControls, setShowCoverSearch, flatListRef, setMenuVisible, navigation]);

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
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        <NowPlayingBackground
          coverImageUri={currentSong?.coverImageUri}
          gradientColors={gradientColors}
          showLyrics={showLyrics}
          canvas={canvas}
          playing={storePlaying}
        />

        <NowPlayingHeader
          animatedStyle={animatedStyle}
          controlsVisible={controlsVisible}
          onGoBack={() => safeGoBack(navigation)}
          menuVisible={menuVisible}
          onMenuClose={() => setMenuVisible(false)}
          menuAnchor={menuAnchor}
          menuOptions={menuOptions}
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
          onMorePress={handleMenuPress}
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
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
  },
  contentArea: {
    flex: 1,
  },
});

export default NowPlayingScreen;
