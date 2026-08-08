import { Song } from '../types/song';
import { getNativeModule } from './nativeModule';

const mod = getNativeModule<{
  search: (q: string) => Promise<string>;
  ensureIndex: () => Promise<void>;
}>('Search');

export async function nativeSearch(query: string): Promise<Song[] | null> {
  if (!mod) return null;
  try {
    // Append '*' for prefix matching: "beatl" matches "Beatles"
    const json: string = await mod.search(query.trim() + '*');
    return JSON.parse(json) as Song[];
  } catch {
    return null;
  }
}

export async function ensureSearchIndex(): Promise<void> {
  if (!mod) return;
  try {
    await mod.ensureIndex();
  } catch {
    // Non-fatal — search falls back to JS filter if index is missing
  }
}
