import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator , TextInput } from 'react-native';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { Colors } from '../../constants/Colors';
import Typography from '../../constants/Typography';
import { Spacing } from '../../constants/Spacing';
import { KeyBackupService } from '../../src/services/encryption';
import Clipboard from '@react-native-clipboard/clipboard';

export default function KeyBackupScreen() {
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hint, setHint] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [backupId, setBackupId] = useState('');
  const [mode, setMode] = useState<'create' | 'restore' | null>(null);

  const handleCreateBackup = async () => {
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setIsCreating(true);
    try {
      const result = await KeyBackupService.getInstance().createKeyBackup(password, hint);
      
      setRecoveryCode(result.recoveryCode);
      setBackupId(result.backupId);
      
      Alert.alert(
        'Backup Created',
        'Your encryption keys have been backed up. Please save your recovery code in a safe place.',
        [
          {
            text: 'Copy Recovery Code',
            onPress: () => {
              Clipboard.setString(result.recoveryCode);
              Alert.alert('Copied', 'Recovery code copied to clipboard');
            }
          },
          { text: 'OK' }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to create backup');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!backupId || !password) {
      Alert.alert('Error', 'Please enter backup ID and password');
      return;
    }

    setIsRestoring(true);
    try {
      await KeyBackupService.getInstance().restoreFromBackup(backupId, password);
      Alert.alert('Success', 'Keys restored successfully');
      setMode(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to restore backup. Check your backup ID and password.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreWithCode = async () => {
    if (!recoveryCode) {
      Alert.alert('Error', 'Please enter recovery code');
      return;
    }

    setIsRestoring(true);
    try {
      await KeyBackupService.getInstance().restoreWithRecoveryCode(recoveryCode);
      Alert.alert('Success', 'Keys restored successfully');
      setMode(null);
    } catch (error) {
      Alert.alert('Error', 'Invalid or expired recovery code');
    } finally {
      setIsRestoring(false);
    }
  };

  if (mode === null) {
    return (
      <Screen>
        <View style={styles.container}>
          <Text style={styles.title}>Key Backup</Text>
          <Text style={styles.description}>
            Backup your encryption keys to recover your messages if you lose access to your device
          </Text>
          
          <Button
            title="Create Backup"
            onPress={() => setMode('create')}
            style={styles.button}
          />
          
          <Button
            title="Restore Backup"
            onPress={() => setMode('restore')}
            variant="secondary"
            style={styles.button}
          />
        </View>
      </Screen>
    );
  }

  if (mode === 'create') {
    return (
      <Screen>
        <ScrollView style={styles.container}>
          <Text style={styles.title}>Create Key Backup</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter a strong password"
              placeholderTextColor={Colors.light.text.secondary}
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Confirm your password"
              placeholderTextColor={Colors.light.text.secondary}
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password Hint (Optional)</Text>
            <TextInput
              style={styles.input}
              value={hint}
              onChangeText={setHint}
              placeholder="Add a hint to remember your password"
              placeholderTextColor={Colors.light.text.secondary}
            />
          </View>
          
          {recoveryCode && (
            <View style={styles.recoveryContainer}>
              <Text style={styles.recoveryLabel}>Recovery Code:</Text>
              <Text style={styles.recoveryCode}>{recoveryCode}</Text>
              <Button
                title="Copy"
                onPress={() => {
                  Clipboard.setString(recoveryCode);
                  Alert.alert('Copied', 'Recovery code copied to clipboard');
                }}
                size="small"
              />
            </View>
          )}
          
          <Button
            title={isCreating ? 'Creating...' : 'Create Backup'}
            onPress={handleCreateBackup}
            disabled={isCreating || !password || !confirmPassword}
            style={styles.button}
          />
          
          <Button
            title="Cancel"
            onPress={() => setMode(null)}
            variant="secondary"
            style={styles.button}
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Restore Key Backup</Text>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Restore with Password</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Backup ID</Text>
            <TextInput
              style={styles.input}
              value={backupId}
              onChangeText={setBackupId}
              placeholder="Enter backup ID"
              placeholderTextColor={Colors.light.text.secondary}
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter backup password"
              placeholderTextColor={Colors.light.text.secondary}
            />
          </View>
          
          <Button
            title={isRestoring ? 'Restoring...' : 'Restore'}
            onPress={handleRestoreBackup}
            disabled={isRestoring || !backupId || !password}
            style={styles.button}
          />
        </View>
        
        <View style={styles.divider} />
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Restore with Recovery Code</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Recovery Code</Text>
            <TextInput
              style={styles.input}
              value={recoveryCode}
              onChangeText={setRecoveryCode}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              placeholderTextColor={Colors.light.text.secondary}
            />
          </View>
          
          <Button
            title={isRestoring ? 'Restoring...' : 'Restore'}
            onPress={handleRestoreWithCode}
            disabled={isRestoring || !recoveryCode}
            style={styles.button}
          />
        </View>
        
        <Button
          title="Cancel"
          onPress={() => setMode(null)}
          variant="secondary"
          style={styles.button}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.xl,
  },
  title: {
    ...Typography.styles.heading1,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  description: {
    ...Typography.styles.bodyLarge,
    color: Colors.light.text.secondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.styles.heading3,
    marginBottom: Spacing.lg,
  },
  inputContainer: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.styles.bodyMedium,
    marginBottom: Spacing.xs,
    color: Colors.light.text.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border.primary,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: Typography.size.md,
    color: Colors.light.text.primary,
  },
  button: {
    marginTop: Spacing.lg,
  },
  recoveryContainer: {
    backgroundColor: Colors.light.background.secondary,
    padding: Spacing.lg,
    borderRadius: 8,
    marginVertical: Spacing.lg,
  },
  recoveryLabel: {
    ...Typography.styles.bodyMedium,
    marginBottom: Spacing.sm,
  },
  recoveryCode: {
    ...Typography.styles.caption,
    fontFamily: 'monospace',
    marginBottom: Spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: Spacing.xl,
  },
});