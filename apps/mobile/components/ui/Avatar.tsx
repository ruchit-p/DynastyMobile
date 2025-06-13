import React from 'react';
import { 
  View, 
  Image, 
  StyleSheet, 
  TouchableOpacity, 
  StyleProp, 
  ViewStyle,
  ImageSourcePropType,
  Text
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '../../hooks/useColorScheme';
import { useBackgroundColor, useBorderColor, useTextColor } from '../../hooks/useThemeColor';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

export interface AvatarProps {
  // Image source
  source?: string | ImageSourcePropType;
  
  // Fallback for when no image is available (typically initials)
  fallback?: string;
  
  // Appearance
  size?: AvatarSize;
  borderWidth?: number;
  
  // Interactive features
  editable?: boolean;
  onPress?: () => void;
  
  // Style overrides
  style?: StyleProp<ViewStyle>;
  
  // Optional props
  testID?: string;
}

/**
 * Avatar Component
 * 
 * A component for displaying user profile images with various sizes and styles.
 * Uses fallback text (typically initials) when no image is available.
 */
const Avatar: React.FC<AvatarProps> = ({
  source,
  fallback,
  size = 'md',
  borderWidth = 0,
  editable = false,
  onPress,
  style,
  testID,
}) => {
  const colorScheme = useColorScheme();
  
  // Get theme colors
  const borderColor = useBorderColor('primary');
  const fallbackBgColor = useBackgroundColor('secondary', 0.1);
  const fallbackTextColor = useTextColor('primary');
  const editBackgroundColor = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent background
  
  // Convert size to number
  let sizeValue: number;
  if (typeof size === 'number') {
    sizeValue = size;
  } else {
    switch (size) {
      case 'xs':
        sizeValue = 24;
        break;
      case 'sm':
        sizeValue = 32;
        break;
      case 'lg':
        sizeValue = 64;
        break;
      case 'xl':
        sizeValue = 120;
        break;
      case 'md':
      default:
        sizeValue = 48;
        break;
    }
  }
  
  // Calculate border radius (always circular)
  const borderRadiusValue = sizeValue / 2;
  
  // Prepare source
  let imageSource: ImageSourcePropType | undefined;
  if (typeof source === 'string') {
    imageSource = { uri: source };
  } else if (source) {
    imageSource = source;
  }
  
  // Edit icon size proportional to avatar size
  const editIconSize = sizeValue * 0.3; // 30% of avatar size
  const editIconPadding = sizeValue * 0.06; // 6% of avatar size
  
  // Calculate font size for fallback text based on avatar size
  const fallbackFontSize = sizeValue * 0.4; // 40% of avatar size
  
  // Choose container based on interactivity
  const Container = onPress ? TouchableOpacity : View;
  
  return (
    <Container
      style={[
        styles.container,
        {
          width: sizeValue,
          height: sizeValue,
          borderRadius: borderRadiusValue,
          borderWidth: borderWidth,
          borderColor: borderColor,
        },
        style,
      ]}
      onPress={onPress}
      disabled={!onPress}
      testID={testID}
      accessible={!!onPress}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={editable ? 'Edit profile picture' : 'Profile picture'}
    >
      {imageSource ? (
        <Image
          source={imageSource}
          style={[
            styles.image,
            {
              width: sizeValue,
              height: sizeValue,
              borderRadius: borderRadiusValue,
            },
          ]}
          resizeMode="cover"
        />
      ) : fallback ? (
        <View style={[
          styles.fallbackContainer, 
          {
            width: sizeValue,
            height: sizeValue,
            borderRadius: borderRadiusValue,
            backgroundColor: fallbackBgColor,
          }
        ]}>
          <Text 
            style={[
              styles.fallbackText,
              {
                fontSize: fallbackFontSize,
                color: fallbackTextColor,
              }
            ]}
            numberOfLines={1}
          >
            {fallback}
          </Text>
        </View>
      ) : (
        // Default placeholder avatar when no source or fallback is provided
        <Image
          source={require('../../assets/images/avatar-placeholder.png')}
          style={[
            styles.image,
            {
              width: sizeValue,
              height: sizeValue,
              borderRadius: borderRadiusValue,
            },
          ]}
          resizeMode="cover"
        />
      )}
      
      {editable && (
        <View
          style={[
            styles.editIconContainer,
            {
              right: sizeValue * 0.05,
              bottom: sizeValue * 0.05,
              backgroundColor: editBackgroundColor,
              padding: editIconPadding,
              borderRadius: editIconSize,
            },
          ]}
        >
          <Ionicons
            name="pencil-outline"
            size={editIconSize}
            color="#FFFFFF"
          />
        </View>
      )}
    </Container>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    // The size and border radius are applied dynamically
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontWeight: '600',
  },
  editIconContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Avatar;