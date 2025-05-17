import React from 'react';
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
import { Colors } from '../../constants/Colors'; // Import the Colors

interface ImageGalleryProps {
  photos: Array<{ uri: string }>;
  onAddPhoto: () => void;
  onRemovePhoto: (index: number) => void;
  onReplacePhoto: (index: number) => void;
  maxPhotos?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  iconColor?: string; // For the remove icon, defaults to dynastyGreen
  addIconColor?: string; // For the add icon, defaults to #A0A0A0
  replaceIconColor?: string; // For the replace icon, defaults to #FFFFFF
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  photos,
  onAddPhoto,
  onRemovePhoto,
  onReplacePhoto,
  maxPhotos = 5,
  style,
  imageStyle,
  iconColor = Colors.dynastyGreen, // Use from Colors.ts
  addIconColor = '#A0A0A0',
  replaceIconColor = '#FFFFFF',
}) => {
  const windowWidth = Dimensions.get('window').width;

  return (
    <View style={[styles.imagePickerContainer, style]}>
      {photos.length > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ width: windowWidth }} // Ensure ScrollView takes up the intended width
        >
          {photos.map((photo, index) => (
            <View key={index} style={[styles.imageWrapper, { width: windowWidth }]}>
              <Image source={{ uri: photo.uri }} style={[styles.eventImagePreview, imageStyle]} />
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={() => onRemovePhoto(index)}
              >
                <Ionicons name="close" size={20} color={iconColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.replacePhotoButton}
                onPress={() => onReplacePhoto(index)}
              >
                <MaterialCommunityIcons name="camera-flip-outline" size={20} color={replaceIconColor} />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < maxPhotos && (
            <TouchableOpacity
              style={[styles.imageWrapper, styles.addMoreButtonPlaceholder, { width: windowWidth }]}
              onPress={onAddPhoto}
            >
              <MaterialCommunityIcons name="camera-plus-outline" size={48} color={addIconColor} />
              <Text style={[styles.imagePickerText, { color: addIconColor }]}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <TouchableOpacity
          style={[styles.imagePickerPlaceholder, { width: windowWidth }]}
          onPress={onAddPhoto}
        >
          <MaterialCommunityIcons name="camera-plus-outline" size={48} color={addIconColor} />
          <Text style={[styles.imagePickerText, { color: addIconColor }]}>Add Event Photo</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  imagePickerContainer: {
    height: 220,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative', // Important for absolute positioning of buttons if needed across different views
    overflow: 'hidden', // Ensure paged ScrollView items don't peek
  },
  imageWrapper: {
    // width is set dynamically using Dimensions.get('window').width
    height: '100%', // Take full height of imagePickerContainer
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  eventImagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 10, // Adjusted for better placement
    right: 10, // Adjusted for better placement
    backgroundColor: '#FFFFFF',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, // Slight increase for visibility
    shadowRadius: 2,
    elevation: 3,
  },
  replacePhotoButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    zIndex: 2,
    backgroundColor: 'rgba(0,0,0,0.5)', // Darker semi-transparent background
    padding: 8, // Increased padding
    borderRadius: 22, // More circular
  },
  imagePickerPlaceholder: {
    flex: 1, // Take full space of container if no images
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMoreButtonPlaceholder: { // Style for the "add photo" button when other photos exist
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E9E9EA', // Slightly different background
  },
  imagePickerText: {
    marginTop: 10,
    fontSize: 16,
  },
});

export default ImageGallery; 