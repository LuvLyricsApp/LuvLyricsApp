/**
 * Get songs, in Allegra's language: the room lit by what's playing behind a
 * title and a pill switch between finding songs and watching them arrive.
 * Both tabs stay mounted (a search in progress survives a look at Downloads).
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import DynamicAura from '../components/allegra/DynamicAura';
import { useArtworkPalette } from '../components/allegra/useArtworkPalette';
import { Tactile } from '../components/allegra/motion';
import { Glass, Radius, Signal, Space } from '../constants/allegraTheme';
import * as Haptics from '../utils/haptics';
import { usePlayerStore } from '../store/playerStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { AudioDownloaderSearchTab } from './AudioDownloaderSearchTab';
import { AudioDownloaderQueueTab } from './AudioDownloaderQueueTab';
import { safeGoBack } from '../utils/navigationService';

interface AudioDownloaderProps {
    navigation: {
        goBack: () => void;
        canGoBack?: () => boolean;
        navigate: (screen: string, params?: Record<string, unknown>) => void;
    };
    route: {
        params?: {
            voiceQuery?: string;
            autoDownload?: boolean;
        };
    };
}

type ShellTab = 'search' | 'queue';

// Isolated badge: re-renders on queue count changes, shell does not
const QueueBadge = () => {
    const count = useDownloadQueueStore(s =>
        s.queue.filter(i => i.status !== 'completed').length
    );
    if (count === 0) return null;
    return (
        <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
    );
};

const Segment: React.FC<{ label: string; icon: React.ComponentProps<typeof Ionicons>['name']; active: boolean; onPress: () => void; children?: React.ReactNode }> = ({ label, icon, active, onPress, children }) => (
    <Tactile
        onPress={() => { if (!active) { Haptics.selectionAsync().catch(() => {}); onPress(); } }}
        pressScale={0.96}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
        wrapperStyle={styles.segmentWrap}
        style={[styles.segment, active && styles.segmentOn]}
    >
        <Ionicons name={icon} size={16} color={active ? Signal.waveInk : Signal.inkSoft} />
        <Text style={[styles.segmentText, active && styles.segmentTextOn]}>{label}</Text>
        {children}
    </Tactile>
);

export const AudioDownloaderScreen: React.FC<AudioDownloaderProps> = ({ navigation, route }) => {
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();
    const [activeShellTab, setActiveShellTab] = useState<ShellTab>('search');
    const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const cover = usePlayerStore(state => state.currentSong?.coverImageUri);
    const palette = useArtworkPalette(cover);
    const voiceQuery = route.params?.voiceQuery;
    const autoDownload = route.params?.autoDownload;

    useEffect(() => {
        setMiniPlayerHidden(true);
        return () => {
            setMiniPlayerHidden(false);
        };
    }, [setMiniPlayerHidden]);

    return (
        <View style={styles.container}>
            <DynamicAura palette={palette} playing={isPlaying} active={isFocused} dim={0.35} />

            <View style={[styles.safeArea, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <Tactile onPress={() => safeGoBack(navigation)} hitSlop={8} pressScale={0.9} accessibilityRole="button" accessibilityLabel="Back" style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={22} color={Signal.ink} />
                    </Tactile>
                    <Text style={styles.title} accessibilityRole="header">Get songs</Text>
                </View>

                <View style={styles.tabBar} accessibilityRole="tablist">
                    <Segment label="Search" icon="search" active={activeShellTab === 'search'} onPress={() => setActiveShellTab('search')} />
                    <Segment label="Downloads" icon="arrow-down" active={activeShellTab === 'queue'} onPress={() => setActiveShellTab('queue')}>
                        <QueueBadge />
                    </Segment>
                </View>

                {/* Isolated tab trees: both stay mounted; the inactive one is hidden with display:none */}
                <View style={[styles.tabContent, activeShellTab !== 'search' && styles.hidden]}>
                    <AudioDownloaderSearchTab
                        autoSearchQuery={voiceQuery}
                        autoDownload={autoDownload}
                        onDownloadStarted={() => setActiveShellTab('queue')}
                    />
                </View>
                <View style={[styles.tabContent, activeShellTab !== 'queue' && styles.hidden]}>
                    <AudioDownloaderQueueTab />
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Signal.bg },
    safeArea: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Space.md,
        paddingTop: Space.xs,
        paddingBottom: Space.sm,
        gap: Space.sm,
    },
    backBtn: {
        width: 44,
        height: 44,
        borderRadius: Radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Glass.fill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Glass.hairline,
    },
    title: { color: Signal.ink, fontSize: 28, fontWeight: '700' },
    tabBar: {
        flexDirection: 'row',
        marginHorizontal: Space.md,
        marginBottom: Space.sm,
        padding: 4,
        gap: 4,
        borderRadius: Radius.pill,
        backgroundColor: 'rgba(244,241,234,0.06)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Glass.hairline,
    },
    segmentWrap: { flex: 1 },
    segment: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        minHeight: 40,
        borderRadius: Radius.pill,
    },
    segmentOn: { backgroundColor: Signal.wave },
    segmentText: { color: Signal.inkSoft, fontSize: 14, fontWeight: '600' },
    segmentTextOn: { color: Signal.waveInk },
    badge: {
        backgroundColor: Signal.accent,
        borderRadius: 9,
        minWidth: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    tabContent: { flex: 1 },
    hidden: { display: 'none' },
});
