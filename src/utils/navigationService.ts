import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Minimal structural shape — screens hand us anything from a real
 * NavigationProp to a hand-rolled `{ goBack }` prop, and react-navigation's
 * `navigate` overloads are not assignable from those narrower types.
 */
type BackCapable = { canGoBack?: () => boolean; goBack: () => void };

/**
 * Pop if there is a screen to return to; otherwise land on Main tabs.
 * Prevents the noisy "GO_BACK was not handled by any navigator" warning
 * when a modal/root screen is the only entry.
 */
export function safeGoBack(navigation?: BackCapable | null): void {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
    return;
  }
  if (!navigationRef.isReady()) {
    navigation?.goBack();
    return;
  }
  // Nothing left to pop — drop onto the tab shell.
  if (navigationRef.canGoBack()) navigationRef.goBack();
  else navigationRef.navigate('Main');
}
