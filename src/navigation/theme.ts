/**
 * The navigation theme. Without one React Navigation paints every screen
 * container in its light default (#f2f2f2), which flashed white between pages
 * and behind any screen still mounting. Everything here is the dark room.
 */
import { DarkTheme, Theme } from '@react-navigation/native';
import { Signal } from '../constants/allegraTheme';

export const SCREEN_BG = Signal.bgDeep;

export const navTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: Signal.wave,
    background: SCREEN_BG,
    card: SCREEN_BG,
    text: '#ffffff',
    border: 'transparent',
    notification: Signal.wave,
  },
};

/** For every native stack: the screen behind a transition is never white. */
export const stackContentStyle = { backgroundColor: SCREEN_BG } as const;
