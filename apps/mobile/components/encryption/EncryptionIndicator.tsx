import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface EncryptionIndicatorProps {
  isEncrypted: boolean;
  isVerified?: boolean;
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  onPress?: () => void;
}

const EncryptionIndicator: React.FC<EncryptionIndicatorProps> = ({
  isEncrypted,
  isVerified = false,
  size = 'small',
  showText = false,
  onPress,
}) => {
  if (!isEncrypted) return null;

  const iconSize = size === 'small' ? 14 : size === 'medium' ? 18 : 22;
  const textSize = size === 'small' ? 10 : size === 'medium' ? 12 : 14;
  const color = isVerified ? '#4CAF50' : '#1A4B44';

  const content = (
    <View style={styles.container}>
      <MaterialIcons 
        name={isVerified ? 'verified-user' : 'lock'} 
        size={iconSize} 
        color={color} 
      />
      {showText && (
        <Text style={[styles.text, { fontSize: textSize, color }]}>
          {isVerified ? 'Verified' : 'Encrypted'}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.touchable}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  touchable: {
    padding: 4,
  },
  text: {
    marginLeft: 4,
    fontWeight: '500',
  },
});

export default EncryptionIndicator;
