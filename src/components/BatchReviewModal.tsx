import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, Image, Pressable, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { UnifiedSong } from '../types/song';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useSongStaging } from '../hooks/useSongStaging';
import { Toast } from './Toast';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

interface BatchReviewModalProps {
    visible: boolean;
    selectedSongs: UnifiedSong[];
    onClose: () => void;
    onQueue: (processedSongs: any[]) => void;
}

const SingleSongReview = ({ song, onConfirm, onSkip }: { song: UnifiedSong, onConfirm: (data: any) => void, onSkip: () => void }) => {
    const { staging, stageSong, retryLyrics, updateSelection, selectLyrics, lyricFetchError } = useSongStaging();
    const [isLoaded, setIsLoaded] = useState(false);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        if (song) {
            stageSong(song);
            setIsLoaded(true);
        }
    }, [song, stageSong]);

    useEffect(() => {
        if (lyricFetchError) {
            setToast({ visible: true, message: lyricFetchError, type: 'error' });
        }
    }, [lyricFetchError]);

    if (!staging || !isLoaded) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.statusText}>Preparing {song.title}...</Text>
            </View>
        );
    }

    return (
        <>
            <View style={styles.reviewContainer}>
                {/* Cover Art */}
                <View style={styles.coverContainer}>
                    <Image source={{ uri: staging.selectedCoverUri }} style={styles.coverImage} />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} />
                    <Text style={styles.songTitle}>{staging.title}</Text>
                    <Text style={styles.songArtist}>{staging.artist}</Text>
                </View>

                {/* Lyrics Preview */}
                <View style={styles.lyricsContainer}>
                    <View style={styles.lyricsHeader}>
                        <Text style={styles.sectionTitle}>Lyrics Preview</Text>
                        <View style={{flexDirection: 'row', gap: 10}}>
                            {staging.lyricOptions && staging.lyricOptions.length > 1 && (
                                <View style={styles.pagination}>
                                    <Pressable
                                        onPress={() => {
                                            const currentIndex = staging.selectedLyricIndex ?? 0;
                                            const prevIndex = (currentIndex - 1 + staging.lyricOptions!.length) % staging.lyricOptions!.length;
                                            selectLyrics(prevIndex);
                                        }}
                                        hitSlop={20}
                                    >
                                        <Ionicons name="chevron-back" size={24} color={Colors.primary} />
                                    </Pressable>
                                    <Text style={styles.pageText}>
                                        {(staging.selectedLyricIndex ?? 0) + 1} / {staging.lyricOptions!.length}
                                    </Text>
                                    <Pressable
                                        onPress={() => {
                                            const currentIndex = staging.selectedLyricIndex ?? 0;
                                            const nextIndex = (currentIndex + 1) % staging.lyricOptions!.length;
                                            selectLyrics(nextIndex);
                                        }}
                                        hitSlop={20}
                                    >
                                        <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
                                    </Pressable>
                                </View>
                            )}
                            <Pressable onPress={retryLyrics} style={styles.retryBtn}>
                                <Ionicons name="refresh" size={16} color={Colors.primary} />
                                <Text style={styles.retryText}>Retry</Text>
                            </Pressable>
                        </View>
                    </View>

                    {staging.lyricOptions === null ? (
                        <ActivityIndicator color={Colors.primary} />
                    ) : staging.lyricOptions.length > 0 ? (
                        <>
                            <Text style={styles.sourceText}>
                                Source: {staging.lyricOptions[staging.selectedLyricIndex ?? 0]?.source || 'Unknown'}
                            </Text>
                            <ScrollView style={styles.lyricsScroll}>
                                <Text style={styles.lyricsText}>
                                    {staging.selectedLyrics?.substring(0, 300)}...
                                </Text>
                            </ScrollView>
                        </>
                    ) : (
                        <Text style={styles.noLyricsText}>No lyrics found.</Text>
                    )}
                </View>

                {/* Actions */}
                <View style={styles.actionRow}>
                    <Pressable style={styles.skipBtn} onPress={onSkip}>
                        <Text style={styles.skipText}>Skip</Text>
                    </Pressable>
                    <Pressable
                        style={styles.confirmBtn}
                        onPress={() => onConfirm(staging)}
                    >
                        <Text style={styles.confirmText}>Add to Queue</Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </Pressable>
                </View>
            </View>
            <Toast
                visible={toast?.visible ?? false}
                message={toast?.message ?? ''}
                type={toast?.type ?? 'error'}
                onDismiss={() => setToast(null)}
                duration={4000}
            />
        </>
    );
};

export const BatchReviewModal = ({ visible, selectedSongs, onClose, onQueue }: BatchReviewModalProps) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [reviewedItems, setReviewedItems] = useState<any[]>([]);

    useEffect(() => {
        if (visible) {
            setCurrentIndex(0);
            setReviewedItems([]);
        }
    }, [visible]);

    const handleConfirm = (stagingData: any) => {
        const newReviewed = [...reviewedItems, stagingData];
        setReviewedItems(newReviewed);

        if (currentIndex < selectedSongs.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            onQueue(newReviewed);
            onClose();
        }
    };

    const handleSkip = () => {
        if (currentIndex < selectedSongs.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            if (reviewedItems.length > 0) {
                onQueue(reviewedItems);
            }
            onClose();
        }
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent={true}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <Text style={styles.stepText}>
                            Reviewing {currentIndex + 1} of {selectedSongs.length}
                        </Text>
                        <Pressable onPress={onClose}>
                            <Ionicons name="close-circle" size={28} color="#fff" />
                        </Pressable>
                    </View>

                    <SingleSongReview
                        key={selectedSongs[currentIndex]?.id}
                        song={selectedSongs[currentIndex]}
                        onConfirm={handleConfirm}
                        onSkip={handleSkip}
                    />
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
        justifyContent: 'center',
        padding: 16
    },
    modalContent: {
        backgroundColor: '#1A1A1A',
        borderRadius: 24,
        flex: 1,
        maxHeight: '90%',
        overflow: 'hidden'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333'
    },
    stepText: { color: '#888', fontWeight: 'bold' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    statusText: { color: '#fff', marginTop: 12 },
    reviewContainer: { flex: 1 },
    coverContainer: {
        height: 300,
        backgroundColor: '#000',
        justifyContent: 'flex-end',
        padding: 20
    },
    coverImage: { ...StyleSheet.absoluteFillObject, opacity: 0.7 },
    songTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
    songArtist: { color: Colors.primary, fontSize: 18, fontWeight: '600' },
    lyricsContainer: { flex: 1, padding: 20 },
    lyricsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#333', padding: 6, borderRadius: 8 },
    retryText: { color: Colors.primary, fontSize: 12 },
    lyricsScroll: { flex: 1, backgroundColor: '#222', borderRadius: 12, padding: 12 },
    lyricsText: { color: '#ccc', lineHeight: 24 },
    noLyricsText: { color: '#666', fontStyle: 'italic' },
    actionRow: {
        flexDirection: 'row',
        padding: 20,
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: '#333'
    },
    skipBtn: {
        flex: 1,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center'
    },
    skipText: { color: '#666', fontWeight: 'bold' },
    confirmBtn: {
        flex: 2,
        backgroundColor: Colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 16,
        gap: 8
    },
    confirmText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    pagination: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 10 },
    pageText: { color: '#fff', fontSize: 12 },
    sourceText: { color: '#888', fontSize: 11, marginBottom: 8, fontStyle: 'italic' }
});