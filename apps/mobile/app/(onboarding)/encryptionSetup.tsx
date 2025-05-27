import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { Typography } from '../../constants/Typography';
import { useAuth } from '../../src/contexts/AuthContext';
import { useEncryption } from '../../src/contexts/EncryptionContext';
import { KeyBackupService } from '../../src/services/encryption';
import Button from '../../components/ui/Button';
import { showErrorAlert } from '../../src/lib/errorUtils';
import { logger } from '../../src/services/LoggingService';

interface OnboardingStep {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const steps: OnboardingStep[] = [
  {
    icon: 'shield-checkmark',
    title: 'End-to-End Encryption',
    description: 'Your messages and files are secured with military-grade encryption. Only you and your family can read them.',
  },
  {
    icon: 'key',
    title: 'Your Encryption Keys',
    description: 'We\'ll generate unique encryption keys for you. These keys never leave your device unencrypted.',
  },
  {
    icon: 'cloud-upload',
    title: 'Secure Backup',
    description: 'Create a backup of your keys with a secure password. This ensures you never lose access to your encrypted data.',
  },
];

export default function EncryptionSetupScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { initializeEncryption } = useEncryption();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showBackupScreen, setShowBackupScreen] = useState(false);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Start setup after last intro step
      setShowBackupScreen(true);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Encryption Setup?',
      'You can enable encryption later from settings, but you won\'t be able to access encrypted messages from other family members.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: () => router.replace('/(tabs)/feed'),
        },
      ]
    );
  };

  const handleSetupEncryption = async () => {
    if (!user) return;

    if (backupPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (backupPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setIsSettingUp(true);
    try {
      // Initialize encryption
      await initializeEncryption();
      
      // Create backup
      const backupService = KeyBackupService.getInstance();
      const backup = await backupService.createKeyBackup(backupPassword);
      
      if (backup.recoveryCode) {
        // Show recovery code to user
        Alert.alert(
          'Save Your Recovery Code',
          `Your recovery code is:\n\n${backup.recoveryCode}\n\nWrite this down and keep it safe. You'll need it if you forget your password.`,
          [
            {
              text: 'I\'ve Saved It',
              onPress: () => {
                setSetupComplete(true);
                setTimeout(() => {
                  router.replace('/(tabs)/feed');
                }, 1500);
              },
            },
          ],
          { cancelable: false }
        );
      }
    } catch (error) {
      logger.error('Encryption setup error:', error);
      showErrorAlert(error, 'Setup Failed');
    } finally {
      setIsSettingUp(false);
    }
  };

  if (showBackupScreen) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setShowBackupScreen(false)} style={styles.backButton}>
              <Ionicons name="arrow-back" size={28} color={Colors.light.text.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name="lock-closed" size={64} color={Colors.dynastyGreen} />
            </View>

            <Text style={styles.title}>Create Backup Password</Text>
            <Text style={styles.description}>
              This password will protect your encryption keys backup. Choose something memorable but secure.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Backup Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="key-outline" size={20} color={Colors.light.text.secondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter password"
                  secureTextEntry
                  value={backupPassword}
                  onChangeText={setBackupPassword}
                  editable={!isSettingUp}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="key-outline" size={20} color={Colors.light.text.secondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm password"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!isSettingUp}
                />
              </View>
            </View>

            <View style={styles.warningBox}>
              <Ionicons name="warning" size={20} color={Colors.light.status.warning} />
              <Text style={styles.warningText}>
                Remember this password! You&apos;ll need it to restore your keys on a new device.
              </Text>
            </View>

            <View style={styles.buttonContainer}>
              <Button
                title={isSettingUp ? 'Setting Up...' : 'Complete Setup'}
                onPress={handleSetupEncryption}
                disabled={isSettingUp || !backupPassword || !confirmPassword}
                style={styles.button}
              />
              {isSettingUp && (
                <ActivityIndicator size="small" color={Colors.dynastyGreen} style={styles.loader} />
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (setupComplete) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={80} color={Colors.light.status.success} />
          <Text style={styles.successTitle}>Encryption Enabled!</Text>
          <Text style={styles.successDescription}>
            Your Dynasty account is now protected with end-to-end encryption.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons 
              name={steps[currentStep].icon} 
              size={80} 
              color={Colors.dynastyGreen} 
            />
          </View>

          <Text style={styles.title}>{steps[currentStep].title}</Text>
          <Text style={styles.description}>{steps[currentStep].description}</Text>

          <View style={styles.dotsContainer}>
            {steps.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === currentStep && styles.activeDot,
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Button
            title={currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
            onPress={handleNext}
            style={styles.button}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.background.primary,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
  },
  header: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  skipButton: {
    alignSelf: 'flex-end',
    padding: Spacing.sm,
  },
  skipText: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
  },
  backButton: {
    padding: Spacing.sm,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.styles.heading2,
    color: Colors.light.text.primary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  description: {
    ...Typography.styles.bodyLarge,
    color: Colors.light.text.secondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    lineHeight: 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: Spacing.xl * 2,
    gap: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.background.tertiary,
  },
  activeDot: {
    backgroundColor: Colors.dynastyGreen,
    width: 24,
  },
  footer: {
    paddingBottom: Spacing.xl,
  },
  button: {
    width: '100%',
  },
  inputContainer: {
    width: '100%',
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.primary,
    marginBottom: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.light.background.secondary,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.primary,
    paddingVertical: Spacing.md,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.status.warningLight,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  warningText: {
    flex: 1,
    ...Typography.styles.bodySmall,
    color: Colors.light.text.primary,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
  },
  loader: {
    marginTop: Spacing.md,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  successTitle: {
    ...Typography.styles.heading2,
    color: Colors.light.text.primary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  successDescription: {
    ...Typography.styles.bodyLarge,
    color: Colors.light.text.secondary,
    textAlign: 'center',
  },
});