import React from 'react';
import { FlexWidget, TextWidget, ImageWidget } from 'react-native-android-widget';

interface SongWidgetProps {
  title?: string;
  artist?: string;
  coverUri?: string;
  isPlaying?: boolean;
}

export function SongWidget({ title = 'No Song Playing', artist = 'LuvLyrics', coverUri, isPlaying = false }: SongWidgetProps) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#111111', // Dark background
        borderRadius: 24,
        flexDirection: 'row', // Horizontal layout for Vinyl style
        alignItems: 'center',
        padding: 16,
      }}
      clickAction="OPEN_APP"
    >
      {/* Vinyl Record / Album Art */}
      <FlexWidget
        style={{
          height: 100,
          width: 100,
          borderRadius: 50, // Circular
          backgroundColor: '#222',
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 16,
        }}
      >
        {coverUri ? (
          <ImageWidget
            image={coverUri as any}
            imageWidth={100}
            imageHeight={100}
            style={{
              height: 100,
              width: 100,
              borderRadius: 50,
            }}
          />
        ) : (
          <FlexWidget
            style={{
              height: 40,
              width: 40,
              borderRadius: 20,
              backgroundColor: '#333',
            }}
          />
        )}
        
        {/* Center Hole for Vinyl Look */}
        <FlexWidget
          style={{
            height: 20,
            width: 20,
            borderRadius: 10,
            backgroundColor: '#111',
            borderWidth: 2,
            borderColor: '#333',
            // Note: Absolute position removed as it's not supported by FlexWidget
          }}
        />
      </FlexWidget>

      {/* Info & Controls */}
      <FlexWidget
        style={{
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <TextWidget
          text={title}
          maxLines={1}
          style={{
            fontSize: 18,
            // Resolved from android/app/src/main/assets/fonts; falls back to the system font.
            fontFamily: 'SF-Pro-Text-Bold',
            color: '#FFFFFF',
          }}
        />
        <TextWidget
          text={artist}
          maxLines={1}
          style={{
            fontSize: 14,
            fontFamily: 'SF-Pro-Text-Regular',
            color: '#AAAAAA',
            marginBottom: 12,
          }}
        />

        {/* Controls */}
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' }}>
          <TextWidget
            text="⏮" // Prev
            style={{ fontSize: 24, color: '#FFF' }}
            clickAction="PREV_SONG"
          />
           <TextWidget
            text={isPlaying ? "⏸" : "▶"} // Play/Pause
            style={{ fontSize: 32, color: '#FFF' }}
            clickAction="TOGGLE_PLAY"
          />
          <TextWidget
            text="⏭" // Next
            style={{ fontSize: 24, color: '#FFF' }}
            clickAction="NEXT_SONG"
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

