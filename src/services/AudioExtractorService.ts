/**
 * AudioExtractorService.ts
 * 
 * "Snaptube-style" On-Device Extractor using react-native-ytdl.
 * Handles Node.js polyfills to prevent crashes in React Native.
 */

// --- POLYFILLS START ---
import { Buffer } from 'buffer';
import 'react-native-url-polyfill/auto'; // usually needed, or use url package
// stream-browserify should be aliased in babel/metro if possible, 
// but often just importing it helps if ytdl uses global.
// We'll set globals manually to be safe.

if (typeof global.Buffer === 'undefined') {
    global.Buffer = Buffer;
}

// Simple stream stub if stream-browserify isn't working perfectly
// ytdl-core often just needs 'stream' content.
// Ref: https://github.com/StartDD/react-native-ytdl#usage
// --- POLYFILLS END ---

import ytdl from 'react-native-ytdl';

export interface AudioFormat {
    quality: string; // "128kbps"
    format: string; // "m4a"
    url: string;
    sizeMb: string;
    bitrate: number;
}

type YtdlGetInfoOptions = {
    requestOptions?: {
        headers?: Record<string, string>;
    };
};

class AudioExtractorService {
    
    /**
     * Get Audio Formats for a YouTube Video
     */
    async getAudioFormats(youtubeUrl: string): Promise<AudioFormat[]> {
        try {
            console.log(`[AudioExtractor] Fetching info for: ${youtubeUrl}`);
            
            // Get Info
            // Get Info
            const getInfo = ytdl.getInfo as (
                url: string,
                options?: YtdlGetInfoOptions
            ) => ReturnType<typeof ytdl.getInfo>;

            const info = await getInfo(youtubeUrl, {
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
                    }
                }
            });
            console.log(`[AudioExtractor] Raw formats found: ${info.formats.length}`);
            
            // Filter for Audio Only
            let audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
            console.log(`[AudioExtractor] Audio-only formats: ${audioFormats.length}`);
            
            // RELAXED FILTER: If no audio-only, try filters that contain audio (audioandvideo)
            if (!audioFormats.length) {
                console.warn('[AudioExtractor] No audio-only formats, trying to find ANY format with audio (audioandvideo)...');
                audioFormats = ytdl.filterFormats(info.formats, 'audioandvideo');
            }

            console.log(`[AudioExtractor] Final formats count: ${audioFormats.length}`);

            if (!audioFormats.length) {
                console.warn('[AudioExtractor] No audio formats found (Strict or Relaxed)');
                return [];
            }

            // Map to UI friendly format
            const mappedFormats = audioFormats.map((format: any) => {
                const bitrate = format.audioBitrate || 128;
                
                // Calculate size: ContentLength or Estimate
                let sizeMb = 'Unknown';
                if (format.contentLength) {
                    sizeMb = (parseInt(format.contentLength, 10) / (1024 * 1024)).toFixed(1);
                } else if (format.approxDurationMs) {
                    // Estimate: (Bitrate * Duration) / 8 / 1024 / 1024
                    // Bitrate is in kbps usually? No, audioBitrate is kbps in ytdl
                    // (bitrate * 1000 * duration_sec) / 8 / 1024 / 1024
                    const durationSec = parseInt(format.approxDurationMs, 10) / 1000;
                    sizeMb = ((bitrate * 1000 * durationSec) / 8 / (1024 * 1024)).toFixed(1);
                }

                return {
                    quality: `${bitrate}kbps`,
                    format: format.container || 'm4a', // usually m4a or webm
                    url: format.url,
                    sizeMb,
                    bitrate
                };
            });

            // Sort by bitrate (High to Low)
            return mappedFormats.sort((a: any, b: any) => b.bitrate - a.bitrate);

        } catch (error) {
            if (__DEV__) console.error('[AudioExtractorService.getAudioFormats] Async error:', error);
            // Polyfill might be missing if this crashes on 'crypto' or 'stream'
            return [];
        }
    }
}

export const audioExtractorService = new AudioExtractorService();
