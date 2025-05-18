import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  type StyleProp,
  type ViewStyle,
  type ImageStyle,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer, VideoPlayerStatus as VideoPlayerStatusType } from 'expo-video'; // MODIFIED: Correct imports, alias type
import { Colors } from '../../constants/Colors';
import * as ImagePicker from 'expo-image-picker'; // For asset type

// Define the structure for a media item
export interface MediaItem {
  uri: string;
  type: 'image' | 'video';
  asset?: ImagePicker.ImagePickerAsset; // Store original asset for more details if needed
  duration?: number; // Specifically for video
  width?: number;
  height?: number;
}

interface MediaGalleryProps {
  media: MediaItem[];
  onAddMedia: () => void;
  onRemoveMedia: (index: number) => void;
  onReplaceMedia: (index: number) => void;
  maxMedia?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>; // Could be renamed to mediaStyle or provide separate videoStyle
  videoStyle?: StyleProp<ViewStyle>; // Style for the VideoView component
  iconColor?: string;
  addIconColor?: string;
  replaceIconColor?: string;
  showRemoveButton?: boolean;
  showReplaceButton?: boolean;
  allowAddingMore?: boolean; // New prop to control visibility of "Add More" slide
}

// Internal component for rendering a single video item with its own player state
const VideoItemRenderer: React.FC<{ item: MediaItem; style?: StyleProp<ViewStyle> }> = ({ item, style }) => {
  // Hooks must be called at the top level
  const player = useVideoPlayer(item.uri, (player) => {
    player.loop = false;
    // console.log(`[VideoItemRenderer] Player initialized for URI: ${item.uri}`); // Initializing log can be noisy if URI is invalid initially
  });

  const [isPlaying, setIsPlaying] = React.useState(player.playing);
  const [status, setStatus] = React.useState<VideoPlayerStatusType>(player.status);
  const [isValidUri, setIsValidUri] = React.useState(true); // State to track URI validity

  React.useEffect(() => {
    // Validate URI when component mounts or item.uri changes
    if (!item.uri || typeof item.uri !== 'string' || item.uri.trim() === '') {
      console.error(`[VideoItemRenderer] Invalid or empty URI for video item:`, item);
      setIsValidUri(false);
      if (player.status !== 'idle') player.replace(null); // Use replace(null) to clear source
      return;
    } else {
      setIsValidUri(true);
      // The useVideoPlayer hook will handle URI changes if item.uri reference changes.
      // If player.uri is not the current item.uri, useVideoPlayer should already be re-evaluating.
      // Forcing a replace here might be redundant if the hook is already processing the new URI.
      console.log(`[VideoItemRenderer] Player URI is being managed by useVideoPlayer for: ${item.uri}`);
    }

    console.log(`[VideoItemRenderer] Mounted/Updated for URI: ${item.uri}, Initial Status: ${player.status}, Initial IsPlaying: ${player.playing}`);

    const playingSubscription = player.addListener('playingChange', () => {
      console.log(`[VideoItemRenderer] Event: playingChange - New isPlaying: ${player.playing} for ${item.uri}`);
      setIsPlaying(player.playing);
    });
    const statusSubscription = player.addListener('statusChange', (event) => {
      console.log(`[VideoItemRenderer] Event: statusChange - New Status: ${event.status}, Error: ${event.error?.message || 'null'} for ${item.uri}`);
      setStatus(event.status);
      if (event.error) {
        console.error(`[VideoItemRenderer] Player Error for ${item.uri}:`, event.error);
      }
    });
    const sourceLoadSubscription = player.addListener('sourceLoad', (event) => {
      console.log(`[VideoItemRenderer] Event: sourceLoad - URI: ${item.uri}, Duration: ${event.duration}, AV Tracks: ${event.availableVideoTracks?.length}, Subtitle Tracks: ${event.availableSubtitleTracks?.length}`);
    });

    return () => {
      console.log(`[VideoItemRenderer] Unmounting for URI: ${item.uri}. Cleaning up listeners.`);
      playingSubscription.remove();
      statusSubscription.remove();
      sourceLoadSubscription.remove();
      // player.release(); // Consider if player should be released here or if useVideoPlayer handles it.
                         // useVideoPlayer hook should handle the release automatically on component unmount.
    };
  }, [player, item.uri]); // item.uri added to dependency array for re-validation
  
  // Early return for invalid URI after hooks
  if (!isValidUri) {
    return (
      <View style={[styles.mediaPreview, styles.videoPreview, styles.videoContainer, style]}>
        <View style={styles.videoOverlay}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="rgba(255,0,0,0.8)" />
          <Text style={styles.errorText}>Invalid video source</Text>
        </View>
      </View>
    );
  }

  const togglePlay = () => {
    console.log(`[VideoItemRenderer] togglePlay called for ${item.uri}. Current status: ${status}, isPlaying: ${isPlaying}`);
    if (status === 'error') { // Use string literal for status comparison
      console.warn(`[VideoItemRenderer] Video player error, cannot play ${item.uri}`);
      return;
    }
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  return (
    <View style={styles.videoContainer}>
      <VideoView
        player={player}
        style={[styles.mediaPreview, styles.videoPreview, style]}
        contentFit="cover"
        allowsFullscreen={true} // MODIFIED: Allow fullscreen
        showsTimecodes // Optional: if you want timecodes without full native controls
        nativeControls={true} // MODIFIED: Enable native controls
      />
      {item.duration ? (
        <Text style={styles.durationText}>
          {Math.floor(item.duration / 60000)}:{(Math.floor(item.duration / 1000) % 60).toString().padStart(2, '0')}
        </Text>
      ) : null}
       {status === 'error' && (
        <View style={styles.videoOverlay}>
            <MaterialCommunityIcons name="alert-circle-outline" size={48} color="rgba(255,0,0,0.8)" />
            <Text style={styles.errorText}>Cannot load video</Text>
        </View>
      )}
      {status === 'loading' && (
        <View style={styles.videoOverlay}>
            {/* You can use an ActivityIndicator here if desired */}
            <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}
    </View>
  );
};

const MediaGallery: React.FC<MediaGalleryProps> = ({
  media = [],
  onAddMedia,
  onRemoveMedia,
  onReplaceMedia,
  maxMedia = 10, // Increased default max
  style,
  imageStyle,
  videoStyle,
  iconColor = Colors.dynastyGreen,
  addIconColor = '#A0A0A0',
  replaceIconColor = '#FFFFFF',
  showRemoveButton = true,
  showReplaceButton = true,
  allowAddingMore = true, // Default to true to maintain current behavior elsewhere
}) => {
  const [measuredWidth, setMeasuredWidth] = useState(Dimensions.get('window').width);

  const onLayout = (event: any) => {
    const { width } = event.nativeEvent.layout;
    setMeasuredWidth(width);
  };

  const renderMediaItem = (item: MediaItem, index: number) => {
    if (item.type === 'image') {
      return <Image source={{ uri: item.uri }} style={[styles.mediaPreview, styles.imagePreview, imageStyle]} />;
    } else if (item.type === 'video') {
      // Use the new VideoItemRenderer for videos
      return <VideoItemRenderer item={item} style={videoStyle} />;
    }
    return null;
  };

  return (
    <View style={[styles.galleryContainer, style]} onLayout={onLayout}>
      {media.length > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          nestedScrollEnabled={true}
          showsHorizontalScrollIndicator={false}
          style={{ width: measuredWidth }}
        >
          {media.map((item, index) => (
            <View key={`${item.uri}-${index}`} style={[styles.mediaWrapper, { width: measuredWidth }]}>
              {renderMediaItem(item, index)}
              {showRemoveButton && (
                <TouchableOpacity
                  style={styles.removeMediaButton}
                  onPress={() => onRemoveMedia(index)}
                >
                  <Ionicons name="close" size={20} color={iconColor} />
                </TouchableOpacity>
              )}
              {showReplaceButton && (
                <TouchableOpacity
                  style={styles.replaceMediaButton}
                  onPress={() => onReplaceMedia(index)}
                >
                  <MaterialCommunityIcons name="camera-flip-outline" size={20} color={replaceIconColor} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {allowAddingMore && media.length < maxMedia && (
            <TouchableOpacity
              style={[styles.mediaWrapper, styles.addMoreButtonPlaceholder, { width: measuredWidth }]}
              onPress={onAddMedia}
            >
              <MaterialCommunityIcons name="camera-plus-outline" size={48} color={addIconColor} />
              <Text style={[styles.galleryPlaceholderText, { color: addIconColor }]}>Add More</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        allowAddingMore ? (
          <TouchableOpacity
            style={[styles.galleryPlaceholder, { width: measuredWidth }]}
            onPress={onAddMedia}
          >
            <MaterialCommunityIcons name="camera-plus-outline" size={48} color={addIconColor} />
            <Text style={[styles.galleryPlaceholderText, { color: addIconColor }]}>Add Photos/Videos</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.galleryPlaceholder, { width: measuredWidth}]}>
            <Text style={styles.galleryPlaceholderText}>No media</Text>
          </View>
        )
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  galleryContainer: {
    height: 250, // Adjusted height for potentially taller video controls or info
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  mediaWrapper: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  mediaPreview: {
    width: '100%',
    height: '100%',
  },
  imagePreview: {
    resizeMode: 'cover',
  },
  videoContainer: { // Container for video and its overlays
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000', // Background for videos
  },
  videoPreview: {
    // resizeMode is set on the component itself
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)', // Slight dim to make icon more visible
  },
  durationText: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: 'white',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 12,
    zIndex: 1, // Ensure it's above the video but below controls if any conflict
  },
  removeMediaButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#FFFFFF',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  replaceMediaButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    zIndex: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
    borderRadius: 22,
  },
  galleryPlaceholder: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMoreButtonPlaceholder: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E9E9EA',
  },
  galleryPlaceholderText: {
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: 'white',
    marginTop: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 5,
    borderRadius: 3,
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 3,
  }
});

export default MediaGallery; 