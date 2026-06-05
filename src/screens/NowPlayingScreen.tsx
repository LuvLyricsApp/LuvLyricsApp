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
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { GestureDetector } = GestureHandler;

type Props = RootStackScreenProps<'NowPlaying'>;

const NowPlayingScreen: React.FC<Props> = ({ navigation, route }) => {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
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
    blob1Style,
    blob2Style,
    blob3Style,
    processedLyrics,
    isLinear,
    flatListRef,
    getActiveLyricIndex,
    playButtonStyle,
    togglePlay,
    skipForward,
    skipBackward,
    handleScrub,
    handleLyricTap,
    gradientColors,
    isDynamicTheme,
    updateCurrentSong,
    addRecentArt,
    autoHideControls,
    setAutoHideControls,
    animateBackground,
    setAnimateBackground,
    storePlaying,
    toggleLike,
    isUserScrolling,
    scrollTimeoutRef,
  } = useNowPlayingLogic(songId);

  const menuOptions = React.useMemo(() => [
    {
      label: showLyrics ? 'Hide Lyrics' : 'Show Lyrics',
      icon: showLyrics ? 'eye-off-outline' : 'eye-outline',
      onPress: () => {
        setMenuVisible(false);
        setShowLyrics(!showLyrics);
      }
    },
    {
      label: 'Go to Current Lyric',
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
      label: 'Edit Lyrics',
      icon: 'create-outline',
      onPress: () => {
        setMenuVisible(false);
        navigation.navigate('AddEditLyrics', { songId: currentSong?.id });
      }
    },
    {
      label: 'Sync Lyrics',
      icon: 'timer-outline',
      onPress: () => {
        setMenuVisible(false);
        navigation.navigate('AddEditLyrics', { songId: currentSong?.id });
      }
    },
    {
      label: autoHideControls ? 'Disable Auto-Hide' : 'Enable Auto-Hide',
      icon: autoHideControls ? 'eye-outline' : 'eye-off-outline',
      onPress: () => {
        setMenuVisible(false);
        setAutoHideControls(!autoHideControls);
      }
    },
    {
      label: animateBackground ? 'Disable Animation' : 'Enable Animation',
      icon: animateBackground ? 'contrast-outline' : 'contrast',
      onPress: () => {
        setMenuVisible(false);
        setAnimateBackground(!animateBackground);
      }
    }
  ], [showLyrics, setShowLyrics, getActiveLyricIndex, isLinear, currentSong?.id, autoHideControls, setAutoHideControls, animateBackground, setAnimateBackground, flatListRef, setMenuVisible, navigation]);

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
      <View style={[styles.container, { backgroundColor: isDark ? '#000' : colors.background }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#000' : colors.background }]} />

        <NowPlayingBackground
          isDynamicTheme={isDynamicTheme}
          coverImageUri={currentSong?.coverImageUri}
          gradientColors={gradientColors}
          animateBackground={animateBackground}
          blob1Style={blob1Style}
          blob2Style={blob2Style}
          blob3Style={blob3Style}
          isDark={isDark}
        />

        <NowPlayingHeader
          animatedStyle={animatedStyle}
          controlsVisible={controlsVisible}
          onGoBack={() => navigation.goBack()}
          onMenuPress={handleMenuPress}
          menuVisible={menuVisible}
          onMenuClose={() => setMenuVisible(false)}
          menuAnchor={menuAnchor}
          menuOptions={menuOptions}
          currentSongTitle={currentSong?.title}
          colors={colors}
          isDark={isDark}
        />

        <CoverArtSearchScreen
          visible={showCoverSearch}
          initialQuery={`${currentSong?.title} ${currentSong?.artist}`}
          onClose={() => setShowCoverSearch(false)}
          onSelect={handleCoverSelect}
        />

        <View style={[styles.contentArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <NowPlayingLyricsArea
            showLyrics={showLyrics}
            processedLyrics={processedLyrics}
            currentTime={positionSV}
            onLyricPress={handleLyricTap}
            songTitle={currentSong?.title}
            highlightColor={gradientColors[0] !== '#000' ? gradientColors[0] : 'rgba(255,255,255,0.2)'}
            isUserScrollingRef={isUserScrolling}
            scrollTimeoutRef={scrollTimeoutRef}
            flatListRef={flatListRef}
            coverImageUri={currentSong?.coverImageUri}
            storePlaying={storePlaying}
            isDark={isDark}
            colors={colors}
            onCoverLongPress={() => setShowCoverSearch(true)}
          />
        </View>

        <NowPlayingControls
          animatedStyle={animatedStyle}
          controlsVisible={controlsVisible}
          isDark={isDark}
          colors={colors}
          coverImageUri={currentSong?.coverImageUri}
          storePlaying={storePlaying}
          currentSongTitle={currentSong?.title}
          currentSongArtist={currentSong?.artist}
          isCurrentSongLiked={isCurrentSongLiked}
          playButtonStyle={playButtonStyle}
          onTogglePlay={togglePlay}
          onSkipForward={skipForward}
          onSkipBackward={skipBackward}
          onToggleLike={() => currentSong && toggleLike(currentSong.id)}
          onToggleLyrics={() => setShowLyrics(!showLyrics)}
          positionSV={positionSV}
          durationSV={durationSV}
          onSeek={handleScrub}
        />
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentArea: {
    flex: 1,
  },
});

export default NowPlayingScreen;
