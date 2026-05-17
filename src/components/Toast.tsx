import React, { useLayoutEffect, useRef, useCallback } from 'react';
import { Animated, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../store/settingsStore';

interface ToastProps {
  visible: boolean;
  message: string; // Should be user-friendly; use getLyricsFriendlyError() for fetch errors
  type?: 'success' | 'error' | 'info';
  onDismiss: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ 
  visible, 
  message, 
  type = 'success', 
  onDismiss,
  duration = 3000 
}) => {
  const insets = useSafeAreaInsets();
  const miniPlayerStyle = useSettingsStore(state => state.miniPlayerStyle);
  const isIsland = miniPlayerStyle === 'island';

  // Animation Values
  // Initial values set far off-screen
  const initialY = isIsland ? 200 : -200;
  const translateY = useRef(new Animated.Value(initialY)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;

  const handleDismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: isIsland ? 100 : -100, // Exit direction matches entry
        duration: 300,
        useNativeDriver: true
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      })
    ]).start(() => onDismiss());
  }, [isIsland, onDismiss, opacity, translateY]);

  // Use useLayoutEffect to prevent initial flash
  useLayoutEffect(() => {
    if (visible) {
      // RESET values immediately
      progress.setValue(1); 
      translateY.setValue(isIsland ? 200 : -200);
      opacity.setValue(0);
      
      // Slide In
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0, 
          useNativeDriver: true,
          tension: 50,
          friction: 9
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true
        })
      ]).start();

      // Progress Bar Animation
      Animated.timing(progress, {
        toValue: 0,
        duration: duration,
        useNativeDriver: false, 
      }).start();

      // Auto Dismiss
      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, isIsland, duration, handleDismiss, opacity, progress, translateY]);

  if (!visible) return null;

  const backgroundColor = 
    type === 'success' ? '#1E1E1E' : 
    type === 'error' ? '#FF3B30' : 
    '#007AFF';
  
  const iconColor = type === 'success' ? '#4CD964' : '#FFF';

  const iconName = 
    type === 'success' ? 'checkmark-circle' : 
    type === 'error' ? 'alert-circle' : 
    'information-circle';

  // Dynamic Styles based on position preference
  // User requested "want down near tonav bar" - implies minimal offset.
  const positionStyle = isIsland ? {
      bottom: insets.bottom + 90, // Adjusted to be above Tab Bar
      right: 20, 
      minWidth: 200,
      maxWidth: 300, 
  } : {
      top: insets.top + 10,
      right: 20,
      minWidth: 200,
      maxWidth: 300, // Fixed: Use number to satisfy TypeScript
  };

  return (
    <Animated.View style={[
      styles.container, 
      positionStyle,
      { 
        transform: [{ translateY }],
        opacity,
        backgroundColor 
      }
    ]}>
      <TouchableOpacity onPress={handleDismiss} activeOpacity={0.8} style={styles.content}>
        <Ionicons name={iconName} size={24} color={iconColor} />
        <Text style={styles.text}>{message}</Text>
      </TouchableOpacity>
      
      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <Animated.View 
            style={[
                styles.progressBar, 
                { 
                    width: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%']
                    }),
                    backgroundColor: iconColor
                }
            ]} 
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 9999,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  text: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  progressBarContainer: {
    height: 3,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressBar: {
    height: '100%',
  }
});
