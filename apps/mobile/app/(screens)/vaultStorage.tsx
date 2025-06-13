import React, { useState, useCallback } from 'react';
import { StyleSheet, View, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Screen from '../../components/ui/Screen';
import EmptyState from '../../components/ui/EmptyState';
import { ThemedText } from '../../components/ThemedText';
import AppHeader from '../../components/ui/AppHeader';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { getVaultService } from '../../src/services/VaultService';

interface StorageInfo {
  totalUsed: number;
  fileCount: number;
  folderCount: number;
  byFileType: Record<string, { count: number; size: number }>;
  quota: number;
  percentUsed: number;
}

const VaultStorageScreen = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

  const { handleError, withErrorHandling } = useErrorHandler({
    title: 'Storage Error',
  });

  const vaultService = getVaultService();

  const fetchStorageInfo = useCallback(async () => {
    setIsLoading(true);
    try {
      await vaultService.initialize();
      const info = await vaultService.getStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      handleError(error, {
        severity: ErrorSeverity.ERROR,
        metadata: {
          action: 'fetchVaultStorageInfo',
        }
      });
    }
    setIsLoading(false);
  }, [vaultService, handleError]);

  useFocusEffect(
    useCallback(() => {
      fetchStorageInfo();
    }, [fetchStorageInfo])
  );

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeIcon = (fileType: string): keyof typeof Ionicons.glyphMap => {
    switch (fileType) {
      case 'image':
        return 'image-outline';
      case 'video':
        return 'videocam-outline';
      case 'audio':
        return 'musical-notes-outline';
      case 'document':
        return 'document-text-outline';
      default:
        return 'document-attach-outline';
    }
  };

  const getFileTypeColor = (fileType: string): string => {
    switch (fileType) {
      case 'image':
        return '#4CAF50';
      case 'video':
        return '#2196F3';
      case 'audio':
        return '#FF9800';
      case 'document':
        return '#9C27B0';
      default:
        return Colors.light.text.secondary;
    }
  };

  if (isLoading) {
    return (
      <Screen safeArea>
        <AppHeader 
          title="Storage Management"
          showBackButton
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dynastyGreen} />
          <ThemedText variant="bodyMedium" color="secondary">Loading storage info...</ThemedText>
        </View>
      </Screen>
    );
  }

  if (!storageInfo) {
    return (
      <Screen safeArea>
        <AppHeader 
          title="Storage Management"
          showBackButton
        />
        <View style={styles.emptyStateContainer}>
          <EmptyState 
            title="Unable to Load Storage Info"
            description="Please try again later"
            icon="alert-circle-outline"
          />
        </View>
      </Screen>
    );
  }

  const usedPercentage = Math.min(storageInfo.percentUsed, 100);
  const storageBarColor = usedPercentage > 80 ? Colors.light.text.error : 
                          usedPercentage > 60 ? '#FF9800' : 
                          Colors.dynastyGreen;

  return (
    <ErrorBoundary screenName="VaultStorageScreen">
      <Screen safeArea>
        <AppHeader 
          title="Storage Management"
          showBackButton
        />
        
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          {/* Storage Overview Card */}
          <Card style={styles.storageCard}>
            <View style={styles.storageHeader}>
              <Ionicons name="cloud-outline" size={40} color={Colors.dynastyGreen} />
              <View style={styles.storageText}>
                <ThemedText variant="heading3">
                  {formatBytes(storageInfo.totalUsed)}
                </ThemedText>
                <ThemedText variant="bodySmall" color="secondary">
                  of {formatBytes(storageInfo.quota)} used
                </ThemedText>
              </View>
            </View>
            
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarBackground}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      width: `${usedPercentage}%`,
                      backgroundColor: storageBarColor 
                    }
                  ]} 
                />
              </View>
              <ThemedText variant="bodySmall" color="secondary" style={styles.percentageText}>
                {usedPercentage}%
              </ThemedText>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <ThemedText variant="heading4">{storageInfo.fileCount}</ThemedText>
                <ThemedText variant="bodySmall" color="secondary">Files</ThemedText>
              </View>
              <View style={styles.statItem}>
                <ThemedText variant="heading4">{storageInfo.folderCount}</ThemedText>
                <ThemedText variant="bodySmall" color="secondary">Folders</ThemedText>
              </View>
              <View style={styles.statItem}>
                <ThemedText variant="heading4">{formatBytes(storageInfo.quota - storageInfo.totalUsed)}</ThemedText>
                <ThemedText variant="bodySmall" color="secondary">Available</ThemedText>
              </View>
            </View>
          </Card>

          {/* Storage Breakdown by File Type */}
          <Card style={styles.breakdownCard}>
            <ThemedText variant="heading4" style={styles.sectionTitle}>
              Storage by File Type
            </ThemedText>
            
            {Object.entries(storageInfo.byFileType).map(([fileType, data]) => {
              if (data.count === 0) return null;
              
              const percentage = storageInfo.totalUsed > 0 
                ? Math.round((data.size / storageInfo.totalUsed) * 100) 
                : 0;
              
              return (
                <View key={fileType} style={styles.fileTypeRow}>
                  <View style={styles.fileTypeInfo}>
                    <Ionicons 
                      name={getFileTypeIcon(fileType)} 
                      size={24} 
                      color={getFileTypeColor(fileType)} 
                    />
                    <View style={styles.fileTypeText}>
                      <ThemedText variant="bodyMedium" weight="semibold">
                        {fileType.charAt(0).toUpperCase() + fileType.slice(1)}s
                      </ThemedText>
                      <ThemedText variant="bodySmall" color="secondary">
                        {data.count} file{data.count !== 1 ? 's' : ''} • {formatBytes(data.size)}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText variant="bodySmall" color="secondary">
                    {percentage}%
                  </ThemedText>
                </View>
              );
            })}
          </Card>

          {/* Actions */}
          <Card style={styles.actionsCard}>
            <ThemedText variant="heading4" style={styles.sectionTitle}>
              Storage Actions
            </ThemedText>
            
            <Button
              variant="secondary"
              size="medium"
              leftIcon={<Ionicons name="trash-outline" size={20} color={Colors.light.text.primary} />}
              onPress={() => router.push('/vaultTrash')}
              style={styles.actionButton}
            >
              Manage Trash
            </Button>
            
            <Button
              variant="secondary"
              size="medium"
              leftIcon={<Ionicons name="analytics-outline" size={20} color={Colors.light.text.primary} />}
              onPress={() => router.push('/vaultAuditLogs')}
              style={styles.actionButton}
            >
              View Activity Logs
            </Button>
            
            <View style={styles.tipContainer}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.light.text.secondary} />
              <ThemedText variant="bodySmall" color="secondary" style={styles.tipText}>
                Files in trash are automatically deleted after 30 days
              </ThemedText>
            </View>
          </Card>
        </ScrollView>
      </Screen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  storageCard: {
    margin: Spacing.md,
    padding: Spacing.lg,
  },
  storageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  storageText: {
    marginLeft: Spacing.md,
  },
  progressBarContainer: {
    marginBottom: Spacing.lg,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  percentageText: {
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  breakdownCard: {
    margin: Spacing.md,
    marginTop: 0,
    padding: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  fileTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  fileTypeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fileTypeText: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  actionsCard: {
    margin: Spacing.md,
    marginTop: 0,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  actionButton: {
    marginBottom: Spacing.sm,
  },
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: BorderRadius.sm,
  },
  tipText: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
});

export default VaultStorageScreen;