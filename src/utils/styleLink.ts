/**
 * lyricflow://style?… — set how the app looks from a link. The emulator smoke
 * test uses it to photograph every look without tapping through Settings, and
 * it is shareable ("try this look"). Only the values below are accepted;
 * anything else is ignored, so a link can never write arbitrary settings.
 *
 *   playerBackground=apple|blend|youtube|aura
 *   miniPlayerBackground=glow|tint|glass|black
 *   appBackground=shader|glass|glow
 *   vinyl=1|0            the cover as a spinning record
 *   fps=1|0              the frame rate readout
 */
import type { AppBackground, MiniPlayerBackground, PlayerBackground } from '../store/settingsStore';

export interface StyleUpdates {
  playerBackground?: PlayerBackground;
  miniPlayerBackground?: MiniPlayerBackground;
  appBackground?: AppBackground;
  playerVinyl?: boolean;
  showPerformanceHUD?: boolean;
}

const PLAYER: readonly PlayerBackground[] = ['apple', 'blend', 'youtube', 'aura'];
const MINI: readonly MiniPlayerBackground[] = ['glow', 'tint', 'glass', 'black'];
const APP: readonly AppBackground[] = ['shader', 'glass', 'glow'];

const pick = <T extends string>(allowed: readonly T[], value: string | undefined): T | undefined =>
  allowed.find(a => a === value);

const flag = (value: string | undefined): boolean | undefined => (value === '1' ? true : value === '0' ? false : undefined);

export const styleUpdates = (params: Record<string, string>): StyleUpdates => {
  const out: StyleUpdates = {};
  const player = pick(PLAYER, params.playerBackground);
  const mini = pick(MINI, params.miniPlayerBackground);
  const app = pick(APP, params.appBackground);
  const vinyl = flag(params.vinyl);
  const fps = flag(params.fps);
  if (player !== undefined) out.playerBackground = player;
  if (mini !== undefined) out.miniPlayerBackground = mini;
  if (app !== undefined) out.appBackground = app;
  if (vinyl !== undefined) out.playerVinyl = vinyl;
  if (fps !== undefined) out.showPerformanceHUD = fps;
  return out;
};
