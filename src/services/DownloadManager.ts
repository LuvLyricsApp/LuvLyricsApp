/**
 * DownloadManager.ts
 * 
 * Handles physical downloading of assets and database finalization.
 * On Android, delegates tasks to native WorkManager-based DownloaderModule to survive app termination.
 * On iOS, continues using FileSystem.DownloadResumable.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Song } from '../types/song';
import { StagingSong } from '../hooks/useSongStaging';
import { lyricaService } from '../services/LyricaService';

let DownloaderModule: any = null;
let downloaderEmitter: any = null;

if (Platform.OS === 'android') {
  try {
    const { requireNativeModule, EventEmitter } = require('expo-modules-core');
    DownloaderModule = requireNativeModule('Downloader');
    downloaderEmitter = new EventEmitter(DownloaderModule);
  } catch {
    // Downloader native module not available — FileSystem fallback active
  }
}

class DownloadManager {
    private activeDownloads: Map<string, FileSystem.DownloadResumable> = new Map();

    async pauseDownload(id: string) {
        if (Platform.OS === 'android' && DownloaderModule) {
            try {
                DownloaderModule.cancel(id);
                if (__DEV__) console.log(`[DownloadManager] Android Download Canceled/Paused: ${id}`);
            } catch (e) {
                if (__DEV__) console.error('[DownloadManager.pauseDownload.android] Async error:', e);
            }
            return;
        }

        const download = this.activeDownloads.get(id);
        if (download) {
            try {
                await download.pauseAsync();
                if (__DEV__) console.log(`[DownloadManager] Paused: ${id}`);
            } catch (e) {
                if (__DEV__) console.error('[DownloadManager.pauseDownload] Async error:', e);
            }
        }
    }

    async resumeDownload(id: string) {
        // Android resumes are re-enqueued by the download queue manager
        if (Platform.OS === 'android') {
            return;
        }

        const download = this.activeDownloads.get(id);
        if (download) {
            try {
                await download.resumeAsync();
                if (__DEV__) console.log(`[DownloadManager] Resumed: ${id}`);
            } catch (e) {
                if (__DEV__) console.error('[DownloadManager.resumeDownload] Async error:', e);
            }
        }
    }

    /**
     * Finalize the download process
     * @param staging - The fully prepped staging object
     * @param onProgress - Callback for download progress
     */
    async finalizeDownload(
        staging: StagingSong,
        onProgress: (progress: number) => void,
        downloadDirectoryUri?: string
    ): Promise<Song> {
        
        if (!staging.selectedQuality) throw new Error('No quality selected');

        // ANDROID NATIVE PATH (WorkManager + HTTP stream + SAF copy)
        if (Platform.OS === 'android' && DownloaderModule && downloaderEmitter) {
            return new Promise((resolve, reject) => {
                const songDir = `${FileSystem.documentDirectory}music/${staging.id}/`;
                const audioUrl = staging.selectedQuality!.url;
                const coverUrl = staging.selectedCoverUri || null;
                const lyrics = staging.selectedLyrics || null;
                const safDir = downloadDirectoryUri || null;

                let progressSub: any = null;

                const cleanup = () => {
                    progressSub?.remove();
                };

                progressSub = downloaderEmitter.addListener('onDownloadProgress', (event: any) => {
                    if (event.id !== staging.id) return;

                    const progress = event.progress;
                    const status = event.status;

                    if (status === 'running') {
                        onProgress(progress);
                    } else if (status === 'exporting') {
                        onProgress(0.95);
                    } else if (status === 'succeeded') {
                        onProgress(1.0);
                        cleanup();

                        // event.audioUri can be null when WorkManager emits "succeeded" from
                        // setProgress() before the state transitions to SUCCEEDED — outputData
                        // isn't populated yet. Fall back to the known download path.
                        const audioUri = event.audioUri ?? `${songDir}audio.mp3`;
                        // If native cover download failed (null), fall back to the remote URL so
                        // the UI still shows art instead of a blank placeholder.
                        const coverUri = event.coverUri || staging.selectedCoverUri || undefined;

                        const newSong: Song = {
                            id: staging.id,
                            title: staging.title,
                            artist: staging.artist,
                            album: staging.album,
                            duration: staging.duration,
                            coverImageUri: coverUri,
                            audioUri: audioUri,
                            playCount: 0,
                            dateCreated: new Date().toISOString(),
                            dateModified: new Date().toISOString(),
                            lyrics: staging.selectedLyrics ? lyricaService.parseLrc(staging.selectedLyrics, staging.duration) : [],
                            gradientId: Math.floor(Math.random() * 5).toString()
                        };
                        resolve(newSong);
                    } else if (status === 'failed' || status === 'cancelled') {
                        cleanup();
                        const detail = event.error ? ` — ${event.error}` : '';
                        reject(new Error(`Download failed with status: ${status}${detail}`));
                    }
                });

                try {
                    DownloaderModule.enqueue(staging.id, audioUrl, coverUrl, songDir, lyrics, safDir);
                } catch (e) {
                    cleanup();
                    reject(e);
                }
            });
        }

        // IOS FALLBACK PATH
        const songDir = `${FileSystem.documentDirectory}music/${staging.id}/`;
        
        let lastProgressEmit = 0;
        const updateProgress = (progress: number) => {
            const now = Date.now();
            if (progress >= 1 || now - lastProgressEmit >= 120) {
                lastProgressEmit = now;
                onProgress(progress);
            }
        };
        
        updateProgress(0.05);
        const dirInfo = await FileSystem.getInfoAsync(songDir);
        if (dirInfo.exists) {
            await FileSystem.deleteAsync(songDir);
        }
        await FileSystem.makeDirectoryAsync(songDir, { intermediates: true });

        try {
            updateProgress(0.1);
            let downloadUrl = staging.selectedQuality.url;
            const format = staging.selectedQuality.format || 'mp3';
            const audioFile = `${songDir}audio.${format}`;
            
            if (__DEV__) console.log(`[DownloadManager] Downloading Audio: ${downloadUrl.substring(0, 80)}...`);

            const audioDownload = FileSystem.createDownloadResumable(
                downloadUrl,
                audioFile,
                {},
                (downloadProgress) => {
                    const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                    updateProgress(0.1 + (progress * 0.7));
                }
            );

            this.activeDownloads.set(staging.id, audioDownload);
            
            try {
                await audioDownload.downloadAsync();
                updateProgress(0.8);
            } finally {
                this.activeDownloads.delete(staging.id);
            }

            updateProgress(0.85);
            let coverLocalUri: string | undefined;
            if (staging.selectedCoverUri) {
                const coverFile = `${songDir}cover.jpg`;
                const coverDownload = FileSystem.createDownloadResumable(staging.selectedCoverUri, coverFile);
                await coverDownload.downloadAsync();
                coverLocalUri = coverFile;
            }
            updateProgress(0.9);

            updateProgress(0.95);
            if (staging.selectedLyrics) {
                const lyricsFile = `${songDir}lyrics.lrc`;
                await FileSystem.writeAsStringAsync(lyricsFile, staging.selectedLyrics);
            }

            let finalAudioUri = audioFile;
            
            try {
                const safDir = downloadDirectoryUri;

                if (safDir) {
                    updateProgress(0.96);
                    if (__DEV__) console.log('[DownloadManager] SAF configured, exporting to:', safDir);
                    
                    const mimeType = format === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
                    const friendlyName = `${staging.artist} - ${staging.title}`;
                    
                    const safUri = await FileSystem.StorageAccessFramework.createFileAsync(safDir, friendlyName, mimeType);
                    
                    const fileContent = await FileSystem.readAsStringAsync(audioFile, { encoding: FileSystem.EncodingType.Base64 });
                    await FileSystem.writeAsStringAsync(safUri, fileContent, { encoding: FileSystem.EncodingType.Base64 });
                    
                    finalAudioUri = safUri;
                    if (__DEV__) console.log(`[DownloadManager] SAF export success. URI: ${safUri.substring(0, 80)}...`);
                }
            } catch (e) {
                if (__DEV__) console.error('[DownloadManager.safExport] Async error:', e);
            }

            const newSong: Song = {
                id: staging.id,
                title: staging.title,
                artist: staging.artist,
                album: staging.album, 
                duration: staging.duration,
                coverImageUri: coverLocalUri,
                audioUri: finalAudioUri,
                playCount: 0,
                dateCreated: new Date().toISOString(),
                dateModified: new Date().toISOString(),
                lyrics: staging.selectedLyrics ? lyricaService.parseLrc(staging.selectedLyrics, staging.duration) : [],
                gradientId: Math.floor(Math.random() * 5).toString()
            };

            updateProgress(1.0);
            return newSong;

        } catch (error) {
            await FileSystem.deleteAsync(songDir, { idempotent: true });
            throw error;
        }
    }
}

export const downloadManager = new DownloadManager();
