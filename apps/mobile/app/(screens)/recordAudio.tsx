import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Text,
  Alert,
} from 'react-native';
import { 
  AudioModule, 
  useAudioRecorder, 
  RecordingPresets, 
  useAudioPlayer, 
  setAudioModeAsync,
  AudioMode 
} from 'expo-audio';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Spacing } from '../../constants/Spacing';
import { commonHeaderOptions } from '../../constants/headerConfig';

const RecordAudioScreen = () => {
  const router = useRouter();
  
  // Recording states with expo-audio hooks
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null); // Store permission string

  // Playback states with expo-audio hooks
  const player = useAudioPlayer(audioUri); // Initialize player with URI, will load when URI is set
  const [isPlaying, setIsPlaying] = useState(false);

  // Timer states
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerIntervalRef = useRef<number | null>(null); // Correct type for setInterval ID in RN

  useEffect(() => {
    // Request permissions on component mount
    requestPermissions();
    
    // Cleanup on unmount
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      // Player and recorder are managed by hooks, auto-cleaned up mostly.
      // Explicitly stop if recording/playing to be safe on unmount.
      if (isRecording) {
        audioRecorder.stop();
      }
      if (player && player.playing) {
        player.pause(); // Or player.stop() if available and more appropriate
      }
    };
  }, []); // audioRecorder, player removed from deps to avoid re-triggering

  // Effect to update isPlaying state based on player's playing property
  useEffect(() => {
    if (player) {
      // Use 'playbackStatusUpdate' for expo-audio AudioPlayer
      const statusSubscription = player.addListener('playbackStatusUpdate', (status) => {
        // status is of type AudioStatus from expo-audio
        setIsPlaying(status.playing);
        if (status.isLoaded && !status.playing && status.didJustFinish) {
          // Playback finished
          // Player position might be reset by the player itself or you can seek to 0 if needed.
        }
      });
      return () => {
        statusSubscription.remove();
      };
    }
  }, [player]);


  // Request audio recording permissions
  const requestPermissions = async () => {
    const { status, granted } = await AudioModule.requestRecordingPermissionsAsync();
    setPermissionStatus(status); // Store the full status string
    
    if (!granted) {
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
      if (permissionStatus !== 'granted') {
        await requestPermissions();
        // Re-check status after requesting again
        if (permissionStatus !== 'granted' && (await AudioModule.getRecordingPermissionsAsync()).status !== 'granted') {
            Alert.alert('Permission Error', 'Microphone permission is still not granted.');
            return;
        }
      }
      
      const audioMode: Partial<AudioMode> = { 
        allowsRecording: true, 
        playsInSilentMode: true,
        shouldPlayInBackground: false, // Assuming recording doesn't need background playback
        interruptionModeAndroid: 'duckOthers', // Or 'doNotMix'
      };
      if (Platform.OS === 'ios') {
        audioMode.interruptionMode = 'duckOthers'; // Or 'doNotMix'
      }
      await setAudioModeAsync(audioMode);
      
      await audioRecorder.prepareToRecordAsync(); // Prepare with selected options (HIGH_QUALITY)
      audioRecorder.record();
      
      setIsRecording(true);
      setAudioUri(null); // Clear previous recording URI
      setRecordingDuration(0);
      
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error: any) {
      console.error('Failed to start recording', error);
      Alert.alert('Error', `Failed to start recording: ${error.message || 'Unknown error'}`);
    }
  };

  // Stop recording
  const stopRecording = async () => {
    try {
      if (!audioRecorder.isRecording) return;
      
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      
      setIsRecording(false);
      await audioRecorder.stop();
      const uri = audioRecorder.uri; // URI is available after stop
      
      if (uri) {
        setAudioUri(uri);
        console.log('Recording URI:', uri);
      }
      
      // Reset audio mode (optional, depends on desired app behavior)
      // await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch (error: any) {
      console.error('Failed to stop recording', error);
      Alert.alert('Error', `Failed to stop recording: ${error.message || 'Unknown error'}`);
    }
  };

  // Play recorded audio
  const playSound = async () => {
    if (!audioUri || !player) return;
    try {
      if (player.playing) {
        await player.pause(); // Pause if already playing different audio or same from start
      }
      // The player is initialized with audioUri, so it should load it.
      // If audioUri changed, player might need player.replace(audioUri) if not reactive.
      // useAudioPlayer(audioUri) should handle this if audioUri is a dependency.
      // For now, let's ensure it is loaded if not already.
      if (!player.isLoaded) {
          // This check might not be necessary if useAudioPlayer handles URI changes correctly
          // by reloading. If audioUri is passed to useAudioPlayer, it should manage this.
      }
      await player.play();
      // isPlaying state will be updated by the 'playingChange' listener
    } catch (error: any) {
      console.error('Failed to play sound', error);
      Alert.alert('Error', `Failed to play recording: ${error.message || 'Unknown error'}`);
    }
  };

  // Stop playing
  const stopSound = async () => {
    if (player && player.playing) {
      try {
        await player.pause(); // Using pause as stop, or seekTo(0) then pause
                                // Or if a 'stop' method is available on AudioPlayer: await player.stop();
      } catch (error: any) {
         console.error('Failed to stop sound', error);
         Alert.alert('Error', `Failed to stop playback: ${error.message || 'Unknown error'}`);
      }
    }
    setIsPlaying(false); // Explicitly set here in case event is missed or for immediate UI update
  };

  // Save recording and return to the previous screen
  const saveRecording = () => {
    if (!audioUri) {
      Alert.alert('No Recording', 'Please record audio before saving.');
      return;
    }
    
    router.navigate({
      pathname: '..', // Navigate back to the previous screen
      params: { 
        recordedAudioUri: audioUri,
        recordedAudioDuration: recordingDuration // Ensure recordingDuration is accurate
      }
    });
  };

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
        <View style={styles.timerContainer}>
          <Text style={styles.timerText}>{formatTime(recordingDuration)}</Text>
          <Text style={styles.timerLabel}>
            {isRecording ? 'Recording...' : audioUri ? 'Recorded' : (permissionStatus === 'granted' ? 'Ready to Record' : (permissionStatus === null ? 'Checking permissions...' : 'Mic permission needed'))}
          </Text>
        </View>
        
        <View style={styles.controlsContainer}>
          <TouchableOpacity 
            style={[
              styles.recordButton, 
              isRecording && styles.recordingButton,
              permissionStatus !== 'granted' && styles.disabledButton // Optional: style for disabled
            ]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={permissionStatus !== 'granted' && !isRecording} // Disable if no permission (unless already recording)
          >
            <Ionicons 
              name={isRecording ? 'stop' : 'mic'} 
              size={36} 
              color="white"
            />
          </TouchableOpacity>
          
          {audioUri && player && ( // Ensure player instance exists
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
        
        <Text style={styles.instructionText}>
          {isRecording 
            ? 'Tap the button to stop recording' 
            : audioUri 
              ? (isPlaying ? 'Tap to stop playback' : 'Tap the play button to listen')
              : (permissionStatus === 'granted' ? 'Tap the button to start recording' : 'Enable microphone to record')}
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
    textAlign: 'center',
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
  disabledButton: { // Optional style for disabled button
    backgroundColor: Colors.palette.neutral.light,
  }
});

export default RecordAudioScreen; 