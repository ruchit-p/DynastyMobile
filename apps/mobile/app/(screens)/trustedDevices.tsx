import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFirebaseAuth, getFirebaseDb } from '../../src/lib/firebase';
import { commonHeaderOptions } from '../../constants/headerConfig';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import * as Device from 'expo-device';
import { FlashList } from '../../components/ui/FlashList';
import { callFirebaseFunction } from '../../src/lib/errorUtils';

interface TrustedDevice {
  id: string;
  visitorId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  lastUsed: Date;
  addedAt: Date;
  trustScore: number;
  isCurrentDevice: boolean;
  lastLocation?: {
    city?: string;
    country?: string;
  };
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

  const loadTrustedDevices = useCallback(
    withErrorHandling(async () => {
      reset();
      setIsLoading(true);
      
      try {
        const auth = getFirebaseAuth();
        
        if (!auth.currentUser) {
          setIsLoading(false);
          return;
        }

        // Get current device ID
        const currentDeviceId = generateDeviceId();
        setCurrentDeviceId(currentDeviceId);
        
        // Get trusted devices from Firebase using device ID
        const result = await callFirebaseFunction<{
          success: boolean;
          devices: {
            id: string;
            visitorId: string;
            deviceName: string;
            deviceType: string;
            platform: string;
            lastUsed: number;
            addedAt: number;
            trustScore: number;
            isCurrentDevice: boolean;
            lastLocation?: {
              city?: string;
              country?: string;
            };
          }[];
        }>('getTrustedDevices', {
          currentDeviceId
        });

        if (result.success && result.devices) {
          const trustedDevices: TrustedDevice[] = result.devices.map(device => ({
            ...device,
            lastUsed: new Date(device.lastUsed),
            addedAt: new Date(device.addedAt),
            isCurrentDevice: device.visitorId === currentDeviceId
          }));
          
          // Sort devices: current device first, then by last used
          trustedDevices.sort((a, b) => {
            if (a.isCurrentDevice) return -1;
            if (b.isCurrentDevice) return 1;
            return b.lastUsed.getTime() - a.lastUsed.getTime();
          });
          
          setDevices(trustedDevices);
        }
      } catch (error) {
        handleError(error, { action: 'loadTrustedDevices' });
      } finally {
        setIsLoading(false);
      }
    }),
    [handleError, reset, withErrorHandling]
  );

  // Generate a device ID based on available device properties
  const generateDeviceId = useCallback(() => {
    return `${Device.brand || 'Unknown'}-${Device.modelName || 'Unknown'}-${Device.deviceYearClass || Date.now()}-${Platform.OS}`;
  }, []);

  useEffect(() => {
    loadTrustedDevices();
  }, [loadTrustedDevices]);

  const getCurrentDeviceInfo = async () => {
    // Create a unique device ID based on available device properties
    const deviceId = generateDeviceId();
    setCurrentDeviceId(deviceId);
    return {
      id: deviceId,
      deviceName: Device.deviceName || `${Device.brand} ${Device.modelName}`,
      deviceType: Device.deviceType === Device.DeviceType.PHONE ? 'Phone' : 'Tablet',
      platform: Platform.OS,
    };
  };

  const removeDevice = withErrorHandling(async (visitorId: string) => {
    if (visitorId === currentDeviceId) {
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
              const result = await callFirebaseFunction<{ success: boolean }>('removeTrustedDevice', {
                deviceIdToRemove: visitorId,
                currentDeviceId
              });
              const success = result.success;
              
              if (success) {
                const updatedDevices = devices.filter(d => d.visitorId !== visitorId);
                setDevices(updatedDevices);
                Alert.alert('Success', 'Device removed successfully.');
              } else {
                Alert.alert('Error', 'Failed to remove device. Please try again.');
              }
            } catch (error) {
              handleError(error, {
                action: 'removeDevice',
                metadata: { visitorId, screenName: 'TrustedDevices' }
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
          
          {item.lastLocation && (
            <Text style={styles.deviceLocation}>
              📍 {item.lastLocation.city ? `${item.lastLocation.city}, ` : ''}{item.lastLocation.country || 'Unknown location'}
            </Text>
          )}
          
          <View style={styles.trustScoreContainer}>
            <Text style={styles.trustScoreLabel}>Trust Score:</Text>
            <View style={styles.trustScoreBar}>
              <View 
                style={[
                  styles.trustScoreFill,
                  { 
                    width: `${item.trustScore}%`,
                    backgroundColor: item.trustScore >= 70 ? '#4CAF50' : 
                                   item.trustScore >= 40 ? '#FF9800' : '#F44336'
                  }
                ]}
              />
            </View>
            <Text style={styles.trustScoreValue}>{item.trustScore}%</Text>
          </View>
        </View>
        
        {!item.isCurrentDevice && (
          <TouchableOpacity
            onPress={() => removeDevice(item.visitorId)}
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
            keyExtractor={(item) => item.visitorId || item.id}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No trusted devices found</Text>
              </View>
            )}
            estimatedItemSize={120}
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
  deviceLocation: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  trustScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  trustScoreLabel: {
    fontSize: 12,
    color: '#666',
    marginRight: 8,
  },
  trustScoreBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 8,
  },
  trustScoreFill: {
    height: '100%',
    borderRadius: 2,
  },
  trustScoreValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    minWidth: 35,
    textAlign: 'right',
  },
});

export default TrustedDevicesScreen;