/**
 * "Update app" in the About sheet. New builds are published by CI to the
 * `apk-latest` release of the public GitHub repo (.github/workflows/android-apk.yml);
 * this reads that release and hands back where to download it.
 */
const RELEASE_API = 'https://api.github.com/repos/LuvLyricsApp/LuvLyricsApp/releases/tags/apk-latest';
/** Always the newest APK, whatever it is called inside the release. */
export const LATEST_APK_URL = 'https://github.com/LuvLyricsApp/LuvLyricsApp/releases/download/apk-latest/LuvLyrics.apk';

export interface LatestBuild {
  publishedAt: Date;
  downloadUrl: string;
}

interface ReleaseJson {
  published_at?: string;
  assets?: { name?: string; browser_download_url?: string }[];
}

/** Pure: the newest build from GitHub's release JSON, or null if it has none. */
export const parseRelease = (json: ReleaseJson | null | undefined): LatestBuild | null => {
  if (!json?.published_at) return null;
  const publishedAt = new Date(json.published_at);
  if (Number.isNaN(publishedAt.getTime())) return null;
  const apk = json.assets?.find(a => a.name?.toLowerCase().endsWith('.apk') && a.browser_download_url);
  return { publishedAt, downloadUrl: apk?.browser_download_url ?? LATEST_APK_URL };
};

/** "today", "yesterday", "3 days ago", or the date. */
export const releasedAgo = (when: Date, now: Date = new Date()): string => {
  const days = Math.floor((now.getTime() - when.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const fetchLatestBuild = async (): Promise<LatestBuild | null> => {
  const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return null;
  return parseRelease((await res.json()) as ReleaseJson);
};
