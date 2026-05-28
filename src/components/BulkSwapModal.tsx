import React, { useState, useEffect } from 'react';
import { 
    View, Text, Modal, StyleSheet, TextInput, Pressable, 
    FlatList, ActivityIndicator, Image 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { UnifiedSong } from '../types/song';
import { MultiSourceSearchService } from '../services/MultiSourceSearchService';


interface BulkSwapModalProps {
    visible: boolean;
    initialQuery: { title: string; artist: string };
    onClose: () => void;
    onSelect: (song: UnifiedSong) => void;
}

export const BulkSwapModal = ({ visible, initialQuery, onClose, onSelect }: BulkSwapModalProps) => {
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
            if (__DEV__) console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const renderItem = ({ item }: { item: UnifiedSong }) => (
        <Pressable style={styles.item} onPress={() => onSelect(item)}>
            <Image source={{ uri: item.highResArt || item.thumbnail }} style={styles.art} />
            <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
                <Text style={styles.source}>{item.source}</Text>
            </View>
            <Ionicons name="checkmark-circle-outline" size={24} color="#666" />
        </Pressable>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Swap Song</Text>
                        <Pressable onPress={onClose}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </Pressable>
                    </View>

                    <View style={styles.searchBar}>
                        <TextInput
                            style={styles.input}
                            value={query}
                            onChangeText={setQuery}
                            onSubmitEditing={() => handleSearch(query)}
                            placeholderTextColor="#666"
                        />
                        <Pressable onPress={() => handleSearch(query)} style={styles.searchBtn}>
                            <Ionicons name="search" size={20} color="#fff" />
                        </Pressable>
                    </View>

                    {isLoading ? (
                        <View style={styles.center}>
                            <ActivityIndicator size="large" color={Colors.primary} />
                        </View>
                    ) : (
                        <FlatList
                            data={results}
                            keyExtractor={item => item.id}
                            renderItem={renderItem}
                            contentContainerStyle={{ padding: 16 }}
                            ListEmptyComponent={
                                <Text style={styles.empty}>No results found.</Text>
                            }
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        padding: 16
    },
    container: {
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        flex: 1,
        maxHeight: '80%',
        borderWidth: 1,
        borderColor: '#333'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333'
    },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    searchBar: {
        flexDirection: 'row',
        padding: 12,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#222'
    },
    input: {
        flex: 1,
        backgroundColor: '#111',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: '#fff',
        borderWidth: 1,
        borderColor: '#333'
    },
    searchBtn: {
        backgroundColor: '#333',
        padding: 10,
        borderRadius: 8
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#222'
    },
    art: { width: 50, height: 50, borderRadius: 4, marginRight: 12 },
    info: { flex: 1 },
    title: { color: '#fff', fontWeight: 'bold' },
    artist: { color: '#aaa', fontSize: 12 },
    source: { color: Colors.primary, fontSize: 10, marginTop: 2 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { color: '#666', textAlign: 'center', marginTop: 32 }
});
