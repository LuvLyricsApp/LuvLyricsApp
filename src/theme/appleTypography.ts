/**
 * Puts every <Text> and <TextInput> on Android into SF Pro, Apple Music's
 * typeface, without each style having to name a font.
 *
 * iOS needs nothing: its system font is SF Pro, so styles just set fontWeight.
 * Android ships SF Pro as one family per weight, so a style that says only
 * `fontWeight: '700'` would fall back to Roboto. This wraps the two components
 * once, before anything renders: the final (flattened) style's weight picks the
 * face and Apple's tracking is applied. Styles that name another family on
 * purpose (monospace, icon fonts) pass through untouched.
 *
 * Imported for its side effect as the very first line of index.ts, so every
 * module that captures Text (Animated.Text, Reanimated) gets the wrapped one.
 */
import React from 'react';
import { Platform, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { resolveSfStyle } from '../constants/fonts';

type StyledProps = { style?: StyleProp<TextStyle> };
type StyledComponent = React.ComponentType<StyledProps>;
type DefaultExport = { default: StyledComponent };

const NO_ANCESTOR = React.createContext(false);

const wrap = (Base: StyledComponent, ancestor: React.Context<boolean>): StyledComponent => {
  const SfText = (props: StyledProps) => {
    // A nested span inherits family and size from its parent — only restyle
    // what it sets itself.
    const nested = React.useContext(ancestor);
    const override = resolveSfStyle(StyleSheet.flatten(props.style), nested);
    return React.createElement(Base, override ? { ...props, style: [props.style, override] } : props);
  };
  // Keep statics such as TextInput.State.
  Object.assign(SfText, Base);
  SfText.displayName = Base.displayName ?? 'Text';
  return SfText;
};

const install = (): void => {
  if (Platform.OS !== 'android') return;
  /* eslint-disable @react-native/no-deep-imports -- the default export is what gets wrapped */
  const text = require('react-native/Libraries/Text/Text') as DefaultExport;
  const input = require('react-native/Libraries/Components/TextInput/TextInput') as DefaultExport;
  const ancestor = (require('react-native/Libraries/Text/TextAncestorContext') as { default: React.Context<boolean> }).default;
  /* eslint-enable @react-native/no-deep-imports */
  try {
    text.default = wrap(text.default, ancestor);
    input.default = wrap(input.default, NO_ANCESTOR);
  } catch {
    // Module exports frozen by a future RN — text falls back to the system font.
  }
};

install();
