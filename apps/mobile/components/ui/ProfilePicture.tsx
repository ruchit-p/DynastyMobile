import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Avatar from './Avatar';

export type ProfilePictureSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

interface ProfilePictureProps {
  // User info
  source?: string;
  name: string;
  
  // Appearance options
  size?: ProfilePictureSize;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
  
  // Interactive features
  onPress?: () => void;
  editable?: boolean;
  
  // Testing
  testID?: string;
}

/**
 * ProfilePicture Component
 * 
 * A reusable component that displays a user's profile picture if available,
 * or their initials as a fallback.
 */
const ProfilePicture: React.FC<ProfilePictureProps> = ({
  source,
  name,
  size = 'md',
  borderWidth = 0,
  style,
  onPress,
  editable = false,
  testID,
}) => {
  // Generate initials from name if no image is available
  const getInitials = () => {
    if (!name) return '';
    
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };
  
  // If source is provided, use it directly
  // Otherwise, dynamically set a placeholder that displays initials
  const initials = getInitials();
  
  return (
    <Avatar 
      source={source}
      size={size}
      borderWidth={borderWidth}
      onPress={onPress}
      editable={editable}
      style={style}
      testID={testID}
      fallback={initials}
    />
  );
};

export default ProfilePicture; 