import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { TabParamList, LibraryStackParamList } from '../types/navigation';
import { ModernPillTabBar } from '../components/ModernPillTabBar';
import { CustomTabBar } from '../components/CustomTabBar';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import LibraryScreen from '../screens/LibraryScreen';
import LuvsScreen from '../screens/LuvsScreen';
import PlaylistsScreen from '../screens/PlaylistsScreen';
import PlaylistDetailScreen from '../screens/PlaylistDetailScreen';
import SearchScreen from '../screens/SearchScreen';
import StreamScreen from '../screens/StreamScreen';
import DownloadsScreen from '../screens/DownloadsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { AudioDownloaderScreen } from '../screens/AudioDownloaderScreen';

const Tab = createBottomTabNavigator<TabParamList>();


const LibraryStack = createNativeStackNavigator<LibraryStackParamList>();

/**
 * Drilling into a playlist keeps the tab bar and mini player, because the detail
 * screen is pushed inside the tab rather than on top of the whole tab navigator.
 */
const LibraryStackScreen: React.FC = () => (
  <LibraryStack.Navigator
    id="LibraryStack"
    screenOptions={{ headerShown: false, animation: 'slide_from_bottom' }}
  >
    <LibraryStack.Screen name="PlaylistsHome" component={PlaylistsScreen} />
    <LibraryStack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} />
    <LibraryStack.Screen name="Downloads" component={DownloadsScreen} options={{ animation: 'slide_from_right' }} />
  </LibraryStack.Navigator>
);



const HomeIcon = ({ color, focused }: { color: string; focused: boolean }) => (
  <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
);

const StreamIcon = ({ color, focused }: { color: string; focused: boolean }) => (
  <Ionicons name={focused ? 'radio' : 'radio-outline'} size={24} color={color} />
);

const LuvsIcon = ({ color, focused }: { color: string; focused: boolean }) => (
  <MaterialCommunityIcons name={focused ? 'heart-multiple' : 'heart-multiple-outline'} size={24} color={color} />
);

const LibraryIcon = ({ color, focused }: { color: string; focused: boolean }) => (
  <Ionicons name={focused ? 'library' : 'library-outline'} size={24} color={color} />
);

const SearchIcon = ({ color, focused }: { color: string; focused: boolean }) => (
  <Ionicons name={focused ? 'search' : 'search-outline'} size={24} color={color} />
);

// Luvs keeps the nav bar so the feed is escapable by tapping another tab; only the
// mini player is suppressed there (see RootNavigator) because Luvs runs its own
// audio pool and a transport for a different player would be misleading.
const renderModernPillTabBar = (props: BottomTabBarProps) => <ModernPillTabBar {...props} />;
const renderCustomTabBar = (props: BottomTabBarProps) => <CustomTabBar {...props} />;

export const TabNavigator: React.FC = () => {
  const colors = useThemeColors();
  const isDark = useIsDark();
  const navBarStyle = useSettingsStore(state => state.navBarStyle);
  const miniPlayerStyle = useSettingsStore(state => state.miniPlayerStyle);
  const setMiniPlayerStyle = useSettingsStore(state => state.setMiniPlayerStyle);

  React.useEffect(() => {
    if (navBarStyle === 'modern-pill' && miniPlayerStyle === 'bar') {
      setMiniPlayerStyle('island');
    }
  }, [navBarStyle, miniPlayerStyle, setMiniPlayerStyle]);

  const activeTint = isDark ? '#fff' : colors.primary;
  const inactiveTint = isDark ? 'rgba(255,255,255,0.5)' : colors.textMuted;

  return (
    <Tab.Navigator
      id="MainTabs"
      // Back from Settings / the downloader returns to the tab you came from.
      backBehavior="history"
      tabBar={navBarStyle === 'modern-pill' ? renderModernPillTabBar : renderCustomTabBar}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        tabBarShowLabel: navBarStyle === 'classic',
      }}
    >
      <Tab.Screen name="Home" component={LibraryScreen} options={{ tabBarLabel: 'Home', tabBarIcon: HomeIcon }} />
      <Tab.Screen name="Stream" component={StreamScreen} options={{ tabBarLabel: 'Stream', tabBarIcon: StreamIcon }} />
      <Tab.Screen name="Luvs" component={LuvsScreen} options={{ tabBarLabel: 'Luvs', tabBarIcon: LuvsIcon }} />
      <Tab.Screen name="Library" component={LibraryStackScreen} options={{ tabBarLabel: 'Library', tabBarIcon: LibraryIcon }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ tabBarLabel: 'Search', tabBarIcon: SearchIcon }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: 'Settings' }} />
      <Tab.Screen name="AudioDownloader" component={AudioDownloaderScreen} options={{ tabBarLabel: 'Downloader' }} />
    </Tab.Navigator>
  );
};

export default TabNavigator;
