import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, Modal, Pressable, TextInput,
    FlatList, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Frosted } from './allegra/Frosted';
import { Glass, Signal } from '../constants/allegraTheme';
import { usePlaylistStore } from '../store/playlistStore';
import { Playlist } from '../types/song';

interface PlaylistSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (playlistId: string, playlistName: string) => void;
    onSkip?: () => void;
}

export const PlaylistSelectionModal = ({ visible, onClose, onSelect, onSkip }: PlaylistSelectionModalProps) => {
    const playlists = usePlaylistStore(state => state.playlists);
    const fetchPlaylists = usePlaylistStore(state => state.fetchPlaylists);
    const createPlaylist = usePlaylistStore(state => state.createPlaylist);
    const storeLoading = usePlaylistStore(state => state.isLoading);
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [localLoading, setLocalLoading] = useState(false);

    useEffect(() => {
        if (visible) { fetchPlaylists(); setIsCreating(false); setNewPlaylistName(''); setSearchQuery(''); }
    }, [visible, fetchPlaylists]);

    const filteredPlaylists = playlists.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const handleCreate = async () => {
        if (!newPlaylistName.trim()) return;
        setLocalLoading(true);
        try {
            const id = await createPlaylist(newPlaylistName.trim());
            onSelect(id, newPlaylistName.trim());
            onClose();
        } catch (e) { console.error(e); }
        finally { setLocalLoading(false); }
    };

    const renderItem = ({ item }: { item: Playlist }) => (
        <Pressable style={styles.item} onPress={() => { onSelect(item.id, item.name); onClose(); }}>
            <View style={styles.iconContainer}>
                <Ionicons name="musical-notes" size={20} color={Signal.inkMuted} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.itemCount}>{item.songCount} songs</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Signal.inkFaint} />
        </Pressable>
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.container}>
                <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} />
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
                    <View style={styles.content}>
                        <Frosted radius={28} intensity={60} tint={0.55} />
                        <View style={styles.header}>
                            <Text style={styles.title}>{isCreating ? 'New playlist' : 'Add to playlist'}</Text>
                            <Pressable onPress={onClose} style={styles.closeBtn}>
                                <Ionicons name="close" size={20} color={Signal.ink} />
                            </Pressable>
                        </View>

                        {isCreating ? (
                            <View>
                                <Text style={styles.subtitle}>Name it</Text>
                                <TextInput
                                    style={styles.input} value={newPlaylistName} onChangeText={setNewPlaylistName}
                                    placeholder="Late night drive" placeholderTextColor={Signal.inkFaint} autoFocus selectionColor={Signal.wave}
                                />
                                <View style={styles.createActions}>
                                    <Pressable style={styles.textBtn} onPress={() => setIsCreating(false)}>
                                        <Text style={styles.textBtnText}>Back to the list</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[styles.primaryBtn, !newPlaylistName.trim() && { opacity: 0.5 }]}
                                        onPress={handleCreate} disabled={!newPlaylistName.trim() || localLoading}
                                    >
                                        {localLoading ? <ActivityIndicator color={Signal.waveInk} /> : <Text style={styles.primaryBtnText}>Create and add</Text>}
                                    </Pressable>
                                </View>
                            </View>
                        ) : (
                            <>
                                {onSkip && (
                                    <Pressable style={styles.skipBtn} onPress={() => { if (onSkip) onSkip(); onClose(); }}>
                                        <View style={styles.skipIcon}>
                                            <Ionicons name="download-outline" size={20} color={Signal.waveInk} />
                                        </View>
                                        <Text style={styles.skipText}>Download to the library only</Text>
                                        <Ionicons name="chevron-forward" size={16} color={Signal.inkMuted} />
                                    </Pressable>
                                )}
                                <View style={styles.searchRow}>
                                    <View style={styles.searchBar}>
                                        <Ionicons name="search" size={16} color={Signal.inkMuted} style={{ marginRight: 8 }} />
                                        <TextInput
                                            style={styles.searchInput} placeholder="Search playlists"
                                            placeholderTextColor={Signal.inkFaint} selectionColor={Signal.wave} value={searchQuery} onChangeText={setSearchQuery}
                                        />
                                    </View>
                                    <Pressable style={styles.addBtn} onPress={() => setIsCreating(true)} accessibilityLabel="New playlist">
                                        <Ionicons name="add" size={24} color={Signal.waveInk} />
                                    </Pressable>
                                </View>
                                {storeLoading ? (
                                    <ActivityIndicator size="large" color={Signal.wave} style={{ margin: 20 }} />
                                ) : (
                                    <FlatList
                                        data={filteredPlaylists} keyExtractor={item => item.id} renderItem={renderItem}
                                        style={styles.list} contentContainerStyle={{ paddingBottom: 20 }}
                                        ListEmptyComponent={<Text style={styles.emptyText}>No playlists found</Text>}
                                    />
                                )}
                            </>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'flex-end' },
    scrim: { backgroundColor: Glass.scrim },
    keyboardView: { width: '100%' },
    content: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', padding: 24, paddingBottom: 32, maxHeight: '80%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { color: Signal.ink, fontSize: 20, fontWeight: '700' },
    closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Glass.fillLight },
    skipBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Glass.fillLight, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline, padding: 12, borderRadius: 16, marginBottom: 16 },
    skipIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: Signal.wave },
    skipText: { flex: 1, color: Signal.ink, fontSize: 15, fontWeight: '600' },
    searchRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Glass.fillLight, borderRadius: 999, paddingHorizontal: 14, height: 44, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairline },
    searchInput: { flex: 1, color: Signal.ink, fontSize: 15 },
    addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Signal.wave },
    list: { maxHeight: 400 },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Glass.hairline },
    iconContainer: { width: 44, height: 44, borderRadius: 10, backgroundColor: Glass.fillLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    itemName: { color: Signal.ink, fontSize: 15, fontWeight: '600', marginBottom: 2 },
    itemCount: { color: Signal.inkMuted, fontSize: 12 },
    emptyText: { color: Signal.inkMuted, textAlign: 'center', marginTop: 20 },
    subtitle: { color: Signal.inkSoft, marginBottom: 12 },
    input: { backgroundColor: Glass.fillLight, color: Signal.ink, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: Glass.hairlineStrong, fontSize: 16, marginBottom: 24 },
    createActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
    textBtn: { padding: 8 },
    textBtnText: { color: Signal.inkSoft },
    primaryBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999, minWidth: 130, alignItems: 'center', backgroundColor: Signal.wave },
    primaryBtnText: { color: Signal.waveInk, fontWeight: '700' },
});
