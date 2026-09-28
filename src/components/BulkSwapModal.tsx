import React, { useState, useEffect } from 'react';
import {
    View, Text, Modal, StyleSheet, TextInput, Pressable,
    FlatList, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UnifiedSong } from '../types/song';
import { MultiSourceSearchService } from '../services/MultiSourceSearchService';
import { Frosted } from './allegra/Frosted';
import { Artwork } from './allegra/Artwork';
import { Glass, Signal } from '../constants/allegraTheme';


interface BulkSwapModalProps {
    visible: boolean;
    initialQuery: { title: string; artist: string };
    onClose: () => void;
    onSelect: (song: UnifiedSong) => void;
}

export const BulkSwapModal = ({ visible, initialQuery, onClose, onSelect }: BulkSwapModalProps) => {
    const insets = useSafeAreaInsets();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<UnifiedSong[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (visible) {
            const q = `${initialQuery.title} ${initialQuery.artist}`;
            setQuery(q);
            handleSearch(q);
        }
    }, [visible, initialQuery]);

    const handleSearch = async (searchText: string) => {
        if (!searchText.trim()) return;
        setIsLoading(true);
        try {
            const res = await MultiSourceSearchService.searchMusic(searchText);
            setResults(res);
        } catch (e) {
            if (__DEV__) console.error('[BulkSwap] search failed:', e);
        } finally {
            setIsLoading(false);
        }
    };

    const renderItem = ({ item }: { item: UnifiedSong }) => (
        <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => onSelect(item)}
            accessibilityRole="button"
            accessibilityLabel={`Use ${item.title} by ${item.artist}`}
        >
            <Artwork uri={item.highResArt || item.thumbnail} title={item.title} artist={item.artist} size={48} style={styles.art} />
            <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{item.artist}{item.source ? ` · ${item.source}` : ''}</Text>
            </View>
            <Text style={styles.use}>Use</Text>
        </Pressable>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
                <View style={[styles.container, { paddingBottom: insets.bottom }]}>
                    <Frosted radius={28} intensity={60} tint={0.55} />
                    <View style={styles.grabber} />
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Swap song</Text>
                        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                            <Ionicons name="close" size={20} color={Signal.ink} />
                        </Pressable>
                    </View>

                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={16} color={Signal.inkMuted} />
                        <TextInput
                            style={styles.input}
                            value={query}
                            onChangeText={setQuery}
                            onSubmitEditing={() => handleSearch(query)}
                            placeholder="Song and artist"
                            placeholderTextColor={Signal.inkFaint}
                            selectionColor={Signal.wave}
                            returnKeyType="search"
                        />
                    </View>

                    {isLoading ? (
                        <View style={styles.center}>
                            <ActivityIndicator size="large" color={Signal.wave} />
                        </View>
                    ) : (
                        <FlatList
                            data={results}
                            keyExtractor={item => item.id}
                            renderItem={renderItem}
                            contentContainerStyle={styles.list}
                            keyboardShouldPersistTaps="handled"
                            ListEmptyComponent={
                                <Text style={styles.empty}>Nothing found. Try the title on its own.</Text>
                            }
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    scrim: { backgroundColor: Glass.scrim },
    container: { height: '82%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
    grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: Glass.hairlineStrong },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
    headerTitle: { color: Signal.ink, fontSize: 20, fontWeight: '700' },
    closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.fillLight },
    searchBar: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14,
        height: 44, borderRadius: 999, backgroundColor: Glass.fillLight, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline,
    },
    input: { flex: 1, color: Signal.ink, fontSize: 15, paddingVertical: 0 },
    list: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 16 },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 14 },
    itemPressed: { backgroundColor: Glass.fillPressed },
    art: { width: 48, height: 48, borderRadius: 8, marginRight: 12 },
    info: { flex: 1 },
    title: { color: Signal.ink, fontSize: 15, fontWeight: '600' },
    artist: { color: Signal.inkMuted, fontSize: 13, marginTop: 2 },
    use: { color: Signal.wave, fontSize: 15, fontWeight: '600', paddingHorizontal: 8 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { color: Signal.inkMuted, textAlign: 'center', marginTop: 32, fontSize: 14 },
});
