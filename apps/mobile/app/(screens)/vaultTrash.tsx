import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Screen from '../../components/ui/Screen';
import EmptyState from '../../components/ui/EmptyState';
import { ThemedText } from '../../components/ThemedText';
import AppHeader from '../../components/ui/AppHeader';
import FileListItemWithPreview from '../../components/ui/FileListItemWithPreview';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { FlashList } from '../../components/ui/FlashList';
import Button from '../../components/ui/Button';
import { Colors } from '../../constants/Colors';
import { Spacing } from '../../constants/Spacing';
import { getVaultService, VaultItem } from '../../src/services/VaultService';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { logger } from '../../src/services/LoggingService';

type UIVaultItem = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  fileType?: 'image' | 'video' | 'audio' | 'document' | 'other';
  size?: string;
  mimeType?: string;
  uri?: string;
  isEncrypted?: boolean;
  deletedAt?: Date;
};

const VaultTrashScreen = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [items, setItems] = useState<UIVaultItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  const { handleError, withErrorHandling } = useErrorHandler({
    title: 'Vault Trash Error',
  });

  const vaultService = getVaultService();

  const fetchDeletedItems = useCallback(async () => {
    setIsLoading(true);
    try {
      await vaultService.initialize();
      const deletedItems = await vaultService.getDeletedItems();
      
      const uiItems: UIVaultItem[] = deletedItems.map(item => {
        if (item.type === 'file') {
          return {
            id: item.id,
            name: item.name,
            type: 'file',
            fileType: item.fileType,
            size: item.size ? `${(item.size / (1024 * 1024)).toFixed(2)} MB` : undefined,
            mimeType: item.mimeType,
            uri: item.downloadURL,
            isEncrypted: item.isEncrypted || false,
            deletedAt: item.deletedAt?.toDate(),
          };
        }
        return { 
          id: item.id, 
          name: item.name, 
          type: 'folder',
          deletedAt: item.deletedAt?.toDate(),
        };
      });
      
      setItems(uiItems);
    } catch (error) {
      handleError(error, {
        severity: ErrorSeverity.ERROR,
        metadata: {
          action: 'fetchDeletedVaultItems',
        }
      });
    }
    setIsLoading(false);
  }, [vaultService, handleError]);

  useFocusEffect(
    useCallback(() => {
      fetchDeletedItems();
    }, [fetchDeletedItems])
  );

  const handleRestoreItem = withErrorHandling(async (item: UIVaultItem) => {
    Alert.alert(
      'Restore Item',
      `Are you sure you want to restore "${item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setIsRestoring(true);
            try {
              await vaultService.restoreItem(item.id);
              Alert.alert('Success', `"${item.name}" has been restored.`);
              fetchDeletedItems();
            } catch (error) {
              handleError(error, {
                severity: ErrorSeverity.ERROR,
                metadata: {
                  action: 'restoreVaultItem',
                  itemId: item.id,
                }
              });
            } finally {
              setIsRestoring(false);
            }
          }
        }
      ]
    );
  });

  const handleRestoreSelected = withErrorHandling(async () => {
    if (selectedItems.size === 0) return;

    Alert.alert(
      'Restore Items',
      `Are you sure you want to restore ${selectedItems.size} selected item(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore All',
          onPress: async () => {
            setIsRestoring(true);
            try {
              let successCount = 0;
              let errorCount = 0;

              for (const itemId of selectedItems) {
                try {
                  await vaultService.restoreItem(itemId);
                  successCount++;
                } catch (error) {
                  errorCount++;
                  logger.error(`Failed to restore item ${itemId}:`, error);
                }
              }

              if (successCount > 0) {
                Alert.alert(
                  'Restore Complete',
                  `Successfully restored ${successCount} item(s).${errorCount > 0 ? ` Failed to restore ${errorCount} item(s).` : ''}`
                );
              }

              setSelectedItems(new Set());
              fetchDeletedItems();
            } catch (error) {
              handleError(error, {
                severity: ErrorSeverity.ERROR,
                metadata: {
                  action: 'restoreMultipleVaultItems',
                  itemCount: selectedItems.size,
                }
              });
            } finally {
              setIsRestoring(false);
            }
          }
        }
      ]
    );
  });

  const handleEmptyTrash = withErrorHandling(async () => {
    Alert.alert(
      'Empty Trash',
      'Are you sure you want to permanently delete all items in trash? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Empty Trash',
          style: 'destructive',
          onPress: async () => {
            setIsRestoring(true);
            try {
              const result = await vaultService.emptyTrash(0); // Delete all items regardless of age
              Alert.alert(
                'Trash Emptied', 
                `Successfully deleted ${result.deletedCount} items.`,
                [{ text: 'OK', onPress: () => fetchDeletedItems() }]
              );
            } catch (error) {
              handleError(error, {
                severity: ErrorSeverity.ERROR,
                metadata: {
                  action: 'emptyVaultTrash',
                }
              });
            } finally {
              setIsRestoring(false);
            }
          }
        }
      ]
    );
  });

  const handlePermanentlyDeleteSelected = withErrorHandling(async () => {
    if (selectedItems.size === 0) return;

    const itemCount = selectedItems.size;
    Alert.alert(
      'Permanently Delete Items',
      `Are you sure you want to permanently delete ${itemCount} item${itemCount > 1 ? 's' : ''}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setIsRestoring(true);
            try {
              const itemIds = Array.from(selectedItems);
              const result = await vaultService.bulkPermanentlyDelete(itemIds);
              
              let message = '';
              if (result.success > 0) {
                message += `Successfully deleted ${result.success} item${result.success > 1 ? 's' : ''}.`;
              }
              if (result.failed > 0) {
                message += ` ${result.failed} item${result.failed > 1 ? 's' : ''} failed to delete.`;
              }
              
              Alert.alert(
                'Deletion Complete',
                message,
                [{ text: 'OK', onPress: () => {
                  setSelectedItems(new Set());
                  fetchDeletedItems();
                }}]
              );
            } catch (error) {
              handleError(error, {
                severity: ErrorSeverity.ERROR,
                metadata: {
                  action: 'bulkPermanentlyDeleteVaultItems',
                  itemCount: selectedItems.size,
                }
              });
            } finally {
              setIsRestoring(false);
            }
          }
        }
      ]
    );
  });

  const handleItemAction = withErrorHandling(async (item: UIVaultItem, action: 'restore' | 'delete') => {
    if (action === 'restore') {
      await handleRestoreItem(item);
    } else if (action === 'delete') {
      Alert.alert(
        'Permanently Delete Item',
        `Are you sure you want to permanently delete "${item.name}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete Permanently',
            style: 'destructive',
            onPress: async () => {
              setIsRestoring(true);
              try {
                await vaultService.permanentlyDeleteItem(item.id);
                Alert.alert(
                  'Item Deleted',
                  `"${item.name}" has been permanently deleted.`,
                  [{ text: 'OK', onPress: () => fetchDeletedItems() }]
                );
              } catch (error) {
                handleError(error, {
                  severity: ErrorSeverity.ERROR,
                  metadata: {
                    action: 'permanentlyDeleteVaultItem',
                    itemId: item.id,
                  }
                });
              } finally {
                setIsRestoring(false);
              }
            }
          }
        ]
      );
    }
  });

  const showItemOptions = (item: UIVaultItem) => {
    Alert.alert(
      item.name,
      'Choose an action:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => handleItemAction(item, 'restore')
        },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => handleItemAction(item, 'delete')
        }
      ]
    );
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const renderItem = ({ item }: { item: UIVaultItem }) => {
    const isSelected = selectedItems.has(item.id);
    const deletedDaysAgo = item.deletedAt 
      ? Math.floor((Date.now() - item.deletedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return (
      <View style={styles.itemContainer}>
        <FileListItemWithPreview
          item={item}
          onPress={() => toggleItemSelection(item.id)}
          onMorePress={() => showItemOptions(item)}
          showPreview={false}
          style={isSelected ? styles.selectedItem : undefined}
        />
        <ThemedText variant="bodySmall" color="secondary" style={styles.deletedInfo}>
          Deleted {deletedDaysAgo} day{deletedDaysAgo !== 1 ? 's' : ''} ago
        </ThemedText>
      </View>
    );
  };

  if (isLoading && items.length === 0) {
    return (
      <Screen safeArea>
        <AppHeader 
          title="Trash"
          showBackButton
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dynastyGreen} />
          <ThemedText variant="bodyMedium" color="secondary">Loading deleted items...</ThemedText>
        </View>
      </Screen>
    );
  }

  return (
    <ErrorBoundary screenName="VaultTrashScreen">
      <Screen safeArea>
        <AppHeader 
          title="Trash"
          showBackButton
          headerRight={items.length > 0 ? (
            <Button
              variant="text"
              size="small"
              onPress={handleEmptyTrash}
              disabled={isRestoring}
            >
              Empty Trash
            </Button>
          ) : undefined}
        />

        {selectedItems.size > 0 && (
          <View style={styles.selectionBar}>
            <ThemedText variant="bodyMedium">
              {selectedItems.size} selected
            </ThemedText>
            <View style={styles.selectionActions}>
              <Button
                variant="secondary"
                size="small"
                onPress={handleRestoreSelected}
                disabled={isRestoring}
                style={styles.selectionButton}
              >
                Restore
              </Button>
              <Button
                variant="secondary"
                size="small"
                onPress={handlePermanentlyDeleteSelected}
                disabled={isRestoring}
                loading={isRestoring}
                style={[styles.selectionButton, styles.destructiveButton]}
                textStyle={styles.destructiveText}
              >
                Delete Forever
              </Button>
            </View>
          </View>
        )}

        {items.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <EmptyState 
              title="Trash is Empty"
              description="Deleted items will appear here and can be restored within 30 days."
              icon="trash-outline"
            />
          </View>
        ) : (
          <>
            <View style={styles.infoBar}>
              <ThemedText variant="bodySmall" color="secondary">
                Items in trash will be permanently deleted after 30 days
              </ThemedText>
            </View>
            <FlashList
              data={items}
              renderItem={renderItem}
              keyExtractor={(item: UIVaultItem) => item.id}
              contentContainerStyle={styles.listContentContainer}
              estimatedItemSize={100}
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
  itemContainer: {
    marginBottom: Spacing.xs,
  },
  selectedItem: {
    backgroundColor: Colors.light.background.secondary,
  },
  deletedInfo: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.light.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionButton: {
    marginLeft: Spacing.xs,
  },
  infoBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.light.background.tertiary,
  },
  destructiveButton: {
    backgroundColor: Colors.light.status.error,
  },
  destructiveText: {
    color: Colors.light.text.inverse,
  },
});

export default VaultTrashScreen;