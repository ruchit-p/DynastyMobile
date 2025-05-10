import React from 'react';
import { 
  View, 
  Image, 
  StyleSheet, 
  TouchableOpacity, 
  StyleProp, 
  ViewStyle,
  ImageSourcePropType
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { useColorScheme } from '../../hooks/useColorScheme';
import { useBackgroundColor, useBorderColor } from '../../hooks/useThemeColor';
import { Colors } from '../../constants/Colors';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

export interface AvatarProps {
  // Image source
  source?: string | ImageSourcePropType;
  
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
 */
const Avatar: React.FC<AvatarProps> = ({
  source,
  size = 'md',
  borderWidth = 0,
  editable = false,
  onPress,
  style,
  testID,
}) => {
  const colorScheme = useColorScheme();
  const theme = colorScheme || 'light';
  
  // Get theme colors
  const borderColor = useBorderColor('primary');
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
  let imageSource: ImageSourcePropType;
  if (typeof source === 'string') {
    imageSource = { uri: source };
  } else if (source) {
    imageSource = source;
  } else {
    // Default placeholder avatar
    // Assume this exists, if not you may need to create one
    imageSource = require('../../assets/images/avatar-placeholder.png');
  }
  
  // Edit icon size proportional to avatar size
  const editIconSize = sizeValue * 0.3; // 30% of avatar size
  const editIconPadding = sizeValue * 0.06; // 6% of avatar size
  
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
  editIconContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Avatar;