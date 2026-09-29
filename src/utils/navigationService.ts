import { createNavigationContainerRef, StackActions } from '@react-navigation/native';
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
 * Opens a tab from anywhere, including over the full-screen player. Pops back
 * to the tab shell first: a plain navigate makes React Navigation 7 push a
 * second Main over an open player, which stays mounted underneath and keeps
 * the mini pill faded out, and navigate with `pop` goes back but drops the
 * nested tab.
 */
export function openMainTab(params: NonNullable<RootStackParamList['Main']>): void {
  const root = navigationRef.getRootState();
  if (!root || root.routes[root.index]?.name === 'Main') {
    navigationRef.navigate('Main', params);
    return;
  }
  navigationRef.dispatch(StackActions.popTo('Main'));
  // Into the tab on the next tick: navigating in the same tick as the pop
  // left the tab navigator on its previous tab (open/library showed Stream).
  setTimeout(() => navigationRef.navigate('Main', params), 0);
}
