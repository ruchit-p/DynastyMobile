import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { Typography } from '../../constants/Typography';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { callFirebaseFunction } from '../../src/lib/errorUtils';
import { LibsignalService } from '../../src/services/encryption/libsignal/LibsignalService';
import { logger } from '../../src/services/LoggingService';

interface KeyVerificationPromptProps {
  visible: boolean;
  userId: string;
  userName: string;
  userAvatar?: string;
  onVerify: () => void;
  onDismiss: () => void;
  onBlock?: () => void;
}

export const KeyVerificationPrompt: React.FC<KeyVerificationPromptProps> = ({
  visible,
  userId,
  userName,
  userAvatar,
  onVerify,
  onDismiss,
  onBlock,
}) => {
  const [loading, setLoading] = useState(false);
  const [trusting, setTrusting] = useState(false);

  const handleVerifySafetyNumber = () => {
    onDismiss();
    router.push({
      pathname: '/(screens)/safetyNumber',
      params: { userId, userName },
    });
  };

  const handleTrustNewKey = async () => {
    setTrusting(true);
    try {
      // Get the new identity key
      const response = await callFirebaseFunction('getUserSignalBundle', { userId });
      const newIdentityKey = response.data.identityKey;

      // Trust the new identity
      const libsignalService = LibsignalService.getInstance();
      await libsignalService.trustIdentity(userId, newIdentityKey);

      // Mark as verified
      await callFirebaseFunction('trustUserIdentity', { userId });

      logger.info(`Trusted new identity for ${userId}`);
      onVerify();
    } catch (error) {
      logger.error('Failed to trust new identity:', error);
    } finally {
      setTrusting(false);
    }
  };

  const handleBlock = async () => {
    if (onBlock) {
      onBlock();
    } else {
      // Default block action
      try {
        await callFirebaseFunction('blockUser', { userId });
        onDismiss();
      } catch (error) {
        logger.error('Failed to block user:', error);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Ionicons
              name="warning"
              size={48}
              color={Colors.light.warning}
            />
          </View>

          <Text style={styles.title}>Safety Number Changed</Text>

          <View style={styles.userInfo}>
            <Avatar uri={userAvatar} name={userName} size={60} />
            <Text style={styles.userName}>{userName}</Text>
          </View>

          <Text style={styles.message}>
            {userName}'s safety number has changed. This could mean:
          </Text>

          <View style={styles.reasonsList}>
            <View style={styles.reason}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.reasonText}>
                They reinstalled Dynasty or switched devices
              </Text>
            </View>
            <View style={styles.reason}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.reasonText}>
                Someone might be trying to intercept your messages
              </Text>
            </View>
          </View>

          <Text style={styles.recommendation}>
            We recommend verifying the safety number before continuing.
          </Text>

          <View style={styles.actions}>
            <Button
              title="Verify Safety Number"
              onPress={handleVerifySafetyNumber}
              variant="primary"
              fullWidth
              leftIcon={
                <Ionicons name="shield-checkmark" size={20} color="white" />
              }
            />

            <Button
              title="Trust Anyway"
              onPress={handleTrustNewKey}
              variant="secondary"
              fullWidth
              loading={trusting}
              style={styles.secondaryButton}
            />

            <TouchableOpacity
              style={styles.dismissButton}
              onPress={onDismiss}
            >
              <Text style={styles.dismissText}>Not Now</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.blockButton} onPress={handleBlock}>
            <Text style={styles.blockText}>Block This Contact</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  container: {
    backgroundColor: Colors.light.background.primary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.styles.heading3,
    color: Colors.light.text.primary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  userName: {
    ...Typography.styles.bodyLarge,
    fontWeight: '600',
    color: Colors.light.text.primary,
    marginTop: Spacing.sm,
  },
  message: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  reasonsList: {
    backgroundColor: Colors.light.background.secondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  reason: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  bullet: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
    marginRight: Spacing.xs,
  },
  reasonText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.secondary,
    flex: 1,
  },
  recommendation: {
    ...Typography.styles.bodySmall,
    color: Colors.light.primary,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: Spacing.lg,
  },
  actions: {
    gap: Spacing.sm,
  },
  secondaryButton: {
    marginTop: Spacing.sm,
  },
  dismissButton: {
    alignItems: 'center',
    padding: Spacing.md,
    marginTop: Spacing.xs,
  },
  dismissText: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
  },
  blockButton: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  blockText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.error,
  },
});