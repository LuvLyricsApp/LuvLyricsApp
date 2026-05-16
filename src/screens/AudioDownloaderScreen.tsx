import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { 
    View, Text, StyleSheet, TextInput, Pressable, 
    ActivityIndicator, ScrollView, FlatList, SectionList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
// Safe area dimensions removed as unused in this block

// useSongStaging removed as unused
import { Colors } from '../constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Toast } from '../components/Toast';
import { MultiSourceSearchService } from '../services/MultiSourceSearchService';
import { UnifiedSong } from '../types/song';
import { usePlayerStore } from '../store/playerStore';
import { useSongsStore } from '../store/songsStore';
import { Audio } from 'expo-av';
// ImageSearchService removed as unused

// New Architecture Imports
import { useDownloaderTabStore, SearchTab } from '../store/downloaderTabStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { 
    DownloadGridCard, 
    FloatingDownloadIndicator, 
    DownloadQueueModal,
    BulkSwapModal,
    PlaylistSelectionModal
} from '../components';
import * as Clipboard from 'expo-clipboard';
import { usePlaylistStore } from '../store/playlistStore';
import { BulkItem } from '../store/downloaderTabStore';
import { useLyricsScanQueueStore } from '../store/lyricsScanQueueStore';
import stringSimilarity from 'string-similarity';
import * as playlistQueries from '../database/playlistQueries';

// Safe area dimensions removed as unused in this block


// --- Types & Components ---

interface ScrollableHeaderProps {
    tabs: SearchTab[];
    activeTabId: string;
    setActiveTab: (id: string) => void;
    closeTab: (id: string) => void;
    createTab: (query: string) => void;
    selectionMode: boolean;
    setSelectionMode: (mode: boolean) => void;
    activeTabMode: 'search' | 'bulk';
    updateTab: (id: string, updates: Partial<SearchTab>) => void;
}

// Single compact toolbar: tab pills + 3 micro-icon buttons
const ScrollableHeader: React.FC<ScrollableHeaderProps> = memo(({
    tabs, activeTabId, setActiveTab, closeTab, createTab,
    selectionMode, setSelectionMode, activeTabMode, updateTab
}) => (
    <View style={styles.toolbarRow}>
        <Pressable
            style={[styles.microBtn, selectionMode && styles.microBtnActive]}
            onPress={() => setSelectionMode(!selectionMode)}
        >
            <Ionicons name={selectionMode ? "checkmark-circle" : "checkmark-circle-outline"} size={17} color={selectionMode ? '#fff' : Colors.primary} />
        </Pressable>

        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBarScroll}
            style={{ flex: 1 }}
        >
            {tabs.map(tab => (
                <Pressable
                    key={tab.id}
                    style={[styles.tabItem, tab.id === activeTabId && styles.activeTabItem]}
                    onPress={() => setActiveTab(tab.id)}
                >
                    <Text style={[styles.tabText, tab.id === activeTabId && styles.activeTabText]} numberOfLines={1}>
                        {tab.query || 'New'}
                    </Text>
                    {tabs.length > 1 && (
                        <Pressable onPress={() => closeTab(tab.id)} style={styles.closeTabBtn}>
                            <Ionicons name="close" size={11} color="#666" />
                        </Pressable>
                    )}
                </Pressable>
            ))}
        </ScrollView>

        <Pressable style={styles.microBtn} onPress={() => createTab('')}>
            <Ionicons name="add" size={18} color="#fff" />
        </Pressable>

        <Pressable
            style={[styles.microBtn, activeTabMode === 'bulk' && styles.microBtnActive]}
            onPress={() => updateTab(activeTabId, { mode: activeTabMode === 'bulk' ? 'search' : 'bulk' })}
        >
            <Ionicons name={activeTabMode === 'bulk' ? 'layers' : 'layers-outline'} size={17} color={activeTabMode === 'bulk' ? '#C084FC' : '#555'} />
        </Pressable>
    </View>
));

interface BulkHeaderProps extends ScrollableHeaderProps {
    bulkPlaylistName: string;
    setBulkPlaylistName: (name: string) => void;
}

const BulkHeader: React.FC<BulkHeaderProps> = memo((props) => (
    <View>
        <ScrollableHeader {...props} />
        <View style={styles.bulkTitleContainer}>
            <Text style={styles.label}>3. NAME YOUR PLAYLIST</Text>
            <TextInput
                style={styles.playlistInput}
                value={props.bulkPlaylistName}
                onChangeText={props.setBulkPlaylistName}
                placeholder="My Awesome Playlist"
                placeholderTextColor="#555"
            />
        </View>
    </View>
));

interface AudioDownloaderProps {
    navigation: {
        goBack: () => void;
        navigate: (screen: string, params?: Record<string, unknown>) => void;
    };
}


