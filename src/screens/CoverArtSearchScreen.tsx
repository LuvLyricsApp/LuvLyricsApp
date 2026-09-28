import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, FlatList,
    Pressable, ActivityIndicator, Modal, useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ImageSearchService, ImageSearchResult } from '../services/ImageSearchService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Frosted } from '../components/allegra/Frosted';
import { Artwork } from '../components/allegra/Artwork';
import { Glass, Signal } from '../constants/allegraTheme';

/**
 * Pick a new cover for a song: a tall frosted sheet with a search field and a
 * two-column grid of covers. Tapping one uses it.
 */

type Props = {
    visible: boolean;
    initialQuery: string;
    onClose: () => void;
    onSelect: (uri: string) => void;
};

const GAP = 12;
const SIDE = 16;

export const CoverArtSearchScreen: React.FC<Props> = ({ visible, initialQuery, onClose, onSelect }) => {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const column = (width - SIDE * 2 - GAP) / 2;
    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<ImageSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const handleSearch = useCallback(async (text: string) => {
        if (!text.trim()) return;
        setIsLoading(true);
        const images = await ImageSearchService.searchImages(text);
        setResults(images);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (visible && initialQuery) {
            setQuery(initialQuery);
            handleSearch(initialQuery);
        }
    }, [visible, initialQuery, handleSearch]);

    const renderItem = ({ item }: { item: ImageSearchResult }) => (
        <Pressable
            style={({ pressed }) => [styles.gridItem, { width: column }, pressed && styles.gridItemPressed]}
            onPress={() => onSelect(item.uri)}
            accessibilityRole="button"
            accessibilityLabel={`Use the cover of ${item.title}`}
        >
            <Artwork uri={item.uri} title={item.title} artist={item.artist} size={column} style={{ width: column, height: column, borderRadius: 10 }} />
            <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.itemArtist} numberOfLines={1}>{item.artist}</Text>
        </Pressable>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.root}>
                <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
                <View style={[styles.sheet, { marginTop: insets.top + 12 }]}>
                    <Frosted radius={28} intensity={60} tint={0.6} />
                    <View style={styles.grabber} />
                    <View style={styles.header}>
                        <Text style={styles.title}>Change cover</Text>
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
                            placeholder="Song or album"
                            placeholderTextColor={Signal.inkFaint}
                            selectionColor={Signal.wave}
                            returnKeyType="search"
                        />
                        {query.length > 0 && (
                            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear">
                                <Ionicons name="close-circle" size={18} color={Signal.inkMuted} />
                            </Pressable>
                        )}
                    </View>

                    {isLoading ? (
                        <View style={styles.center}>
                            <ActivityIndicator size="large" color={Signal.wave} />
                            <Text style={styles.hint}>Looking for covers</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={results}
                            keyExtractor={(item) => item.id}
                            renderItem={renderItem}
                            numColumns={2}
                            contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]}
                            columnWrapperStyle={styles.columnWrapper}
                            keyboardDismissMode="on-drag"
                            keyboardShouldPersistTaps="handled"
                            ListEmptyComponent={
                                <View style={styles.center}>
                                    <Ionicons name="images-outline" size={40} color={Signal.inkFaint} />
                                    <Text style={styles.hint}>No covers for that. Try the album name.</Text>
                                </View>
                            }
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1 },
    scrim: { backgroundColor: Glass.scrimHeavy },
    sheet: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
    grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: Glass.hairlineStrong },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
    title: { color: Signal.ink, fontSize: 20, fontWeight: '700' },
    closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.fillLight },
    searchBar: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SIDE, marginBottom: 8, paddingHorizontal: 14,
        height: 44, borderRadius: 999, backgroundColor: Glass.fillLight, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline,
    },
    input: { flex: 1, color: Signal.ink, fontSize: 15, paddingVertical: 0 },
    listContent: { paddingHorizontal: SIDE, paddingTop: 8, flexGrow: 1 },
    columnWrapper: { justifyContent: 'space-between', marginBottom: 16 },
    gridItem: { borderRadius: 12 },
    gridItemPressed: { opacity: 0.7 },
    itemTitle: { color: Signal.ink, fontSize: 13, fontWeight: '600', marginTop: 8 },
    itemArtist: { color: Signal.inkMuted, fontSize: 12, marginTop: 2 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    hint: { color: Signal.inkMuted, marginTop: 12, fontSize: 14, textAlign: 'center' },
});
