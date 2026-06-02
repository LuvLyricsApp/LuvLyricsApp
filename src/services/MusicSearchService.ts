export interface Song {
  id: string;
  title: string;
  artist: string;
  image: string; // High-res (500x500 or 1000x1000)
  downloadUrl: string; // 320kbps m4a
  hasLyrics: boolean;
  album: string;
  duration: number; // in seconds
}

export interface Lyrics {
  lyrics: string;
  snippet: string;
  copyright: string;
}

const API_BASE = 'https://saavn.dev/api';

export const MusicSearchService = {
  /**
   * Search for songs using Saavn API
   * Returns a standardized list of songs with high-res art and direct audio URLs.
   */
  searchSongs: async (query: string): Promise<Song[]> => {
    try {
      const response = await fetch(`${API_BASE}/search/songs?query=${encodeURIComponent(query)}&limit=10`);
      const data = await response.json();

      if (!data.success || !data.data || !data.data.results) {
        return [];
      }

      return data.data.results.map((item: any) => {
        // Extract 320kbps (or best available) download URL
        const downloadUrls = item.downloadUrl || [];
        // Sort by quality (highest bitrate first - usually last in array or explicitly labeled)
        // Saavn API usually provides: [{ quality: "12kbps", url: "..." }, ... { quality: "320kbps", url: "..." }]
        const bestUrlObj = downloadUrls.find((u: any) => u.quality === '320kbps') || downloadUrls[downloadUrls.length - 1];
        const bestUrl = bestUrlObj?.url || '';

        // Get highest res image
        const images = item.image || [];
        const bestImageObj = images.find((i: any) => i.quality === '500x500') || images[images.length - 1];
        const bestImage = bestImageObj?.url || '';

        return {
          id: item.id,
          title: item.name, // "name" is the title in Saavn API
          artist: item.primaryArtists,
          image: bestImage,
          downloadUrl: bestUrl,
          hasLyrics: item.hasLyrics === 'true' || item.hasLyrics === true,
          album: item.album?.name || '',
          duration: parseInt(item.duration || '0', 10),
        };
      });

    } catch (error) {
      console.error('[MusicSearchService] Search Error:', error);
      return [];
    }
  },

  /**
   * Fetch lyrics for a specific song ID
   */
  getLyrics: async (id: string): Promise<Lyrics | null> => {
    try {
      const response = await fetch(`${API_BASE}/songs/${id}/lyrics`);
      const data = await response.json();

      if (!data.success || !data.data) {
        return null;
      }

      return {
        lyrics: data.data.lyrics || '',
        snippet: data.data.snippet || '',
        copyright: data.data.copyright || '',
      };
    } catch (error) {
      console.error('[MusicSearchService] Lyrics Error:', error);
      return null;
    }
  }
};
