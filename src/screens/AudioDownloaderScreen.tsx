import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { DarkColors } from '../constants/colors';
import { usePlayerStore } from '../store/playerStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { AudioDownloaderSearchTab } from './AudioDownloaderSearchTab';
import { AudioDownloaderQueueTab } from './AudioDownloaderQueueTab';

interface AudioDownloaderProps {
    navigation: {
        goBack: () => void;
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

export const AudioDownloaderScreen: React.FC<AudioDownloaderProps> = ({ navigation, route }) => {
    const [activeShellTab, setActiveShellTab] = useState<ShellTab>('search');
    const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
    const voiceQuery = route.params?.voiceQuery;
    const autoDownload = route.params?.autoDownload;

    useEffect(() => {
        setMiniPlayerHidden(true);
        return () => setMiniPlayerHidden(false);
    }, [setMiniPlayerHidden]);

    return (
        <View style={styles.container}>
            {/* Background gradients — app blue theme */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#030912' }]} />
            <LinearGradient
                colors={['rgba(47,140,255,0.16)', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }} end={{ x: 0.75, y: 0.65 }}
            />
            <LinearGradient
                colors={['rgba(30,100,220,0.12)', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 1, y: 1 }} end={{ x: 0.25, y: 0.35 }}
            />
            <LinearGradient
                colors={['transparent', 'rgba(10,50,140,0.07)', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0.55 }} end={{ x: 1, y: 0.45 }}
            />
            <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.65)']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            />

            <SafeAreaView style={styles.safeArea}>
                {/* Shell header: back + tab switcher */}
                <View style={styles.header}>
                    <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="#fff" />
                    </Pressable>

                    <View style={styles.tabBar}>
                        <Pressable
                            style={[styles.tabBtn, activeShellTab === 'search' && styles.tabBtnActive]}
                            onPress={() => setActiveShellTab('search')}
                        >
                            <Ionicons name="search" size={15} color={activeShellTab === 'search' ? '#fff' : '#666'} />
                            <Text style={[styles.tabBtnText, activeShellTab === 'search' && styles.tabBtnTextActive]}>
                                Search
                            </Text>
                        </Pressable>

                        <Pressable
                            style={[styles.tabBtn, activeShellTab === 'queue' && styles.tabBtnActive]}
                            onPress={() => setActiveShellTab('queue')}
                        >
                            <Ionicons name="download" size={15} color={activeShellTab === 'queue' ? '#fff' : '#666'} />
                            <Text style={[styles.tabBtnText, activeShellTab === 'queue' && styles.tabBtnTextActive]}>
                                Downloads
                            </Text>
                            <QueueBadge />
                        </Pressable>
                    </View>
                </View>

                {/* Isolated tab trees — both stay mounted; inactive one hidden via display:none */}
                <View style={[styles.tabContent, activeShellTab !== 'search' && styles.hidden]}>
                    <AudioDownloaderSearchTab
                        autoSearchQuery={voiceQuery}
                        autoDownload={autoDownload}
                    />
                </View>
                <View style={[styles.tabContent, activeShellTab !== 'queue' && styles.hidden]}>
                    <AudioDownloaderQueueTab />
                </View>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    safeArea: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 8,
        paddingTop: 8,
        gap: 12,
    },
    backBtn: { padding: 8 },
    tabBar: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 20,
        padding: 3,
        gap: 3,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    tabBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 17,
        gap: 6,
    },
    tabBtnActive: {
        backgroundColor: 'rgba(47,140,255,0.42)',
    },
    tabBtnText: { color: '#666', fontSize: 13, fontWeight: '600' },
    tabBtnTextActive: { color: '#fff' },
    badge: {
        backgroundColor: DarkColors.primary,
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    tabContent: { flex: 1 },
    hidden: { display: 'none' },
});
