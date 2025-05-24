import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFirebaseAuth, getFirebaseDb } from '../../src/lib/firebase';
import { commonHeaderOptions } from '../../constants/headerConfig';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import * as Device from 'expo-device';
import FlashList from '../../components/ui/FlashList';

interface TrustedDevice {
  id: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  lastUsed: Date;
  addedAt: Date;
  isCurrentDevice: boolean;
}

const TrustedDevicesScreen = () => {
  const navigation = useNavigation();
  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Trusted Devices Error',
    trackCurrentScreen: true
  });

  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');

  useEffect(() => {
    navigation.setOptions({
      ...commonHeaderOptions,
      title: 'Trusted Devices',
    });
  }, [navigation]);

  useEffect(() => {
    loadTrustedDevices();
  }, []);

  const getCurrentDeviceInfo = async () => {
    // Create a unique device ID based on available device properties
    const deviceId = `${Device.brand || 'Unknown'}-${Device.modelName || 'Unknown'}-${Device.deviceYearClass || Date.now()}`;
    setCurrentDeviceId(deviceId);
    return {
      id: deviceId,
      deviceName: Device.deviceName || `${Device.brand} ${Device.modelName}`,
      deviceType: Device.deviceType === Device.DeviceType.PHONE ? 'Phone' : 'Tablet',
      platform: Platform.OS,
    };
  };

  const loadTrustedDevices = withErrorHandling(async () => {
    reset();
    setIsLoading(true);
    
    try {
      const auth = getFirebaseAuth();
      const db = getFirebaseDb();
      
      if (!auth.currentUser) {
        setIsLoading(false);
        return;
      }

      const currentDevice = await getCurrentDeviceInfo();
      
      // Get user's trusted devices from Firestore
      const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
      const userData = userDoc.data();
      
      let trustedDevices: TrustedDevice[] = userData?.trustedDevices || [];
      
      // Check if current device is in the list
      const currentDeviceExists = trustedDevices.some(d => d.id === currentDevice.id);
      
      if (!currentDeviceExists) {
        // Add current device to trusted devices
        const newDevice: TrustedDevice = {
          ...currentDevice,
          lastUsed: new Date(),
          addedAt: new Date(),
          isCurrentDevice: true,
        };
        
        trustedDevices = [newDevice, ...trustedDevices];
        
        // Save to Firestore
        await db.collection('users').doc(auth.currentUser.uid).update({
          trustedDevices: trustedDevices.map(d => ({
            ...d,
            lastUsed: d.lastUsed instanceof Date ? d.lastUsed.toISOString() : d.lastUsed,
            addedAt: d.addedAt instanceof Date ? d.addedAt.toISOString() : d.addedAt,
          }))
        });
      }
      
      // Mark current device and convert dates
      const processedDevices = trustedDevices.map(device => ({
        ...device,
        isCurrentDevice: device.id === currentDevice.id,
        lastUsed: device.lastUsed instanceof Date ? device.lastUsed : new Date(device.lastUsed),
        addedAt: device.addedAt instanceof Date ? device.addedAt : new Date(device.addedAt),
      }));
      
      setDevices(processedDevices);
    } catch (error) {
      handleError(error, {
        action: 'loadTrustedDevices',
        metadata: { screenName: 'TrustedDevices' }
      });
    } finally {
      setIsLoading(false);
    }
  });

  const removeDevice = withErrorHandling(async (deviceId: string) => {
    if (deviceId === currentDeviceId) {
      Alert.alert('Cannot Remove', 'You cannot remove the device you are currently using.');
      return;
    }

    Alert.alert(
      'Remove Device',
      'Are you sure you want to remove this device? It will need to be re-verified to access your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const auth = getFirebaseAuth();
              const db = getFirebaseDb();
              
              if (!auth.currentUser) return;
              
              const updatedDevices = devices.filter(d => d.id !== deviceId);
              
              await db.collection('users').doc(auth.currentUser.uid).update({
                trustedDevices: updatedDevices.map(d => ({
                  ...d,
                  lastUsed: d.lastUsed.toISOString(),
                  addedAt: d.addedAt.toISOString(),
                }))
              });
              
              setDevices(updatedDevices);
              Alert.alert('Success', 'Device removed successfully.');
            } catch (error) {
              handleError(error, {
                action: 'removeDevice',
                metadata: { deviceId, screenName: 'TrustedDevices' }
              });
              Alert.alert('Error', 'Failed to remove device. Please try again.');
            }
          }
        }
      ]
    );
  });

  const renderDevice = ({ item }: { item: TrustedDevice }) => {
    const getDeviceIcon = () => {
      if (item.platform === 'ios') return 'logo-apple';
      if (item.platform === 'android') return 'logo-android';
      return 'phone-portrait-outline';
    };

    return (
      <View style={styles.deviceItem}>
        <View style={styles.deviceIconContainer}>
          <Ionicons name={getDeviceIcon() as any} size={24} color="#333" />
        </View>
        
        <View style={styles.deviceInfo}>
          <View style={styles.deviceHeader}>
            <Text style={styles.deviceName}>{item.deviceName}</Text>
            {item.isCurrentDevice && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>Current</Text>
              </View>
            )}
          </View>
          
          <Text style={styles.deviceDetails}>
            {item.deviceType} • {item.platform === 'ios' ? 'iOS' : 'Android'}
          </Text>
          
          <Text style={styles.deviceDate}>
            Last used: {item.lastUsed.toLocaleDateString()}
          </Text>
        </View>
        
        {!item.isCurrentDevice && (
          <TouchableOpacity
            onPress={() => removeDevice(item.id)}
            style={styles.removeButton}
          >
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0A5C36" />
          <Text style={styles.loadingText}>Loading devices...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ErrorBoundary screenName="TrustedDevicesScreen">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.infoContainer}>
            <Ionicons name="information-circle-outline" size={20} color="#666" />
            <Text style={styles.infoText}>
              These devices can access your account without additional verification.
            </Text>
          </View>
          
          <FlashList
            data={devices}
            renderItem={renderDevice}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No trusted devices found</Text>
              </View>
            )}
            estimatedItemSize={80}
          />
        </View>
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F4F1',
    padding: 15,
    marginBottom: 10,
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#666',
  },
  deviceItem: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  currentBadge: {
    backgroundColor: '#0A5C36',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 10,
  },
  currentBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  deviceDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  deviceDate: {
    fontSize: 13,
    color: '#999',
  },
  removeButton: {
    padding: 10,
  },
  separator: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginLeft: 70,
  },
  emptyContainer: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});

export default TrustedDevicesScreen;