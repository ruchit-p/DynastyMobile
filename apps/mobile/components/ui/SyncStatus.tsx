import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Colors } from '@/constants/Colors';
import { Spacing, BorderRadius, Shadows } from '@/constants/Spacing';
import Typography from '@/constants/Typography';
import Card from './Card';

interface SyncStatusProps {
  pendingOperations: number;
  lastSyncTime?: Date;
  isSyncing: boolean;
  onSync?: () => void;
  syncError?: string | null;
}

/**
 * SyncStatus - Shows synchronization progress and status
 * Displays pending operations, last sync time, and provides manual sync trigger
 */
export const SyncStatus = React.memo<SyncStatusProps>(({
  pendingOperations,
  lastSyncTime,
  isSyncing,
  onSync,
  syncError,
}) => {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const secondaryTextColor = useThemeColor(
    { 
      light: Colors.light.text.secondary,
      dark: Colors.dark.text.secondary
    },
    'text'
  );
  const errorColor = useThemeColor(
    { 
      light: Colors.light.status.error,
      dark: Colors.dark.status.error
    },
    'text'
  );
  const successColor = useThemeColor(
    { 
      light: Colors.light.status.success,
      dark: Colors.dark.status.success
    },
    'text'
  );
  const warningColor = useThemeColor(
    { 
      light: Colors.light.status.warning,
      dark: Colors.dark.status.warning
    },
    'text'
  );
  const buttonBackgroundColor = useThemeColor(
    { 
      light: Colors.light.button.primary.background,
      dark: Colors.dark.button.primary.background
    },
    'background'
  );
  const disabledButtonColor = useThemeColor(
    { 
      light: Colors.light.button.disabled.background,
      dark: Colors.dark.button.disabled.background
    },
    'background'
  );

  // Format last sync time
  const formatSyncTime = (date?: Date) => {
    if (!date) return 'Never synced';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // Determine status color and icon
  const getStatusConfig = () => {
    if (syncError) {
      return { color: errorColor, icon: 'alert-circle' as const, text: 'Sync failed' };
    }
    if (isSyncing) {
      return { color: warningColor, icon: 'sync' as const, text: 'Syncing...' };
    }
    if (pendingOperations > 0) {
      return { color: warningColor, icon: 'time' as const, text: `${pendingOperations} pending` };
    }
    return { color: successColor, icon: 'checkmark-circle' as const, text: 'All synced' };
  };

  const statusConfig = getStatusConfig();

  return (
    <Card style={styles.container}>
      <View style={styles.header}>
        <View style={styles.statusSection}>
          <Ionicons 
            name={statusConfig.icon} 
            size={20} 
            color={statusConfig.color}
            style={styles.statusIcon}
          />
          <Text style={[styles.statusText, { color: statusConfig.color }]}>
            {statusConfig.text}
          </Text>
        </View>
        
        <TouchableOpacity
          onPress={onSync}
          disabled={isSyncing || !onSync}
          style={[
            styles.syncButton,
            { 
              backgroundColor: isSyncing || !onSync 
                ? disabledButtonColor 
                : buttonBackgroundColor 
            }
          ]}
          activeOpacity={0.7}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color={Colors.light.text.inverse} />
          ) : (
            <Ionicons 
              name="refresh" 
              size={18} 
              color={Colors.light.text.inverse}
            />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.details}>
        <Text style={[styles.lastSyncText, { color: secondaryTextColor }]}>
          Last sync: {formatSyncTime(lastSyncTime)}
        </Text>
        
        {syncError && (
          <Text style={[styles.errorText, { color: errorColor }]} numberOfLines={2}>
            {syncError}
          </Text>
        )}
      </View>

      {pendingOperations > 0 && !isSyncing && (
        <View style={styles.pendingBar}>
          <View 
            style={[
              styles.pendingIndicator,
              { backgroundColor: warningColor }
            ]}
          />
          <Text style={[styles.pendingText, { color: textColor }]}>
            {pendingOperations} change{pendingOperations !== 1 ? 's' : ''} waiting to sync
          </Text>
        </View>
      )}
    </Card>
  );
});

SyncStatus.displayName = 'SyncStatus';

export default SyncStatus;

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    margin: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIcon: {
    marginRight: Spacing.xs,
  },
  statusText: {
    ...Typography.styles.bodyMedium,
    fontWeight: Typography.weight.medium,
  },
  syncButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.md,
  },
  details: {
    marginTop: Spacing.xs,
  },
  lastSyncText: {
    ...Typography.styles.caption,
  },
  errorText: {
    ...Typography.styles.caption,
    marginTop: Spacing.xs,
  },
  pendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border.light,
  },
  pendingIndicator: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.xs,
  },
  pendingText: {
    ...Typography.styles.bodySmall,
  },
});