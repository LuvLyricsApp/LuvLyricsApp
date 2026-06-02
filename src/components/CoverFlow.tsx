import React, { useEffect } from 'react';
import { StyleSheet, View, Image, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Song } from '../types/song';
import { getGradientForSong } from '../constants/gradients';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_SIZE = 220;

interface CoverFlowProps {
  currentSong: Song | null;
  prevSong: Song | null;
  nextSong: Song | null;
  onNext: () => void;
  onPrev: () => void;
  defaultGradientColors: string[];
  isEditMode: boolean;
  onPress: (e: any) => void;
  onSwipeConfirmed: () => void;
}

interface CoverCardProps {
  song: Song | null;
  indexOffset: number;
  translateX: SharedValue<number>;
  isEditMode: boolean;
  defaultGradientColors: string[];
  prevSong: Song | null;
  nextSong: Song | null;
  onPress: (e: any) => void;
  onSwipeConfirmed: () => void;
  onNext: () => void;
  onPrev: () => void;
}

const CoverCard: React.FC<CoverCardProps> = ({
  song,
  indexOffset,
  translateX,
  isEditMode,
  defaultGradientColors,
  prevSong,
  nextSong,
}) => {
    // indexOffset: -1 (Prev), 0 (Current), 1 (Next)
    
    const animatedStyle = useAnimatedStyle(() => {
       // Calculate transform based on swipe
       // We assume all cards are centered initially.
       
       // Spacing multiplier
       const SWIPE_SPACING = SCREEN_WIDTH * 0.8; 
       const cardTranslateX = translateX.value + (indexOffset * SWIPE_SPACING);
       
       // Removed Scale Effect as requested ("dont want getting big")
       // Kept logic simple 1:1 size
       const scale = 1;

       return {
           transform: [
               { translateX: cardTranslateX }, 
               { scale: scale } 
           ] as any, 
       };
    });

    // We simply stack them absolutely. Center is relative.
    if (!song && indexOffset !== 0) return null; 

    const imageUri = song?.coverImageUri;
    // Use Helper designed to guarantee colors even if missing ID
    const gradient = song ? getGradientForSong(song) : defaultGradientColors;

    return (
        <Animated.View 
            key={indexOffset}
            style={[
                styles.cardContainer,
                // Apply absolute positioning to ALL cards to ensure consistent behavior
                // but use left/right calc to center them.
                styles.centeredCard, 
                animatedStyle,
            ]}
        >
             <View style={styles.shadowContainer}>
                {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.coverArt} />
                ) : (
                    <LinearGradient colors={gradient as [string, string]} style={styles.coverArt}>
                        <Ionicons name="musical-notes" size={80} color="rgba(255,255,255,0.4)" />
                    </LinearGradient>
                )}
                
                {/* Hints for Center Card */}
                {indexOffset === 0 && !isEditMode && (
                    <Animated.View style={styles.swipeHintContainer}>
                        {prevSong && <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.5)" />}
                        <View style={{ flex: 1 }} />
                        {nextSong && <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.5)" />}
                    </Animated.View>
                )}

                {/* Edit Overlay for Center Card */}
                {indexOffset === 0 && isEditMode && (
                    <View style={styles.editOverlay}>
                        <Ionicons name="camera" size={32} color="#fff" />
                    </View>
                )}
             </View>
        </Animated.View>
    );
};

