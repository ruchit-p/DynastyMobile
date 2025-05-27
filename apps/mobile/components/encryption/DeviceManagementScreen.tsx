import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { Screen } from '../ui/Screen';
import { ListItem } from '../ListItem';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Spacing } from '../../constants/Spacing';
import { MultiDeviceService } from '../../src/services/encryption';
import { callFirebaseFunction } from '../../src/lib/errorUtils';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

interface Device {
  id: string;
  deviceName: string;
  deviceInfo: {
    platform?: string;
    model?: string;
  };
  lastActive: any;
  isTrusted: boolean;
  isActive: boolean;
  registeredAt: any;
}

export default function DeviceManagementScreen() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadDevices();
    getCurrentDeviceId();
  }, []);

  const getCurrentDeviceId = async () => {
    try {
      const deviceId = await MultiDeviceService.getInstance().getDeviceId();
      setCurrentDeviceId(deviceId);
    } catch (error) {
      console.error('Failed to get device ID:', error);
    }
  };

  const loadDevices = async () => {
    try {
      const result = await callFirebaseFunction('getUserDevices', {});
      if (result.success && result.result?.devices) {
        setDevices(result.result.devices);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
      Alert.alert('Error', 'Failed to load devices');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRemoveDevice = (device: Device) => {
    if (device.id === currentDeviceId) {
      Alert.alert('Error', 'Cannot remove current device');
      return;
    }

    Alert.alert(
      'Remove Device',
      `Are you sure you want to remove "${device.deviceName}"? This device will no longer have access to your encrypted messages.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await callFirebaseFunction('removeDevice', { deviceId: device.id });
              await loadDevices();
              Alert.alert('Success', 'Device removed successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to remove device');
            }
          }
        }
      ]
    );
  };

  const handleTrustDevice = async (device: Device) => {
    try {
      await MultiDeviceService.getInstance().trustDevice(device.id);
      await loadDevices();
      Alert.alert('Success', 'Device trusted successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to trust device');
    }
  };

  const formatLastActive = (timestamp: any) => {
    if (!timestamp) return 'Never';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'MMM d, yyyy h:mm a');
  };

  const renderDevice = (device: Device) => {
    const isCurrentDevice = device.id === currentDeviceId;
    const deviceIcon = device.deviceInfo?.platform === 'ios' ? 'phone-portrait' : 'phone-portrait-outline';
    
    return (
      <View key={device.id} style={styles.deviceCard}>
        <View style={styles.deviceHeader}>
          <Ionicons name={deviceIcon} size={24} color={Colors.light.text.primary} />
          <View style={styles.deviceInfo}>
            <View style={styles.deviceTitleRow}>
              <Text style={styles.deviceName}>{device.deviceName}</Text>
              {isCurrentDevice && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>Current</Text>
                </View>
              )}
            </View>
            {device.deviceInfo?.model && (
              <Text style={styles.deviceModel}>{device.deviceInfo.model}</Text>
            )}
            <Text style={styles.lastActive}>
              Last active: {formatLastActive(device.lastActive)}
            </Text>
          </View>
        </View>
        
        <View style={styles.deviceActions}>
          {!isCurrentDevice && !device.isTrusted && (
            <Button
              title="Trust"
              onPress={() => handleTrustDevice(device)}
              size="small"
              variant="secondary"
            />
          )}
          {device.isTrusted && (
            <View style={styles.trustedBadge}>
              <Ionicons name="shield-checkmark" size={16} color={Colors.light.status.success} />
              <Text style={styles.trustedText}>Trusted</Text>
            </View>
          )}
          {!isCurrentDevice && (
            <IconButton
              icon="trash-outline"
              onPress={() => handleRemoveDevice(device)}
              color={Colors.light.status.error}
            />
          )}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              loadDevices();
            }}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Trusted Devices</Text>
          <Text style={styles.subtitle}>
            Manage devices that have access to your encrypted messages
          </Text>
        </View>

        <View style={styles.devicesContainer}>
          {devices.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="phone-portrait-outline" size={48} color={Colors.light.text.secondary} />
              <Text style={styles.emptyText}>No devices found</Text>
            </View>
          ) : (
            devices.map(renderDevice)
          )}
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color={Colors.light.text.secondary} />
            <Text style={styles.infoText}>
              Only trusted devices can decrypt your messages. Remove a device if it&apos;s lost or you no longer use it.
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  title: {
    ...Typography.styles.heading2,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
  },
  devicesContainer: {
    padding: Spacing.xl,
  },
  deviceCard: {
    backgroundColor: Colors.light.background.secondary,
    borderRadius: 12,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  deviceName: {
    ...Typography.styles.bodyLarge,
    fontWeight: '600',
  },
  deviceModel: {
    ...Typography.styles.caption,
    color: Colors.light.text.secondary,
    marginTop: Spacing.xs,
  },
  lastActive: {
    ...Typography.styles.caption,
    color: Colors.light.text.secondary,
    marginTop: Spacing.xs,
  },
  currentBadge: {
    backgroundColor: Colors.light.tint,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 4,
  },
  currentBadgeText: {
    ...Typography.styles.caption,
    color: Colors.light.background.primary,
    fontWeight: '600',
  },
  deviceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  trustedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  trustedText: {
    ...Typography.styles.caption,
    color: Colors.light.status.success,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    ...Typography.styles.bodyLarge,
    color: Colors.light.text.secondary,
    marginTop: Spacing.md,
  },
  infoSection: {
    padding: Spacing.xl,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.light.background.secondary,
    padding: Spacing.lg,
    borderRadius: 12,
  },
  infoText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.secondary,
    flex: 1,
  },
});