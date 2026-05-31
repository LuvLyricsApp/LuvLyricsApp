/**
 * ImageSearchService.ts
 * 
 * Fetches high-quality album art from iTunes Search API.
 * No API Key required.
 */


export interface ImageSearchResult {
    id: string; // collectionId or trackId
    uri: string; // The high-res image URL
    title: string;
    artist: string;
    width: number;
    height: number;
}

class ImageSearchServiceImpl {
    
    /**
     * Search iTunes for Album Art (Standard)
     * Used by CoverArtSearchScreen
     */
    async searchImages(query: string, limit: number = 20): Promise<ImageSearchResult[]> {
        if (!query) return [];

        try {
            const term = encodeURIComponent(query);
            const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=${limit}`;

            const timeoutPromise = new Promise<any>((_, reject) => 
                setTimeout(() => reject(new Error('TIMEOUT')), 20000)
            );

            const response = await Promise.race([
                fetch(url),
                timeoutPromise
            ]) as Response;

            const data = await response.json();

            if (!data.results) return [];

            return data.results.map((item: any) => {
                const highResUrl = item.artworkUrl100 
                    ? item.artworkUrl100.replace('100x100bb', '1000x1000bb')
                    : null;

                return {
                    id: item.trackId?.toString() || Math.random().toString(),
                    uri: highResUrl || item.artworkUrl100,
                    title: item.trackName,
                    artist: item.artistName,
                    width: 1000,
                    height: 1000
                };
            }).filter((img: any) => img.uri); 

        } catch (error) {
            if (__DEV__) console.error('[ImageSearchService.searchImages] Async error:', error);
            return [];
        }
    }

    /**
     * Search iTunes for High-Res (1000x1000) Cover Art URLs only
     * Used by AudioDownloader
     */
    async searchItunes(query: string): Promise<string[]> {
        try {
            const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`);
            const data = await response.json();
            
            if (data.resultCount > 0) {
                return data.results.map((result: any) => {
                    return result.artworkUrl100.replace('100x100bb', '1000x1000bb');
                });
            }
            return [];
        } catch (e) {
            if (__DEV__) console.error('[ImageSearchService.searchItunes] Async error:', e);
            return [];
        }
    }
}

export const ImageSearchService = new ImageSearchServiceImpl();
