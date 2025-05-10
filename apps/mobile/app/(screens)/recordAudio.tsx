import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Text,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { Stack, useRouter } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { commonHeaderOptions } from '../../constants/headerConfig';

const RecordAudioScreen = () => {
  const router = useRouter();
  
  // Recording states
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<boolean | null>(null);
  
  // Timer states
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Request permissions on component mount
    requestPermissions();
    
    // Cleanup on unmount
    return () => {
      if (timerInterval) clearInterval(timerInterval);
      if (sound) sound.unloadAsync();
      if (recording) recording.stopAndUnloadAsync();
    };
  }, []);

  // Request audio recording permissions
  const requestPermissions = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    setPermissionStatus(status === 'granted');
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant microphone access to record audio.',
        [{ text: 'OK' }]
      );
    }
  };

  // Format seconds to display as MM:SS
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Start recording
  const startRecording = async () => {
    try {
      if (!permissionStatus) {
        await requestPermissions();
        if (!permissionStatus) return;
      }
      
      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      // Prepare and start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start timer
      const interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      
      setTimerInterval(interval);
    } catch (error) {
      console.error('Failed to start recording', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  // Stop recording
  const stopRecording = async () => {
    try {
      if (!recording) return;
      
      // Stop the timer
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      
      setIsRecording(false);
      
      // Stop recording and get URI
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (uri) {
        setAudioUri(uri);
        console.log('Recording URI:', uri);
      }
      
      setRecording(null);
      
      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch (error) {
      console.error('Failed to stop recording', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  // Play recorded audio
  const playSound = async () => {
    try {
      if (!audioUri) return;
      
      // Unload previous sound if exists
      if (sound) {
        await sound.unloadAsync();
      }
      
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      setIsPlaying(true);
      
      // Listen for playback status updates
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && !status.isPlaying && status.didJustFinish) {
          setIsPlaying(false);
        }
      });
    } catch (error) {
      console.error('Failed to play sound', error);
      Alert.alert('Error', 'Failed to play recording');
    }
  };

  // Stop playing
  const stopSound = async () => {
    if (sound) {
      await sound.stopAsync();
      setIsPlaying(false);
    }
  };

  // Save recording and return to the previous screen
  const saveRecording = () => {
    if (!audioUri) {
      Alert.alert('No Recording', 'Please record audio before saving.');
      return;
    }
    
    // Navigate back with the audio URI
    router.navigate({
      pathname: '..',
      params: { 
        recordedAudioUri: audioUri,
        recordedAudioDuration: recordingDuration
      }
    });
  };

  // Create header options with a Save button when recording is available
  const headerOptions = {
    ...commonHeaderOptions,
    title: 'Record Audio',
    headerLeft: () => (
      <TouchableOpacity 
        onPress={() => router.back()} 
        style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10, padding: 5 }}
      >
        <Ionicons name="close" size={28} color={Colors.palette.neutral.dark} />
      </TouchableOpacity>
    ),
    headerRight: audioUri ? () => (
      <TouchableOpacity onPress={saveRecording} style={{ marginRight: 15 }}>
        <Text style={styles.saveButtonText}>Save</Text>
      </TouchableOpacity>
    ) : undefined,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={headerOptions} />
      
      <View style={styles.container}>
        {/* Timer Display */}
        <View style={styles.timerContainer}>
          <Text style={styles.timerText}>{formatTime(recordingDuration)}</Text>
          <Text style={styles.timerLabel}>
            {isRecording ? 'Recording...' : audioUri ? 'Recorded' : 'Ready to Record'}
          </Text>
        </View>
        
        {/* Controls */}
        <View style={styles.controlsContainer}>
          {/* Record Button */}
          <TouchableOpacity 
            style={[
              styles.recordButton, 
              isRecording && styles.recordingButton
            ]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Ionicons 
              name={isRecording ? 'stop' : 'mic'} 
              size={36} 
              color="white"
            />
          </TouchableOpacity>
          
          {/* Play Button (only shown when there's a recording) */}
          {audioUri && (
            <TouchableOpacity 
              style={styles.playButton}
              onPress={isPlaying ? stopSound : playSound}
            >
              <Ionicons 
                name={isPlaying ? 'stop' : 'play'} 
                size={24} 
                color="white"
              />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Instructions */}
        <Text style={styles.instructionText}>
          {isRecording 
            ? 'Tap the button to stop recording' 
            : audioUri 
              ? 'Tap the play button to listen to your recording' 
              : 'Tap the button to start recording'}
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.palette.neutral.white,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  timerText: {
    fontSize: 56,
    fontWeight: '500',
    color: Colors.palette.neutral.darkest,
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    fontSize: 18,
    color: Colors.palette.neutral.medium,
    marginTop: Spacing.sm,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.xl,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.palette.dynastyGreen.dark,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  recordingButton: {
    backgroundColor: Colors.palette.status.error,
  },
  playButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.palette.dynastyGreen.medium,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  instructionText: {
    color: Colors.palette.neutral.medium,
    textAlign: 'center',
    marginTop: Spacing.md,
    fontSize: 16,
  },
  saveButtonText: {
    color: Colors.palette.dynastyGreen.dark,
    fontSize: 17,
    fontWeight: '500',
  },
});

export default RecordAudioScreen; 