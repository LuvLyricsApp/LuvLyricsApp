/**
 * NativeSearchService.ts
 * 
 * "The Unblockable Search Engine"
 * Directly fetches YouTube search results and parses the initial data.
 * Bypasses Piped/Invidious APIs entirely.
 */


export interface NativeSearchResult {
    id: string;
    title: string;
    uploaderName: string;
    thumbnail: string;
    duration: number;
    url: string;
}

class NativeSearchServiceImpl {
    
    /**
     * Search YouTube directly via HTML parsing
     */
    async searchNativeYouTube(query: string): Promise<NativeSearchResult[]> {
        try {
            if (__DEV__) console.log(`[NativeSearch] Searching: ${query}`);
            const encodedQuery = encodeURIComponent(query);
            // Use a generic user agent to look like a browser
            const timeoutPromise = new Promise<any>((_, reject) => 
                setTimeout(() => reject(new Error('TIMEOUT')), 15000)
            );

            const response = await Promise.race([
                fetch(`https://www.youtube.com/results?search_query=${encodedQuery}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                }),
                timeoutPromise
            ]) as Response;

            const html = await response.text();

            // Extract ytInitialData
            // Method: Split by variable declaration to avoid complex regex
            const splitStart = html.split('var ytInitialData = ')[1];
            if (!splitStart) throw new Error('Could not find ytInitialData');

            const splitEnd = splitStart.split(';</script>')[0];
            const json = JSON.parse(splitEnd);

            // Navigate the JSON tree to find video results
            // This path is standard for desktop/mobile web responses, but requires safety checks
            const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

            if (!contents || !Array.isArray(contents)) {
                if (__DEV__) console.warn('[NativeSearch] No contents found in JSON tree');
                return [];
            }

            const results: NativeSearchResult[] = [];

            for (const item of contents) {
                if (item.videoRenderer) {
                    const video = item.videoRenderer;
                    
                    // Filter out ads or live streams if needed (usually indicated by badges)
                    // Basic extraction:
                    const id = video.videoId;
                    const title = video.title?.runs?.[0]?.text || 'Unknown Title';
                    const uploader = video.ownerText?.runs?.[0]?.text || 'Unknown Artist';
                    const thumbnail = video.thumbnail?.thumbnails?.[0]?.url; // Use 0 for base, usually has hq variants in list
                    
                    // Duration parsing (e.g. "4:05")
                    const durationText = video.lengthText?.simpleText || '0:00';
                    const duration = this.parseDuration(durationText);

                    if (id && title) {
                        results.push({
                            id,
                            title,
                            uploaderName: uploader,
                            thumbnail,
                            duration,
                            url: `https://www.youtube.com/watch?v=${id}`
                        });
                    }
                }
            }

            return results;

        } catch (error) {
            if (__DEV__) console.error('[NativeSearchService.search] Async error:', error);
            return [];
        }
    }

    parseDuration(timeStr: string): number {
        const parts = timeStr.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
    }
}

export const NativeSearchService = new NativeSearchServiceImpl();
