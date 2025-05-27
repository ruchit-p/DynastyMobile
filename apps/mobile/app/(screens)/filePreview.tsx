import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, Image, Text, ActivityIndicator, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { setAudioModeAsync, AudioMode } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system'; // Import FileSystem
import { commonHeaderOptions } from '../../constants/headerConfig';
import { Colors } from '../../constants/Colors';
import Fonts from '../../constants/Fonts';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import Screen from '../../components/ui/Screen';
import Button from '../../components/ui/Button';
import { ThemedText } from '../../components/ThemedText';
import { Spacing } from '../../constants/Spacing';
import { logger } from '../../src/services/LoggingService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const FilePreviewScreen = () => {
  const params = useLocalSearchParams<{ fileUri: string; fileName: string; fileType: 'image' | 'video' | 'audio' | 'document' | 'other'; mimeType?: string }>();
  const router = useRouter();
  const videoViewRef = useRef<VideoView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaUriToDisplay, setMediaUriToDisplay] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'File Preview Error',
    trackCurrentScreen: true
  });

  const { fileUri: initialFileUri, fileName, fileType, mimeType } = params;

  // Reset error state when component mounts or params change
  useEffect(() => {
    reset();
    setError(null);
  }, [initialFileUri, fileName, fileType, reset]);

  const player = useVideoPlayer(mediaUriToDisplay && fileType === 'video' ? mediaUriToDisplay : null, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (player) {
      const playingSubscription = player.addListener('playingChange', (event: { isPlaying: boolean }) => {
        setIsVideoPlaying(event.isPlaying);
      });
      return () => {
        playingSubscription.remove();
      };
    }
  }, [player]);

  useEffect(() => {
    let isMounted = true;

    const setupAudioAndPrepareMedia = withErrorHandling(async () => {
      if (!isMounted) return;

      if (fileType === 'video') {
        try {
          const mode: Partial<AudioMode> = {
            allowsRecording: false,
            playsInSilentMode: true,
            shouldPlayInBackground: false,
            interruptionModeAndroid: 'duckOthers',
          };
          if (Platform.OS === 'android') {
            mode.shouldRouteThroughEarpiece = false;
          }
          await setAudioModeAsync(mode);
        } catch (e) {
          handleError(e, { functionName: 'setupAudioMode', fileType });
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
          logger.debug(`Attempting to download ${fileType}: ${initialFileUri} to ${localPath}`);
          const downloadResult = await FileSystem.downloadAsync(initialFileUri, localPath);
          logger.debug("Download HTTP Result:", JSON.stringify({ status: downloadResult.status, headers: downloadResult.headers, mimeType: downloadResult.mimeType }));

          if (isMounted) {
            if (downloadResult.status === 200) {
              try {
                const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
                logger.debug("Downloaded File Info:", JSON.stringify(fileInfo));

                if (fileInfo.exists && fileInfo.size && fileInfo.size > 500) { // Check existence and size
            setMediaUriToDisplay(downloadResult.uri);
            setError(null); 
                } else {
                  const sizeError = fileInfo.exists ? `File size too small (${fileInfo.size} bytes)` : 'File not found after download';
                  logger.error("Downloaded file seems invalid or too small. URI:", downloadResult.uri, "Info:", fileInfo);
                  setError(`Failed to download a valid media file. ${sizeError}.`);
                  setMediaUriToDisplay(null);
                }
              } catch (infoError: any) {
                handleError(infoError, { 
                  functionName: 'getFileInfo', 
                  downloadUri: downloadResult.uri,
                  originalUri: initialFileUri
                });
                setError(`Failed to verify downloaded file. ${infoError.message}`);
                setMediaUriToDisplay(null);
              }
            } else {
              const downloadError = new Error(`Download failed with status ${downloadResult.status}`);
              handleError(downloadError, { 
                functionName: 'downloadFile',
                httpStatus: downloadResult.status,
                originalUri: initialFileUri,
                fileType
              });
              setError(`Failed to download media. HTTP status ${downloadResult.status}.`);
              setMediaUriToDisplay(null); // Ensure we don't try to display a bad URI
            }
          }
        } catch (e: any) {
          handleError(e, { 
            functionName: 'downloadFile',
            originalUri: initialFileUri,
            fileType,
            localPath
          });
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
    }, { functionName: 'setupAudioAndPrepareMedia', fileType, fileName });

    setupAudioAndPrepareMedia();

    return () => {
      isMounted = false;
      if (mediaUriToDisplay && mediaUriToDisplay.startsWith(FileSystem.cacheDirectory || '')) {
        FileSystem.deleteAsync(mediaUriToDisplay, { idempotent: true })
          .then(() => logger.debug("Deleted cached preview file:", mediaUriToDisplay))
          .catch(e => {
            handleError(e, { 
              functionName: 'deleteCache', 
              cacheUri: mediaUriToDisplay 
            });
          });
      }
    };
  }, [initialFileUri, fileName, fileType, handleError, mediaUriToDisplay, withErrorHandling]);

  useEffect(() => {
    return () => {
      if (player) {
        player.replace(null);
      }
    };
  }, [player]);

  const handleVideoLoad = () => {
    logger.debug('Video ready for display/playback');
  };

  const handleShare = async () => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setError('Sharing is not available on this device');
        return;
      }
      
      await Sharing.shareAsync(mediaUriToDisplay || initialFileUri, {
        mimeType: mimeType || 'application/octet-stream',
        dialogTitle: `Share ${fileName}`,
      });
    } catch (e: any) {
      handleError(e, { functionName: 'shareFile' });
    }
  };

  const handleOpenExternally = async () => {
    try {
      if (mediaUriToDisplay?.startsWith('http')) {
        await WebBrowser.openBrowserAsync(mediaUriToDisplay);
      } else {
        await Sharing.shareAsync(mediaUriToDisplay || initialFileUri, {
          mimeType: mimeType || 'application/octet-stream',
          dialogTitle: `Open ${fileName}`,
        });
      }
    } catch (e: any) {
      handleError(e, { functionName: 'openExternally' });
    }
  };

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
    
    if (!mediaUriToDisplay && fileType !== 'document' && fileType !== 'other') {
        return null; 
    }

    if (fileType === 'image') {
      return (
        <Image
          source={{ uri: mediaUriToDisplay }}
          style={styles.image}
          resizeMode="contain"
          onError={(e) => {
            const renderError = new Error(`Image rendering failed: ${e.nativeEvent.error}`);
            handleError(renderError, { 
              functionName: 'renderImage',
              mediaUri: mediaUriToDisplay,
              nativeError: e.nativeEvent.error
            });
            if (!error) setError(`Failed to render image. ${e.nativeEvent.error || ''}`);
          }}
        />
      );
    }

    if (fileType === 'video' && player) {
      return (
        <VideoView
          ref={videoViewRef}
          player={player}
          style={styles.video}
          contentFit="contain"
          allowsFullscreen
          allowsPictureInPicture
          nativeControls={false}
        />
      );
    }

    if (fileType === 'audio') {
      return (
        <View style={styles.audioContainer}>
          <Ionicons name="musical-notes" size={80} color={Colors.dynastyGreen} />
          <ThemedText variant="heading3" style={styles.fileName}>{fileName}</ThemedText>
          <ThemedText variant="bodyMedium" color="secondary">Audio file</ThemedText>
          <View style={styles.actionButtons}>
            <Button
              variant="primary"
              size="medium"
              onPress={handleOpenExternally}
              leftIcon={<Ionicons name="play-circle" size={20} color="white" />}
            >
              Play Audio
            </Button>
          </View>
        </View>
      );
    }

    if (fileType === 'document' || fileType === 'other') {
      const isDocument = fileType === 'document';
      const iconName = isDocument ? 'document-text' : 'document-attach';
      
      return (
        <View style={styles.documentContainer}>
          <Ionicons name={iconName} size={80} color={Colors.dynastyGreen} />
          <ThemedText variant="heading3" style={styles.fileName}>{fileName}</ThemedText>
          <ThemedText variant="bodyMedium" color="secondary">
            {isDocument ? 'Document' : 'File'} • {mimeType || 'Unknown type'}
          </ThemedText>
          <View style={styles.actionButtons}>
            <Button
              variant="primary"
              size="medium"
              onPress={handleOpenExternally}
              leftIcon={<Ionicons name="open-outline" size={20} color="white" />}
            >
              Open File
            </Button>
            <Button
              variant="secondary"
              size="medium"
              onPress={handleShare}
              leftIcon={<Ionicons name="share-outline" size={20} color={Colors.light.text.primary} />}
              style={styles.shareButton}
            >
              Share
            </Button>
          </View>
        </View>
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
    <ErrorBoundary screenName="FilePreviewScreen">
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
      {fileType === 'video' && mediaUriToDisplay && !error && player && (
        <View style={styles.controlsContainer}>
          <TouchableOpacity 
            onPress={() => {
              if (isVideoPlaying) {
                player.pause();
              } else {
                player.play();
              }
            }}
            style={styles.controlButton}
          >
            <Ionicons name={isVideoPlaying ? 'pause-circle-outline' : 'play-circle-outline'} size={40} color={Colors.dynastyGreen} />
          </TouchableOpacity>
        </View>
      )}
      </View>
    </ErrorBoundary>
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
  audioContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  documentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  fileName: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  actionButtons: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  shareButton: {
    marginTop: Spacing.sm,
  },
});

export default FilePreviewScreen; 