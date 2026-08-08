import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useThemeColors } from '../contexts/ThemeContext';
import { usePlaylistStore } from '../store/playlistStore';
import { useNavigation, useRoute } from '@react-navigation/native';
import { safeGoBack } from '../utils/navigationService';

export const CreatePlaylistModal = () => {
    const colors = useThemeColors();
    const navigation = useNavigation();
    const route = useRoute<any>(); // Get params properly
    const params = route.params;
    const isEditMode = !!params?.playlistId;
    
    // Initialize with existing name if editing
    const [name, setName] = useState(params?.initialName || '');
    
    const createPlaylist = usePlaylistStore(state => state.createPlaylist);
    const updatePlaylist = usePlaylistStore(state => state.updatePlaylist);
    
    const handleCreate = async () => {
        if (!name.trim()) return;
        
        try {
            if (isEditMode && params?.playlistId) {
                await updatePlaylist(params.playlistId, { name: name.trim() });
            } else {
                await createPlaylist(name.trim());
            }
            safeGoBack(navigation);
        } catch {
            Alert.alert('Error', `Failed to ${isEditMode ? 'update' : 'create'} playlist`);
        }
    };
    
    return (
        <View style={styles.container}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <View style={styles.content}>
                    <Text style={styles.title}>{isEditMode ? 'Rename Playlist' : 'New Playlist'}</Text>
                    <Text style={styles.subtitle}>{isEditMode ? 'Enter a new name' : 'Enter a name for your playlist'}</Text>
                    
                    <TextInput
                        style={styles.input}
                        placeholder="My Awesome Playlist"
                        placeholderTextColor={colors.textSecondary}
                        value={name}
                        onChangeText={setName}
                        autoFocus
                    />
                    
                    <View style={styles.buttons}>
                        <Pressable 
                            style={styles.cancelButton} 
                            onPress={() => safeGoBack(navigation)}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                        
                        <Pressable 
                            style={[styles.createButton, !name.trim() && styles.disabledButton]} 
                            onPress={handleCreate}
                            disabled={!name.trim()}
                        >
                            <Text style={styles.createText}>{isEditMode ? 'Save' : 'Create'}</Text>
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    keyboardView: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    content: {
        backgroundColor: '#1E1E1E',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: '#333',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: '#888888',
        marginBottom: 24,
        textAlign: 'center',
    },
    input: {
        backgroundColor: '#000',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#333',
        marginBottom: 24,
    },
    buttons: {
        flexDirection: 'row',
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        backgroundColor: '#333',
        alignItems: 'center',
    },
    cancelText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
    createButton: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        backgroundColor: '#1DB954',
        alignItems: 'center',
    },
    disabledButton: {
        opacity: 0.5,
    },
    createText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 16,
    },
});
export default CreatePlaylistModal;
