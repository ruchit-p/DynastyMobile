import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  AudioModule, 
  useAudioRecorder, 
  RecordingPresets,
  setAudioModeAsync,
  AudioMode 
} from 'expo-audio';
import { Colors } from '../../constants/Colors';
import { Spacing } from '../../constants/Spacing';

interface VoiceMessageRecorderProps {
  onRecordingComplete: (uri: string, duration: number) => void;
  onCancel: () => void;
  isVisible: boolean;
}

export default function VoiceMessageRecorder({
  onRecordingComplete,
  onCancel,
  isVisible,
}: VoiceMessageRecorderProps) {
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const checkPermissions = useCallback(async () => {
    try {
      const { status } = await AudioModule.getRecordingPermissionsAsync();
      if (status === 'granted') {
        setHasPermission(true);
      } else {
        const { status: newStatus } = await AudioModule.requestRecordingPermissionsAsync();
        setHasPermission(newStatus === 'granted');
        
        if (newStatus !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Please allow microphone access to send voice messages.',
            [{ text: 'OK', onPress: onCancel }]
          );
        }
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  }, [onCancel]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;

    try {
      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Stop recording
      const uri = await audioRecorder.stop();
      audioRecorder.release();
      
      setIsRecording(false);

      if (uri && recordingDuration >= 1) {
        onRecordingComplete(uri, recordingDuration);
      } else if (recordingDuration < 1) {
        Alert.alert('Too Short', 'Voice message must be at least 1 second long.');
        onCancel();
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Recording Error', 'Failed to save recording. Please try again.');
      onCancel();
    }
  }, [audioRecorder, isRecording, recordingDuration, onRecordingComplete, onCancel]);

  useEffect(() => {
    if (isVisible) {
      checkPermissions();
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (isRecording) {
        stopRecording();
      }
    };
  }, [isVisible, isRecording, checkPermissions, stopRecording]);

  useEffect(() => {
    if (isRecording) {
      // Start pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  const startRecording = async () => {
    if (!hasPermission) {
      await checkPermissions();
      return;
    }

    try {
      // Configure audio mode for recording
      await setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      } as AudioMode);

      // Start recording
      await audioRecorder.record();
      setIsRecording(true);
      setRecordingDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000) as unknown as NodeJS.Timeout;
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
    }
  };


  const cancelRecording = async () => {
    if (isRecording) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      await audioRecorder.stop();
      audioRecorder.release();
      setIsRecording(false);
    }
    
    setRecordingDuration(0);
    onCancel();
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isVisible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.recordingContainer}>
        {isRecording && (
          <View style={styles.recordingInfo}>
            <View style={styles.recordingIndicator}>
              <Animated.View
                style={[
                  styles.recordingDot,
                  { transform: [{ scale: pulseAnim }] }
                ]}
              />
            </View>
            <Text style={styles.duration}>{formatDuration(recordingDuration)}</Text>
            <Text style={styles.recordingText}>Recording...</Text>
          </View>
        )}

        <View style={styles.controls}>
          <TouchableOpacity
            onPress={cancelRecording}
            style={styles.cancelButton}
          >
            <Ionicons name="close" size={30} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={isRecording ? stopRecording : startRecording}
            style={[
              styles.recordButton,
              isRecording && styles.recordButtonActive
            ]}
          >
            <Ionicons 
              name={isRecording ? "stop" : "mic"} 
              size={40} 
              color="white" 
            />
          </TouchableOpacity>

          {isRecording ? (
            <TouchableOpacity
              onPress={stopRecording}
              style={styles.sendButton}
            >
              <Ionicons name="send" size={30} color={Colors.light.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.placeholder} />
          )}
        </View>

        {!isRecording && (
          <Text style={styles.hintText}>Tap to record voice message</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  recordingContainer: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  recordingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  recordingIndicator: {
    marginRight: Spacing.sm,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF4444',
  },
  duration: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text.primary,
    marginHorizontal: Spacing.sm,
  },
  recordingText: {
    fontSize: 16,
    color: Colors.light.text.secondary,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  recordButtonActive: {
    backgroundColor: '#FF4444',
  },
  cancelButton: {
    padding: Spacing.md,
  },
  sendButton: {
    padding: Spacing.md,
  },
  placeholder: {
    width: 30 + Spacing.md * 2,
  },
  hintText: {
    textAlign: 'center',
    marginTop: Spacing.md,
    fontSize: 14,
    color: Colors.light.text.secondary,
  },
});