import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, Image, Text, ActivityIndicator, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, ResizeMode, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../components/ui/AppHeader'; // Assuming consistent header usage
import { Colors } from '../../constants/Colors';
import Fonts from '../../constants/Fonts';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const FilePreviewScreen = () => {
  const params = useLocalSearchParams<{ fileUri: string; fileName: string; fileType: 'image' | 'video' }>();
  const router = useRouter();
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<any>({}); // To store video status
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { fileUri, fileName, fileType } = params;

  useEffect(() => {
    if (fileType === 'video') {
      (async () => {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true, // Important for video sound to play even in silent mode
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        } catch (e) {
          console.error('Failed to set audio mode', e);
        }
      })();
    }
  }, [fileType]);

  if (!fileUri || !fileType) {
    return (
      <View style={styles.containerCentered}>
        <Text style={styles.errorText}>File information is missing.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.button}>
            <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderContent = () => {
    if (error) {
      return (
        <View style={styles.containerCentered}>
          <Ionicons name="alert-circle-outline" size={60} color={Colors.light.icon} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    if (isLoading && fileType === 'image') { // For images, loading is usually quick, handled by Image onError/onLoad
        // Can show a placeholder if desired, but Image component has its own internal loading
    }

    if (fileType === 'image') {
      return (
        <Image 
          source={{ uri: fileUri }}
          style={styles.image}
          resizeMode="contain"
          onLoad={() => setIsLoading(false)}
          onError={(e) => {
            console.error("Image load error:", e.nativeEvent.error);
            setError(`Failed to load image. ${e.nativeEvent.error || 'Unknown error'}`);
            setIsLoading(false);
          }}
        />
      );
    }

    if (fileType === 'video') {
      return (
        <Video
          ref={videoRef}
          style={styles.video}
          source={{
            uri: fileUri,
          }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          isLooping={false}
          onPlaybackStatusUpdate={playbackStatus => setStatus(() => playbackStatus)}
          onLoad={() => setIsLoading(false)}
          onError={(e) => {
            console.error("Video load error:", e);
            setError(`Failed to load video. ${e}`);
            setIsLoading(false);
          }}
          onReadyForDisplay={() => setIsLoading(false)} // Another good point to hide loader
        />
      );
    }

    return (
        <View style={styles.containerCentered}>
            <Text style={styles.errorText}>Unsupported file type for preview.</Text>
        </View>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader title={fileName || 'Preview'} />
      <View style={styles.contentContainer}>
        {isLoading && (
            <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={Colors.light.primary} />
                <Text style={styles.loadingText}>Loading Preview...</Text>
            </View>
        )}
        {!isLoading && renderContent()}
      </View>
      {fileType === 'video' && status.isLoaded && !error && (
        <View style={styles.controlsContainer}>
          <TouchableOpacity 
            onPress={() => status.isPlaying ? videoRef.current?.pauseAsync() : videoRef.current?.playAsync()}
            style={styles.controlButton}
          >
            <Ionicons name={status.isPlaying ? 'pause-circle-outline' : 'play-circle-outline'} size={40} color={Colors.light.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background, // Darker background for media focus
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  containerCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  image: {
    width: screenWidth * 0.95,
    height: screenHeight * 0.8,
  },
  video: {
    width: screenWidth,
    height: screenHeight * 0.7, // Adjust as needed
    backgroundColor: '#000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)', // Semi-transparent overlay
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // Ensure it's on top
  },
  loadingText: {
    marginTop: 10,
    fontSize: Fonts.size.medium,
    color: Colors.light.background, // White text on dark overlay
    fontFamily: Fonts.type.base,
  },
  errorText: {
    fontSize: Fonts.size.large,
    color: Colors.light.text, // Use theme text color for errors
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: Fonts.type.base,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: Colors.light.background, // Match container bg
    borderTopWidth: 1,
    borderTopColor: Colors.light.icon,
  },
  controlButton: {
    padding: 10,
  },
  button: {
    marginTop: 20,
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  buttonText: {
    color: Colors.light.buttonText,
    fontSize: Fonts.size.medium,
    fontFamily: Fonts.type.bold,
  },
});

export default FilePreviewScreen; 