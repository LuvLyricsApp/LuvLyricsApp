import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

interface ProcessingOverlayProps {
  isVisible: boolean;
  stage: string;
  progress: number;
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({
  isVisible,
  stage,
  progress,
}) => {
  if (!isVisible) return null;

  return (
    <View style={styles.processingOverlay}>
      <View style={styles.processingCard}>
        <ActivityIndicator size="large" color="#EDEDED" />
        <Text style={styles.processingStage}>{stage}</Text>
        <View style={styles.progressBarContainer}>
          <View 
            style={[
              styles.progressBar, 
              { width: `${Math.round(progress * 100)}%` }
            ]} 
          />
        </View>
        <Text style={styles.processingPercent}>
          {Math.round(progress * 100)}%
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  processingCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    minWidth: 280,
    borderWidth: 1,
    borderColor: '#262626',
  },
  processingStage: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '100%',
    height: 6,
    backgroundColor: '#262626',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 3,
  },
  processingPercent: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
  },
});
