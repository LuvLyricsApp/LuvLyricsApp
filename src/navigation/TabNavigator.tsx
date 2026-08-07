import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { TabParamList } from '../types/navigation';
import { ModernPillTabBar } from '../components/ModernPillTabBar';
import { CustomTabBar } from '../components/CustomTabBar';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeColors, useIsDark } from '../contexts/ThemeContext';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import LibraryScreen from '../screens/LibraryScreen';
import LuvsScreen from '../screens/LuvsScreen';
import PlaylistsScreen from '../screens/PlaylistsScreen';
import SearchScreen from '../screens/SearchScreen';

const Tab = createBottomTabNavigator<TabParamList>();



const HomeIcon = ({ color, focused }: { color: string; focused: boolean }) => (
  <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
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

// Luvs is a full-bleed reels feed — it owns the whole screen and exits via its own
// back button. `tabBarStyle: { display: 'none' }` has no effect here because both
// bars are custom components that never read it, so the gate lives at the renderer.
const FULLSCREEN_ROUTES = ['Luvs'];

const isFullscreenRoute = (state: BottomTabBarProps['state']) =>
  FULLSCREEN_ROUTES.includes(state.routes[state.index]?.name);

const renderModernPillTabBar = (props: BottomTabBarProps) =>
  isFullscreenRoute(props.state) ? null : <ModernPillTabBar {...props} />;
const renderCustomTabBar = (props: BottomTabBarProps) =>
  isFullscreenRoute(props.state) ? null : <CustomTabBar {...props} />;

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
      tabBar={navBarStyle === 'modern-pill' ? renderModernPillTabBar : renderCustomTabBar}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        tabBarShowLabel: navBarStyle === 'classic',
      }}
    >
      <Tab.Screen name="Home" component={LibraryScreen} options={{ tabBarLabel: 'Home', tabBarIcon: HomeIcon }} />
      <Tab.Screen name="Luvs" component={LuvsScreen} options={{ tabBarLabel: 'Luvs', tabBarIcon: LuvsIcon }} />
      <Tab.Screen name="Library" component={PlaylistsScreen} options={{ tabBarLabel: 'Library', tabBarIcon: LibraryIcon }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ tabBarLabel: 'Search', tabBarIcon: SearchIcon }} />
    </Tab.Navigator>
  );
};

export default TabNavigator;
