
import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, Modal, Pressable, TextInput, 
    FlatList, ActivityIndicator, KeyboardAvoidingView, Platform 
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { usePlaylistStore } from '../store/playlistStore';
import { Playlist } from '../types/song';

interface PlaylistSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (playlistId: string, playlistName: string) => void;
    onSkip?: () => void; // Download without playlist
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
        if (visible) {
            fetchPlaylists();
            setIsCreating(false);
            setNewPlaylistName('');
            setSearchQuery('');
        }
    }, [visible, fetchPlaylists]);

    const filteredPlaylists = playlists.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleCreate = async () => {
        if (!newPlaylistName.trim()) return;
        setLocalLoading(true);
        try {
            const id = await createPlaylist(newPlaylistName.trim());
            onSelect(id, newPlaylistName.trim());
            onClose();
        } catch (e) {
            if (__DEV__) console.error(e);
        } finally {
            setLocalLoading(false);
        }
    };

    const renderItem = ({ item }: { item: Playlist }) => (
        <Pressable 
            style={styles.item}
            onPress={() => {
                onSelect(item.id, item.name);
                onClose();
            }}
        >
            <View style={styles.iconContainer}>
                 <Ionicons name="musical-notes" size={20} color="#666" />
            </View>
            <View style={{flex: 1}}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.itemCount}>{item.songCount} songs</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
        </Pressable>
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
             <View style={styles.container}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                </Pressable>

                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.keyboardView}
                >
                    <View style={styles.content}>
                        {/* Header */}
                        <View style={styles.header}>
                            <Text style={styles.title}>
                                {isCreating ? 'New Playlist' : 'Add to Playlist'}
                            </Text>
                            <Pressable onPress={onClose} style={styles.closeBtn}>
                                <Ionicons name="close" size={20} color="#fff" />
                            </Pressable>
                        </View>

                        {/* Body */}
                        {isCreating ? (
                            <View>
                                <Text style={styles.subtitle}>Enter playlist name</Text>
                                <TextInput
                                    style={styles.input}
                                    value={newPlaylistName}
                                    onChangeText={setNewPlaylistName}
                                    placeholder="My Awesome Playlist"
                                    placeholderTextColor="#555"
                                    autoFocus
                                />
                                <View style={styles.createActions}>
                                    <Pressable style={styles.textBtn} onPress={() => setIsCreating(false)}>
                                        <Text style={styles.textBtnText}>Back to List</Text>
                                    </Pressable>
                                    <Pressable 
                                        style={[styles.primaryBtn, !newPlaylistName.trim() && { opacity: 0.5 }]} 
                                        onPress={handleCreate}
                                        disabled={!newPlaylistName.trim() || localLoading}
                                    >
                                        {localLoading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>Create & Add</Text>}
                                    </Pressable>
                                </View>
                            </View>
                        ) : (
                            <>
                                {onSkip && (
                                    <Pressable 
                                        style={styles.skipBtn}
                                        onPress={() => {
                                            if (onSkip) onSkip();
                                            onClose();
                                        }}
                                    >
                                        <View style={styles.skipIcon}>
                                            <Ionicons name="download-outline" size={20} color="#fff" />
                                        </View>
                                        <Text style={styles.skipText}>Download to Library Only</Text>
                                        <Ionicons name="chevron-forward" size={16} color="#666" />
                                    </Pressable>
                                )}

                                <View style={styles.searchRow}>
                                    <View style={styles.searchBar}>
                                        <Ionicons name="search" size={16} color="#666" style={{marginRight: 8}}/>
                                        <TextInput 
                                            style={styles.searchInput}
                                            placeholder="Search playlists..."
                                            placeholderTextColor="#666"
                                            value={searchQuery}
                                            onChangeText={setSearchQuery}
                                        />
                                    </View>
                                    <Pressable style={styles.addBtn} onPress={() => setIsCreating(true)}>
                                        <Ionicons name="add" size={24} color="#000" />
                                    </Pressable>
                                </View>

                                {storeLoading ? (
                                    <ActivityIndicator size="large" color={Colors.primary} style={{margin: 20}} />
                                ) : (
                                    <FlatList
                                        data={filteredPlaylists}
                                        keyExtractor={item => item.id}
                                        renderItem={renderItem}
                                        style={styles.list}
                                        contentContainerStyle={{paddingBottom: 20}}
                                        ListEmptyComponent={
                                            <Text style={styles.emptyText}>No playlists found</Text>
                                        }
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
    keyboardView: { width: '100%' },
    content: {
        backgroundColor: '#1E1E1E',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        maxHeight: '80%',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
        borderWidth: 1,
        borderColor: '#333'
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    closeBtn: { padding: 4 },
    
    // Skip Button
    skipBtn: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#333',
        padding: 12, borderRadius: 12, marginBottom: 16
    },
    skipIcon: {
        width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center', marginRight: 12
    },
    skipText: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' },

    // Search & List
    searchRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    searchBar: { 
        flex: 1, flexDirection: 'row', alignItems: 'center', 
        backgroundColor: '#111', borderRadius: 12, paddingHorizontal: 12, height: 44,
        borderWidth: 1, borderColor: '#333'
    },
    searchInput: { flex: 1, color: '#fff', fontSize: 14 },
    addBtn: { 
        width: 44, height: 44, borderRadius: 12, 
        backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' 
    },
    list: { maxHeight: 400 },
    item: { 
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12, 
        borderBottomWidth: 1, borderBottomColor: '#2a2a2a' 
    },
    iconContainer: { 
        width: 40, height: 40, borderRadius: 8, backgroundColor: '#2a2a2a', 
        alignItems: 'center', justifyContent: 'center', marginRight: 12 
    },
    itemName: { color: '#fff', fontSize: 15, fontWeight: '500', marginBottom: 2 },
    itemCount: { color: '#666', fontSize: 12 },
    emptyText: { color: '#666', textAlign: 'center', marginTop: 20 },

    // Create Logic
    subtitle: { color: '#aaa', marginBottom: 12 },
    input: { 
        backgroundColor: '#111', color: '#fff', padding: 16, borderRadius: 12, 
        borderWidth: 1, borderColor: '#333', fontSize: 16, marginBottom: 24 
    },
    createActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
    textBtn: { padding: 8 },
    textBtnText: { color: '#aaa' },
    primaryBtn: { 
        backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 24, 
        borderRadius: 20, minWidth: 120, alignItems: 'center' 
    },
    primaryBtnText: { color: '#000', fontWeight: 'bold' }
});
