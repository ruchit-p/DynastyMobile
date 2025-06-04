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
import auth from '@react-native-firebase/auth';
import {
  getVaultItemsMobile,
  createVaultFolderMobile,
  addVaultFileMobile,
  renameVaultItemMobile,
  deleteVaultItemMobile,
  getUploadSignedUrlMobile,
} from '../../src/lib/firebaseUtils';
import firebase from '@react-native-firebase/app';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { showErrorAlert } from '../../src/lib/errorUtils';
import { useSmartMediaUpload } from '../../hooks/useSmartMediaUpload';
import { useEncryption } from '../../src/contexts/EncryptionContext';
import { getVaultService, VaultItem as ServiceVaultItem } from '../../src/services/VaultService';
import VaultSearchBar, { VaultSearchFilters } from '../../components/ui/VaultSearchBar';
import Checkbox from '../../components/ui/Checkbox';
import UploadProgressBar from '../../components/ui/UploadProgressBar';
import Button from '../../components/ui/Button';
import { logger } from '../../src/services/LoggingService';
import { useBackgroundColor, useBorderColor } from '../../hooks/useThemeColor';

// MARK: - Helper Functions

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
  if (type.includes('document') || type.includes('text') || name.endsWith('.doc') || name.endsWith('.docx') || name.endsWith('.txt') || name.endsWith('.ppt') || name.endsWith('.pptx') || name.endsWith('.xls') || name.endsWith('.xlsx')) return 'document';
  
  return 'other';
};

type VaultFile = Extract<UIVaultItem, { type: 'file' }>;
type VaultFolder = Extract<UIVaultItem, { type: 'folder' }>;

