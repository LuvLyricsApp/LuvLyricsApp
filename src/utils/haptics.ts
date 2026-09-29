/**
 * expo-haptics behind the Settings "Haptics" switch. Import this module in
 * place of expo-haptics (`import * as Haptics from '../utils/haptics'`) so
 * turning haptics off silences every tap, swipe and confirmation at once.
 */
import { Vibration } from 'react-native';
import * as ExpoHaptics from 'expo-haptics';
import { useSettingsStore } from '../store/settingsStore';

export { ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';

const enabled = (): boolean => useSettingsStore.getState().hapticsEnabled ?? true;

export const selectionAsync = (): Promise<void> =>
  enabled() ? ExpoHaptics.selectionAsync() : Promise.resolve();

export const impactAsync = (style?: ExpoHaptics.ImpactFeedbackStyle): Promise<void> =>
  enabled() ? ExpoHaptics.impactAsync(style) : Promise.resolve();

export const notificationAsync = (type?: ExpoHaptics.NotificationFeedbackType): Promise<void> =>
  enabled() ? ExpoHaptics.notificationAsync(type) : Promise.resolve();

export const vibrate = (ms: number): void => {
  if (enabled()) Vibration.vibrate(ms);
};
