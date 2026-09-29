import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
    View, Text, StyleSheet, TextInput, Pressable,
    ActivityIndicator, ScrollView, FlatList, SectionList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_CLEARANCE } from '../navigation/tabs';

import { Glass, Radius, Signal, Space } from '../constants/allegraTheme';
import { Tactile } from '../components/allegra/motion';
import { PrimaryButton, GlassButton } from '../components/allegra/home';
import * as Haptics from '../utils/haptics';
import { Toast } from '../components/Toast';
import { MultiSourceSearchService } from '../services/MultiSourceSearchService';
import { UnifiedSong } from '../types/song';
import { useSongsStore } from '../store/songsStore';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { useDownloaderTabStore, SearchTab as SearchTabState } from '../store/downloaderTabStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { DownloadGridCard } from '../components/DownloadGridCard';
import { BulkSwapModal } from '../components/BulkSwapModal';
import { PlaylistSelectionModal } from '../components/PlaylistSelectionModal';
import * as Clipboard from 'expo-clipboard';
import { BulkItem } from '../store/downloaderTabStore';
import stringSimilarity from 'string-similarity';

/** The collapsible results section (its header used to compare against an all-caps copy and never opened). */
const REMIXES = 'Remixes and covers';

// --- Sub-components ---

interface ScrollableHeaderProps {
    tabs: SearchTabState[];
    activeTabId: string;
    setActiveTab: (id: string) => void;
    closeTab: (id: string) => void;
    createTab: (query: string) => void;
    activeTabMode: 'search' | 'bulk';
    updateTab: (id: string, updates: Partial<SearchTabState>) => void;
}

const ScrollableHeader: React.FC<ScrollableHeaderProps> = memo(({
    tabs, activeTabId, setActiveTab, closeTab, createTab,
    activeTabMode, updateTab
}) => {
    return (
    <View style={styles.toolbarRow}>
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
                        {tab.query || 'New search'}
                    </Text>
                    {tabs.length > 1 && (
                        <Pressable onPress={() => closeTab(tab.id)} hitSlop={8} style={styles.closeTabBtn} accessibilityRole="button" accessibilityLabel="Close this search">
                            <Ionicons name="close" size={12} color={Signal.inkMuted} />
                        </Pressable>
                    )}
                </Pressable>
            ))}
        </ScrollView>

        <Tactile onPress={() => { Haptics.selectionAsync().catch(() => {}); createTab(''); }} pressScale={0.9} accessibilityRole="button" accessibilityLabel="New search" style={styles.microBtn}>
            <Ionicons name="add" size={19} color={Signal.ink} />
        </Tactile>

        <Tactile
            onPress={() => { Haptics.selectionAsync().catch(() => {}); updateTab(activeTabId, { mode: activeTabMode === 'bulk' ? 'search' : 'bulk' }); }}
            pressScale={0.9}
            accessibilityRole="button"
            accessibilityLabel={activeTabMode === 'bulk' ? 'Back to search' : 'Add a whole list of songs'}
            style={[styles.microBtn, activeTabMode === 'bulk' && styles.microBtnActive]}
        >
            <Ionicons name={activeTabMode === 'bulk' ? 'layers' : 'layers-outline'} size={18} color={activeTabMode === 'bulk' ? Signal.waveInk : Signal.inkSoft} />
        </Tactile>
    </View>
    );
});

interface BulkHeaderProps extends ScrollableHeaderProps {
    bulkPlaylistName: string;
    setBulkPlaylistName: (name: string) => void;
}

const BulkHeader: React.FC<BulkHeaderProps> = memo((props) => (
    <View>
        <ScrollableHeader {...props} />
        <View style={styles.bulkTitleContainer}>
            <Text style={styles.label}>Name your playlist</Text>
            <TextInput
                style={styles.playlistInput}
                value={props.bulkPlaylistName}
                onChangeText={props.setBulkPlaylistName}
                placeholder="Playlist name"
                placeholderTextColor={Signal.inkFaint}
            />
        </View>
    </View>
));

// --- Main SearchTab ---

