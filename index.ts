// Must stay first: wraps Text before any module captures it (Android SF Pro).
import './src/theme/appleTypography';
import * as Sentry from '@sentry/react-native';
import { registerRootComponent } from 'expo';
import React from 'react';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__,
  tracesSampleRate: 0.2,
});

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { SongWidget } from './src/widget/SongWidget';

registerWidgetTaskHandler(async (props) => {
  const { renderWidget } = props;
  renderWidget(
    React.createElement(SongWidget)
  );
});
