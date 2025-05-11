import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, Image, Text, ActivityIndicator, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Video, ResizeMode, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system'; // Import FileSystem
import { commonHeaderOptions } from '../../constants/headerConfig';
import { Colors } from '../../constants/Colors';
import Fonts from '../../constants/Fonts';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const FilePreviewScreen = () => {
  const params = useLocalSearchParams<{ fileUri: string; fileName: string; fileType: 'image' | 'video' }>();
  const router = useRouter();
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true); // Global loading for screen (download + render)
  const [error, setError] = useState<string | null>(null);
  const [mediaUriToDisplay, setMediaUriToDisplay] = useState<string | null>(null); // URI for Image/Video source

  const { fileUri: initialFileUri, fileName, fileType } = params;

  useEffect(() => {
    let isMounted = true;

    const setupAudioAndPrepareMedia = async () => {
      if (!isMounted) return;

      if (fileType === 'video') {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        } catch (e) {
          console.error('Failed to set audio mode for video playback:', e);
        }
      }

      if (!initialFileUri) {
        if (isMounted) {
          setError("File information is missing.");
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) setIsLoading(true);

      if (initialFileUri.startsWith('http')) {
        const extension = fileName?.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
        const localPath = `${FileSystem.cacheDirectory}${fileName ? fileName.replace(/[^a-zA-Z0-9.]/g, '_') : `preview_${Date.now()}`}${extension}`;
        
        try {
          console.log(`Attempting to download ${fileType}: ${initialFileUri} to ${localPath}`);
          const downloadResult = await FileSystem.downloadAsync(initialFileUri, localPath);
          console.log("Download HTTP Result:", JSON.stringify({ status: downloadResult.status, headers: downloadResult.headers, mimeType: downloadResult.mimeType }));

          if (isMounted) {
            if (downloadResult.status === 200) {
              try {
                const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
                console.log("Downloaded File Info:", JSON.stringify(fileInfo));

                if (fileInfo.exists && fileInfo.size && fileInfo.size > 500) { // Check existence and size
            setMediaUriToDisplay(downloadResult.uri);
            setError(null); 
                } else {
                  const sizeError = fileInfo.exists ? `File size too small (${fileInfo.size} bytes)` : 'File not found after download';
                  console.error("Downloaded file seems invalid or too small. URI:", downloadResult.uri, "Info:", fileInfo);
                  setError(`Failed to download a valid media file. ${sizeError}.`);
                  setMediaUriToDisplay(null);
                }
              } catch (infoError: any) {
                console.error("Error getting file info after download:", infoError);
                setError(`Failed to verify downloaded file. ${infoError.message}`);
                setMediaUriToDisplay(null);
              }
            } else {
              console.error("Download failed. Status:", downloadResult.status, "URI:", initialFileUri);
              setError(`Failed to download media. HTTP status ${downloadResult.status}.`);
              setMediaUriToDisplay(null); // Ensure we don't try to display a bad URI
            }
          }
        } catch (e: any) {
          console.error(`Error downloading ${fileType} from ${initialFileUri}:`, e);
          if (isMounted) {
            setError(`Failed to download media for preview. ${e.message || 'Check network or permissions.'}`);
            setMediaUriToDisplay(null);
          }
        } finally {
          if (isMounted) setIsLoading(false); 
        }
      } else { // Already a local URI
        if (isMounted) {
          setMediaUriToDisplay(initialFileUri);
          setError(null);
          setIsLoading(false);
        }
      }
    };

    setupAudioAndPrepareMedia();

    return () => {
      isMounted = false;
      if (mediaUriToDisplay && mediaUriToDisplay.startsWith(FileSystem.cacheDirectory || '')) {
        FileSystem.deleteAsync(mediaUriToDisplay, { idempotent: true })
          .then(() => console.log("Deleted cached preview file:", mediaUriToDisplay))
          .catch(e => console.warn("Failed to delete cached preview file:", mediaUriToDisplay, e));
      }
    };
  }, [initialFileUri, fileName, fileType]);


  const renderActualContent = () => {
    if (error && !mediaUriToDisplay) { 
        return (
            <View style={styles.containerCentered}>
                <Ionicons name="alert-circle-outline" size={60} color={Colors.light.text.error} />
                <Text style={styles.errorText}>{error}</Text>
                 <TouchableOpacity onPress={() => router.back()} style={styles.button}>
                    <Text style={styles.buttonText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }
    
    if (!mediaUriToDisplay) {
        return null; 
    }

    if (fileType === 'image') {
      return (
        <Image
          source={{ uri: mediaUriToDisplay }}
          style={styles.image}
          resizeMode="contain"
          onError={(e) => {
            console.error("Image rendering error (from local URI):", e.nativeEvent.error);
            if (!error) setError(`Failed to render image. ${e.nativeEvent.error || ''}`);
          }}
        />
      );
    }

    if (fileType === 'video') {
      return (
        <Video
          ref={videoRef}
          style={styles.video}
          source={{ uri: mediaUriToDisplay }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          isLooping={false}
          onPlaybackStatusUpdate={playbackStatus => setStatus(() => playbackStatus)}
          onError={(videoError) => {
            console.error("Video rendering error (from local URI):", videoError);
            if (!error) setError(`Failed to render video. ${videoError}`);
          }}
        />
      );
    }

    return (
        <View style={styles.containerCentered}>
            <Text style={styles.errorText}>Unsupported file type for preview.</Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.button}>
                <Text style={styles.buttonText}>Go Back</Text>
            </TouchableOpacity>
        </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: fileName || 'Preview',
          ...commonHeaderOptions,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 10 : 0 }}>
              <Ionicons name="arrow-back" size={24} color={Colors.light.text.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.contentContainer}>
        {!isLoading && (mediaUriToDisplay || error) && renderActualContent()}
        
        {isLoading && (
            <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={Colors.dynastyGreen} />
                <Text style={styles.loadingText}>Loading Preview...</Text>
            </View>
        )}
      </View>
      {fileType === 'video' && mediaUriToDisplay && !error && status.isLoaded && (
        <View style={styles.controlsContainer}>
          <TouchableOpacity 
            onPress={() => status.isPlaying ? videoRef.current?.pauseAsync() : videoRef.current?.playAsync()}
            style={styles.controlButton}
          >
            <Ionicons name={status.isPlaying ? 'pause-circle-outline' : 'play-circle-outline'} size={40} color={Colors.dynastyGreen} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background.secondary,
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
    height: screenHeight * 0.7,
    backgroundColor: '#000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 10,
    fontSize: Fonts.size.medium,
    color: Colors.light.text.inverse,
    fontFamily: Fonts.type.base,
  },
  errorText: {
    fontSize: Fonts.size.large,
    color: Colors.light.text.error,
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: Fonts.type.base,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: Colors.light.background.primary,
    borderTopWidth: 1,
    borderTopColor: Colors.light.icon.primary,
  },
  controlButton: {
    padding: 10,
  },
  button: {
    marginTop: 20,
    backgroundColor: Colors.dynastyGreen,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  buttonText: {
    color: Colors.light.button.primary.text,
    fontSize: Fonts.size.medium,
    fontFamily: Fonts.type.bold,
  },
});

export default FilePreviewScreen; 