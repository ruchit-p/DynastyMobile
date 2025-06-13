import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { ListItem } from '../ListItem';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Spacing } from '../../constants/Spacing';
import { EncryptionContext } from '../../src/contexts/EncryptionContext';
import { KeyRotationService, KeyBackupService } from '../../src/services/encryption';
import { Ionicons } from '@expo/vector-icons';
import { getEncryptionSettings, updateEncryptionSettings } from '../../src/lib/encryptionUtils';

export default function EncryptionSettingsScreen() {
  const router = useRouter();
  const { isEncryptionReady, resetEncryption } = useContext(EncryptionContext);
  const [autoRotation, setAutoRotation] = useState(true);
  const [hasBackup, setHasBackup] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [lastRotation, setLastRotation] = useState<Date | null>(null);
  const [encryptionSettings, setEncryptionSettings] = useState({
    encryptStories: false,
    encryptEvents: false,
    encryptVault: true,
    encryptAllMedia: false,
  });

  useEffect(() => {
    checkBackupStatus();
    checkRotationStatus();
    loadEncryptionSettings();
  }, []);

  const loadEncryptionSettings = async () => {
    try {
      const settings = await getEncryptionSettings();
      setEncryptionSettings(settings);
    } catch (error) {
      console.error('Failed to load encryption settings:', error);
    }
  };

  const handleEncryptionSettingChange = async (key: keyof typeof encryptionSettings, value: boolean) => {
    try {
      const newSettings = { ...encryptionSettings, [key]: value };
      setEncryptionSettings(newSettings);
      await updateEncryptionSettings(newSettings);
    } catch (error) {
      Alert.alert('Error', 'Failed to update encryption settings');
      // Revert the change
      setEncryptionSettings(prev => ({ ...prev, [key]: !value }));
    }
  };

  const checkBackupStatus = async () => {
    try {
      const backupExists = await KeyBackupService.getInstance().hasBackup();
      setHasBackup(backupExists);
    } catch (error) {
      console.error('Failed to check backup status:', error);
    }
  };

  const checkRotationStatus = async () => {
    try {
      const status = await KeyRotationService.getInstance().getRotationStatus();
      setLastRotation(status.lastRotated ? new Date(status.lastRotated) : null);
    } catch (error) {
      console.error('Failed to check rotation status:', error);
    }
  };

  const handleManualRotation = async () => {
    Alert.alert(
      'Rotate Encryption Keys',
      'This will generate new encryption keys. All active sessions will need to be re-established. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rotate',
          style: 'destructive',
          onPress: async () => {
            setIsRotating(true);
            try {
              await KeyRotationService.getInstance().rotateKeys();
              Alert.alert('Success', 'Encryption keys rotated successfully');
              await checkRotationStatus();
            } catch (error) {
              Alert.alert('Error', 'Failed to rotate keys');
            } finally {
              setIsRotating(false);
            }
          }
        }
      ]
    );
  };

  const handleResetEncryption = () => {
    Alert.alert(
      'Reset Encryption',
      'This will delete all encryption keys and encrypted data. You will lose access to all encrypted messages. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetEncryption();
            router.back();
          }
        }
      ]
    );
  };

  return (
    <Screen>
      <ScrollView style={styles.container}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Encryption Status</Text>
          
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Ionicons 
                name={isEncryptionReady ? "shield-checkmark" : "shield-outline"} 
                size={24} 
                color={isEncryptionReady ? Colors.light.status.success : Colors.light.text.secondary} 
              />
              <Text style={styles.statusText}>
                {isEncryptionReady ? 'Encryption Active' : 'Encryption Not Set Up'}
              </Text>
            </View>
            
            {lastRotation && (
              <Text style={styles.lastRotationText}>
                Last key rotation: {lastRotation.toLocaleDateString()}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Management</Text>
          
          <ListItem
            title="Key Backup"
            subtitle={hasBackup ? "Backup exists" : "No backup"}
            rightIcon="chevron-forward"
            leftIcon={hasBackup ? "checkmark-circle" : "alert-circle"}
            leftIconColor={hasBackup ? Colors.light.status.success : Colors.light.status.warning}
            onPress={() => router.push('/keyBackup')}
          />
          
          <ListItem
            title="Trusted Devices"
            subtitle="Manage your devices"
            rightIcon="chevron-forward"
            leftIcon="phone-portrait-outline"
            onPress={() => router.push('/(screens)/trustedDevices')}
          />
          
          <ListItem
            title="Manual Key Rotation"
            subtitle="Generate new encryption keys"
            leftIcon="refresh"
            onPress={handleManualRotation}
            disabled={isRotating}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Automatic Key Rotation</Text>
              <Text style={styles.settingSubtitle}>Rotate keys every 30 days</Text>
            </View>
            <Switch
              value={autoRotation}
              onValueChange={setAutoRotation}
              trackColor={{ 
                false: Colors.light.background.tertiary, 
                true: Colors.light.tint 
              }}
              thumbColor={Colors.light.background.primary}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feature Encryption</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Encrypt Stories</Text>
              <Text style={styles.settingSubtitle}>End-to-end encrypt story content</Text>
            </View>
            <Switch
              value={encryptionSettings.encryptStories}
              onValueChange={(value) => handleEncryptionSettingChange('encryptStories', value)}
              trackColor={{ 
                false: Colors.light.background.tertiary, 
                true: Colors.light.tint 
              }}
              thumbColor={Colors.light.background.primary}
            />
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Encrypt Events</Text>
              <Text style={styles.settingSubtitle}>End-to-end encrypt event details</Text>
            </View>
            <Switch
              value={encryptionSettings.encryptEvents}
              onValueChange={(value) => handleEncryptionSettingChange('encryptEvents', value)}
              trackColor={{ 
                false: Colors.light.background.tertiary, 
                true: Colors.light.tint 
              }}
              thumbColor={Colors.light.background.primary}
            />
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Encrypt Vault</Text>
              <Text style={styles.settingSubtitle}>End-to-end encrypt vault files</Text>
            </View>
            <Switch
              value={encryptionSettings.encryptVault}
              onValueChange={(value) => handleEncryptionSettingChange('encryptVault', value)}
              trackColor={{ 
                false: Colors.light.background.tertiary, 
                true: Colors.light.tint 
              }}
              thumbColor={Colors.light.background.primary}
            />
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Encrypt All Media</Text>
              <Text style={styles.settingSubtitle}>Encrypt all uploaded photos and videos</Text>
            </View>
            <Switch
              value={encryptionSettings.encryptAllMedia}
              onValueChange={(value) => handleEncryptionSettingChange('encryptAllMedia', value)}
              trackColor={{ 
                false: Colors.light.background.tertiary, 
                true: Colors.light.tint 
              }}
              thumbColor={Colors.light.background.primary}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Advanced</Text>
          
          <Button
            title="Export Keys"
            onPress={() => router.push('/exportKeys')}
            variant="secondary"
            style={styles.button}
          />
          
          <Button
            title="Reset Encryption"
            onPress={handleResetEncryption}
            variant="danger"
            style={styles.button}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  sectionTitle: {
    ...Typography.styles.heading3,
    marginBottom: Spacing.lg,
  },
  statusCard: {
    backgroundColor: Colors.light.background.secondary,
    padding: Spacing.lg,
    borderRadius: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  statusText: {
    ...Typography.styles.bodyLarge,
    flex: 1,
  },
  lastRotationText: {
    ...Typography.styles.caption,
    color: Colors.light.text.secondary,
    marginTop: Spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    ...Typography.styles.bodyLarge,
    marginBottom: Spacing.xs,
  },
  settingSubtitle: {
    ...Typography.styles.caption,
    color: Colors.light.text.secondary,
  },
  button: {
    marginTop: Spacing.md,
  },
});