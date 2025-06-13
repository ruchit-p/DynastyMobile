import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface EncryptionStatusBannerProps {
  isEncrypted: boolean;
  isVerified?: boolean;
  onPress?: () => void;
}

export const EncryptionStatusBanner: React.FC<EncryptionStatusBannerProps> = ({
  isEncrypted,
  isVerified = false,
  onPress,
}) => {
  if (!isEncrypted) return null;

  return (
    <TouchableOpacity 
      style={[styles.container, isVerified && styles.verifiedContainer]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <MaterialIcons 
        name={isVerified ? 'verified-user' : 'lock'} 
        size={16} 
        color={isVerified ? '#FFFFFF' : '#1A4B44'} 
      />
      <Text style={[styles.text, isVerified && styles.verifiedText]}>
        {isVerified 
          ? 'Messages are end-to-end encrypted and verified' 
          : 'Messages are end-to-end encrypted'}
      </Text>
      <MaterialIcons 
        name="info-outline" 
        size={16} 
        color={isVerified ? '#FFFFFF' : '#1A4B44'} 
      />
    </TouchableOpacity>
  );
};

interface EncryptionIndicatorProps {
  size?: number;
  color?: string;
  style?: any;
}

export const EncryptionIndicator: React.FC<EncryptionIndicatorProps> = ({
  size = 14,
  color = '#1A4B44',
  style,
}) => {
  return <MaterialIcons name="lock" size={size} color={color} style={style} />;
};

interface MessageEncryptionStatusProps {
  isEncrypted: boolean;
  isSending?: boolean;
  hasError?: boolean;
}

export const MessageEncryptionStatus: React.FC<MessageEncryptionStatusProps> = ({
  isEncrypted,
  isSending = false,
  hasError = false,
}) => {
  if (!isEncrypted) return null;

  let icon = 'lock';
  let color = '#1A4B44';
  let text = 'Encrypted';

  if (isSending) {
    icon = 'lock-clock';
    color = '#666666';
    text = 'Encrypting...';
  } else if (hasError) {
    icon = 'lock-open';
    color = '#FF0000';
    text = 'Encryption failed';
  }

  return (
    <View style={styles.messageStatus}>
      <MaterialIcons name={icon as any} size={12} color={color} />
      <Text style={[styles.messageStatusText, { color }]}>{text}</Text>
    </View>
  );
};

interface EncryptionSetupPromptProps {
  onSetup: () => void;
  onDismiss: () => void;
}

export const EncryptionSetupPrompt: React.FC<EncryptionSetupPromptProps> = ({
  onSetup,
  onDismiss,
}) => {
  return (
    <View style={styles.setupPrompt}>
      <MaterialIcons name="enhanced-encryption" size={48} color="#1A4B44" />
      <Text style={styles.setupTitle}>Enable End-to-End Encryption</Text>
      <Text style={styles.setupDescription}>
        Protect your messages with end-to-end encryption. Only you and the people you&apos;re chatting with can read your messages.
      </Text>
      <View style={styles.setupButtons}>
        <TouchableOpacity style={styles.setupButton} onPress={onSetup}>
          <Text style={styles.setupButtonText}>Enable Encryption</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.dismissButtonText}>Not Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  verifiedContainer: {
    backgroundColor: '#1A4B44',
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: '#1A4B44',
    marginHorizontal: 8,
  },
  verifiedText: {
    color: '#FFFFFF',
  },
  messageStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  messageStatusText: {
    fontSize: 10,
    marginLeft: 4,
  },
  setupPrompt: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  setupTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A4B44',
    marginTop: 16,
    marginBottom: 8,
  },
  setupDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  setupButtons: {
    width: '100%',
  },
  setupButton: {
    backgroundColor: '#1A4B44',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  setupButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dismissButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#666',
    fontSize: 16,
  },
});
