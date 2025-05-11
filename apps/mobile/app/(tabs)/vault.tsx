import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, View, Alert, Platform, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import FloatingActionMenu, { FabMenuItemAction, FloatingActionMenuRef } from '../../components/ui/FloatingActionMenu';
import Screen from '../../components/ui/Screen';
import EmptyState from '../../components/ui/EmptyState';
import ThemedText from '../../components/ThemedText';
import IconButton, { IconSet } from '../../components/ui/IconButton';
import AppHeader from '../../components/ui/AppHeader';
import FileListItem, { type VaultListItemType as UIVaultItem } from '../../components/ui/FileListItem';
import { Colors } from '../../constants/Colors';
import Fonts from '../../constants/Fonts';
import { Spacing, BorderRadius, Shadows } from '../../constants/Spacing';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import auth from '@react-native-firebase/auth';
import { storage } from '../../src/lib/firebase';
import {
  getVaultItemsMobile,
  createVaultFolderMobile,
  addVaultFileMobile,
  renameVaultItemMobile,
  deleteVaultItemMobile,
} from '../../src/lib/firebaseUtils';

// MARK: - Helper Functions

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

  const fabMenuRef = useRef<FloatingActionMenuRef>(null);

  const fetchItems = useCallback(async (parentId: string | null) => {
    setIsLoading(true);
    try {
      const { items: remote } = await getVaultItemsMobile(parentId);
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
      Alert.alert('Error', 'Could not load vault items.');
    }
    setIsLoading(false);
  }, [pathHistory]);

  useFocusEffect(
    useCallback(() => {
      fetchItems(currentPathId);
      fabMenuRef.current?.close();
    }, [currentPathId, fetchItems])
  );
  
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
    setIsLoading(true);
    try {
      const uid = auth().currentUser?.uid;
      if (!uid) throw new Error('Not authenticated');
      for (const fileResult of assets) {
        const assetName = (fileResult as any).name || (fileResult as any).fileName || `file_${Date.now()}`;
        const assetMimeType = (fileResult as any).mimeType;
        const assetSize = (fileResult as any).size || 0;
        // Generate unique storage path
        const parentSegment = currentPathId || 'root';
        const storagePath = `vault/${uid}/${parentSegment}/${assetName}`;
        const ref = storage.ref(storagePath);
        await ref.putFile((fileResult as any).uri);
        const downloadURL = await ref.getDownloadURL();
        const fileType = getVaultFileType(assetMimeType, assetName);
        await addVaultFileMobile({
          name: assetName,
          parentId: currentPathId,
          storagePath,
          downloadURL,
          fileType,
          size: assetSize,
          mimeType: assetMimeType,
        });
      }
      Alert.alert('Success', `${assets.length} item(s) added to Vault.`);
      fetchItems(currentPathId);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not upload items.');
    }
    setIsLoading(false);
  };

  // MARK: - FAB Menu Items & Pickers
  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', multiple: true, copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets) {
        await handleAddItemsToVault(result.assets);
      } else if (result.canceled === true) {
        console.log('Document picking cancelled');
      }
    } catch (error) {
      console.error('Error picking documents:', error);
      Alert.alert('Error', 'Could not pick documents.');
    }
  };

  const pickMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        await handleAddItemsToVault(result.assets);
      }
    } catch (error) {
      console.error('Error picking media:', error);
      Alert.alert('Error', 'Could not pick media.');
    }
  };

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
              onPress: async (folderName) => {
                if (folderName && folderName.trim()) {
                  try {
                    await createVaultFolderMobile(folderName.trim(), currentPathId);
                    fetchItems(currentPathId);
                  } catch (e) {
                    console.error('Error creating folder:', e);
                    Alert.alert('Error', 'Could not create folder.');
                  }
                }
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error accessing folder:', error);
      Alert.alert('Error', 'Could not access the selected folder.');
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
        Alert.alert('Error', 'File URI is missing.');
        return;
      }

      if (file.fileType === 'image' || file.fileType === 'video') {
        // Navigate to a new screen for image/video preview
        router.push({ 
          pathname: '/(screens)/filePreview', // Placeholder - this screen needs to be created
          params: { fileUri: file.uri, fileName: file.name, fileType: file.fileType } 
        });
      } else if (file.fileType === 'document' || file.fileType === 'audio' || file.fileType === 'other') {
        try {
          if (!(await Sharing.isAvailableAsync())) {
            Alert.alert('Sharing Error', 'Sharing is not available on this device.');
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
          console.error('Error sharing file:', e);
          Alert.alert('Error', `Could not open file: ${e.message}`);
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
              console.error('Delete error:', e);
              Alert.alert('Error', 'Could not delete item.');
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
        { text: 'Rename', onPress: async (newName) => {
            if (newName && newName.trim() !== '' && newName.trim() !== item.name) {
              try {
                await renameVaultItemMobile(item.id, newName.trim());
                Alert.alert('Renamed', `"${item.name}" -> "${newName.trim()}"`);
                fetchItems(currentPathId);
              } catch (e) {
                console.error('Rename error:', e);
                Alert.alert('Error', 'Could not rename item.');
              }
            }
        }}
      ],
      'plain-text',
      item.name
    );
  };

  const handleItemLongPress = (item: UIVaultItem) => {
    Alert.alert(item.name, undefined, [
      { text: 'Rename', onPress: () => handleRenameItem(item) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDeleteItem(item) },
      { text: 'Cancel', style: 'cancel' }
    ]);
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
    return (
      <FileListItem
        item={item}
        onPress={() => handleItemPress(item)}
        onMorePress={() => handleItemLongPress(item)}
      />
    );
  };

  // MARK: - Main Return
  return (
    <View style={styles.screen}>
      {/* Vault-specific header shadow wrapper */}
      <View style={styles.vaultHeaderShadowContainer}>
        <AppHeader
          title={pathHistory.length > 1 ? currentPathDisplay : 'Vault'}
          headerLeft={pathHistory.length > 1 ? getHeaderLeft : undefined}
        />
      </View>
      <Screen safeArea={false} style={styles.contentScreen}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dynastyGreen} />
            <ThemedText variant="bodyMedium" color="secondary">Loading items...</ThemedText>
          </View>
        ) : items.length === 0 ? (
           <View style={styles.emptyStateContainer}>
              <EmptyState 
                  title={currentPathId === null ? "Vault is Empty" : "Folder is Empty"}
                  description={currentPathId === null ? "Tap the '+' button to add your first file or folder." : "This folder is currently empty. Add some files!"}
                  icon="archive-outline"
                  onAction={currentPathId === null ? undefined : () => fabMenuRef.current?.open()}
                  actionLabel={currentPathId === null ? undefined : "Add Items"}
              />
          </View>
        ) : (
          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContentContainer}
          />
        )}
        <FloatingActionMenu
          ref={fabMenuRef}
          menuItems={vaultMenuItems}
        />
      </Screen>
    </View>
  );
};

// MARK: - Styles
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background.primary,
  },
  contentScreen: {
    flex: 1,
  },
  vaultHeaderShadowContainer: {
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background.primary,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  listContentContainer: {
    flexGrow: 1,
    paddingBottom: Spacing.lg + 80,
  },
});

export default VaultScreen; 