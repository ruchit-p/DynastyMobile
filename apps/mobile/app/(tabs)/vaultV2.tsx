/**
 * Vault Screen V2 - Migrated to use vault-sdk
 * 
 * This is a demonstration of how to migrate from VaultService to the new SDK.
 * Key changes:
 * 1. Uses useVault hook instead of getVaultService()
 * 2. Direct SDK methods for CRUD operations
 * 3. React Query handles caching and state management
 * 4. Simpler error handling with built-in error boundaries
 */

import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, View, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import FloatingActionMenu, { FabMenuItemAction, FloatingActionMenuRef } from '../../components/ui/FloatingActionMenu';
import Screen from '../../components/ui/Screen';
import EmptyState from '../../components/ui/EmptyState';
import { ThemedText } from '../../components/ThemedText';
import IconButton, { IconSet } from '../../components/ui/IconButton';
import AppHeader from '../../components/ui/AppHeader';
import FileListItem, { type VaultListItemType as UIVaultItem } from '../../components/ui/FileListItem';
import FileListItemWithPreview from '../../components/ui/FileListItemWithPreview';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { FlashList } from '../../components/ui/FlashList';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import VaultSearchBar, { VaultSearchFilters } from '../../components/ui/VaultSearchBar';
import Checkbox from '../../components/ui/Checkbox';
import UploadProgressBar from '../../components/ui/UploadProgressBar';
import Button from '../../components/ui/Button';
import { logger } from '../../src/services/LoggingService';
import { useBackgroundColor, useBorderColor } from '../../hooks/useThemeColor';
import { useVault } from '../../src/components/providers/VaultProvider';
import { useAuth } from '../../src/contexts/AuthContext';

// Constants
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILE_SIZE_MB = 100;

const getVaultFileType = (mimeType?: string | null, fileName?: string | null) => {
  if (!mimeType && !fileName) return 'other';
  const name = fileName?.toLowerCase() || '';
  const type = mimeType?.toLowerCase() || '';

  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('application/pdf') || name.endsWith('.pdf')) return 'document';
  if (type.includes('document') || type.includes('text')) return 'document';
  
  return 'other';
};

type VaultFile = Extract<UIVaultItem, { type: 'file' }>;
type VaultFolder = Extract<UIVaultItem, { type: 'folder' }>;