export const CoverFlow: React.FC<CoverFlowProps> = ({
  currentSong,
  prevSong,
  nextSong,
  onNext,
  onPrev,
  defaultGradientColors,
  isEditMode,
  onPress,
  onSwipeConfirmed,
}) => {
  const translateX = useSharedValue(0);
  const isInteracting = useSharedValue(false);

  // Reset position when song changes
  useEffect(() => {
    translateX.value = 0;
  }, [currentSong?.id, translateX]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onBegin(() => {
      isInteracting.value = true;
    })
    .onUpdate((e) => {
      // Resistance at edges if no next/prev song
      let friction = 1;
      if (!prevSong && e.translationX > 0) friction = 0.3;
      if (!nextSong && e.translationX < 0) friction = 0.3;
      
      translateX.value = e.translationX * friction;
    })
    .onEnd((e) => {
      isInteracting.value = false;
      const velocity = e.velocityX;
      const translation = e.translationX;

      // Threshold to trigger change
      const SWIPE_THRESHOLD = COVER_SIZE * 0.25; // Lower threshold feels snappier
      const TARGET_TRANSLATION = SCREEN_WIDTH * 0.8; // Match the SPACING used in render

      if (translation < -SWIPE_THRESHOLD && nextSong) {
        // Swiped Left -> Next
        runOnJS(onSwipeConfirmed)(); // STOP AUDIO INSTANTLY
        
        // "Alive" Spring: Fast snap, slight overshoot, quick settle.
        translateX.value = withSpring(-TARGET_TRANSLATION, { 
            velocity: velocity,
            mass: 0.6,        // Lighter feel
            damping: 15,      // Less resistance = more fluidity
            stiffness: 180,   // Responsive but not rigid
            overshootClamping: false // Allow it to breathe (bounce slightly)
        }, () => {
             runOnJS(onNext)();
        });
      } else if (translation > SWIPE_THRESHOLD && prevSong) {
        // Swiped Right -> Prev
        runOnJS(onSwipeConfirmed)(); // STOP AUDIO INSTANTLY

        translateX.value = withSpring(TARGET_TRANSLATION, {
            velocity: velocity,
            mass: 0.6,
            damping: 15,
            stiffness: 180,
            overshootClamping: false
        }, () => {
             runOnJS(onPrev)();
        });
      } else {
        // Snap back (Empty space or canceled swipe)
        translateX.value = withSpring(0, { mass: 0.5, damping: 15, stiffness: 150 });
      }
    });

  const tapGesture = Gesture.Tap().onEnd((e) => {
      runOnJS(onPress)(e);
  });

  const composedGesture = Gesture.Simultaneous(panGesture, tapGesture);

  return (
    <View style={styles.container}>
        <GestureDetector gesture={composedGesture}>
            <Animated.View style={styles.touchArea}>
                {/* Render Neighbors First (Below) */}
                <CoverCard 
                    song={prevSong} 
                    indexOffset={-1} 
                    translateX={translateX}
                    isEditMode={isEditMode}
                    defaultGradientColors={defaultGradientColors}
                    prevSong={prevSong}
                    nextSong={nextSong}
                    onPress={onPress}
                    onSwipeConfirmed={onSwipeConfirmed}
                    onNext={onNext}
                    onPrev={onPrev}
                />
                <CoverCard 
                    song={nextSong} 
                    indexOffset={1} 
                    translateX={translateX}
                    isEditMode={isEditMode}
                    defaultGradientColors={defaultGradientColors}
                    prevSong={prevSong}
                    nextSong={nextSong}
                    onPress={onPress}
                    onSwipeConfirmed={onSwipeConfirmed}
                    onNext={onNext}
                    onPrev={onPrev}
                />
                {/* Render Current (Top) */}
                <CoverCard 
                    song={currentSong} 
                    indexOffset={0} 
                    translateX={translateX}
                    isEditMode={isEditMode}
                    defaultGradientColors={defaultGradientColors}
                    prevSong={prevSong}
                    nextSong={nextSong}
                    onPress={onPress}
                    onSwipeConfirmed={onSwipeConfirmed}
                    onNext={onNext}
                    onPrev={onPrev}
                />
            </Animated.View>
        </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 240, 
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 10,
    // overflow: 'visible' does not work on Android if parent clips. 
    // Usually OK in simple Views.
  },
  touchArea: {
      width: '100%',
      height: '100%',
      // We need a specific container area.
      alignItems: 'center',
      justifyContent: 'center',
  },
  cardContainer: {
     width: COVER_SIZE,
     height: COVER_SIZE,
     justifyContent: 'center',
     alignItems: 'center',
     zIndex: 1,
  },
  centeredCard: {
      position: 'absolute',
      // Center horizontally: (Screen Width - Card Width) / 2
      left: (SCREEN_WIDTH - COVER_SIZE) / 2, 
      // Center vertically if needed, but height is fixed in container
  },
  shadowContainer: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 20, // MORE CURVED EDGES
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
    backgroundColor: '#222',
  },
  coverArt: {
    width: '100%',
    height: '100%',
    borderRadius: 20, // MODE CURVED EDGES
  },
  swipeHintContainer: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
  },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
});
