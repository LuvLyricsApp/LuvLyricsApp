/**
 * Opt-in diagnostics for release builds. Off unless the app was opened with
 * lyricflow://diagnose (the emulator smoke test does this); then tagged lines
 * go to logcat as ReactNativeJS so a release run can show what the canvas and
 * player actually did. In development they always print.
 */
let enabled = false;

export const enableDiagnostics = (): void => { enabled = true; };

export const diag = (tag: string, message: string): void => {
  if (!__DEV__ && !enabled) return;
  console.warn(`[diag:${tag}] ${message}`);
};
