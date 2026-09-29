import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
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
 * when a modal/root screen is the only entry (e.g. cold open → NowPlaying).
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

/**
 * Opens a tab from anywhere, including over the full-screen player.
 *
 * Over the player, the tab changes underneath it and the player is asked to
 * close. The player blocks its own removal (`usePreventRemove`) to animate
 * out, so popping to Main and then navigating left the old tab showing once it
 * had gone; a plain navigate pushed a second Main over it instead, keeping the
 * mini pill faded out.
 */
export function openMainTab(params: NonNullable<RootStackParamList['Main']>): void {
  const root = navigationRef.getRootState();
  const main = root?.routes.find(r => r.name === 'Main');
  const tabsKey = main?.state?.key;
  if (!root || root.routes[root.index]?.name === 'Main' || !tabsKey || !('screen' in params)) {
    navigationRef.navigate('Main', params);
    return;
  }
  navigationRef.dispatch({ ...CommonActions.navigate(params.screen, params.params), target: tabsKey });
  // Like the back button: a sheet or Up next open over the player closes
  // first and the player stays, already over the right tab.
  navigationRef.goBack();
}
