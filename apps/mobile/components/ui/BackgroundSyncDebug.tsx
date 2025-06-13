/**
 * Background Sync Debug Component
 * For testing and debugging background sync functionality in development
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import { backgroundSyncTask } from '../../src/services/BackgroundSyncTask';

interface SyncStatus {
  available: boolean;
  configured: boolean;
  registered: boolean;
  status: BackgroundTask.BackgroundTaskStatus;
}

export default function BackgroundSyncDebug() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateStatus = async () => {
    try {
      const status = await backgroundSyncTask.getStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('[BackgroundSyncDebug] Failed to get status:', error);
    }
  };

  useEffect(() => {
    updateStatus();
  }, []);

  // Only show in development mode
  if (!__DEV__) {
    return null;
  }

  const handleConfigureSync = async () => {
    setIsLoading(true);
    try {
      await backgroundSyncTask.configure();
      await updateStatus();
      Alert.alert('Success', 'Background sync configured successfully');
    } catch (error) {
      console.error('[BackgroundSyncDebug] Configure failed:', error);
      Alert.alert('Error', 'Failed to configure background sync');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestSync = async () => {
    setIsLoading(true);
    try {
      const result = await backgroundSyncTask.triggerSyncForTesting();
      Alert.alert(
        'Test Result', 
        result ? 'Sync triggered successfully' : 'Failed to trigger sync'
      );
    } catch (error) {
      console.error('[BackgroundSyncDebug] Test sync failed:', error);
      Alert.alert('Error', 'Failed to trigger test sync');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopSync = async () => {
    setIsLoading(true);
    try {
      await backgroundSyncTask.stop();
      await updateStatus();
      Alert.alert('Success', 'Background sync stopped');
    } catch (error) {
      console.error('[BackgroundSyncDebug] Stop failed:', error);
      Alert.alert('Error', 'Failed to stop background sync');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusText = (status: BackgroundTask.BackgroundTaskStatus) => {
    switch (status) {
      case BackgroundTask.BackgroundTaskStatus.Available:
        return 'Available';
      case BackgroundTask.BackgroundTaskStatus.Restricted:
        return 'Restricted';
      default:
        return 'Unknown';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Background Sync Debug</Text>
      
      {syncStatus && (
        <View style={styles.statusContainer}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={styles.statusText}>
            Available: {syncStatus.available ? '✅' : '❌'}
          </Text>
          <Text style={styles.statusText}>
            Configured: {syncStatus.configured ? '✅' : '❌'}
          </Text>
          <Text style={styles.statusText}>
            Registered: {syncStatus.registered ? '✅' : '❌'}
          </Text>
          <Text style={styles.statusText}>
            System Status: {getStatusText(syncStatus.status)}
          </Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, styles.configureButton]} 
          onPress={handleConfigureSync}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Configuring...' : 'Configure Sync'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.testButton]} 
          onPress={handleTestSync}
          disabled={isLoading || !syncStatus?.configured}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Testing...' : 'Test Sync'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.stopButton]} 
          onPress={handleStopSync}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Stopping...' : 'Stop Sync'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.refreshButton]} 
          onPress={updateStatus}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>Refresh Status</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f0f0f0',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  statusContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 6,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    marginBottom: 4,
  },
  buttonContainer: {
    gap: 8,
  },
  button: {
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  configureButton: {
    backgroundColor: '#007AFF',
  },
  testButton: {
    backgroundColor: '#34C759',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  refreshButton: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
}); 