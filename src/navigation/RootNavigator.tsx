/**
 * LyricFlow - Root Navigator
 * Stack navigation with tab navigator and modal screens
 */

import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { navigationRef } from '../utils/navigationService';

// Import navigators and screens
import TabNavigator from './TabNavigator';
import NowPlayingScreen from '../screens/NowPlayingScreen';
import AddEditLyricsScreen from '../screens/AddEditLyricsScreen';
import { YoutubeBrowserScreen } from '../screens/YoutubeBrowserScreen';
import { MiniPlayer } from '../components/MiniPlayer';
import { MoreMenuHost } from '../components/MoreMenu';
import { ListenTogetherHost } from '../components/listenTogether/ListenTogetherHost';
import { BackgroundDownloader } from '../components/BackgroundDownloader';
import { VoiceSearchCard } from '../components/VoiceSearchCard';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { AddToPlaylistModal } from '../components/AddToPlaylistModal';
import { useStreamSession } from '../hooks/useStreamSession';
import { useCoverArtBackfill } from '../hooks/useCoverArtBackfill';
import { useDeepLinks } from '../hooks/useDeepLinks';
import { useWidgetLinks, useWidgetSync } from '../widget/useWidgetSync';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const [currentRoute, setCurrentRoute] = React.useState<string | undefined>();
  useStreamSession();
  useCoverArtBackfill();
  useDeepLinks();
  // Home-screen widgets: keep them current, and answer their taps.
  useWidgetSync();
  useWidgetLinks();

  // The mini player sits above the tab bar on every tab/screen — except Luvs,
  // a full-bleed reels feed running its own audio pool. The bar used to paint over
  // it and its transport controlled a different player than the one you could hear.
  const showMiniPlayer = currentRoute !== 'Luvs';

  return (
    <NavigationContainer
      ref={navigationRef}
      onStateChange={() => {
        const route = navigationRef.getCurrentRoute();
        setCurrentRoute(route?.name);
      }}
    >
      <View style={{ flex: 1 }}>
        <Stack.Navigator
          id="RootStack"
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        >
          <Stack.Screen name="Main" component={TabNavigator} />
          <Stack.Screen
            name="NowPlaying"
            component={NowPlayingScreen}
            // The sheet animates itself (navigation/playerSheet.ts): it rises
            // from the pill and follows a drag down from anywhere.
            options={{
              presentation: 'transparentModal',
              animation: 'none',
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="AddEditLyrics"
            component={AddEditLyricsScreen}
          />
          <Stack.Screen
            name="CreatePlaylist"
            component={CreatePlaylistModal}
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
            }}
          />
          <Stack.Screen
            name="AddToPlaylist"
            component={AddToPlaylistModal}
            options={{
              presentation: 'transparentModal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="YoutubeBrowser"
            component={YoutubeBrowserScreen}
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack.Navigator>
        
        {/* Mini player pill above the tab bar, on every screen but Luvs. */}
        {showMiniPlayer && <MiniPlayer />}
        {/* After the pill, so the ••• menu opens over it. */}
        <MoreMenuHost />
        {/* Listen together: runs the room sync, shows join requests anywhere. */}
        <ListenTogetherHost />
        <BackgroundDownloader />
        {/* Hold the mic, say a song: the answer appears here, over everything. */}
        <VoiceSearchCard />
      </View>
    </NavigationContainer>
  );
};

export default RootNavigator;