const VaultScreenV2 = () => {
  const router = useRouter();
  const { user } = useAuth();
  
  // Use the new vault hook
  const { vaultClient } = useVault();
  
  const [currentPathId, setCurrentPathId] = useState<string | null>(null);
  const [currentPathDisplay, setCurrentPathDisplay] = useState<string>('');
  const [pathHistory, setPathHistory] = useState<{id: string | null; name: string}[]>([{id: null, name: 'Vault'}]);
  const [searchFilters, setSearchFilters] = useState<VaultSearchFilters>({
    query: '',
    fileTypes: [],
    sortBy: 'name',
    sortOrder: 'asc'
  });
  const [isSearching, setIsSearching] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showUploadProgress, setShowUploadProgress] = useState(false);

  const fabMenuRef = useRef<FloatingActionMenuRef>(null);

  // Get theme colors
  const backgroundColor = useBackgroundColor('secondary');
  const borderColor = useBorderColor();
  const tertiaryBackgroundColor = useBackgroundColor('tertiary');

  // The SDK provides loading state and items directly
  const isLoading = vaultClient?.isLoading || false;
  const sdkItems = vaultClient?.items || [];
  const error = vaultClient?.error;

  // Filter and transform SDK items for display
  const displayItems = React.useMemo(() => {
    let filtered = sdkItems;

    // Filter by current folder (parentId)
    filtered = filtered.filter(item => 
      item.metadata?.parentId === currentPathId
    );

    // Apply search filters
    if (isSearching) {
      if (searchFilters.query) {
        const query = searchFilters.query.toLowerCase();
        filtered = filtered.filter(item =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
        );
      }

      if (searchFilters.fileTypes.length > 0) {
        filtered = filtered.filter(item => {
          const fileType = getVaultFileType(item.mimeType, item.name);
          return searchFilters.fileTypes.includes(fileType);
        });
      }
    }

    // Sort items
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (searchFilters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          comparison = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          break;
        case 'size':
          comparison = (b.fileSize || 0) - (a.fileSize || 0);
          break;
        case 'type':
          comparison = (a.type || '').localeCompare(b.type || '');
          break;
      }
      
      return searchFilters.sortOrder === 'desc' ? -comparison : comparison;
    });

    // Transform to UI format
    return filtered.map(item => ({
      id: item.id,
      name: item.name,
      type: 'file' as const,
      fileType: getVaultFileType(item.mimeType, item.name),
      size: item.fileSize ? `${(item.fileSize / (1024 * 1024)).toFixed(2)} MB` : undefined,
      mimeType: item.mimeType,
      uri: item.fileUrl,
      isEncrypted: !!item.encryptionKey,
    } as UIVaultItem));
  }, [sdkItems, currentPathId, isSearching, searchFilters]);

  // Refresh data on focus
  useFocusEffect(
    useCallback(() => {
      vaultClient?.refetch();
      fabMenuRef.current?.close();
    }, [vaultClient])
  );

  const handleSearch = useCallback(() => {
    setIsSearching(true);
  }, []);

  const handleFiltersChange = useCallback((newFilters: VaultSearchFilters) => {
    setSearchFilters(newFilters);
    if (!newFilters.query && newFilters.fileTypes.length === 0) {
      setIsSearching(false);
    }
  }, []);

  const navigateToFolder = (folder: {id: string; name: string}) => {
    const newHist = [...pathHistory, { id: folder.id, name: folder.name }];
    setPathHistory(newHist);
    setCurrentPathDisplay(newHist.slice(1).map(p => p.name).join(' / '));
    setCurrentPathId(folder.id);
  };

  const navigateBack = () => {
    if (pathHistory.length > 1) {
      const newHist = [...pathHistory];
      newHist.pop();
      setPathHistory(newHist);
      setCurrentPathId(newHist[newHist.length - 1].id);
      setCurrentPathDisplay(newHist.length > 1 ? newHist.slice(1).map(p => p.name).join(' / ') : '');
    }
  };

  const handleAddItemsToVault = async (
    assets: DocumentPicker.DocumentPickerAsset[] | ImagePicker.ImagePickerAsset[]
  ) => {
    if (!vaultClient) return;

    try {
      setShowUploadProgress(true);
      const uploadPromises = [];

      for (const fileResult of assets) {
        const assetName = (fileResult as any).name || (fileResult as any).fileName || `file_${Date.now()}`;
        const assetMimeType = (fileResult as any).mimeType || 'application/octet-stream';
        const assetSize = (fileResult as any).size || 0;
        const assetUri = (fileResult as any).uri;

        // Validate file size
        if (assetSize > MAX_FILE_SIZE) {
          Alert.alert(
            'File Too Large',
            `"${assetName}" exceeds the maximum file size of ${MAX_FILE_SIZE_MB}MB.`,
            [{ text: 'OK' }]
          );
          continue;
        }

        // Use SDK to upload file
        const uploadPromise = vaultClient.uploadFileAsync({
          file: {
            uri: assetUri,
            name: assetName,
            type: assetMimeType,
          },
          familyId: user?.uid || '',
          vaultItem: {
            name: assetName,
            type: getVaultFileType(assetMimeType, assetName) as any,
            metadata: {
              parentId: currentPathId,
            },
          },
          onProgress: (progress) => {
            logger.info(`Upload progress for ${assetName}: ${progress}%`);
          },
        });

        uploadPromises.push(uploadPromise);
      }

      await Promise.all(uploadPromises);
      
      // Refresh the list
      vaultClient.refetch();
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', 'Failed to upload one or more files.');
    } finally {
      setShowUploadProgress(false);
    }
  };

  const handleSelectItems = () => {
    setSelectionMode(true);
    setSelectedItems(new Set());
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedItems(new Set());
  };

  const handleDeleteSelected = async () => {
    if (!vaultClient || selectedItems.size === 0) return;

    Alert.alert(
      'Delete Items',
      `Are you sure you want to delete ${selectedItems.size} item(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete each selected item
              await Promise.all(
                Array.from(selectedItems).map(id => 
                  vaultClient.deleteFileAsync({
                    vaultItem: sdkItems.find(item => item.id === id)!,
                    familyId: user?.uid || '',
                  })
                )
              );

              // Clear selection and refresh
              handleCancelSelection();
              vaultClient.refetch();
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Delete Failed', 'Failed to delete one or more items.');
            }
          },
        },
      ]
    );
  };

  const handleDocumentPicker = async () => {
    const result = await vaultClient?.pickDocument();
    if (result && result.type === 'success') {
      await handleAddItemsToVault([result]);
    }
  };

  const handlePhotoPicker = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled) {
      await handleAddItemsToVault(result.assets);
    }
  };

  const handleCameraPicker = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 1,
    });

    if (!result.canceled) {
      await handleAddItemsToVault(result.assets);
    }
  };

  const renderItem = ({ item }: { item: UIVaultItem }) => {
    const handlePress = () => {
      if (selectionMode) {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(item.id)) {
          newSelected.delete(item.id);
        } else {
          newSelected.add(item.id);
        }
        setSelectedItems(newSelected);
      } else if (item.type === 'folder') {
        navigateToFolder({ id: item.id, name: item.name });
      } else {
        router.push({
          pathname: '/(screens)/filePreview',
          params: {
            id: item.id,
            name: item.name,
            uri: item.uri || '',
            mimeType: item.mimeType || '',
            size: item.size || '',
            isEncrypted: item.isEncrypted ? 'true' : 'false',
          },
        });
      }
    };

    return (
      <View style={styles.itemContainer}>
        {selectionMode && (
          <View style={styles.checkboxContainer}>
            <Checkbox
              checked={selectedItems.has(item.id)}
              onValueChange={() => handlePress()}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <FileListItemWithPreview
            item={item}
            onPress={handlePress}
            disabled={selectionMode}
          />
        </View>
      </View>
    );
  };

  const fabActions: FabMenuItemAction[] = [
    {
      label: 'Upload File',
      iconSource: 'ionicon',
      iconName: 'document-outline',
      onPress: handleDocumentPicker,
    },
    {
      label: 'Take Photo',
      iconSource: 'ionicon',
      iconName: 'camera-outline',
      onPress: handleCameraPicker,
    },
    {
      label: 'Choose Photo',
      iconSource: 'ionicon',
      iconName: 'image-outline',
      onPress: handlePhotoPicker,
    },
  ];

  return (
    <ErrorBoundary>
      <Screen style={[styles.container, { backgroundColor }]}>
        <AppHeader
          title="Vault"
          subtitle={currentPathDisplay}
          leftButton={
            pathHistory.length > 1 ? (
              <IconButton
                icon={{ iconSet: IconSet.Ionicons, iconName: 'arrow-back' }}
                variant="ghost"
                onPress={navigateBack}
              />
            ) : undefined
          }
          rightButton={
            <IconButton
              icon={{ iconSet: IconSet.Ionicons, iconName: 'ellipsis-horizontal' }}
              variant="ghost"
              onPress={handleSelectItems}
            />
          }
        />

        <VaultSearchBar
          onSearch={handleSearch}
          onFiltersChange={handleFiltersChange}
          initialFilters={searchFilters}
        />

        {selectionMode && (
          <View style={[styles.selectionBar, { backgroundColor: tertiaryBackgroundColor }]}>
            <ThemedText>{selectedItems.size} selected</ThemedText>
            <View style={styles.selectionActions}>
              <Button
                title="Cancel"
                variant="outline"
                size="small"
                onPress={handleCancelSelection}
              />
              <Button
                title="Delete"
                variant="danger"
                size="small"
                onPress={handleDeleteSelected}
                disabled={selectedItems.size === 0}
              />
            </View>
          </View>
        )}

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
          </View>
        ) : error ? (
          <EmptyState
            icon={{ iconSet: IconSet.Ionicons, iconName: 'alert-circle-outline' }}
            title="Error Loading Vault"
            subtitle={error.message}
            action={{
              label: 'Retry',
              onPress: () => vaultClient?.refetch(),
            }}
          />
        ) : displayItems.length === 0 ? (
          <EmptyState
            icon={{ iconSet: IconSet.Ionicons, iconName: 'folder-open-outline' }}
            title={isSearching ? 'No Results' : 'Empty Vault'}
            subtitle={isSearching ? 'Try adjusting your search filters' : 'Add files to get started'}
            action={
              !isSearching
                ? {
                    label: 'Add Files',
                    onPress: handleDocumentPicker,
                  }
                : undefined
            }
          />
        ) : (
          <FlashList
            data={displayItems}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            estimatedItemSize={80}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: borderColor }]} />
            )}
            contentContainerStyle={styles.listContent}
          />
        )}

        {showUploadProgress && (
          <UploadProgressBar />
        )}

        <FloatingActionMenu
          ref={fabMenuRef}
          actions={fabActions}
          backgroundColor={Colors.light.primary}
        />
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
  listContent: {
    paddingBottom: 100,
  },
  separator: {
    height: 1,
    marginHorizontal: Spacing.medium,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxContainer: {
    paddingLeft: Spacing.medium,
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.medium,
    borderBottomWidth: 1,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: Spacing.small,
  },
});

export default VaultScreenV2;