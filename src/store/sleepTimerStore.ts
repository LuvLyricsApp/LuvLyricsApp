/**
 * Sleep timer: pause the music after a set time, or when the current song ends.
 * The pause goes through requestPlayback, like every other transport command.
 */
import { create } from 'zustand';

export type SleepChoice = 15 | 30 | 45 | 60 | 'end';
export const SLEEP_CHOICES: SleepChoice[] = [15, 30, 45, 60, 'end'];

/** When a choice should fire (ms epoch). `remainingSec` is what's left of the song. */
export const sleepTimerEnd = (choice: SleepChoice, now: number, remainingSec: number): number =>
  choice === 'end' ? now + Math.max(1, remainingSec) * 1000 : now + choice * 60_000;

/** "12 min" / "45 s" left, for the Now Playing chip. */
export const sleepLabel = (endsAt: number, now: number): string => {
  const s = Math.max(0, Math.round((endsAt - now) / 1000));
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;
};

interface SleepTimerState {
  endsAt: number | null;
  choice: SleepChoice | null;
  start: (choice: SleepChoice, remainingSec: number) => void;
  cancel: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useSleepTimerStore = create<SleepTimerState>((set, get) => ({
  endsAt: null,
  choice: null,
  start: (choice, remainingSec) => {
    if (timer) clearTimeout(timer);
    const endsAt = sleepTimerEnd(choice, Date.now(), remainingSec);
    timer = setTimeout(async () => {
      timer = null;
      set({ endsAt: null, choice: null });
      const { usePlayerStore } = await import('./playerStore');
      usePlayerStore.getState().requestPlayback(false);
    }, endsAt - Date.now());
    set({ endsAt, choice });
  },
  cancel: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (get().endsAt !== null) set({ endsAt: null, choice: null });
  },
}));