export const AudioDownloaderScreen: React.FC<AudioDownloaderProps> = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    // Global Stores
    const { 
        tabs, activeTabId, 
        createTab, closeTab, setActiveTab, updateTab, 
        toggleSelection, clearAllSelections, getSelectedSongs 
    } = useDownloaderTabStore();
    
    const addToQueue = useDownloadQueueStore(state => state.addToQueue);
    const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);

    // Local UI State
    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' } | null>(null);
    
    const [showQueue, setShowQueue] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);
    
    // Playlist Selection State
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [pendingDownloadSongs, setPendingDownloadSongs] = useState<UnifiedSong[]>([]);
    
    // Dual-Field Search State - synced with active tab
    const [searchMode, setSearchMode] = useState<'title' | 'artist'>('title'); // Default: title open
    const [titleQuery, setTitleQueryLocal] = useState(activeTab?.titleQuery || '');
    const [artistQuery, setArtistQueryLocal] = useState(activeTab?.artistQuery || '');
    const [remixSectionExpanded, setRemixSectionExpanded] = useState(false);
    
    // Bulk Input State
    const [jsonInput, setJsonInput] = useState('');
    const [bulkPlaylistName, setBulkPlaylistName] = useState('');
    
    // Swap Modal State
    const [swapModalVisible, setSwapModalVisible] = useState(false);
    const [swapTargetItem, setSwapTargetItem] = useState<BulkItem | null>(null);

    const selectedCount = getSelectedSongs().length;
    const readyBulkCount = activeTab.bulkItems?.filter(i => i.result).length || 0;
    const showBottomActionBar = selectedCount > 0 || (activeTab.mode === 'bulk' && readyBulkCount > 0);
    const actionBarBottom = Math.max(24, insets.bottom + 12);

    // Effect to sync local state ONLY when switching tabs
    useEffect(() => {
        if (activeTab) {
            setJsonInput((activeTab.bulkItems && activeTab.bulkItems.length > 0) ? JSON.stringify(activeTab.bulkItems.map(i => i.query), null, 2) : '');
            setBulkPlaylistName(activeTab.bulkPlaylistName || '');
        }
    }, [activeTabId]); // Only sync when the ID changes

    // Wrap setters - ONLY local state update while typing
    const setTitleQuery = (val: string) => {
        setTitleQueryLocal(val);
    };
    const setArtistQuery = (val: string) => {
        setArtistQueryLocal(val);
    };

    // Sync search fields ONLY when switching tabs
    useEffect(() => {
        if (activeTab) {
            setTitleQueryLocal(activeTab.titleQuery || '');
            setArtistQueryLocal(activeTab.artistQuery || '');
            // Switch search mode based on content
            if (activeTab.artistQuery && !activeTab.titleQuery) {
                setSearchMode('artist');
            } else {
                setSearchMode('title');
            }
        }
    }, [activeTabId]); // Only sync when the ID changes
    
    // Preview Audio State
    
    // Animated values removed as unused in Unified UI

    
    // Preview Audio State
    const [previewSound, setPreviewSound] = useState<Audio.Sound | null>(null);
    const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);

    // Audio Ref for cleanup
    const previewSoundRef = useRef<Audio.Sound | null>(null);

    // Sync ref with state
    useEffect(() => {
        previewSoundRef.current = previewSound;
    }, [previewSound]); // Correct: only depend on state value

    // Cleanup on unmount
    useEffect(() => {
        setMiniPlayerHidden(true);
        return () => {
            setMiniPlayerHidden(false);
            if (previewSoundRef.current) {
                previewSoundRef.current.unloadAsync();
            }
        };
    }, [setMiniPlayerHidden]);

    // Filter Results for Artist Search
    const filterResults = useCallback((results: UnifiedSong[], query: string): {
        exactMatches: UnifiedSong[];
        remixesAndCovers: UnifiedSong[];
    } => {
        const artistLower = query.toLowerCase().trim();
        
        const exactMatches = results.filter(song => {
            const songArtist = song.artist.toLowerCase();
            // Exact match: artist name appears without remix/cover keywords
            return songArtist.includes(artistLower) && 
                   !songArtist.match(/remix|cover|vs\.|feat\.|ft\./i);
        });
        
        const remixesAndCovers = results.filter(song => {
            const songArtist = song.artist.toLowerCase();
            return songArtist.includes(artistLower) && 
                   songArtist.match(/remix|cover|vs\.|feat\.|ft\./i);
        });
        
        return { exactMatches, remixesAndCovers };
    }, []);

    // Handle Search
    const handleSearch = useCallback(async () => {
        // Construct query from dual fields
        let finalQuery = '';
        
        if (titleQuery && artistQuery) {
            finalQuery = `${titleQuery} ${artistQuery}`;
        } else if (artistQuery) {
            finalQuery = artistQuery;
        } else if (titleQuery) {
            finalQuery = titleQuery;
        }
        
        if (!finalQuery.trim()) return;
        
        // Update Tab State AND sync typing fields to store
        updateTab(activeTabId, { 
            isSearching: true, 
            status: 'Searching...', 
            results: [], 
            remixResults: [],
            query: finalQuery,
            titleQuery: titleQuery,
            artistQuery: artistQuery,
        });

        try {
            if (__DEV__) console.log(`[Tab-${activeTabId.slice(-4)}] 🔍 Searching: ${finalQuery}`);
            const results = await MultiSourceSearchService.searchMusic(finalQuery, artistQuery, (status) => {
                 updateTab(activeTabId, { status });
            });
            
            // Filter results if artist query exists
            if (artistQuery) {
                const { exactMatches, remixesAndCovers } = filterResults(results, artistQuery);
                
                // Fallback: If strict filtering hid everything, but we have results, show them!
                if (exactMatches.length === 0 && remixesAndCovers.length === 0 && results.length > 0) {
                     if (__DEV__) console.log('[AudioDownloader] Strict filter hid all results. Falling back to raw.');
                     updateTab(activeTabId, { 
                        results, 
                        remixResults: [],
                        isSearching: false, 
                        status: '' // Clear "No results" since we are showing raw
                    });
                } else {
                    updateTab(activeTabId, { 
                        results: exactMatches,
                        remixResults: remixesAndCovers,
                        isSearching: false, 
                        status: exactMatches.length === 0 && remixesAndCovers.length === 0 ? 'No results found.' : '' 
                    });
                }
            } else {
                updateTab(activeTabId, { 
                    results, 
                    remixResults: [],
                    isSearching: false, 
                    status: results.length === 0 ? 'No results found.' : '' 
                });
            }
            
        } catch (_error) {
            updateTab(activeTabId, { isSearching: false, status: 'Search failed.' });
            setToast({ visible: true, message: 'Search failed', type: 'error' });
        }
    }, [activeTabId, titleQuery, artistQuery, updateTab]);

    // Handle Preview
    const handlePreviewToggle = async (song: UnifiedSong) => {
        try {
            if (playingPreviewId === song.id && previewSound) {
                await previewSound.pauseAsync();
                setPlayingPreviewId(null);
                return;
            }

            if (previewSound) await previewSound.unloadAsync();

            const { sound } = await Audio.Sound.createAsync(
                { uri: song.downloadUrl },
                { shouldPlay: true }
            );
            
            setPreviewSound(sound);
            setPlayingPreviewId(song.id);
            sound.setOnPlaybackStatusUpdate((s) => {
                if (s.isLoaded && s.didJustFinish) setPlayingPreviewId(null);
            });
        } catch {
            setToast({ visible: true, message: 'Preview failed', type: 'error' });
        }
    };

    // New Tab for Artist
    const openArtistTab = (artistName: string) => {
        createTab(artistName);
        // We'll need to trigger search for the new tab after creation
        // Since createTab is synchronous, we can find the last tab and update it
        // Or better: createTab could accept initial search request?
        // Current implementation: createTab(query).
        // I need to trigger search effect or just call search manually?
        // I'll manually trigger it in a timeout to ensure state update
        setTimeout(() => {
            // Find the new tab (it's the active one now)
            // But wait, createTab sets active.
            // We need a way to run search.
            // For now, user has to hit enter? 
            // Better: update logic.
            // Actually, `handleSearch` uses `activeTab`. 
            // So if I call handleSearch() immediately it might use old active tab if state hasn't flushed.
            // React batching...
            // I'll just let the user hit enter for now or Auto-Search?
            // "Clicking Artist Name -> Opens new search tab... and immediately fetch".
            // I'll add an effect: useEffect(() => { if new tab has query & no results & !searching => search }, [activeTabId])
        }, 100);
    };
    
    // Auto-Search Effect for new Tabs
    useEffect(() => {
        if (activeTab.query && activeTab.results.length === 0 && !activeTab.isSearching && activeTab.status === '') {
             handleSearch();
        }
    }, [activeTabId, activeTab.query, activeTab.results.length, activeTab.isSearching, activeTab.status, handleSearch]);

    // Selection Logic
    const handleLongPress = (song: UnifiedSong) => {
        toggleSelection(activeTabId, song.id);
    };

    // Direct Download Logic
    const handlePress = (song: UnifiedSong) => {
        // If selection mode is active, toggle selection
        if (activeTab.selectedSongs.length > 0 || selectionMode) {
            toggleSelection(activeTabId, song.id);
            return;
        }

        // Prepare Queue Item
        const queueItem: UnifiedSong = {
            ...song,
            highResArt: song.highResArt || song.thumbnail || '',
            downloadUrl: song.downloadUrl || song.streamUrl || '',
            streamUrl: song.downloadUrl || song.streamUrl || '',
            selectedQuality: {
                url: song.downloadUrl || song.streamUrl || '',
                quality: '320kbps',
                format: 'mp3'
            },
            selectedLyrics: '',
            selectedCoverUri: song.highResArt || song.thumbnail || ''
        };

        // Trigger Playlist Selection Modal
        setPendingDownloadSongs([queueItem]);
        setPlaylistModalVisible(true);
    };

    const handleBatchDownload = () => {
        const selectedSongs = getSelectedSongs().map(s => s.song);
        if (selectedSongs.length === 0) return;
        
        // If in Bulk Mode, we use the bulk playlist logic
        if (activeTab.mode === 'bulk') {
            handleBulkDownloadAction();
            return;
        }

        const queueItems = selectedSongs.map(song => ({
            ...song,
            highResArt: song.highResArt || song.thumbnail || '',
            downloadUrl: song.downloadUrl || song.streamUrl || '',
            streamUrl: song.downloadUrl || song.streamUrl || '',
            selectedQuality: {
                url: song.downloadUrl || song.streamUrl || '',
                quality: '320kbps',
                format: 'mp3'
            },
            selectedLyrics: '',
            selectedCoverUri: song.highResArt || song.thumbnail || ''
        }));

        // Trigger Playlist Selection Modal
        setPendingDownloadSongs(queueItems as UnifiedSong[]);
        setPlaylistModalVisible(true);
    };

    const confirmDownload = (targetPlaylistId?: string, playlistName?: string) => {
        if (pendingDownloadSongs.length === 0) return;

        const currentQueue = useDownloadQueueStore.getState().queue;
        const newSongs = pendingDownloadSongs.filter(s => !currentQueue.find(q => q.id === s.id));
        const duplicates = pendingDownloadSongs.length - newSongs.length;

        if (newSongs.length > 0) {
            addToQueue(newSongs, targetPlaylistId);
            
            let msg = `Added ${newSongs.length} song${newSongs.length > 1 ? 's' : ''} to queue`;
            if (playlistName) {
                msg += ` (Simultaneously adding to "${playlistName}")`;
            }
            setToast({ visible: true, message: msg, type: 'success' });
        }

        if (duplicates > 0) {
             // If we only had duplicates, or some duplicates
             const msg = newSongs.length === 0 
                ? 'Song already in queue!' 
                : `Added ${newSongs.length}, skipped ${duplicates} duplicates`;
             setToast({ visible: true, message: msg, type: newSongs.length === 0 ? 'error' : 'success' });
        }
        
        // Cleanup
        setPendingDownloadSongs([]);
        setPlaylistModalVisible(false);
        clearAllSelections();
        setSelectionMode(false);
    };

    // --- Bulk Logic ---
    
    const handleSwap = (item: BulkItem) => {
        setSwapTargetItem(item);
        setSwapModalVisible(true);
    };

    const onSwapConfirm = (newSong: UnifiedSong) => {
        if (!swapTargetItem) return;
        
        // Update the item in the bulk list
        const updatedItems = activeTab.bulkItems?.map(i => 
            i.id === swapTargetItem.id ? { ...i, result: newSong, status: 'found' as const } : i
        );
        
        updateTab(activeTabId, { bulkItems: updatedItems });
        setSwapModalVisible(false);
        setSwapTargetItem(null);
    };

    const copyPromptToClipboard = async () => {
        const prompt = `Please generate a JSON list of songs for me.  
Format: 
[
  { "title": "Song Title", "artist": "Artist Name" },
  { "title": "Another Song", "artist": "Another Artist" }
]
Only provide the JSON array, no other text.`;
        await Clipboard.setStringAsync(prompt);
        setToast({ visible: true, message: 'Prompt copied to clipboard!', type: 'success' });
    };

    const parseAndSearchBulk = async () => {
        try {
            const parsed = JSON.parse(jsonInput);
            if (!Array.isArray(parsed)) throw new Error('Not an array');

            const bulkItems: BulkItem[] = parsed.map((item: { title?: string; artist?: string }, index: number) => ({
                id: `bulk-${Date.now()}-${index}`,
                query: { title: item.title || '', artist: item.artist || '' },
                result: null,
                status: 'pending',
                originalIndex: index
            }));

            // Update tab with pending items
            updateTab(activeTabId, { bulkItems, status: 'Searching...', isSearching: true });

            // Process sequentially to be nice to APIs (or parallel chunks)
            for (let i = 0; i < bulkItems.length; i++) {
                // Fetch the LATEST items from store to avoid overwriting manual updates
                const latestTab = useDownloaderTabStore.getState().tabs.find(t => t.id === activeTabId);
                if (!latestTab || !latestTab.bulkItems) break;
                
                const currentItem = latestTab.bulkItems[i];
                if (!currentItem || currentItem.status === 'found') continue; // Skip if manually swapped or already found
                
                // Mark ONLY this item as searching
                const searchingItems = [...latestTab.bulkItems];
                searchingItems[i] = { ...searchingItems[i], status: 'searching' };
                updateTab(activeTabId, { bulkItems: searchingItems });

                const queryTitle = currentItem.query.title.toLowerCase().trim();
                const queryArtist = currentItem.query.artist.toLowerCase().trim();

                try {
                    // 1. Check local library first
                    const localSongs = useSongsStore.getState().songs;
                    const existingSong = localSongs.find(s => 
                        s.title.toLowerCase().trim() === queryTitle && 
                        (s.artist || '').toLowerCase().trim() === queryArtist
                    );

                    const reReadTab = useDownloaderTabStore.getState().tabs.find(t => t.id === activeTabId);
                    if (!reReadTab || !reReadTab.bulkItems) break;
                    const updatedItems = [...reReadTab.bulkItems];

                    if (existingSong) {
                        updatedItems[i] = {
                            ...updatedItems[i],
                            status: 'already_present',
                            result: {
                                id: existingSong.id,
                                title: existingSong.title,
                                artist: existingSong.artist || 'Unknown Artist',
                                highResArt: existingSong.coverImageUri || '',
                                downloadUrl: existingSong.audioUri || '',
                                source: 'Local',
                                isLocal: true,
                                duration: existingSong.duration
                            }
                        };
                    } else {
                        // 2. Search online if not found locally
                        const query = `${currentItem.query.title} ${currentItem.query.artist}`;
                        const results = await MultiSourceSearchService.searchMusic(query, currentItem.query.artist);
                        
                        if (results.length > 0) {
                            // STRICT TITLE MATCHING: Pick the best result
                            const matches = results.map(r => ({
                                result: r,
                                rating: stringSimilarity.compareTwoStrings(
                                    `${queryTitle} ${queryArtist}`,
                                    `${r.title.toLowerCase()} ${r.artist.toLowerCase()}`
                                )
                            }));
                            
                            // Sort by similarity rating
                            matches.sort((a, b) => b.rating - a.rating);
                            
                            // Pick best match if it meets threshold, otherwise take first but warn
                            const bestMatch = matches[0].rating > 0.4 ? matches[0].result : results[0];

                            updatedItems[i] = {
                                ...updatedItems[i],
                                status: 'found',
                                result: bestMatch
                            };
                        } else {
                            updatedItems[i] = {
                                ...updatedItems[i],
                                status: 'not_found'
                            };
                        }
                    }
                    updateTab(activeTabId, { bulkItems: updatedItems });
                } catch (error) {
                    console.warn(`[BulkSearch] Item ${i} failed:`, error);
                    const tabAfterError = useDownloaderTabStore.getState().tabs.find(t => t.id === activeTabId);
                    if (tabAfterError && tabAfterError.bulkItems) {
                        const errorItems = [...tabAfterError.bulkItems];
                        errorItems[i] = { ...errorItems[i], status: 'not_found' };
                        updateTab(activeTabId, { bulkItems: errorItems });
                    }
                }
                
                // Small delay to be nice to API
                await new Promise(r => setTimeout(r, 600));
            }

            updateTab(activeTabId, { isSearching: false, status: 'Completed' });

        } catch {
            setToast({ visible: true, message: 'Invalid JSON format', type: 'error' });
            updateTab(activeTabId, { isSearching: false });
        }
    };

    const handleBulkDownloadAction = async () => {
        if (!bulkPlaylistName.trim()) {
            setToast({ visible: true, message: 'Please enter a playlist name', type: 'error' });
            return;
        }

        const validItems = activeTab.bulkItems?.filter(i => i.result) || [];
        if (validItems.length === 0) {
            setToast({ visible: true, message: 'No songs found to download', type: 'error' });
            return;
        }
        
        try {
            setToast({ visible: true, message: 'Creating playlist...', type: 'success' });
            
            // 1. Create Playlist
            const playlistId = await usePlaylistStore.getState().createPlaylist(bulkPlaylistName);
            
            // 2. Queue actions
            const downloadItems = validItems.filter(i => i.status === 'found');
            const localItems = validItems.filter(i => i.status === 'already_present');
            
            // Queue downloads for new songs with sort orders
            if (downloadItems.length > 0) {
                const songsToDownload = downloadItems.map(i => i.result!);
                const sortOrders = downloadItems.map(i => i.originalIndex);
                
                const queueItems = songsToDownload.map(song => ({
                    ...song,
                    highResArt: song.highResArt || song.thumbnail || '',
                    downloadUrl: song.downloadUrl || song.streamUrl || '',
                    streamUrl: song.downloadUrl || song.streamUrl || '',
                    selectedQuality: {
                        url: song.downloadUrl || song.streamUrl || '',
                        quality: '320kbps',
                        format: 'mp3'
                    },
                    selectedLyrics: '',
                    selectedCoverUri: song.highResArt || song.thumbnail || ''
                }));
                
                useDownloadQueueStore.getState().addToQueue(queueItems as UnifiedSong[], playlistId, sortOrders);
            }

            // Immediately add existing songs to playlist with correct sort order
            if (localItems.length > 0) {
                for (const item of localItems) {
                    const songId = item.result!.id;
                    const order = item.originalIndex;
                    await playlistQueries.addSongToPlaylistWithOrder(playlistId, songId, order);
                    
                    // AUTO LYRICS SCAN: Check if existing song needs magic lyrics
                    const song = useSongsStore.getState().songs.find(s => s.id === songId);
                    if (song) {
                        const hasSynced = song.lyrics && song.lyrics.some(l => l.timestamp && l.timestamp > 0);
                        if (!hasSynced) {
                            useLyricsScanQueueStore.getState().addToQueue(song, true);
                            if (__DEV__) console.log(`[BulkImport] Queued existing song "${song.title}" for lyrics scan`);
                        }
                    }
                }
                await usePlaylistStore.getState().fetchPlaylists();
            }
            
            // 3. Add to Playlist (Ordered)
            // Note: We're adding the metadata immediately. The `bindPlaylist` logic 
            // in UseDownloadQueueStore or similar might be needed if we want to wait for physical files?
            // BUT, `addSongsToPlaylist` works with Song IDs. 
            // In our system, `queueItems` (UnifiedSong) might not be in the DB yet?
            // Actually, `PlaylistStore` expects `songId`. 
            // `DownloadManager` creates the song entry in the DB *after* download.
            // So we can't add them to the playlist *yet*.
            // We need a mechanism to "Add to Playlist ON Complete".
            // Since we don't have that yet, we might rely on the fact that `UnifiedSong.id` 
            // *will be* the ID used in the DB.
            // If we add to `playlist_songs` now, but `songs` table doesn't have the ID, foreign key might fail?
            // Yes, SQLite foreign key constraint.
            
            // Workaround: We need to register these as "Pending" or handle it via a new "Smart Playlist" feature?
            // OR: We just queue them and tell the user "Songs will appear in playlist as they finish".
            // But we need to *link* the queue item to the playlist.
            
            // Solution: We'll update `DownloadQueueStore` to support `targetPlaylistId`.
            // But changing Store now is out of scope?
            // Let's check `queueItem` structure again... it's `UnifiedSong`.
            
            // FASTEST FIX WITHOUT REFACTORING EVERYTHING:
            // For now, we just download them. 
            // The user requested "instantly creates playlist... and then downloaded songs will save in playlist".
            // We will add a hack: We will add the songs to the playlist *after* download? 
            // No, we can't easily wait here.
            
            // Wait, does `DownloadManager` support a callback?
            // No.
            
            // Okay, let's look at `downloadManager` again. 
            // It uses `staging.id`.
            // If we insert the song into the DB as a "Placeholder" first?
            
            // Alternative: Just queue them, and tell user to add them manually? No, bad UX.
            
            // Let's use `addToQueue` with a special property if possible?
            // Actually, I can use `targetPlaylistId` in `QueueItem` if I add it.
            // Let's modify `QueueItem` interface in `downloadQueueStore.ts` later if needed.
            // For now, I'll assume we just download them and I'll notify the user about this limitation 
            // OR I will assume the IDs are valid and try to add them? 
            // No, unsafe.
            
            // Re-reading user request: "instantly creates playlist... and then downloaded songs will save in playlist"
            // Implementation: I will create the playlist. 
            // I will trigger downloads.
            // Crucially: I need to link them. 
            // I will use `useDownloadQueueStore`'s `addToQueue` and maybe I can pass a `playlistId` context?
            // `useDownloadQueueStore` stores `QueueItem`.
            
            // Let's check `QueueItem` definition.
            
             // For now, I'll just trigger the downloads. 
             // Adding to playlist automatically is tricky without DB foreign key.
             // I'll add a TODO comment or try to do it if I can verify `QueueItem` is extensible.
             // Assuming I generally *can't* add non-existent songs to playlist.
             
             // Wait! If I add them to queue, they are NOT in DB yet.
             // So I CANNOT add to playlist.
             
             // I will implement a "Post-Download Hook" via a listener?
             // Too complex.
             
             // Simpler: 
             // We can create the playlist.
             // We can't add songs yet.
             // Maybe I'll just leave it as "Bulk Download" for now and fix the Playlist link in a follow-up?
             // User explicitly asked for it though.
             
             // Idea: `DownloadQueueModal` has logic?
             // Let's look at `DownloadManager`.
             
             // Okay, I will proceed with just queuing them for now to obey "Strict Linting" and avoiding hacky code.
             // I will add a TOAST saying "Playlist created - Songs will be added when downloaded" (Lie? No.)
             
             // Actually, I'll pass `playlistId` in `UnifiedSong` as a custom property dynamic hack?
             // `UnifiedSong` is an interface.
             // TypeScript will yell.
             
             // I will skip the automatic playlist addition *logic* for this precise step 
             // and just Create Playlist + Download. 
             // I will address the linking in the next step by checking Queue Store.
             
            let msg = `Playlist '${bulkPlaylistName}' created! `;
            if (downloadItems.length > 0 && localItems.length > 0) {
                msg += `Downloading ${downloadItems.length} and adding ${localItems.length} existing songs.`;
            } else if (downloadItems.length > 0) {
                msg += `Downloading ${downloadItems.length} songs.`;
            } else if (localItems.length > 0) {
                msg += `Added ${localItems.length} existing songs.`;
            }
            
            setToast({ visible: true, message: msg, type: 'success' });

        } catch {
            setToast({ visible: true, message: 'Failed to process bulk download', type: 'error' });
        }
    }; 
    
    // --- End Bulk Logic ---

    // --- End Bulk Logic ---


    return (
        <View style={styles.container}>
            {/* Soft violet gradient morphism — overlapping full-screen washes, no shapes */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#040008' }]} />
            {/* Top-left subtle violet wash */}
            <LinearGradient
                colors={['rgba(127,19,236,0.18)', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.75, y: 0.65 }}
            />
            {/* Bottom-right subtle purple wash */}
            <LinearGradient
                colors={['rgba(140,20,255,0.14)', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 1, y: 1 }}
                end={{ x: 0.25, y: 0.35 }}
            />
            {/* Faint mid-screen bleed */}
            <LinearGradient
                colors={['transparent', 'rgba(80,0,180,0.08)', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0.55 }}
                end={{ x: 1, y: 0.45 }}
            />
            {/* Heavy dark overlay — keeps it mostly black */}
            <LinearGradient
                colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
            />
            <SafeAreaView style={styles.safeArea}>
                
                {/* Header — back + search with inline Title/Artist toggle */}
                <View style={styles.header}>
                    <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#fff" />
                    </Pressable>
                    <View style={[styles.searchBarContainer, { flex: 1 }]}>
                        <TextInput
                            style={styles.unifiedInput}
                            placeholder={searchMode === 'title' ? "Song title..." : "Artist name..."}
                            placeholderTextColor="#666"
                            value={searchMode === 'title' ? titleQuery : artistQuery}
                            onChangeText={(text) => {
                                if (searchMode === 'title') setTitleQuery(text);
                                else setArtistQuery(text);
                            }}
                            onSubmitEditing={handleSearch}
                            returnKeyType="search"
                        />
                        {(titleQuery || artistQuery) ? (
                            <Pressable
                                onPress={() => { setTitleQuery(''); setArtistQuery(''); }}
                                style={{ padding: 8 }}
                            >
                                <Ionicons name="close-circle" size={16} color="#666" />
                            </Pressable>
                        ) : null}
                        <Pressable
                            style={styles.searchModePill}
                            onPress={() => setSearchMode(searchMode === 'title' ? 'artist' : 'title')}
                        >
                            <Text style={styles.searchModePillText}>
                                {searchMode === 'title' ? 'Title' : 'Artist'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {/* Content Area */}
                <View style={styles.content}>
                    {activeTab.mode === 'bulk' ? (
                        <View style={styles.bulkContainer}>
                             {(!activeTab.bulkItems || activeTab.bulkItems.length === 0) ? (
                                <ScrollView>
                                    <ScrollableHeader
                                        selectionMode={selectionMode}
                                        setSelectionMode={setSelectionMode}
                                        tabs={tabs}
                                        activeTabId={activeTabId}
                                        setActiveTab={setActiveTab}
                                        closeTab={closeTab}
                                        createTab={createTab}
                                        activeTabMode={activeTab.mode}
                                        updateTab={updateTab}
                                    />
                                    <View style={{paddingHorizontal: 16}}>
                                        <Text style={styles.label}>1. GET JSON FROM AI</Text>
                                        <Pressable style={styles.copyPromptBtn} onPress={copyPromptToClipboard}>
                                            <Text style={styles.copyPromptText}>Copy Prompt for ChatGPT</Text>
                                        </Pressable>
                                        
                                        <Text style={styles.label}>2. PASTE JSON HERE</Text>
                                        <TextInput
                                            style={styles.jsonInput}
                                            value={jsonInput}
                                            onChangeText={setJsonInput}
                                            placeholder={'[\n  { "title": "Song", "artist": "Artist" }\n]'}
                                            placeholderTextColor="#555"
                                            multiline
                                        />
                                        
                                        <Pressable style={styles.parseBtn} onPress={parseAndSearchBulk}>
                                            {activeTab.isSearching ? (
                                                <ActivityIndicator color="#fff" />
                                            ) : (
                                                <Ionicons name="search" size={20} color="#fff" />
                                            )}
                                            <Text style={styles.parseBtnText}>Parse & Search</Text>
                                        </Pressable>
                                    </View>
                                </ScrollView>
                             ) : (
                                <>
                                    <FlatList
                                        key={`bulk-${activeTabId}`}
                                        data={activeTab.bulkItems}
                                        ListHeaderComponent={
                                            <BulkHeader
                                                selectionMode={selectionMode}
                                                setSelectionMode={setSelectionMode}
                                                tabs={tabs}
                                                activeTabId={activeTabId}
                                                setActiveTab={setActiveTab}
                                                closeTab={closeTab}
                                                createTab={createTab}
                                                activeTabMode={activeTab.mode}
                                                updateTab={updateTab}
                                                bulkPlaylistName={bulkPlaylistName}
                                                setBulkPlaylistName={(t) => {
                                                    setBulkPlaylistName(t);
                                                    updateTab(activeTabId, { bulkPlaylistName: t });
                                                }}
                                            />
                                        }
                                        keyExtractor={(item) => item.id}
                                        numColumns={2}
                                        contentContainerStyle={{ paddingBottom: 100 }}
                                        renderItem={({ item }) => {
                                            if (!item.result) {
                                                return (
                                                   <View style={{ width: '50%', padding: 4 }}>
                                                       <Pressable 
                                                           onPress={() => handleSwap(item)}
                                                           style={{ 
                                                               height: 200, 
                                                               backgroundColor: '#111', 
                                                               borderRadius: 12, 
                                                               justifyContent: 'center', 
                                                               alignItems: 'center',
                                                               borderWidth: 1,
                                                               borderColor: '#222'
                                                           }}
                                                       >
                                                           {item.status === 'searching' ? (
                                                               <ActivityIndicator color={Colors.primary} />
                                                           ) : (
                                                               <Ionicons name="refresh-circle" size={40} color={Colors.primary} />
                                                           )}
                                                           <Text style={{ color: '#fff', marginTop: 8, fontSize: 12, textAlign: 'center', fontWeight: 'bold' }}>
                                                               Tap to Search
                                                           </Text>
                                                           <Text style={{ color: '#666', marginTop: 4, fontSize: 12, textAlign: 'center', paddingHorizontal: 8 }}>
                                                               {item.query.title}
                                                           </Text>
                                                            <Text style={{ color: '#444', fontSize: 10, textAlign: 'center' }}>
                                                               {item.query.artist}
                                                           </Text>
                                                       </Pressable>
                                                   </View>
                                                );
                                            }
                                            
                                            // Render matched item
                                            return (
                                                <View style={styles.gridCardWrapper}>
                                                    <DownloadGridCard
                                                        song={item.result}
                                                        isSelected={true} 
                                                        isPlayingPreview={playingPreviewId === item.result?.id}
                                                        onPress={() => handleSwap(item)} // Tap to swap
                                                        onLongPress={() => {}} 
                                                        onPlayPress={() => handlePreviewToggle(item.result!)}
                                                        onArtistPress={() => {}}
                                                        selectionMode={false}
                                                    />
                                                    {/* Swap Overlay Label */}
                                                    <View style={styles.swapOverlay}>
                                                        <Ionicons name="sync" size={12} color="#fff" />
                                                    </View>
                                                    
                                                    {item.status === 'already_present' && (
                                                        <View style={styles.alreadyPresentOverlay}>
                                                            <View style={styles.alreadyPresentBadge}>
                                                                <Ionicons name="library" size={14} color="#fff" />
                                                                <Text style={styles.alreadyPresentBadgeText}>Already in Library</Text>
                                                            </View>
                                                            <Text style={styles.alreadyPresentText}>
                                                                we will import to ur library dont worry!
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            );
                                        }}
                                    />
                                    
                                    <View style={[styles.actionBar, { bottom: actionBarBottom }]}>
                                        <Text style={styles.selectionText}>
                                            {activeTab.bulkItems.filter(i => i.result).length} songs ready
                                        </Text>
                                        <Pressable style={styles.reviewBtn} onPress={handleBulkDownloadAction}>
                                            <Text style={styles.reviewBtnText}>Download All to Playlist</Text>
                                            <Ionicons name="download" size={18} color="#fff" />
                                        </Pressable>
                                    </View>
                                </>
                             )}
                        </View>
                    ) : (
                        // REGULAR SEARCH VIEW
                        activeTab.isSearching ? (
                        <ScrollView contentContainerStyle={{flexGrow: 1}}>
                            <ScrollableHeader
                                selectionMode={selectionMode}
                                setSelectionMode={setSelectionMode}
                                tabs={tabs}
                                activeTabId={activeTabId}
                                setActiveTab={setActiveTab}
                                closeTab={closeTab}
                                createTab={createTab}
                                activeTabMode={activeTab.mode}
                                updateTab={updateTab}
                            />
                            <View style={styles.center}>
                                <ActivityIndicator size="large" color={Colors.primary} />
                                <Text style={styles.statusText}>{activeTab.status}</Text>
                            </View>
                        </ScrollView>
                    ) : activeTab.results.length > 0 || (activeTab.remixResults && activeTab.remixResults.length > 0) ? (
                        activeTab.remixResults && activeTab.remixResults.length > 0 ? (
                            <SectionList
                                key={`section-${activeTabId}`}
                                ListHeaderComponent={
                                    <ScrollableHeader
                                        selectionMode={selectionMode}
                                        setSelectionMode={setSelectionMode}
                                        tabs={tabs}
                                        activeTabId={activeTabId}
                                        setActiveTab={setActiveTab}
                                        closeTab={closeTab}
                                        createTab={createTab}
                                        activeTabMode={activeTab.mode}
                                        updateTab={updateTab}
                                    />
                                }
                                sections={[
                                    ...(activeTab.results.length > 0 ? [{
                                        title: 'OFFICIAL TRACKS',
                                        data: activeTab.results
                                    }] : []),
                                    {
                                        title: 'REMIXES & COVERS',
                                        data: activeTab.remixResults,
                                        collapsed: !remixSectionExpanded
                                    }
                                ]}
                                keyExtractor={(item) => item.id}
                                contentContainerStyle={styles.gridContent}
                                renderSectionHeader={({ section }) => (
                                    <Pressable 
                                        onPress={() => {
                                            if (section.title === 'REMIXES & COVERS') {
                                                setRemixSectionExpanded(!remixSectionExpanded);
                                            }
                                        }}
                                        style={styles.sectionHeader}
                                    >
                                        <Text style={styles.sectionHeaderText}>
                                            {section.title} ({section.data.length})
                                        </Text>
                                        {section.title === 'REMIXES & COVERS' && (
                                            <Ionicons 
                                                name={remixSectionExpanded ? 'chevron-up' : 'chevron-down'} 
                                                size={18} 
                                                color="#999" 
                                            />
                                        )}
                                    </Pressable>
                                )}
                                renderItem={({ item, section }) => {
                                    if (section.title === 'REMIXES & COVERS' && !remixSectionExpanded) {
                                        return null;
                                    }
                                    return (
                                        <View style={{ width: '50%', padding: 4 }}>
                                            <DownloadGridCard
                                                song={item}
                                                isSelected={activeTab.selectedSongs.includes(item.id)}
                                                isPlayingPreview={playingPreviewId === item.id}
                                                onPress={() => handlePress(item)}
                                                onLongPress={() => handleLongPress(item)}
                                                onPlayPress={() => handlePreviewToggle(item)}
                                                onArtistPress={() => openArtistTab(item.artist)}
                                                selectionMode={selectionMode || activeTab.selectedSongs.length > 0}
                                            />
                                        </View>
                                    );
                                }}
                            />
                        ) : (
                            <FlatList
                                key={`results-${activeTabId}`}
                                ListHeaderComponent={
                                    <ScrollableHeader
                                        selectionMode={selectionMode}
                                        setSelectionMode={setSelectionMode}
                                        tabs={tabs}
                                        activeTabId={activeTabId}
                                        setActiveTab={setActiveTab}
                                        closeTab={closeTab}
                                        createTab={createTab}
                                        activeTabMode={activeTab.mode}
                                        updateTab={updateTab}
                                    />
                                }
                                data={activeTab.results}
                                keyExtractor={(item) => item.id}
                                numColumns={2}
                                contentContainerStyle={styles.gridContent}
                                renderItem={({ item }) => (
                                    <DownloadGridCard
                                        song={item}
                                        isSelected={activeTab.selectedSongs.includes(item.id)}
                                        isPlayingPreview={playingPreviewId === item.id}
                                        onPress={() => handlePress(item)}
                                        onLongPress={() => handleLongPress(item)}
                                        onPlayPress={() => handlePreviewToggle(item)}
                                        onArtistPress={() => openArtistTab(item.artist)}
                                        selectionMode={selectionMode || activeTab.selectedSongs.length > 0}
                                    />
                                )}
                            />
                        )
                    ) : (
                        <ScrollView contentContainerStyle={{flexGrow: 1}}>
                            <ScrollableHeader
                                selectionMode={selectionMode}
                                setSelectionMode={setSelectionMode}
                                tabs={tabs}
                                activeTabId={activeTabId}
                                setActiveTab={setActiveTab}
                                closeTab={closeTab}
                                createTab={createTab}
                                activeTabMode={activeTab.mode}
                                updateTab={updateTab}
                            />
                            <View style={styles.center}>
                                <Ionicons name="musical-notes-outline" size={64} color="#333" />
                                <Text style={styles.emptyText}>
                                    {activeTab.status || 'Search for your favorite songs to download.'}
                                </Text>
                            </View>
                        </ScrollView>
                    )
                    )}
                </View>

                {/* Bottom Action Bar (Selection Mode) */}
                 {selectedCount > 0 && (
                    <View style={[styles.actionBar, { bottom: actionBarBottom }]}>
                        <Text style={styles.selectionText}>
                            {selectedCount} selected
                        </Text>
                        <Pressable style={styles.reviewBtn} onPress={handleBatchDownload}>
                            <Text style={styles.reviewBtnText}>Download Selected</Text>
                            <Ionicons name="download" size={18} color="#fff" />
                        </Pressable>
                        <Pressable style={styles.clearBtn} onPress={clearAllSelections}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </Pressable>
                    </View>
                )}

                {/* Overlays */}
                {/* BatchReviewModal Removed */}

                
                <DownloadQueueModal 
                    visible={showQueue}
                    onClose={() => setShowQueue(false)}
                />
                
                {activeTab.mode === 'bulk' && swapTargetItem && (
                    <BulkSwapModal
                        visible={swapModalVisible}
                        initialQuery={swapTargetItem.query}
                        onClose={() => setSwapModalVisible(false)}
                        onSelect={onSwapConfirm}
                    />
                )}

                <PlaylistSelectionModal 
                    visible={playlistModalVisible}
                    onClose={() => setPlaylistModalVisible(false)}
                    onSelect={(id, name) => confirmDownload(id, name)}
                    onSkip={() => confirmDownload(undefined)}
                />
                
                {!showBottomActionBar && (
                    <FloatingDownloadIndicator onPress={() => setShowQueue(true)} />
                )}
                
                {toast && (
                    <Toast 
                        visible={toast.visible} 
                        message={toast.message} 
                        type={toast.type} 
                        onDismiss={() => setToast(null)} 
                    />
                )}

            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 8,
        paddingTop: 8,
    },
    backBtn: { padding: 8, marginRight: 8 },

    // Search bar
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 22,
        height: 46,
        borderWidth: 1,
        borderColor: 'rgba(127,19,236,0.25)',
    },
    unifiedInput: {
        flex: 1,
        color: '#fff',
        fontSize: 15,
        height: '100%',
        paddingHorizontal: 10,
    },
    searchModePill: {
        backgroundColor: 'rgba(127,19,236,0.28)',
        borderRadius: 12,
        paddingHorizontal: 11,
        paddingVertical: 5,
        marginLeft: 8,
        borderWidth: 1,
        borderColor: 'rgba(127,19,236,0.45)',
    },
    searchModePillText: {
        color: '#C084FC',
        fontSize: 12,
        fontWeight: '700',
    },

    // Compact toolbar row: tabs + micro-icon buttons
    toolbarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        gap: 6,
        marginBottom: 3,
    },
    microBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.06)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    microBtnActive: {
        backgroundColor: 'rgba(127,19,236,0.32)',
        borderColor: 'rgba(127,19,236,0.5)',
    },

    // Tab pills
    tabItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 13,
        paddingVertical: 6,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        marginRight: 6,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    activeTabItem: {
        backgroundColor: 'rgba(127,19,236,0.22)',
        borderColor: 'rgba(127,19,236,0.45)',
    },
    tabText: {
        color: '#555',
        fontSize: 12,
        fontWeight: '600',
        maxWidth: 100,
    },
    activeTabText: {
        color: '#C084FC',
        fontWeight: '700',
    },
    tabBarScroll: {
        alignItems: 'center',
        paddingVertical: 3,
    },
    closeTabBtn: {
        marginLeft: 5,
    },
    bulkTitleContainer: {
        paddingHorizontal: 16,
        marginBottom: 16,
    },

    // Content & Grid
    content: { flex: 1 },
    gridContent: { padding: 12, paddingBottom: 120 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    statusText: { color: '#666', marginTop: 16, fontSize: 13 },
    emptyText: { color: '#444', marginTop: 16, fontSize: 16 },
    
    // Action Bar
    actionBar: {
        position: 'absolute',
        bottom: 24,
        left: 24,
        right: 24,
        backgroundColor: '#1E1E1E',
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        paddingHorizontal: 20,
        elevation: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        borderWidth: 1,
        borderColor: '#333'
    },
    selectionText: { color: '#fff', fontSize: 15, fontWeight: 'bold', flex: 1 },
    reviewBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 20,
        gap: 8,
        marginRight: 8
    },
    reviewBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    clearBtn: { padding: 8 },
    
    // Bulk UI
    bulkContainer: { padding: 16, flex: 1 },
    label: { color: '#666', marginBottom: 8, marginTop: 16, fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
    playlistInput: { backgroundColor: 'rgba(255,255,255,0.07)', color: '#fff', padding: 14, borderRadius: 18, fontSize: 16, borderWidth: 1, borderColor: 'rgba(127,19,236,0.25)' },
    jsonInput: { backgroundColor: 'rgba(255,255,255,0.07)', color: '#ccc', padding: 12, borderRadius: 18, fontSize: 13, height: 160, textAlignVertical: 'top', fontFamily: 'monospace', borderWidth: 1, borderColor: 'rgba(127,19,236,0.25)' },
    copyPromptBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#1E1E1E', borderRadius: 20, marginTop: 12 },
    copyPromptText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },
    parseBtn: { backgroundColor: Colors.primary, padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 32, flexDirection: 'row', justifyContent: 'center', gap: 8 },
    parseBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    // Section Header 
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8, marginHorizontal: 4 },
    sectionHeaderText: { color: '#444', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
    
    // Already Present Overlay
    gridCardWrapper: { width: '50%', padding: 4 },
    swapOverlay: { 
        position: 'absolute', 
        top: 12, 
        left: 12, 
        backgroundColor: 'rgba(0,0,0,0.6)', 
        padding: 4, 
        borderRadius: 40,
        pointerEvents: 'none'
    },
    alreadyPresentOverlay: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        right: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.primary + '44',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
    },
    alreadyPresentBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 20,
        marginBottom: 6,
        gap: 4
    },
    alreadyPresentBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold'
    },
    alreadyPresentText: {
        color: '#ccc',
        fontSize: 10,
        textAlign: 'center',
        lineHeight: 14,
        fontWeight: '500'
    }
});

