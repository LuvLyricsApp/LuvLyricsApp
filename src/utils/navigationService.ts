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

type MainParams = NonNullable<RootStackParamList['Main']>;

/** A tab asked for over the player, opened once Main is on top again. */
let pendingTab: { params: MainParams; until: number } | null = null;
let stopWatching: (() => void) | null = null;

/**
 * Opens a tab from anywhere, including over the full-screen player.
 *
 * Over the player, the player is asked to close (like the back button) and
 * the tab opens once Main is on top again. The player blocks its own removal
 * (`usePreventRemove`) to animate out, and every way of changing the tab
 * while it was still up (pop then navigate, navigate into the tab underneath)
 * left Stream showing once it had gone. A plain navigate pushed a second Main
 * over it instead, keeping the mini pill faded out.
 */
export function openMainTab(params: MainParams): void {
  const root = navigationRef.getRootState();
  if (!root || root.routes[root.index]?.name === 'Main') {
    navigationRef.navigate('Main', params);
    return;
  }
  // If only a sheet or Up next closes, the player stays and the tab is dropped
  // after a moment rather than opening whenever the player is closed later.
  pendingTab = { params, until: Date.now() + 3000 };
  stopWatching ??= navigationRef.addListener('state', () => {
    const now = navigationRef.getRootState();
    if (!pendingTab || now.routes[now.index]?.name !== 'Main') return;
    const { params: tab, until } = pendingTab;
    pendingTab = null;
    stopWatching?.();
    stopWatching = null;
    if (Date.now() <= until) navigationRef.navigate('Main', tab);
  });
  navigationRef.goBack();
}
