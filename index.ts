// Must stay first: wraps Text before any module captures it (Android SF Pro).
import './src/theme/appleTypography';
import * as Sentry from '@sentry/react-native';
import { registerRootComponent } from 'expo';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__,
  tracesSampleRate: 0.2,
  // Both of these run all the time a trace is open: stall tracking keeps a
  // timer ticking on the JS thread, native frames tracking hooks every frame.
  // Traces stay on; the always-on watchers do not.
  enableStallTracking: false,
  enableNativeFramesTracking: false,
});

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widget/widgetTaskHandler';

// Home-screen widgets (Android): Now playing card and Playlist list.
registerWidgetTaskHandler(widgetTaskHandler);
