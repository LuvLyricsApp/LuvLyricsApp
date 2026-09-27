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
import SettingsScreen from '../screens/SettingsScreen';
import { AudioDownloaderScreen } from '../screens/AudioDownloaderScreen';
import { YoutubeBrowserScreen } from '../screens/YoutubeBrowserScreen';
import { MiniPlayer } from '../components/MiniPlayer';
import { BackgroundDownloader } from '../components/BackgroundDownloader';
import { useSettingsStore } from '../store/settingsStore';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { AddToPlaylistModal } from '../components/AddToPlaylistModal';
import { useStreamSession } from '../hooks/useStreamSession';
import { useCoverArtBackfill } from '../hooks/useCoverArtBackfill';

// Tabs whose layout leaves room for the Dynamic Island mini player up top.
const ISLAND_ROUTES = new Set(['Home', 'Stream']);

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const [currentRoute, setCurrentRoute] = React.useState<string | undefined>();
  const miniPlayerStyle = useSettingsStore(state => state.miniPlayerStyle);
  useStreamSession();
  useCoverArtBackfill();

  // Island mode: only render MiniPlayer on the Home and Stream tabs.
  // Classic bar mode: render MiniPlayer on every tab/screen — except Luvs, which is
  // a full-bleed reels feed running its own audio pool. The bar used to paint over
  // it and its transport controlled a different player than the one you could hear.
  const showMiniPlayer = currentRoute !== 'Luvs' && (
    miniPlayerStyle === 'island'
      ? ISLAND_ROUTES.has(currentRoute ?? '')
      : true
  );

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
            options={{
              presentation: 'fullScreenModal',
            }}
          />
          <Stack.Screen
            name="AddEditLyrics"
            component={AddEditLyricsScreen}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
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
            name="AudioDownloader"
            component={AudioDownloaderScreen}
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
        
        {/* Island mode: Home + Stream. Bar mode: all tabs. */}
        {showMiniPlayer && <MiniPlayer isHomeTab={ISLAND_ROUTES.has(currentRoute ?? '')} />}
        <BackgroundDownloader />
      </View>
    </NavigationContainer>
  );
};

export default RootNavigator;
