import React, { useState, useCallback } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Screen from '../../components/ui/Screen';
import EmptyState from '../../components/ui/EmptyState';
import ThemedText from '../../components/ThemedText';
import AppHeader from '../../components/ui/AppHeader';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import FlashList from '../../components/ui/FlashList';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { callFirebaseFunction } from '../../src/lib/firebaseUtils';
import { format, formatDistanceToNow } from 'date-fns';

interface AuditLog {
  id: string;
  itemId?: string;
  storagePath?: string;
  userId: string;
  targetUserId?: string;
  action: 'share' | 'download' | 'upload' | 'delete' | 'restore' | 'move';
  permissions?: 'read' | 'write';
  timestamp: Date;
  metadata?: {
    itemName?: string;
    itemType?: string;
    [key: string]: any;
  };
}

const VaultAuditLogsScreen = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const { handleError, withErrorHandling } = useErrorHandler({
    title: 'Audit Logs Error',
  });

  const fetchAuditLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      // TODO: Create getVaultAuditLogs function in backend
      const result = await callFirebaseFunction('getVaultAuditLogs', { limit: 100 });
      
      const auditLogs: AuditLog[] = result.data.logs.map((log: any) => ({
        ...log,
        timestamp: log.timestamp?.toDate() || new Date(),
      }));
      
      setLogs(auditLogs);
    } catch (error) {
      handleError(error, {
        severity: ErrorSeverity.ERROR,
        metadata: {
          action: 'fetchVaultAuditLogs',
        }
      });
    }
    setIsLoading(false);
  }, [handleError]);

  useFocusEffect(
    useCallback(() => {
      fetchAuditLogs();
    }, [fetchAuditLogs])
  );

  const getActionIcon = (action: AuditLog['action']): keyof typeof Ionicons.glyphMap => {
    switch (action) {
      case 'share':
        return 'share-outline';
      case 'download':
        return 'download-outline';
      case 'upload':
        return 'cloud-upload-outline';
      case 'delete':
        return 'trash-outline';
      case 'restore':
        return 'refresh-outline';
      case 'move':
        return 'move-outline';
      default:
        return 'document-outline';
    }
  };

  const getActionColor = (action: AuditLog['action']): string => {
    switch (action) {
      case 'delete':
        return Colors.light.text.error;
      case 'share':
        return Colors.dynastyGreen;
      case 'restore':
        return Colors.light.text.success;
      default:
        return Colors.light.text.primary;
    }
  };

  const formatActionText = (log: AuditLog): string => {
    switch (log.action) {
      case 'share':
        return `Shared ${log.metadata?.itemName || 'item'} with ${log.permissions} permissions`;
      case 'download':
        return `Downloaded ${log.metadata?.itemName || 'file'}`;
      case 'upload':
        return `Uploaded ${log.metadata?.itemName || 'file'}`;
      case 'delete':
        return `Deleted ${log.metadata?.itemName || 'item'}`;
      case 'restore':
        return `Restored ${log.metadata?.itemName || 'item'}`;
      case 'move':
        return `Moved ${log.metadata?.itemName || 'item'}`;
      default:
        return log.action;
    }
  };

  const renderItem = ({ item }: { item: AuditLog }) => {
    return (
      <View style={styles.logItem}>
        <View style={styles.iconContainer}>
          <Ionicons 
            name={getActionIcon(item.action)} 
            size={24} 
            color={getActionColor(item.action)} 
          />
        </View>
        <View style={styles.logContent}>
          <ThemedText variant="bodyMedium" weight="semibold">
            {formatActionText(item)}
          </ThemedText>
          <ThemedText variant="bodySmall" color="secondary">
            {formatDistanceToNow(item.timestamp, { addSuffix: true })} • {format(item.timestamp, 'MMM d, yyyy h:mm a')}
          </ThemedText>
          {item.targetUserId && (
            <ThemedText variant="bodySmall" color="secondary">
              User ID: {item.targetUserId}
            </ThemedText>
          )}
        </View>
      </View>
    );
  };

  if (isLoading && logs.length === 0) {
    return (
      <Screen safeArea>
        <AppHeader 
          title="Vault Audit Logs"
          showBackButton
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dynastyGreen} />
          <ThemedText variant="bodyMedium" color="secondary">Loading audit logs...</ThemedText>
        </View>
      </Screen>
    );
  }

  return (
    <ErrorBoundary screenName="VaultAuditLogsScreen">
      <Screen safeArea>
        <AppHeader 
          title="Vault Audit Logs"
          showBackButton
        />

        {logs.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <EmptyState 
              title="No Activity Yet"
              description="Vault access logs will appear here"
              icon="shield-checkmark-outline"
            />
          </View>
        ) : (
          <>
            <View style={styles.infoBar}>
              <ThemedText variant="bodySmall" color="secondary">
                Showing the last {logs.length} vault activities
              </ThemedText>
            </View>
            <FlashList
              data={logs}
              renderItem={renderItem}
              keyExtractor={(item: AuditLog) => item.id}
              contentContainerStyle={styles.listContentContainer}
              estimatedItemSize={80}
            />
          </>
        )}
      </Screen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  listContentContainer: {
    flexGrow: 1,
    paddingBottom: Spacing.lg,
  },
  infoBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.light.background.tertiary,
  },
  logItem: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.light.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  logContent: {
    flex: 1,
  },
});

export default VaultAuditLogsScreen;