interface AudioDownloaderSearchTabProps {
    autoSearchQuery?: string;
    autoDownload?: boolean;
    onDownloadStarted?: () => void;
}

// Isolated: no props — reads from stores directly, never re-renders on queue progress
export const AudioDownloaderSearchTab = memo(({ autoSearchQuery, autoDownload, onDownloadStarted }: AudioDownloaderSearchTabProps) => {

    // --- Store ---
    const { tabs, activeTabId, setActiveTab, closeTab, createTab, updateTab, clearAllSelections, getSelectedSongs } = useDownloaderTabStore(
        useShallow(s => ({
            tabs: s.tabs,
            activeTabId: s.activeTabId,
            setActiveTab: s.setActiveTab,
            closeTab: s.closeTab,
            createTab: s.createTab,
            updateTab: s.updateTab,
            clearAllSelections: s.clearAllSelections,
            getSelectedSongs: s.getSelectedSongs,
        })),
    );
    const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];

    // --- Derived from activeTab ---
    const titleQuery = activeTab.titleQuery;
    const artistQuery = activeTab.artistQuery;
    const setTitleQuery = useCallback((text: string) => updateTab(activeTabId, { titleQuery: text }), [activeTabId, updateTab]);
    const setArtistQuery = useCallback((text: string) => updateTab(activeTabId, { artistQuery: text }), [activeTabId, updateTab]);
    const bulkPlaylistName = activeTab.bulkPlaylistName;
    const setBulkPlaylistName = useCallback((name: string) => updateTab(activeTabId, { bulkPlaylistName: name }), [activeTabId, updateTab]);
    const selectedCount = (activeTab.selectedSongs ?? []).length;
    const readyBulkCount = (activeTab.bulkItems ?? []).filter(i => i.result !== null).length;

    const insets = useSafeAreaInsets();

    // --- Local state ---
    const [searchMode, setSearchMode] = useState<'title' | 'artist'>('title');
    const [jsonInput, setJsonInput] = useState('');
    const [remixSectionExpanded, setRemixSectionExpanded] = useState(false);
    const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
    const [swapModalVisible, setSwapModalVisible] = useState(false);
    const [swapTargetItem, setSwapTargetItem] = useState<BulkItem | null>(null);
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' } | null>(null);
    const [cyclingItemId, setCyclingItemId] = useState<string | null>(null);

    // --- Refs ---
    const previewSoundRef = useRef<AudioPlayer | null>(null);
    const downloadContextRef = useRef<'selected' | 'bulk'>('selected');
    const hasAutoSearchedRef = useRef(false);
    const hasAutoDownloadedRef = useRef(false);

    // --- Other stores ---
    const existingSongs = useSongsStore(state => state.songs);
    // Just the action: the whole store would re-render this tab on every download tick.
    const addToQueue = useDownloadQueueStore(s => s.addToQueue);

    // --- Handlers ---
    const runSearchWithQuery = useCallback(async (q: string, mode: 'title' | 'artist' = 'title') => {
        if (!q.trim()) return;
        updateTab(activeTabId, { isSearching: true, status: 'Searching...', results: [], remixResults: [] });
        try {
            const results = await MultiSourceSearchService.searchMusic(
                q,
                mode === 'artist' ? q : undefined,
                (status) => updateTab(activeTabId, { status })
            );
            updateTab(activeTabId, { isSearching: false, results, status: '' });
        } catch {
            updateTab(activeTabId, { isSearching: false, status: 'Search failed' });
        }
    }, [activeTabId, updateTab]);

    const handleSearch = useCallback(() => {
        const query = searchMode === 'title' ? titleQuery.trim() : artistQuery.trim();
        runSearchWithQuery(query, searchMode);
    }, [searchMode, titleQuery, artistQuery, runSearchWithQuery]);

    const handlePreviewToggle = useCallback(async (song: UnifiedSong) => {
        // expo-audio has no stop(): remove() tears the player down outright.
        if (playingPreviewId === song.id) {
            previewSoundRef.current?.remove();
            previewSoundRef.current = null;
            setPlayingPreviewId(null);
            return;
        }
        if (previewSoundRef.current) {
            previewSoundRef.current.remove();
            previewSoundRef.current = null;
        }
        const url = song.streamUrl || song.downloadUrl;
        if (!url) return;
        try {
            const sound = createAudioPlayer({ uri: url });
            previewSoundRef.current = sound;
            sound.play();
            setPlayingPreviewId(song.id);
            sound.addListener('playbackStatusUpdate', s => {
                if (s.isLoaded && s.didJustFinish) { setPlayingPreviewId(null); previewSoundRef.current = null; }
            });
        } catch {}
    }, [playingPreviewId]);

    // A tap anywhere on a result ticks it; the bar at the bottom downloads what is ticked.
    const handlePress = useCallback((item: UnifiedSong) => {
        Haptics.selectionAsync().catch(() => {});
        useDownloaderTabStore.getState().toggleSelection(activeTabId, item.id);
    }, [activeTabId]);

    const handleBatchDownload = useCallback(() => {
        if (selectedCount === 0) return;
        downloadContextRef.current = 'selected';
        setPlaylistModalVisible(true);
    }, [selectedCount]);

    const handleBulkDownloadAction = useCallback(() => {
        if (readyBulkCount === 0) return;
        downloadContextRef.current = 'bulk';
        setPlaylistModalVisible(true);
    }, [readyBulkCount]);

    const confirmDownload = useCallback((playlistId?: string, _playlistName?: string) => {
        setPlaylistModalVisible(false);
        const ctx = downloadContextRef.current;
        if (ctx === 'selected') {
            const selected = getSelectedSongs();
            addToQueue(selected.map(s => s.song), playlistId);
            clearAllSelections();
        } else if (ctx === 'bulk') {
            const songs = (activeTab.bulkItems ?? []).filter(i => i.result !== null).map(i => i.result!);
            addToQueue(songs, playlistId);
        }
        onDownloadStarted?.();
    }, [getSelectedSongs, addToQueue, clearAllSelections, activeTab.bulkItems, onDownloadStarted]);

    const openArtistTab = useCallback((artist: string) => { createTab(artist); }, [createTab]);

    const handleSwap = useCallback((item: BulkItem) => {
        setSwapTargetItem(item);
        setSwapModalVisible(true);
    }, []);

    const onSwapConfirm = useCallback((song: UnifiedSong) => {
        if (!swapTargetItem) return;
        updateTab(activeTabId, {
            bulkItems: (activeTab.bulkItems ?? []).map(i =>
                i.id === swapTargetItem.id ? { ...i, result: song, status: 'found' as const } : i
            )
        });
        setSwapModalVisible(false);
        setSwapTargetItem(null);
    }, [swapTargetItem, activeTab.bulkItems, activeTabId, updateTab]);

    const handleCycleNextCandidate = useCallback(async (item: BulkItem) => {
        setCyclingItemId(item.id);
        try {
            const results = await MultiSourceSearchService.searchMusic(`${item.query.artist} ${item.query.title}`);
            const next = results.find(r => r.id !== item.result?.id) ?? results[0];
            if (next) {
                const fresh = () => useDownloaderTabStore.getState().tabs.find(t => t.id === activeTabId)?.bulkItems ?? [];
                updateTab(activeTabId, { bulkItems: fresh().map(i => i.id === item.id ? { ...i, result: next, status: 'found' as const } : i) });
            }
        } catch {}
        setCyclingItemId(null);
    }, [activeTabId, updateTab]);

    const parseAndSearchBulk = useCallback(async () => {
        try {
            const parsed: { title: string; artist: string }[] = JSON.parse(jsonInput);
            if (!Array.isArray(parsed)) throw new Error();
            const items: BulkItem[] = parsed.map((entry, i) => ({
                id: `bulk_${Date.now()}_${i}`,
                query: { title: entry.title ?? '', artist: entry.artist ?? '' },
                result: null,
                status: 'pending' as const,
                originalIndex: i,
            }));
            updateTab(activeTabId, { mode: 'bulk', bulkItems: items, isSearching: true });
            for (const item of items) {
                const fresh = () => useDownloaderTabStore.getState().tabs.find(t => t.id === activeTabId)?.bulkItems ?? [];
                updateTab(activeTabId, { bulkItems: fresh().map(i => i.id === item.id ? { ...i, status: 'searching' as const } : i) });
                try {
                    const results = await MultiSourceSearchService.searchMusic(`${item.query.artist} ${item.query.title}`);
                    const best = results[0] ?? null;
                    const alreadyIn = best && existingSongs.some(s => stringSimilarity.compareTwoStrings(s.title, best.title) > 0.85);
                    const status = best ? (alreadyIn ? 'already_present' as const : 'found' as const) : 'not_found' as const;
                    updateTab(activeTabId, { bulkItems: fresh().map(i => i.id === item.id ? { ...i, result: best, status } : i) });
                } catch {
                    updateTab(activeTabId, { bulkItems: fresh().map(i => i.id === item.id ? { ...i, status: 'not_found' as const } : i) });
                }
            }
            updateTab(activeTabId, { isSearching: false });
        } catch {
            setToast({ visible: true, message: 'That list is not valid. Paste a list like [{"title": "Song", "artist": "Artist"}]', type: 'error' });
        }
    }, [jsonInput, activeTabId, existingSongs, updateTab]);

    const copyPromptToClipboard = useCallback(async () => {
        await Clipboard.setStringAsync('Return a JSON array: [{"title": "Song Name", "artist": "Artist Name"}]');
        setToast({ visible: true, message: 'Prompt copied', type: 'success' });
    }, []);

    // --- Auto-search / auto-download from voice ---
    useEffect(() => {
        if (autoSearchQuery && !hasAutoSearchedRef.current) {
            hasAutoSearchedRef.current = true;
            setSearchMode('title');
            setTitleQuery(autoSearchQuery);
            runSearchWithQuery(autoSearchQuery, 'title');
        }
    }, [autoSearchQuery, setTitleQuery, runSearchWithQuery]);

    useEffect(() => {
        if (autoDownload && activeTab.results.length > 0 && !hasAutoDownloadedRef.current) {
            hasAutoDownloadedRef.current = true;
            addToQueue([activeTab.results[0]]);
            setToast({ visible: true, message: `Added ${activeTab.results[0].title} to download queue`, type: 'success' });
        }
    }, [autoDownload, activeTab.results, addToQueue]);

    const sharedHeaderProps = {
        tabs, activeTabId, setActiveTab, closeTab, createTab,
        activeTabMode: activeTab.mode,
        updateTab,
    };

    return (
        <View style={styles.container}>
            {/* Search input */}
            <View style={styles.searchRow}>
                <View style={styles.searchBarContainer}>
                    <Ionicons name="search" size={18} color={Signal.inkMuted} style={styles.searchIcon} />
                    <TextInput
                        style={styles.unifiedInput}
                        placeholder={searchMode === 'title' ? 'Search by song title' : 'Search by artist'}
                        placeholderTextColor={Signal.inkFaint}
                        value={searchMode === 'title' ? titleQuery : artistQuery}
                        onChangeText={text => { if (searchMode === 'title') setTitleQuery(text); else setArtistQuery(text); }}
                        onSubmitEditing={handleSearch}
                        returnKeyType="search"
                        selectionColor={Signal.wave}
                    />
                    {(titleQuery || artistQuery) ? (
                        <Pressable onPress={() => { setTitleQuery(''); setArtistQuery(''); }} hitSlop={8} style={styles.clearSearchBtn} accessibilityRole="button" accessibilityLabel="Clear the search">
                            <Ionicons name="close-circle" size={18} color={Signal.inkMuted} />
                        </Pressable>
                    ) : null}
                    <Tactile
                        onPress={() => { Haptics.selectionAsync().catch(() => {}); setSearchMode(searchMode === 'title' ? 'artist' : 'title'); }}
                        pressScale={0.94}
                        accessibilityRole="button"
                        accessibilityLabel={`Searching by ${searchMode}. Tap to switch`}
                        style={styles.searchModePill}
                    >
                        <Text style={styles.searchModePillText}>{searchMode === 'title' ? 'Title' : 'Artist'}</Text>
                    </Tactile>
                </View>
                <Tactile
                    onPress={handleSearch}
                    disabled={!(searchMode === 'title' ? titleQuery : artistQuery).trim() || activeTab.isSearching}
                    pressScale={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="Search"
                    style={[styles.searchGo, (!(searchMode === 'title' ? titleQuery : artistQuery).trim() || activeTab.isSearching) && styles.searchGoOff]}
                >
                    {activeTab.isSearching
                        ? <ActivityIndicator size="small" color={Signal.waveInk} />
                        : <Ionicons name="arrow-forward" size={20} color={Signal.waveInk} />}
                </Tactile>
            </View>

            {/* Content */}
            <View style={styles.content}>
                {activeTab.mode === 'bulk' ? (
                    <View style={styles.bulkContainer}>
                        {(!activeTab.bulkItems || activeTab.bulkItems.length === 0) ? (
                            <ScrollView>
                                <ScrollableHeader {...sharedHeaderProps} />
                                <View style={{ paddingHorizontal: 16 }}>
                                    <Text style={styles.bulkTitle}>Add a whole list</Text>
                                    <Text style={styles.bulkHint}>Ask ChatGPT (or anyone) for your songs as a list, paste it below, and we find every one.</Text>
                                    <View style={styles.bulkStep}>
                                        <Text style={styles.label}>Get the song list</Text>
                                        <GlassButton icon="copy-outline" label="Copy the prompt for ChatGPT" onPress={copyPromptToClipboard} />
                                    </View>
                                    <View style={styles.bulkStep}>
                                        <Text style={styles.label}>Paste it here</Text>
                                        <TextInput
                                            style={styles.jsonInput}
                                            value={jsonInput}
                                            onChangeText={setJsonInput}
                                            placeholder={'[\n  { "title": "Song", "artist": "Artist" }\n]'}
                                            placeholderTextColor={Signal.inkFaint}
                                            multiline
                                            selectionColor={Signal.wave}
                                        />
                                    </View>
                                    <View style={styles.bulkGo}>
                                        <PrimaryButton
                                            icon="search"
                                            label={activeTab.isSearching ? 'Finding songs' : 'Find these songs'}
                                            onPress={parseAndSearchBulk}
                                            disabled={!jsonInput.trim() || !!activeTab.isSearching}
                                        />
                                    </View>
                                </View>
                            </ScrollView>
                        ) : (
                            <>
                                <FlatList
                                    key={`bulk-${activeTabId}`}
                                    data={activeTab.bulkItems}
                                    ListHeaderComponent={
                                        <BulkHeader
                                            {...sharedHeaderProps}
                                            bulkPlaylistName={bulkPlaylistName}
                                            setBulkPlaylistName={t => { setBulkPlaylistName(t); updateTab(activeTabId, { bulkPlaylistName: t }); }}
                                        />
                                    }
                                    keyExtractor={item => item.id}
                                    numColumns={2}
                                    contentContainerStyle={{ paddingBottom: 220 }}
                                    renderItem={({ item }) => {
                                        if (!item.result) {
                                            return (
                                                <View style={{ width: '50%', padding: 4 }}>
                                                    <View style={styles.bulkPlaceholder}>
                                                        {item.status === 'searching'
                                                            ? <ActivityIndicator color={Signal.wave} />
                                                            : <Ionicons name="refresh-circle" size={40} color={Signal.wave} />}
                                                        <Text style={styles.bulkPlaceholderTitle}>
                                                            {item.status === 'not_found' ? 'No match yet' : 'Ready to search'}
                                                        </Text>
                                                        <Text style={styles.bulkPlaceholderQuery}>{item.query.title}</Text>
                                                        <Text style={styles.bulkPlaceholderArtist}>{item.query.artist}</Text>
                                                        <Tactile onPress={() => handleSwap(item)} pressScale={0.94} accessibilityRole="button" accessibilityLabel={`Choose a match for ${item.query.title}`} style={styles.bulkActionBtn}>
                                                            <Ionicons name="search" size={14} color={Signal.ink} />
                                                            <Text style={styles.bulkActionBtnText}>Choose a match</Text>
                                                        </Tactile>
                                                    </View>
                                                </View>
                                            );
                                        }
                                        return (
                                            <View style={styles.gridCardWrapper}>
                                                <DownloadGridCard
                                                    song={item.result}
                                                    isSelected
                                                    isPlayingPreview={playingPreviewId === item.result?.id}
                                                    onPress={() => handleSwap(item)}
                                                    onLongPress={() => {}}
                                                    onPlayPress={() => handlePreviewToggle(item.result!)}
                                                    onArtistPress={() => {}}
                                                    selectionMode={false}
                                                />
                                                <View style={styles.swapOverlay}><Ionicons name="sync" size={12} color={Signal.ink} /></View>
                                                {item.status === 'already_present' && (
                                                    <View style={styles.alreadyPresentOverlay}>
                                                        <View style={styles.alreadyPresentBadge}>
                                                            <Ionicons name="checkmark-circle" size={14} color={Signal.wave} />
                                                            <Text style={styles.alreadyPresentBadgeText}>Already in your library</Text>
                                                        </View>
                                                        <Text style={styles.alreadyPresentText}>It will be added to the playlist without downloading again.</Text>
                                                    </View>
                                                )}
                                                <Tactile onPress={() => handleCycleNextCandidate(item)} pressScale={0.94} accessibilityRole="button" accessibilityLabel="Try the next match" style={[styles.bulkActionBtn, styles.bulkNextBtn]}>
                                                    {cyclingItemId === item.id
                                                        ? <ActivityIndicator color={Signal.ink} size="small" />
                                                        : (<>
                                                            <Ionicons name="play-skip-forward" size={14} color={Signal.ink} />
                                                            <Text style={styles.bulkActionBtnText}>Next match</Text>
                                                        </>)}
                                                </Tactile>
                                            </View>
                                        );
                                    }}
                                />
                                {activeTab.mode === 'bulk' && readyBulkCount > 0 && (
                                    <View style={styles.actionBar}>
                                        <Text style={styles.selectionText}>{readyBulkCount} ready</Text>
                                        <PrimaryButton icon="arrow-down" label="Download all" onPress={handleBulkDownloadAction} compact />
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                ) : activeTab.isSearching ? (
                    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
                        <ScrollableHeader {...sharedHeaderProps} />
                        <View style={styles.center}>
                            <ActivityIndicator size="large" color={Signal.wave} />
                            <Text style={styles.statusText}>{activeTab.status || 'Searching'}</Text>
                        </View>
                    </ScrollView>
                ) : activeTab.results.length > 0 || (activeTab.remixResults && activeTab.remixResults.length > 0) ? (
                    activeTab.remixResults && activeTab.remixResults.length > 0 ? (
                        <SectionList
                            key={`section-${activeTabId}`}
                            ListHeaderComponent={<ScrollableHeader {...sharedHeaderProps} />}
                            sections={[
                                ...(activeTab.results.length > 0 ? [{ title: 'Official tracks', data: activeTab.results }] : []),
                                { title: REMIXES, data: activeTab.remixResults, collapsed: !remixSectionExpanded },
                            ]}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.gridContent}
                            renderSectionHeader={({ section }) => (
                                <Pressable
                                    onPress={() => { if (section.title === REMIXES) { Haptics.selectionAsync().catch(() => {}); setRemixSectionExpanded(v => !v); } }}
                                    disabled={section.title !== REMIXES}
                                    style={styles.sectionHeader}
                                    accessibilityRole={section.title === REMIXES ? 'button' : 'header'}
                                    accessibilityState={section.title === REMIXES ? { expanded: remixSectionExpanded } : undefined}
                                >
                                    <Text style={styles.sectionHeaderText}>{section.title} · {section.data.length}</Text>
                                    {section.title === REMIXES && (
                                        <Ionicons name={remixSectionExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Signal.inkMuted} />
                                    )}
                                </Pressable>
                            )}
                            renderItem={({ item, section }) => {
                                if (section.title === REMIXES && !remixSectionExpanded) return null;
                                return (
                                    <View style={{ width: '50%', padding: 4 }}>
                                        <DownloadGridCard
                                            song={item}
                                            isSelected={activeTab.selectedSongs.includes(item.id)}
                                            isPlayingPreview={playingPreviewId === item.id}
                                            onPress={() => handlePress(item)}
                                            onPlayPress={() => handlePreviewToggle(item)}
                                            onArtistPress={() => openArtistTab(item.artist)}
                                            selectionMode
                                        />
                                    </View>
                                );
                            }}
                        />
                    ) : (
                        <FlatList
                            key={`results-${activeTabId}`}
                            ListHeaderComponent={<ScrollableHeader {...sharedHeaderProps} />}
                            data={activeTab.results}
                            keyExtractor={item => item.id}
                            numColumns={2}
                            contentContainerStyle={styles.gridContent}
                            renderItem={({ item }) => (
                                <DownloadGridCard
                                    song={item}
                                    isSelected={activeTab.selectedSongs.includes(item.id)}
                                    isPlayingPreview={playingPreviewId === item.id}
                                    onPress={() => handlePress(item)}
                                    onPlayPress={() => handlePreviewToggle(item)}
                                    onArtistPress={() => openArtistTab(item.artist)}
                                    selectionMode
                                />
                            )}
                        />
                    )
                ) : (
                    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
                        <ScrollableHeader {...sharedHeaderProps} />
                        <View style={styles.center}>
                            <View style={styles.emptyIcon}>
                                <Ionicons name="search" size={26} color={Signal.inkSoft} />
                            </View>
                            <Text style={styles.emptyTitle}>{activeTab.status || 'Find a song to save'}</Text>
                            <Text style={styles.emptyText}>
                                {activeTab.status
                                    ? 'Try the artist as well as the title, or check the spelling.'
                                    : 'Search by title or artist. Tap results to pick them, then download.'}
                            </Text>
                        </View>
                    </ScrollView>
                )}
            </View>

            {/* Selection action bar */}
            {selectedCount > 0 && (
                // Above the floating tab bar, not under it.
                <View style={[styles.actionBar, { bottom: TAB_BAR_CLEARANCE + insets.bottom + 8 }]}>
                    <Text style={styles.selectionText}>{selectedCount} selected</Text>
                    <PrimaryButton icon="arrow-down" label="Download" onPress={handleBatchDownload} compact />
                    <Tactile onPress={clearAllSelections} hitSlop={8} pressScale={0.9} accessibilityRole="button" accessibilityLabel="Clear the selection" style={styles.clearBtn}>
                        <Ionicons name="close" size={20} color={Signal.ink} />
                    </Tactile>
                </View>
            )}

            {/* Modals */}
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
            {toast && (
                <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    container: { flex: 1 },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: Space.md,
        paddingBottom: Space.xs,
        paddingTop: 2,
    },
    searchBarContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Glass.fill,
        borderRadius: Radius.pill,
        height: 48,
        paddingRight: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Glass.hairlineStrong,
    },
    searchIcon: { marginLeft: 14 },
    unifiedInput: {
        flex: 1, minWidth: 0, color: Signal.ink, fontSize: 15, height: '100%',
        paddingLeft: 10, paddingRight: 8,
    },
    clearSearchBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 2 },
    searchModePill: {
        backgroundColor: Glass.fillLight, borderRadius: Radius.pill,
        minWidth: 62, height: 34, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong,
    },
    searchModePillText: { color: Signal.ink, fontSize: 12, fontWeight: '600' },
    searchGo: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: Signal.wave },
    searchGoOff: { opacity: 0.4 },
    toolbarRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: Space.sm, paddingVertical: 5, gap: 6, marginBottom: 3,
    },
    microBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: Glass.fillLight, justifyContent: 'center', alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline,
    },
    microBtnActive: { backgroundColor: Signal.wave, borderColor: Signal.wave },
    tabItem: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 36,
        backgroundColor: Glass.fillLight, borderRadius: Radius.pill, marginRight: 6,
        borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline,
    },
    activeTabItem: { backgroundColor: 'rgba(217, 230, 106, 0.16)', borderColor: Signal.wave },
    tabText: { color: Signal.inkMuted, fontSize: 13, fontWeight: '600', maxWidth: 120 },
    activeTabText: { color: Signal.ink },
    tabBarScroll: { alignItems: 'center', paddingVertical: 3 },
    closeTabBtn: { marginLeft: 6 },
    bulkTitleContainer: { paddingHorizontal: Space.md, marginBottom: Space.md },
    content: { flex: 1 },
    gridContent: { padding: Space.sm, paddingBottom: 220 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Space.xl, paddingTop: 48 },
    statusText: { color: Signal.inkMuted, marginTop: Space.md, fontSize: 14 },
    emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline },
    emptyTitle: { color: Signal.ink, fontSize: 18, fontWeight: '700', marginTop: Space.md, textAlign: 'center' },
    emptyText: { color: Signal.inkMuted, marginTop: 6, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    // The floating bar over the results: how many, and the one thing to do next.
    actionBar: {
        position: 'absolute', left: Space.lg, right: Space.lg,
        backgroundColor: Glass.fillHeavy, borderRadius: Radius.pill,
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingVertical: 8, paddingLeft: 20, paddingRight: 8,
        borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong,
    },
    selectionText: { color: Signal.ink, fontSize: 15, fontWeight: '600', flex: 1 },
    clearBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.fillLight },
    bulkContainer: { padding: Space.md, flex: 1 },
    bulkTitle: { color: Signal.ink, fontSize: 20, fontWeight: '700', marginTop: Space.sm },
    bulkHint: { color: Signal.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 4 },
    bulkStep: { alignItems: 'flex-start' },
    bulkGo: { marginTop: Space.lg, alignItems: 'flex-start' },
    label: { color: Signal.inkSoft, marginBottom: 8, marginTop: Space.md, fontWeight: '600', fontSize: 14 },
    playlistInput: { backgroundColor: Glass.fill, color: Signal.ink, paddingHorizontal: 16, height: 48, borderRadius: Radius.pill, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong },
    jsonInput: { alignSelf: 'stretch', backgroundColor: Glass.fill, color: Signal.inkSoft, padding: 14, borderRadius: Radius.panel - 4, fontSize: 13, height: 160, textAlignVertical: 'top', borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Space.md, marginBottom: Space.xs, marginHorizontal: 6, minHeight: 32 },
    sectionHeaderText: { color: Signal.inkSoft, fontSize: 15, fontWeight: '700' },
    gridCardWrapper: { width: '50%', padding: 4 },
    swapOverlay: { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(8,9,12,0.6)', padding: 5, borderRadius: 40, pointerEvents: 'none' },
    alreadyPresentOverlay: {
        position: 'absolute', bottom: 8, left: 8, right: 8,
        backgroundColor: 'rgba(8,9,12,0.9)', padding: 10, borderRadius: Radius.well,
        borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong,
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
    },
    alreadyPresentBadge: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 5 },
    alreadyPresentBadgeText: { color: Signal.ink, fontSize: 11, fontWeight: '700' },
    alreadyPresentText: { color: Signal.inkSoft, fontSize: 11, textAlign: 'center', lineHeight: 15 },
    bulkActionBtn: {
        marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: Glass.fillPressed, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong,
        paddingHorizontal: 12, minHeight: 32, borderRadius: Radius.pill,
    },
    bulkActionBtnText: { color: Signal.ink, fontSize: 12, fontWeight: '600' },
    bulkNextBtn: { position: 'absolute', bottom: 10, right: 10, marginTop: 0, backgroundColor: 'rgba(8,9,12,0.72)' },
    bulkPlaceholder: {
        height: 200, backgroundColor: Glass.fill, borderRadius: Radius.panel - 4,
        justifyContent: 'center', alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline, paddingHorizontal: 8,
    },
    bulkPlaceholderTitle: { color: Signal.ink, marginTop: 8, fontSize: 13, textAlign: 'center', fontWeight: '700' },
    bulkPlaceholderQuery: { color: Signal.inkSoft, marginTop: 4, fontSize: 12, textAlign: 'center', paddingHorizontal: 8 },
    bulkPlaceholderArtist: { color: Signal.inkMuted, fontSize: 11, textAlign: 'center' },
});
