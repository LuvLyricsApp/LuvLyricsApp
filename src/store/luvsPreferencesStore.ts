/**
 * Luvs language preferences for the Settings / LanguagePicker UI.
 * Ranking and interaction history live in Kotlin (LuvsPrefs) on Android.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_KEY = '@reels_preferences';

export type LuvLanguage =
  | 'English'
  | 'Hindi'
  | 'Tamil'
  | 'Telugu'
  | 'Punjabi'
  | 'Korean'
  | 'Kannada'
  | 'Malayalam'
  | 'Bengali'
  | 'Marathi';

export interface LanguagePreference {
  language: LuvLanguage;
  weight: number;
}

const DEFAULT_LANGUAGES: LanguagePreference[] = [
  { language: 'English', weight: 50 },
  { language: 'Hindi', weight: 50 },
  { language: 'Tamil', weight: 0 },
  { language: 'Telugu', weight: 0 },
  { language: 'Punjabi', weight: 0 },
  { language: 'Korean', weight: 0 },
  { language: 'Kannada', weight: 0 },
  { language: 'Malayalam', weight: 0 },
  { language: 'Bengali', weight: 0 },
  { language: 'Marathi', weight: 0 },
];

interface LuvsPreferencesState {
  preferredLanguages: LanguagePreference[];
  setPreferredLanguages: (languages: LuvLanguage[]) => void;
  loadFromStorage: () => Promise<void>;
}

function normalizeLangs(raw: unknown): LanguagePreference[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_LANGUAGES.map(l => ({ ...l }));

  // Legacy: string[]
  if (typeof raw[0] === 'string') {
    const selected = new Set(raw as string[]);
    return DEFAULT_LANGUAGES.map(l => ({
      language: l.language,
      weight: selected.has(l.language) ? 50 : 0,
    }));
  }

  const byName = new Map(
    (raw as { language?: string; weight?: number }[])
      .filter(l => l?.language)
      .map(l => [l.language as string, typeof l.weight === 'number' ? l.weight : 0]),
  );
  return DEFAULT_LANGUAGES.map(l => ({
    language: l.language,
    weight: byName.has(l.language) ? (byName.get(l.language) as number) : l.weight,
  }));
}

export const useLuvsPreferencesStore = create<LuvsPreferencesState>((set) => ({
  preferredLanguages: DEFAULT_LANGUAGES.map(l => ({ ...l })),

  setPreferredLanguages: (languages: LuvLanguage[]) => {
    const preferredLanguages = DEFAULT_LANGUAGES.map(l => ({
      language: l.language,
      weight: languages.includes(l.language) ? 50 : 0,
    }));
    set({ preferredLanguages });
    AsyncStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ preferredLanguages }),
    ).catch(() => {});
  },

  loadFromStorage: async () => {
    try {
      const data = await AsyncStorage.getItem(PREFS_KEY);
      if (!data) return;
      const parsed = JSON.parse(data);
      set({ preferredLanguages: normalizeLangs(parsed.preferredLanguages) });
    } catch {
      // keep defaults
    }
  },
}));
