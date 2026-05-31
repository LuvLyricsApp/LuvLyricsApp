import React, { useEffect, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { useSongsStore } from '../store/songsStore';
import { useSettingsStore } from '../store/settingsStore';
import { lyricaService } from '../services/LyricaService';
import { useLyricsScanQueueStore } from '../store/lyricsScanQueueStore';
import { processLyricsScanQueue } from '../services/lyricsScanWorker';
import { usePlaylistStore } from '../store/playlistStore';
import { useKeepAwake } from 'expo-keep-awake';
import * as playlistQueries from '../database/playlistQueries';
import { downloadManager } from '../services/DownloadManager';

// Wrapper component to conditionally use the hook
const KeepAwakeController = () => {
  useKeepAwake();
  return null;
};

export const BackgroundDownloader = () => {
    const { queue, updateItem } = useDownloadQueueStore();
    const addSong = useSongsStore(state => state.addSong);
    const fetchSongs = useSongsStore(state => state.fetchSongs);
    const activeDownloads = useRef<Set<string>>(new Set());
    const MAX_CONCURRENT = 2; // 2-at-a-time is a good speed/reliability balance

    // Trigger lyrics scan worker whenever new pending scan jobs appear
    const scanQueue = useLyricsScanQueueStore(state => state.queue);
    const scanProcessing = useLyricsScanQueueStore(state => state.processing);
    useEffect(() => {
        const hasPending = Object.values(scanQueue).some(j => j.status === 'pending');
        if (hasPending && !scanProcessing) {
            processLyricsScanQueue();
        }
    }, [scanQueue, scanProcessing]);

    // Prevent screen from sleeping while downloading
    const hasActiveDownloads = queue.some(item => item.status === 'downloading' || item.status === 'pending');
    
    // Use the wrapper component to activate keep-awake only when needed
    // This avoids hook rule violations and import errors for non-existent static methods


    useEffect(() => {
        let isActive = true;

        // Cleanup: Remove IDs from activeDownloads that are no longer in the queue
        // This handles the case where a user removes a currently downloading song
        const queueIds = new Set(queue.map(q => q.id));
        for (const activeId of activeDownloads.current) {
            if (!queueIds.has(activeId)) {
                if (__DEV__) console.log(`[BackgroundDownloader] Detected removal of active item: ${activeId}`);
                // Stop the download to save bandwidth
                downloadManager.pauseDownload(activeId); 
                activeDownloads.current.delete(activeId);
            }
        }

        const processItem = async (item: any) => {
            // Check limits BEFORE adding to active set
            if (activeDownloads.current.has(item.id)) {
                if (__DEV__) console.log(`[BackgroundDownloader] ${item.id} already downloading`);
                return;
            }
            if (activeDownloads.current.size >= MAX_CONCURRENT) {
                if (__DEV__) console.log(`[BackgroundDownloader] Max concurrent (${MAX_CONCURRENT}) reached, waiting...`);
                return;
            }

            // Validate song has required fields
            // UnifiedSong from Reels usually has downloadUrl, but Search results use streamUrl. Check both.
            const targetUrl = item.song.downloadUrl || item.song.streamUrl;
            
            if (!targetUrl) {
                console.error(`[BackgroundDownloader] ❌ No download URL for ${item.song.title}`);
                updateItem(item.id, { 
                    status: 'failed', 
                    error: 'No download URL available', 
                    stageStatus: 'Failed - No URL' 
                });
                return;
            }

            // Add to active set IMMEDIATELY (synchronously)
            activeDownloads.current.add(item.id);
            if (__DEV__) {
              console.log(`[BackgroundDownloader] Starting download ${activeDownloads.current.size}/${MAX_CONCURRENT}: ${item.song.title}`);
              console.log(`[BackgroundDownloader] URL: ${targetUrl.substring(0, 80)}...`);
            }

            try {
                // Log song object to debug cover art
                if (__DEV__) console.log(`[BackgroundDownloader] Song cover art URL:`, item.song.highResArt || item.song.thumbnail || 'NONE');
                
                // 1. Transform UnifiedSong to StagingSong format
                const stagingPayload: any = {
                    id: item.song.id,
                    title: item.song.title,
                    artist: item.song.artist,
                    album: item.song.album || '',
                    duration: item.song.duration || 0,
                    selectedQuality: {
                        url: targetUrl,
                        quality: '320kbps',
                        format: 'mp3'
                    },
                    // Try highResArt -> thumbnail -> empty
                    selectedCoverUri: item.song.highResArt || item.song.thumbnail || '',
                    selectedLyrics: '', // Fetch lyrics AFTER download (Phase 2)
                    status: 'downloading',
                    progress: 0
                };

                // 2. Start Download (Phase 1: Audio & Cover - 0% to 80%)
                updateItem(item.id, { status: 'downloading', stageStatus: 'Downloading audio...', progress: 0 });
                
                // 🔥 Parallel Optimization: Start Searching Lyrics WHILE audio is downloading
                if (__DEV__) console.log(`[BackgroundDownloader] ⚡ Starting parallel lyrics search (synced preferred) for: ${item.song.title}`);
                const lyricsPromise = lyricaService.fetchLyrics(
                    item.song.title,
                    item.song.artist,
                    true, // Prefer synced lyrics
                    item.song.duration
                ).catch((_e: unknown) => {
                    if (__DEV__) console.warn(`[BackgroundDownloader] Parallel lyrics search failed`);
                    return null;
                });

                const newSong = await downloadManager.finalizeDownload(
                    stagingPayload,
                    (progress) => {
                        const scaledProgress = progress * 0.8;
                        if (isActive) updateItem(item.id, { progress: scaledProgress });
                    },
                    useSettingsStore.getState().downloadDirectoryUri
                );

                if (__DEV__) console.log(`[BackgroundDownloader] Audio download completed. Checking parallel lyrics search results...`);

                // 3. Process Lyrics (Phase 2: Lyrics - 80% to 100%)
                if (isActive) {
                    updateItem(item.id, { progress: 0.85, stageStatus: 'Processing lyrics...' });
                    
                    try {
                        // Await the promise we started earlier
                        const res = await lyricsPromise;
                        
                        if (res && res.lyrics) {
                            const isSynced = lyricaService.hasTimestamps(res.lyrics);
                            const type = isSynced ? 'Synced' : 'Plain';
                            if (__DEV__) console.log(`[BackgroundDownloader] ✅ Found lyrics (${type}) via ${res.source}`);
                            updateItem(item.id, { progress: 0.95, stageStatus: 'Saving lyrics...' });
                            
                            // Write to file
                            const songDir = newSong.audioUri?.substring(0, newSong.audioUri.lastIndexOf('/'));
                            if (songDir) {
                               const lyricsPath = `${songDir}/lyrics.lrc`;
                               await FileSystem.writeAsStringAsync(lyricsPath, res.lyrics);
                               if (__DEV__) console.log(`[BackgroundDownloader] Wrote lyrics to: ${lyricsPath}`);
                               
                               // Update song object
                               newSong.lyrics = lyricaService.parseLrc(res.lyrics, newSong.duration);
                               newSong.lyricSource = res.source as never; 
                            }
                        } else {
                            if (__DEV__) console.log(`[BackgroundDownloader] ❌ No lyrics found for ${item.song.title}`);
                            updateItem(item.id, { stageStatus: 'No lyrics found' });
                        }
                } catch {
                     if (__DEV__) console.warn(`[BackgroundDownloader] Lyrics processing failed`);
                     // Continue saving song even if lyrics fail
                    }
                }

                // 4. Complete
                if (__DEV__) console.log(`[BackgroundDownloader] ✅ Completed: ${item.song.title}`);
                
                // CRITICAL: Remove from active downloads BEFORE updating state
                activeDownloads.current.delete(item.id);
                if (__DEV__) console.log(`[BackgroundDownloader] Removed from active set. Active: ${activeDownloads.current.size}`);

                const currentQueue = useDownloadQueueStore.getState().queue;
                const isStillInQueue = currentQueue.some(q => q.id === item.id);
                
                if (!isStillInQueue) {
                    if (__DEV__) console.log(`[BackgroundDownloader] Item ${item.id} was removed from queue. Aborting save.`);
                    return;
                }

                if (__DEV__) console.log(`[BackgroundDownloader] Calling updateItem with status=completed...`);
                updateItem(item.id, { status: 'completed', progress: 1, stageStatus: 'Done' });
                
                if (__DEV__) console.log(`[BackgroundDownloader] Calling addSong...`);
                await addSong(newSong);

                // 🎵 Enqueue lyrics scan BEFORE fetchSongs to avoid race condition
                // (fetchSongs triggers re-render cascade; scan must be queued first)
                const hasSyncedLyrics = Array.isArray(newSong.lyrics) && 
                  newSong.lyrics.some((line: { timestamp?: number }) => line.timestamp !== undefined && line.timestamp > 0);
                if (!hasSyncedLyrics) {
                    try {
                        const { addToQueue } = useLyricsScanQueueStore.getState();
                        addToQueue(newSong, true); // forceSynced = true
                        if (__DEV__) console.log(`[BackgroundDownloader] Enqueued ${newSong.title} for synced lyrics retry`);
                    } catch {
                        if (__DEV__) console.warn(`[BackgroundDownloader] Failed to enqueue for lyrics retry`);
                    }
                }

                if (__DEV__) console.log(`[BackgroundDownloader] addSong completed, calling fetchSongs...`);
                await fetchSongs();

                // 5. Add to Playlist if requested (Respect sortOrder)
                if (item.targetPlaylistId) {
                    try {
                        if (__DEV__) console.log(`[BackgroundDownloader] Adding to playlist: ${item.targetPlaylistId} with order: ${item.sortOrder}`);
                        await playlistQueries.addSongToPlaylistWithOrder(
                            item.targetPlaylistId, 
                            newSong.id, 
                            item.sortOrder || 0
                        );
                        // Trigger store refresh
                        await usePlaylistStore.getState().fetchPlaylists();
                    } catch {
                         if (__DEV__) console.error(`[BackgroundDownloader] Failed to add to playlist`);
                    }
                }

            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (__DEV__) {
                    console.error(`[BackgroundDownloader] ❌ Error for ${item.song.title}:`, error);
                }
                
                // Also remove from active set on error before updating status
                activeDownloads.current.delete(item.id);
                
                updateItem(item.id, { status: 'failed', error: errorMessage, stageStatus: 'Failed' });
            } finally {
                // Double check cleanup just in case
                if (activeDownloads.current.has(item.id)) {
                    activeDownloads.current.delete(item.id);
                }
                if (__DEV__) console.log(`[BackgroundDownloader] Finished ${item.song.title} block`);
                // The effect will re-run due to queue changes (status update) and pick up next items
            }
        };

        // Find all pending items
        const pendingItems = queue.filter(item => item.status === 'pending');
        
        if (__DEV__) console.log(`[BackgroundDownloader] Pending: ${pendingItems.length}, Active: ${activeDownloads.current.size}/${MAX_CONCURRENT}`);
        
        // Start downloads up to the limit (don't await - let them run in parallel)
        for (const pendingItem of pendingItems) {
            if (activeDownloads.current.size < MAX_CONCURRENT && !activeDownloads.current.has(pendingItem.id)) {
                processItem(pendingItem); // Fire and forget - runs in background
            }
        }

        return () => {
            isActive = false;
        };
    }, [queue, updateItem, addSong, fetchSongs]);

    return (
        <>
            {hasActiveDownloads && <KeepAwakeController />}
        </>
    );
};
export default BackgroundDownloader;
