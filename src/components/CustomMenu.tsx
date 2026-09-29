/**
 * Context menu on Allegra's floating glass: frosted groups, hairline
 * separators, the signal colour for Cancel and the warm accent for
 * destructive rows.
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
  Platform,
  Dimensions,
} from 'react-native';
import { Frosted } from './allegra/Frosted';
import { Glass, Signal } from '../constants/allegraTheme';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  FadeIn, 
  FadeOut, 
} from 'react-native-reanimated';

interface MenuOption {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: (e?: any) => void;
  isDestructive?: boolean;
}

interface CustomMenuProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: MenuOption[];
  anchorPosition?: { x: number; y: number };
}

export const CustomMenu: React.FC<CustomMenuProps> = ({
  visible,
  onClose,
  title,
  options,
  anchorPosition,
}) => {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View 
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={styles.overlay}
        />
      </TouchableWithoutFeedback>

      <View style={styles.menuContainer} pointerEvents="box-none">
        <Animated.View 
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={[
            styles.menuContent,
            anchorPosition ? {
              position: 'absolute',
              // Tapped in the lower half: open upward from the tap, so a
              // button near the bottom never pushes the menu off screen.
              ...(anchorPosition.y > Dimensions.get('window').height / 2
                ? { bottom: Dimensions.get('window').height - anchorPosition.y + 8 }
                : { top: anchorPosition.y }),
              right: anchorPosition.x > 200 ? 16 : undefined, // Align right if tapped on right side
              left: anchorPosition.x <= 200 ? 16 : undefined,
              width: 280, // Slightly wider for safer text fitting
            } : {}
          ]}
        >
          {/* Menu Items Group */}
          <View style={styles.groupContainer}>
            <Frosted radius={18} intensity={60} tint={0.5} />
            {/* Title Header */}
            {title && (
              <View style={styles.header}>
                <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
              </View>
            )}

            {options.map((option, index) => (
              <View key={index}>
                {(index > 0 || title) && <View style={styles.separator} />}
                <Pressable
                  style={({ pressed }) => [
                    styles.option,
                    pressed && styles.optionPressed,
                  ]}
                  onPress={(e) => {
                    option.onPress(e);
                    onClose();
                  }}
                >
                  <Text 
                    style={[
                      styles.optionLabel, 
                      option.isDestructive && styles.destructiveLabel
                    ]}
                    numberOfLines={1} // Prevent excessively tall items, rely on truncation for extreme cases
                  >
                    {option.label}
                  </Text>
                  {option.icon && (
                    <Ionicons 
                      name={option.icon} 
                      size={20} 
                      color={option.isDestructive ? Signal.accent : Signal.inkSoft} 
                      style={{ marginLeft: 12 }} // Add spacing
                    />
                  )}
                </Pressable>
              </View>
            ))}
          </View>

          {/* Cancel Button only if NOT anchored */}
          {!anchorPosition && (
            <Pressable 
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.cancelPressed
              ]}
              onPress={onClose}
            >
              <Frosted radius={18} intensity={60} tint={0.5} />
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Glass.scrim,
  },
  menuContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  menuContent: {
    width: '100%',
    gap: 8,
  },
  groupContainer: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  header: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: Glass.hairline,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: Signal.inkMuted,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  optionPressed: {
    backgroundColor: Glass.fillPressed,
  },
  optionLabel: {
    fontSize: 17,
    fontWeight: '400',
    color: Signal.ink,
    flex: 1, // Allow text to take available space
  },
  destructiveLabel: {
    color: Signal.accent,
  },
  separator: {
    height: 0.5,
    backgroundColor: Glass.hairline,
    marginLeft: 16,
  },
  cancelButton: {
    borderRadius: 18,
    overflow: 'hidden',
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelPressed: {
    backgroundColor: Glass.fillPressed,
  },
  cancelLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: Signal.wave,
  },
});

export default CustomMenu;
