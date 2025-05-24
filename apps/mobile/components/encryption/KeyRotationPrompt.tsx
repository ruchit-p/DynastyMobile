import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius, Shadows } from '../../constants/Spacing';
import Typography from '../../constants/Typography';
import { useEncryption } from '../../src/contexts/EncryptionContext';
import { KeyRotationService } from '../../src/services/encryption';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showErrorAlert } from '../../src/lib/errorUtils';

const KEY_ROTATION_CHECK_KEY = 'lastKeyRotationCheck';
const KEY_ROTATION_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // Check once per day

export const KeyRotationPrompt: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [lastRotation, setLastRotation] = useState<Date | null>(null);
  const { isEncryptionReady } = useEncryption();

  useEffect(() => {
    if (!isEncryptionReady) return;

    const checkKeyRotation = async () => {
      try {
        // Check if we've already checked today
        const lastCheckStr = await AsyncStorage.getItem(KEY_ROTATION_CHECK_KEY);
        if (lastCheckStr) {
          const lastCheck = new Date(lastCheckStr);
          if (Date.now() - lastCheck.getTime() < CHECK_INTERVAL) {
            return; // Already checked today
          }
        }

        // Update last check time
        await AsyncStorage.setItem(KEY_ROTATION_CHECK_KEY, new Date().toISOString());

        // Check if rotation is needed
        const rotationService = KeyRotationService.getInstance();
        const needsRotation = await rotationService.checkIfRotationNeeded();
        
        if (needsRotation) {
          const lastRotationDate = await rotationService.getLastRotationDate();
          setLastRotation(lastRotationDate);
          setIsVisible(true);
        }
      } catch (error) {
        console.error('[KeyRotationPrompt] Error checking rotation:', error);
      }
    };

    checkKeyRotation();

    // Check periodically while app is running
    const interval = setInterval(checkKeyRotation, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [isEncryptionReady]);

  const handleRotateNow = async () => {
    setIsRotating(true);
    try {
      const rotationService = KeyRotationService.getInstance();
      await rotationService.rotateKeys();
      
      setIsVisible(false);
      // Reset check timer after successful rotation
      await AsyncStorage.setItem(KEY_ROTATION_CHECK_KEY, new Date().toISOString());
    } catch (error) {
      console.error('[KeyRotationPrompt] Rotation error:', error);
      showErrorAlert(error, 'Key Rotation Failed');
    } finally {
      setIsRotating(false);
    }
  };

  const handleRemindLater = async () => {
    setIsVisible(false);
    // Will check again tomorrow
  };

  const formatLastRotation = () => {
    if (!lastRotation) return 'Never';
    
    const days = Math.floor((Date.now() - lastRotation.getTime()) / (24 * 60 * 60 * 1000));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={handleRemindLater}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Ionicons name="key" size={48} color={Colors.dynastyGreen} />
          </View>
          
          <Text style={styles.title}>Security Key Rotation</Text>
          
          <Text style={styles.description}>
            It's time to rotate your encryption keys for enhanced security. This process helps protect your messages even if old keys are compromised.
          </Text>
          
          <View style={styles.infoContainer}>
            <Ionicons name="time-outline" size={20} color={Colors.palette.neutral.medium} />
            <Text style={styles.infoText}>
              Last rotation: {formatLastRotation()}
            </Text>
          </View>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={handleRemindLater}
              disabled={isRotating}
            >
              <Text style={styles.secondaryButtonText}>Remind Me Later</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleRotateNow}
              disabled={isRotating}
            >
              {isRotating ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={20} color="white" />
                  <Text style={styles.primaryButtonText}>Rotate Now</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          
          {isRotating && (
            <Text style={styles.rotatingText}>
              Rotating keys... This may take a moment.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: Colors.light.background.primary,
    marginHorizontal: Spacing.xl,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    ...Shadows.lg,
    maxWidth: 400,
    width: '90%',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.styles.heading3,
    color: Colors.light.text.primary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  description: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
    padding: Spacing.sm,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: BorderRadius.md,
  },
  infoText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.secondary,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  primaryButton: {
    backgroundColor: Colors.dynastyGreen,
  },
  primaryButtonText: {
    ...Typography.styles.button,
    color: 'white',
  },
  secondaryButton: {
    backgroundColor: Colors.light.background.secondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  secondaryButtonText: {
    ...Typography.styles.button,
    color: Colors.light.text.primary,
  },
  rotatingText: {
    ...Typography.styles.caption,
    color: Colors.light.text.secondary,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});

export default KeyRotationPrompt;