const VaultScreen = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentPathId, setCurrentPathId] = useState<string | null>(null);
  const [currentPathDisplay, setCurrentPathDisplay] = useState<string>('');
  const [items, setItems] = useState<UIVaultItem[]>([]);
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

  // Initialize our error handler
  const { handleError, withErrorHandling } = useErrorHandler({
    title: 'Vault Error',
  });

  const fabMenuRef = useRef<FloatingActionMenuRef>(null);
  
  // Smart media upload hook
  const smartUpload = useSmartMediaUpload();
  const { isEncryptionReady } = useEncryption();

  // Get theme colors
  const backgroundColor = useBackgroundColor('secondary');
  const borderColor = useBorderColor();
  const tertiaryBackgroundColor = useBackgroundColor('tertiary');

  const fetchItems = useCallback(async (parentId: string | null, forceRefresh = false) => {
    setIsLoading(true);
    try {
      const vaultService = getVaultService();
      await vaultService.initialize();
      
      let remote: ServiceVaultItem[];
      
      if (isSearching && (searchFilters.query || searchFilters.fileTypes.length > 0)) {
        // Use search API when searching
        remote = await vaultService.searchItems({
          query: searchFilters.query,
          fileTypes: searchFilters.fileTypes,
          parentId: parentId,
          includeDeleted: false,
          sortBy: searchFilters.sortBy,
          sortOrder: searchFilters.sortOrder,
          limit: 100
        });
      } else {
        // Use regular fetch when not searching
        remote = await vaultService.getItems(parentId, forceRefresh);
        
        // Apply client-side sorting when not searching
        remote.sort((a, b) => {
          let comparison = 0;
          
          switch (searchFilters.sortBy) {
            case 'name':
              comparison = a.name.localeCompare(b.name);
              break;
            case 'date':
              const aDate = a.updatedAt || a.createdAt;
              const bDate = b.updatedAt || b.createdAt;
              comparison = (aDate?.toMillis?.() || 0) - (bDate?.toMillis?.() || 0);
              break;
            case 'size':
              comparison = (a.size || 0) - (b.size || 0);
              break;
            case 'type':
              comparison = (a.type || '').localeCompare(b.type || '');
              break;
          }
          
          return searchFilters.sortOrder === 'desc' ? -comparison : comparison;
        });
      }
      
      const uiItems: UIVaultItem[] = remote.map(r => {
        if (r.type === 'file') {
          return {
            id: r.id,
            name: r.name,
            type: 'file',
            fileType: r.fileType!,
            size: r.size ? `${(r.size / (1024 * 1024)).toFixed(2)} MB` : undefined,
            mimeType: r.mimeType,
            uri: r.downloadURL,
            isEncrypted: r.isEncrypted || false,
          };
        }
        return { id: r.id, name: r.name, type: 'folder' };
      });
      setItems(uiItems);
      // update header display
      if (pathHistory.length > 1) {
        setCurrentPathDisplay(pathHistory.slice(1).map(p => p.name).join(' / '));
      }
    } catch (error) {
      handleError(error, {
        severity: ErrorSeverity.ERROR,
        metadata: {
          action: 'fetchVaultItems',
          parentId,
          pathDepth: pathHistory.length
        }
      });
    }
    setIsLoading(false);
  }, [pathHistory, handleError, isSearching, searchFilters]);

  useFocusEffect(
    useCallback(() => {
      fetchItems(currentPathId);
      fabMenuRef.current?.close();
    }, [currentPathId, fetchItems])
  );
  
  const handleSearch = useCallback(() => {
    setIsSearching(true);
    fetchItems(currentPathId, true);
  }, [currentPathId, fetchItems]);
  
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

  const handleAddItemsToVault = withErrorHandling(async (
    assets: DocumentPicker.DocumentPickerAsset[] | ImagePicker.ImagePickerAsset[]
  ) => {
    try {
      const vaultService = getVaultService();
      await vaultService.initialize();
      
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
            `"${assetName}" exceeds the maximum file size of ${MAX_FILE_SIZE_MB}MB. Please select a smaller file.`,
            [{ text: 'OK' }]
          );
          continue; // Skip this file and continue with others
        }
        
        // Use VaultService for upload
        const uploadPromise = vaultService.uploadFile(
          assetUri,
          assetName,
          assetMimeType,
          currentPathId,
          {
            encrypt: smartUpload.isEncrypted && isEncryptionReady,
            onProgress: (progress) => {
              logger.debug(`Upload progress for ${assetName}: ${progress}%`);
            }
          }
        );
        
        uploadPromises.push(uploadPromise);
      }
      
      // Wait for all uploads to complete
      const results = await Promise.allSettled(uploadPromises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failedCount = results.filter(r => r.status === 'rejected').length;
      
      if (successCount > 0) {
        fetchItems(currentPathId, true);
      }
      
      if (failedCount > 0) {
        Alert.alert(
          'Upload Complete',
          `${successCount} file(s) uploaded successfully. ${failedCount} file(s) failed to upload.`
        );
      }
      
    } catch (error: any) {
      handleError(error, {
        severity: ErrorSeverity.ERROR,
        metadata: {
          action: 'uploadToVault',
          assetCount: assets.length,
          currentFolderId: currentPathId,
          encrypted: smartUpload.isEncrypted
        }
      });
    }
  });

  // MARK: - FAB Menu Items & Pickers
  const pickDocuments = withErrorHandling(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', multiple: true, copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets) {
        await handleAddItemsToVault(result.assets);
      } else if (result.canceled === true) {
        logger.debug('Document picking cancelled');
      }
    } catch (error) {
      handleError(error, {
        severity: ErrorSeverity.ERROR,
        metadata: { action: 'pickDocuments' }
      });
    }
  });

  const pickMedia = withErrorHandling(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        await handleAddItemsToVault(result.assets);
      }
    } catch (error) {
      handleError(error, {
        severity: ErrorSeverity.ERROR,
        metadata: { action: 'pickMedia' }
      });
    }
  });

  // On Android, try to use the Storage Access Framework via DocumentPicker for folder access
  const pickFolder = async () => {
    try {
      if (Platform.OS === 'android') {
        // Using DocumentPicker to access folders - this is the best approach for Android 10+
        const result = await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          type: '*/*',
          multiple: false
        });

        if (result.canceled === false && result.assets && result.assets.length > 0) {
          const folderUri = result.assets[0].uri;
          const folderName = result.assets[0].name;
          
          Alert.alert('Folder Selected', `Selected folder: ${folderName}.`);
          // Create folder in backend
          await createVaultFolderMobile(folderName, currentPathId);
        }
      } else {
        // On iOS, folder picking isn't well supported - suggest alternative
        Alert.alert(
          'Folder Upload',
          'Direct folder upload is not fully supported on this platform. You can create a folder and then upload files into it instead.',
          [
            { text: 'Cancel', onPress: () => {} },
            { 
              text: 'Create Folder', 
              onPress: async (folderName?: string) => {
                if (folderName && folderName.trim()) {
                  try {
                    await createVaultFolderMobile(folderName.trim(), currentPathId);
                    fetchItems(currentPathId);
                  } catch (e) {
                    logger.error('Error creating folder:', e);
                    showErrorAlert(e, 'Folder Creation Error');
                  }
                }
              }
            }
          ]
        );
      }
    } catch (error) {
      logger.error('Error accessing folder:', error);
      showErrorAlert(error, 'Folder Access Error');
    }
  };

  const vaultMenuItems: FabMenuItemAction[] = [
    {
      id: 'uploadFiles',
      text: 'Upload File(s)',
      iconName: 'document-attach-outline',
      iconLibrary: 'Ionicons',
      onPress: pickDocuments,
    },
    {
      id: 'uploadMedia',
      text: 'Upload Media',
      iconName: 'images-outline',
      iconLibrary: 'Ionicons',
      onPress: pickMedia,
    },
    {
      id: 'uploadFolder',
      text: 'Upload Folder',
      iconName: 'folder-open-outline',
      iconLibrary: 'Ionicons',
      onPress: pickFolder,
    },
  ];

  // MARK: - File/Folder Icon Logic
  const getItemIcon = (item: UIVaultItem) => {
    if (item.type === 'folder') {
      return 'folder-outline';
    }
    switch ((item as VaultFile).fileType) {
      case 'image': return 'image-outline';
      case 'video': return 'videocam-outline';
      case 'audio': return 'musical-notes-outline';
      case 'document': 
        const fName = item.name.toLowerCase();
        if (fName.endsWith('.pdf')) return 'document-outline'; // More specific for PDF
        if (fName.endsWith('.doc') || fName.endsWith('.docx')) return 'document-text-outline'; // Word docs
        // Add more specific doc icons if needed
        return 'document-outline'; // Generic document
      default: return 'document-outline';
    }
  };
  
  const handleItemPress = async (item: UIVaultItem) => {
    if (item.type === 'folder') {
      navigateToFolder(item);
    } else { // File
      const file = item as VaultFile;
      if (!file.uri) {
        showErrorAlert({ message: 'File URI is missing.', code: 'not-found' }, 'File Error');
        return;
      }

      if (file.fileType === 'image' || file.fileType === 'video') {
        // Navigate to a new screen for image/video preview
        router.push({ 
          pathname: '/filePreview',
          params: { 
            fileUri: file.uri, 
            fileName: file.name, 
            fileType: file.fileType,
            mimeType: file.mimeType 
          } 
        });
      } else if (file.fileType === 'document' || file.fileType === 'audio' || file.fileType === 'other') {
        try {
          if (!(await Sharing.isAvailableAsync())) {
            showErrorAlert({ message: 'Sharing is not available on this device.', code: 'unavailable' }, 'Sharing Error');
            return;
          }
          // For documents, audio, etc., try to share/open with external app
          // Download if it's a remote URI
          let localUri = file.uri;
          if (file.uri.startsWith('http')) {
            setIsLoading(true); // Show loading indicator for download
            // Ensure file.name is a string for concatenation
            const tempFileName = FileSystem.documentDirectory + String(file.name);
            const downloadResult = await FileSystem.downloadAsync(file.uri, tempFileName);
            localUri = downloadResult.uri;
            setIsLoading(false);
          }
          
          await Sharing.shareAsync(localUri, {
            mimeType: file.mimeType || 'application/octet-stream',
            dialogTitle: `Open ${file.name}`,
          });
        } catch (e: any) { // Catch specific error type
          setIsLoading(false);
          logger.error('Error sharing file:', e);
          showErrorAlert(e, 'File Opening Error');
        }
      }
    }
  };

  // MARK: - Long Press Actions
  const handleDeleteItem = (item: UIVaultItem) => {
    Alert.alert(
      `Delete ${item.type}`,
      `Are you sure you want to delete "${item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteVaultItemMobile(item.id);
              Alert.alert('Deleted', `"${item.name}" has been deleted.`);
              fetchItems(currentPathId);
            } catch (e) {
              logger.error('Delete error:', e);
              showErrorAlert(e, 'Delete Error');
            }
          }
        }
      ]
    );
  };

  const handleRenameItem = (item: UIVaultItem) => {
    Alert.prompt(
      `Rename ${item.type}`,
      `Enter new name for "${item.name}"`,
      [
        { text: 'Cancel' },
        { text: 'Rename', onPress: async (newName?: string) => {
            if (newName && newName.trim() !== '' && newName.trim() !== item.name) {
              try {
                await renameVaultItemMobile(item.id, newName.trim());
                Alert.alert('Renamed', `"${item.name}" -> "${newName.trim()}"`);
                fetchItems(currentPathId);
              } catch (e) {
                logger.error('Rename error:', e);
                showErrorAlert(e, 'Rename Error');
              }
            }
        }}
      ],
      'plain-text',
      item.name
    );
  };

  const handleItemLongPress = (item: UIVaultItem) => {
    if (!selectionMode) {
      // Enter selection mode on long press
      setSelectionMode(true);
      setSelectedItems(new Set([item.id]));
    } else {
      Alert.alert(item.name, undefined, [
        { text: 'Rename', onPress: () => handleRenameItem(item) },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteItem(item) },
        { text: 'Cancel', style: 'cancel' }
      ]);
    }
  };
  
  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
    
    // Exit selection mode if no items selected
    if (newSelected.size === 0) {
      setSelectionMode(false);
    }
  };
  
  const handleBulkDelete = withErrorHandling(async () => {
    if (selectedItems.size === 0) return;
    
    Alert.alert(
      'Delete Items',
      `Are you sure you want to delete ${selectedItems.size} item(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              const vaultService = getVaultService();
              const itemIds = Array.from(selectedItems);
              const result = await vaultService.bulkDelete(itemIds);
              
              if (result.success > 0) {
                Alert.alert(
                  'Delete Complete',
                  `Successfully deleted ${result.success} item(s).${result.failed > 0 ? ` Failed to delete ${result.failed} item(s).` : ''}`
                );
              }
              
              setSelectedItems(new Set());
              setSelectionMode(false);
              fetchItems(currentPathId, true);
            } catch (error) {
              handleError(error, {
                severity: ErrorSeverity.ERROR,
                metadata: {
                  action: 'bulkDeleteVaultItems',
                  itemCount: selectedItems.size
                }
              });
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  });
  
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedItems(new Set());
  };
  
  const getHeaderLeft = () => {
    if (pathHistory.length > 1) {
      return (
        <IconButton
          iconSet={IconSet.Ionicons}
          iconName="arrow-back"
          size={24}
          color={Colors.light.text.primary}
          onPress={navigateBack}
          accessibilityLabel="Navigate back"
        />
      );
    }
    return null;
  };

  // MARK: - Render Logic
  if (isLoading && items.length === 0) { // Show full screen loader only on initial load or full path change
    return (
      <Screen safeArea>
        <EmptyState
          icon="hourglass-outline"
          title="Loading Vault"
          description="Please wait while we load your files..."
          iconSize={50}
        />
      </Screen>
    );
  }

  const renderItem = ({ item }: { item: UIVaultItem }) => {
    const isSelected = selectedItems.has(item.id);
    
    return (
      <View style={styles.itemWrapper}>
        {selectionMode && (
          <Checkbox
            value={isSelected}
            onValueChange={() => toggleItemSelection(item.id)}
            style={styles.checkbox}
          />
        )}
        <View style={{ flex: 1 }}>
          <FileListItemWithPreview
            item={item}
            onPress={() => {
              if (selectionMode) {
                toggleItemSelection(item.id);
              } else {
                handleItemPress(item);
              }
            }}
            onMorePress={() => handleItemLongPress(item)}
            showPreview={!selectionMode}
            style={isSelected ? styles.selectedItem : undefined}
          />
        </View>
      </View>
    );
  };

  // MARK: - Main Return
  return (
    <ErrorBoundary screenName="VaultScreen">
      <Screen 
        safeArea={true} 
        scroll={false}
        style={[styles.screen, { backgroundColor }]}
      >
        <AppHeader
          title={selectionMode ? `${selectedItems.size} selected` : (pathHistory.length > 1 ? currentPathDisplay : 'Vault')}
          headerLeft={selectionMode ? () => (
            <IconButton
              iconSet={IconSet.Ionicons}
              iconName="close"
              size={24}
              color={Colors.light.text.primary}
              onPress={exitSelectionMode}
              accessibilityLabel="Exit selection mode"
            />
          ) : (pathHistory.length > 1 ? getHeaderLeft : undefined)}
          headerRight={selectionMode ? () => (
            <View style={styles.headerActions}>
              <IconButton
                iconSet={IconSet.Ionicons}
                iconName="trash-outline"
                size={24}
                color={Colors.light.text.primary}
                onPress={handleBulkDelete}
                accessibilityLabel="Delete selected"
                disabled={selectedItems.size === 0}
              />
            </View>
          ) : () => (
            <View style={styles.headerActions}>
              <IconButton
                iconSet={IconSet.Ionicons}
                iconName="pie-chart-outline"
                size={24}
                color={Colors.light.text.primary}
                onPress={() => router.push('/vaultStorage')}
                accessibilityLabel="Storage management"
              />
              <IconButton
                iconSet={IconSet.Ionicons}
                iconName="shield-checkmark-outline"
                size={24}
                color={Colors.light.text.primary}
                onPress={() => router.push('/vaultAuditLogs')}
                accessibilityLabel="View audit logs"
              />
              <IconButton
                iconSet={IconSet.Ionicons}
                iconName="trash-outline"
                size={24}
                color={Colors.light.text.primary}
                onPress={() => router.push('/vaultTrash')}
                accessibilityLabel="View trash"
              />
            </View>
          )}
        />
        
        {!selectionMode && (
          <VaultSearchBar
            filters={searchFilters}
            onFiltersChange={handleFiltersChange}
            onSearch={handleSearch}
          />
        )}
        
        {selectionMode && (
          <View style={[styles.bulkActionsBar, { 
            backgroundColor: tertiaryBackgroundColor,
            borderBottomWidth: 1,
            borderBottomColor: borderColor 
          }]}>
            <Button
              variant="text"
              size="small"
              onPress={() => {
                if (selectedItems.size === items.length) {
                  setSelectedItems(new Set());
                } else {
                  setSelectedItems(new Set(items.map(i => i.id)));
                }
              }}
            >
              {selectedItems.size === items.length ? 'Deselect All' : 'Select All'}
            </Button>
          </View>
        )}
        
        <View style={styles.contentArea}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <EmptyState
                icon="hourglass-outline"
                title="Loading Vault"
                description="Fetching your files and folders..."
                iconSize={50}
              />
            </View>
          ) : items.length === 0 ? (
             <View style={styles.emptyStateContainer}>
                <EmptyState 
                    title={isSearching ? "No Results Found" : (currentPathId === null ? "Vault is Empty" : "Folder is Empty")}
                    description={isSearching ? "Try adjusting your search or filters." : (currentPathId === null ? "Tap the '+' button to add your first file or folder." : "This folder is currently empty. Add some files!")}
                    icon={isSearching ? "search-outline" : "archive-outline"}
                    onAction={isSearching ? () => {
                      setSearchFilters({ query: '', fileTypes: [], sortBy: 'name', sortOrder: 'asc' });
                      setIsSearching(false);
                      fetchItems(currentPathId);
                    } : (currentPathId === null ? undefined : () => fabMenuRef.current?.open())}
                    actionLabel={isSearching ? "Clear Search" : (currentPathId === null ? undefined : "Add Items")}
                />
            </View>
          ) : (
            <FlashList
              data={items}
              renderItem={renderItem}
              keyExtractor={(item: UIVaultItem) => item.id}
              contentContainerStyle={styles.listContentContainer}
              estimatedItemSize={80}
            />
          )}
        </View>
        
        <FloatingActionMenu
          ref={fabMenuRef}
          menuItems={vaultMenuItems}
        />
        
        {showUploadProgress && (
          <UploadProgressBar 
            onDismiss={() => setShowUploadProgress(false)}
          />
        )}
      </Screen>
    </ErrorBoundary>
  );
};

// MARK: - Styles
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  listContentContainer: {
    flexGrow: 1,
    paddingBottom: Spacing['5xl'],
    paddingHorizontal: Spacing.md,
  },
  itemWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    marginLeft: Spacing.md,
    marginRight: Spacing.xs,
  },
  selectedItem: {
    // Selection styling handled by theme-aware component
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bulkActionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});

export default VaultScreen; 