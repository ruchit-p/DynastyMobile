import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, AudioModule } from 'expo-audio';
import Slider from '@react-native-community/slider';
import { Colors } from '../../constants/Colors';
import { Spacing } from '../../constants/Spacing';

interface VoiceMessagePlayerProps {
  uri: string;
  duration?: number;
  isOwnMessage?: boolean;
}

export default function VoiceMessagePlayer({
  uri,
  duration = 0,
  isOwnMessage = false,
}: VoiceMessagePlayerProps) {
  const player = useAudioPlayer(uri);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (player) {
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.isLoaded) {
          setIsPlaying(status.playing);
          setCurrentPosition(status.currentTime / 1000); // Convert to seconds
          
          if (status.duration) {
            setTotalDuration(status.duration / 1000); // Convert to seconds
          }
          
          if (status.didJustFinish) {
            setIsPlaying(false);
            setCurrentPosition(0);
            player.seekTo(0);
          }
        }
      });

      return () => {
        subscription.remove();
        if (player.playing) {
          player.pause();
        }
      };
    }
  }, [player]);

  const togglePlayback = async () => {
    if (!player) return;

    try {
      setIsLoading(true);
      
      if (isPlaying) {
        await player.pause();
      } else {
        // Configure audio mode for playback
        await AudioModule.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        
        await player.play();
      }
    } catch (error) {
      console.error('Playback error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onSliderValueChange = async (value: number) => {
    if (player) {
      await player.seekTo(value * 1000); // Convert to milliseconds
      setCurrentPosition(value);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const bubbleColor = isOwnMessage ? Colors.light.primary : '#F0F0F0';
  const textColor = isOwnMessage ? 'white' : Colors.light.text.primary;
  const iconColor = isOwnMessage ? 'white' : Colors.light.primary;

  return (
    <View style={[styles.container, { backgroundColor: bubbleColor }]}>
      <TouchableOpacity
        onPress={togglePlayback}
        disabled={isLoading}
        style={styles.playButton}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={24}
            color={iconColor}
          />
        )}
      </TouchableOpacity>

      <View style={styles.waveformContainer}>
        <Slider
          style={styles.slider}
          value={currentPosition}
          minimumValue={0}
          maximumValue={totalDuration || 1}
          onSlidingComplete={onSliderValueChange}
          minimumTrackTintColor={iconColor}
          maximumTrackTintColor={isOwnMessage ? 'rgba(255,255,255,0.3)' : '#CCC'}
          thumbTintColor={iconColor}
        />
        
        <View style={styles.timeContainer}>
          <Text style={[styles.timeText, { color: textColor }]}>
            {formatTime(currentPosition)}
          </Text>
          <Text style={[styles.timeText, { color: textColor }]}>
            {formatTime(totalDuration)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: 18,
    minWidth: 200,
    maxWidth: 250,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  waveformContainer: {
    flex: 1,
  },
  slider: {
    height: 30,
    marginHorizontal: -5,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    marginTop: -5,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
  },
});