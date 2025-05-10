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
import AnimatedActionSheet, { type ActionSheetAction } from '../../components/ui/AnimatedActionSheet';
import { Colors } from '../../constants/Colors';
import Fonts from '../../constants/Fonts';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

// Define types for Vault items
interface VaultItemBase {
  id: string;
  name: string;
  type: 'folder' | 'file';
  path: string; // Full path of the item relative to vault root e.g., "/My Documents/Work"
  parentId: string | null; // ID of the parent folder, null for root items
}

interface VaultFolder extends VaultItemBase {
  type: 'folder';
}

interface VaultFile extends VaultItemBase {
  type: 'file';
  fileType: 'image' | 'video' | 'audio' | 'document' | 'other';
  size?: string; // e.g., "1.2 MB"
  createdAt?: Date;
  uri?: string; // URI for local or remote file access
  mimeType?: string; // e.g., 'application/pdf', 'image/jpeg'
}

type VaultItem = VaultFolder | VaultFile;

// Mock data for initial display - adjust as needed
// Simulating a nested structure:
// / (root)
//   - Vacation Photos (folder1)
//     - TripToItaly.jpg (file4)
//   - Beach.jpg (file1)
//   - Presentation.pptx (file2)
//   - Work Documents (folder2)
//     - Meeting_Notes.docx (file3)
//     - Report.pdf (file5)
const mockVaultItems: VaultItem[] = [
  { id: 'folder1', name: 'Vacation Photos', type: 'folder', path: '/Vacation Photos', parentId: null },
  { id: 'file1', name: 'Beach.jpg', type: 'file', fileType: 'image', path: '/Beach.jpg', parentId: null, size: '2.1 MB', uri: 'https://picsum.photos/seed/beach/400/300', mimeType: 'image/jpeg' },
  { id: 'file2', name: 'Presentation.pptx', type: 'file', fileType: 'document', path: '/Presentation.pptx', parentId: null, size: '500 KB', uri: 'https://example.com/sample.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
  { id: 'folder2', name: 'Work Documents', type: 'folder', path: '/Work Documents', parentId: null },
  { id: 'file3', name: 'Meeting_Notes.docx', type: 'file', fileType: 'document', path: '/Work Documents/Meeting_Notes.docx', parentId: 'folder2', size: '120 KB', uri: 'https://example.com/sample.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { id: 'file4', name: 'TripToItaly.jpg', type: 'file', fileType: 'image', path: '/Vacation Photos/TripToItaly.jpg', parentId: 'folder1', size: '3.5 MB', uri: 'https://picsum.photos/seed/italy/400/300', mimeType: 'image/jpeg' },
  { id: 'file5', name: 'Report.pdf', type: 'file', fileType: 'document', path: '/Work Documents/Report.pdf', parentId: 'folder2', size: '1.2 MB', uri: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', mimeType: 'application/pdf' },
  { id: 'video1', name: 'Tutorial.mp4', type: 'file', fileType: 'video', path: '/Tutorial.mp4', parentId: null, size: '15.2 MB', uri: 'http://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4', mimeType: 'video/mp4' },
];

// MARK: - Helper Functions

const getVaultFileType = (mimeType?: string | null, fileName?: string | null): VaultFile['fileType'] => {
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

const generateCanonicalPath = (name: string, parentId: string | null, allItems: VaultItem[]): string => {
  if (parentId === null) {
    return `/${name}`;
  }
  const parentFolder = allItems.find(item => item.id === parentId && item.type === 'folder');
  if (parentFolder) {
    return `${parentFolder.path}/${name}`;
  }
  // Fallback if parent isn't found (should ideally not happen in a consistent state)
  return `/${name}`; 
};

const buildDisplayPath = (folderId: string | null, allItems: VaultItem[]): string => {
  if (folderId === null) {
    return 'Root';
  }
  let currentFolder = allItems.find(item => item.id === folderId);
  if (!currentFolder) return 'Root'; // Should not happen

  const pathParts: string[] = [currentFolder.name];
  while (currentFolder?.parentId) {
    currentFolder = allItems.find(item => item.id === currentFolder!.parentId);
    if (currentFolder) {
      pathParts.unshift(currentFolder.name);
    } else {
      break; // Parent not found, stop building path
    }
  }
  return pathParts.join(' / ') || 'Root';
};

const VaultScreen = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentPathId, setCurrentPathId] = useState<string | null>(null);
  const [currentPathDisplay, setCurrentPathDisplay] = useState<string>('Root');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [pathHistory, setPathHistory] = useState<{id: string | null, name: string}[]>([{id: null, name: 'Root'}]);
  const [vaultData, setVaultData] = useState<VaultItem[]>(mockVaultItems);

  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [isFileActionMenuVisible, setIsFileActionMenuVisible] = useState(false);

  const fabMenuRef = useRef<FloatingActionMenuRef>(null);

  const loadItemsForPath = useCallback((folderId: string | null, currentData: VaultItem[]) => {
    setIsLoading(true);
    setTimeout(() => {
      setItems(currentData.filter(item => item.parentId === folderId).sort((a,b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
      }));      
      setCurrentPathDisplay(buildDisplayPath(folderId, currentData));
      setIsLoading(false);
    }, 300);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadItemsForPath(currentPathId, vaultData);
      fabMenuRef.current?.close();
    }, [currentPathId, vaultData, loadItemsForPath])
  );
  
  const navigateToFolder = (folder: VaultFolder) => {
    const newPathEntry = { id: folder.id, name: folder.name };
    setPathHistory(prev => [...prev, newPathEntry]);
    setCurrentPathId(folder.id);
  };

  const navigateBack = () => {
    if (pathHistory.length > 1) {
      const newPathHistory = [...pathHistory];
      newPathHistory.pop();
      const previousPath = newPathHistory[newPathHistory.length - 1];
      setPathHistory(newPathHistory);
      setCurrentPathId(previousPath.id);
    }
  };

  const handleAddItemsToVault = (newFiles: DocumentPicker.DocumentPickerAsset[] | ImagePicker.ImagePickerAsset[]) => {
    let updatedVaultData = [...vaultData]; // Create a mutable copy

    const newVaultEntries: VaultFile[] = newFiles.map((fileResult) => {
      // Handle different structures for DocumentPickerAsset and ImagePickerAsset
      const assetName = (fileResult as any).name || (fileResult as ImagePicker.ImagePickerAsset).fileName || `file_${Date.now()}`;
      const assetMimeType = (fileResult as any).mimeType || (fileResult as ImagePicker.ImagePickerAsset).mimeType;
      const assetSize = (fileResult as any).size || (fileResult as ImagePicker.ImagePickerAsset).fileSize;


      const baseName = assetName;
      let uniqueName = baseName;
      let counter = 1;
      while (updatedVaultData.some(item => item.parentId === currentPathId && item.name === uniqueName)) {
        const ext = baseName.includes('.') ? baseName.substring(baseName.lastIndexOf('.')) : '';
        const nameWithoutExt = baseName.includes('.') ? baseName.substring(0, baseName.lastIndexOf('.')) : baseName;
        uniqueName = `${nameWithoutExt}_${counter}${ext}`;
        counter++;
      }

      const newEntry: VaultFile = {
        id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: uniqueName,
        type: 'file',
        fileType: getVaultFileType(assetMimeType, assetName),
        uri: fileResult.uri,
        size: assetSize ? `${(assetSize / (1024*1024)).toFixed(2)} MB` : undefined,
        mimeType: assetMimeType,
        parentId: currentPathId,
        path: generateCanonicalPath(uniqueName, currentPathId, updatedVaultData),
        createdAt: new Date(),
      };
      updatedVaultData.push(newEntry); // Add to the mutable copy for path generation of subsequent items in the same batch
      return newEntry;
    });
    setVaultData(updatedVaultData); // Single update to state
    Alert.alert('Success', `${newFiles.length} item(s) added to Vault.`);
  };

  // MARK: - FAB Menu Items & Pickers
  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Allow all file types
        multiple: true,
        copyToCacheDirectory: true, // Important for accessing the file
      });

      if (result.canceled === false && result.assets) {
        handleAddItemsToVault(result.assets);
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
        mediaTypes: ImagePicker.MediaTypeOptions.All, // Images and Videos
        allowsMultipleSelection: true, // Allow multiple media selection
        quality: 0.8, // Adjust quality as needed (0 to 1)
      });

      if (!result.canceled && result.assets) {
        handleAddItemsToVault(result.assets);
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
          
          Alert.alert('Folder Selected', `Selected folder: ${folderName}. Unfortunately, due to platform limitations, we cannot automatically import all contents of this folder.`);
          
          // Potentially a folder could be added to your vault data structure here
          // even if individual files would need to be picked separately
          const newFolder: VaultFolder = {
            id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            name: folderName,
            type: 'folder',
            parentId: currentPathId,
            path: generateCanonicalPath(folderName, currentPathId, vaultData),
          };
          
          const updatedVaultData = [...vaultData, newFolder];
          setVaultData(updatedVaultData);
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
              onPress: () => {
                // Prompt to create a folder
                Alert.prompt(
                  'Create Folder',
                  'Enter folder name:',
                  [
                    { 
                      text: 'Cancel',
                      onPress: () => {} 
                    },
                    {
                      text: 'Create',
                      onPress: (folderName) => {
                        if (folderName && folderName.trim()) {
                          const newFolder: VaultFolder = {
                            id: `folder_${Date.now()}`,
                            name: folderName.trim(),
                            type: 'folder',
                            parentId: currentPathId,
                            path: generateCanonicalPath(folderName.trim(), currentPathId, vaultData),
                          };
                          setVaultData([...vaultData, newFolder]);
                        }
                      }
                    }
                  ]
                );
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
  const getItemIcon = (item: VaultItem) => {
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
  
  const handleItemPress = async (item: VaultItem) => {
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
  const handleDeleteItem = (itemToDelete: VaultItem) => {
    Alert.alert(
      `Delete ${itemToDelete.type}`,
      `Are you sure you want to delete "${itemToDelete.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            let updatedData = vaultData.filter(item => item.id !== itemToDelete.id);
            // If deleting a folder, recursively delete its children
            if (itemToDelete.type === 'folder') {
                const itemsToDeleteStack: string[] = [itemToDelete.id];
                const allDescendantIds = new Set<string>();

                while(itemsToDeleteStack.length > 0) {
                    const currentFolderId = itemsToDeleteStack.pop()!;
                    const children = vaultData.filter(i => i.parentId === currentFolderId);
                    children.forEach(child => {
                        allDescendantIds.add(child.id);
                        if (child.type === 'folder') {
                            itemsToDeleteStack.push(child.id);
                        }
                    });
                }
                updatedData = updatedData.filter(item => !allDescendantIds.has(item.id));
            }
            setVaultData(updatedData);
            Alert.alert('Deleted', `"${itemToDelete.name}" and its contents (if a folder) have been deleted.`);
          },
        },
      ]
    );
  };

  const handleRenameItem = (itemToRename: VaultItem) => {
    const promptTitle = `Rename ${itemToRename.type}`;
    const promptMessage = `Enter new name for "${itemToRename.name}":`;
    const currentName = itemToRename.name;

    Alert.prompt(promptTitle, promptMessage, async (newName) => {
        if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
            const trimmedNewName = newName.trim();
            const isNameTaken = vaultData.some(item => 
                item.parentId === itemToRename.parentId && 
                item.name === trimmedNewName &&
                item.id !== itemToRename.id
            );
            if (isNameTaken) {
                Alert.alert('Error', 'An item with this name already exists in this folder.');
                return;
            }

            let updatedData = [...vaultData];
            const itemIndex = updatedData.findIndex(item => item.id === itemToRename.id);
            if (itemIndex === -1) return; 

            const oldPath = updatedData[itemIndex].path;
            updatedData[itemIndex] = { 
                ...updatedData[itemIndex], 
                name: trimmedNewName,
                path: generateCanonicalPath(trimmedNewName, updatedData[itemIndex].parentId, updatedData) // Pass all data for context
            };

            // If renaming a folder, update paths of all children recursively
            if (updatedData[itemIndex].type === 'folder') {
                updatedData = updateDescendantPathsRecursive(updatedData[itemIndex].id, updatedData[itemIndex].path, updatedData);
            }

            setVaultData(updatedData);
            Alert.alert('Renamed', `"${currentName}" has been renamed to "${trimmedNewName}".`);
        } else if (newName && newName.trim() === currentName) {
            // No change
        } else {
            Alert.alert('Error', 'Name cannot be empty.');
        }
    }, 'plain-text', currentName);
  };

  // Recursive function to update paths of descendants
  const updateDescendantPathsRecursive = (parentId: string, parentPath: string, currentData: VaultItem[]): VaultItem[] => {
    let updatedData = [...currentData];
    for (let i = 0; i < updatedData.length; i++) {
        if (updatedData[i].parentId === parentId) {
            const newPath = `${parentPath}/${updatedData[i].name}`;
            updatedData[i] = { ...updatedData[i], path: newPath };
            if (updatedData[i].type === 'folder') {
                // Pass the mutated updatedData to the recursive call so it has the latest paths
                updatedData = updateDescendantPathsRecursive(updatedData[i].id, newPath, updatedData);
            }
        }
    }
    return updatedData;
  };

  const handleMoveItem = (itemToMove: VaultItem) => {
    const availableFolders = vaultData.filter(item => 
        item.type === 'folder' && 
        item.id !== itemToMove.id && // Cannot move into itself
        !(itemToMove.type === 'folder' && vaultData.some(child => child.parentId === itemToMove.id && child.id === item.id)) && // Cannot move into its own direct child
        !(itemToMove.type === 'folder' && isDescendant(item.id, itemToMove.id, vaultData)) // Cannot move into one of its own descendants
    );

    if (availableFolders.length === 0 && itemToMove.parentId === null) {
        Alert.alert('Move Item', 'No other folders available to move this item to.');
        return;
    }

    const folderOptions = availableFolders.map(folder => ({ 
        text: folder.name,
        onPress: () => {
            let updatedData = [...vaultData];
            const itemIndex = updatedData.findIndex(i => i.id === itemToMove.id);
            if (itemIndex === -1) return;

            const newParentId = folder.id;
            const newPath = generateCanonicalPath(updatedData[itemIndex].name, newParentId, updatedData);

            updatedData[itemIndex] = { ...updatedData[itemIndex], parentId: newParentId, path: newPath };

            if (updatedData[itemIndex].type === 'folder') {
                updatedData = updateDescendantPathsRecursive(updatedData[itemIndex].id, newPath, updatedData);
            }
            setVaultData(updatedData);
            Alert.alert('Moved', `"${itemToMove.name}" has been moved to "${folder.name}".`);
        }
    })); 

    if (itemToMove.parentId !== null) {
        folderOptions.unshift({ 
            text: 'Move to Root', 
            onPress: () => {
                let updatedData = [...vaultData];
                const itemIndex = updatedData.findIndex(i => i.id === itemToMove.id);
                if (itemIndex === -1) return;

                const newParentId = null;
                const newPath = generateCanonicalPath(updatedData[itemIndex].name, newParentId, updatedData);
                
                updatedData[itemIndex] = { ...updatedData[itemIndex], parentId: newParentId, path: newPath };

                if (updatedData[itemIndex].type === 'folder') {
                    updatedData = updateDescendantPathsRecursive(updatedData[itemIndex].id, newPath, updatedData);
                }
                setVaultData(updatedData);
                Alert.alert('Moved', `"${itemToMove.name}" has been moved to Root.`);
            }
        });
    }

    folderOptions.push({ text: 'Cancel', onPress: () => {} });
    Alert.alert(`Move "${itemToMove.name}"`, 'Select a destination folder:', folderOptions);
  };

  // Helper function to check if targetFolderId is a descendant of sourceFolderId
  const isDescendant = (targetFolderId: string, sourceFolderId: string, allItems: VaultItem[]): boolean => {
    let parent = allItems.find(item => item.id === targetFolderId)?.parentId;
    while (parent) {
        if (parent === sourceFolderId) return true;
        parent = allItems.find(item => item.id === parent)?.parentId;
    }
    return false;
  };

  const handleItemLongPress = (item: VaultItem) => {
    const actionSheetOptions: { text: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }[] = [
      { text: 'Rename', onPress: () => handleRenameItem(item) },
      { text: 'Move', onPress: () => handleMoveItem(item) },
      { text: 'Delete', onPress: () => handleDeleteItem(item) },
      { text: 'Cancel' },
    ];
    Alert.alert(item.name, `Selected: ${item.type}`, actionSheetOptions);
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

  // MARK: - Item Actions & Action Sheet

  const handleOpenItemMoreMenu = (item: VaultFile) => {
    setSelectedFile(item);
    setIsFileActionMenuVisible(true);
  };

  const handleCloseItemMoreMenu = () => {
    setIsFileActionMenuVisible(false);
    setSelectedFile(null);
  };

  const handleViewItemDetails = () => {
    if (selectedFile) {
      Alert.alert("View Details", `Viewing details for ${selectedFile.name}`);
      // TODO: Implement actual navigation or modal for details
    }
    handleCloseItemMoreMenu();
  };

  const handleShareItem = async () => {
    if (selectedFile?.uri) {
      try {
        if (!(await Sharing.isAvailableAsync())) {
          Alert.alert("Sharing not available", "Sharing is not available on this device.");
          return;
        }
        await Sharing.shareAsync(selectedFile.uri, {
          mimeType: selectedFile.mimeType,
          dialogTitle: `Share ${selectedFile.name}`,
        });
      } catch (error) {
        console.error("Error sharing file:", error);
        Alert.alert("Error", "Could not share the file.");
      }
    } else {
      Alert.alert("Cannot Share", "File URI is missing or invalid.");
    }
    handleCloseItemMoreMenu();
  };

  const fileActionMenuActions: ActionSheetAction[] = selectedFile ? [
    { title: 'View Details', onPress: handleViewItemDetails, icon: 'information-circle-outline' },
    { title: 'Rename', onPress: () => { if(selectedFile) handleRenameItem(selectedFile); handleCloseItemMoreMenu(); }, icon: 'pencil-outline' },
    { title: 'Move', onPress: () => { if(selectedFile) handleMoveItem(selectedFile); handleCloseItemMoreMenu(); }, icon: 'move-outline' },
    { title: 'Share', onPress: handleShareItem, icon: 'share-outline', disabled: !selectedFile?.uri || !Sharing.isAvailableAsync() },
    { title: 'Delete', onPress: () => { if(selectedFile) handleDeleteItem(selectedFile); handleCloseItemMoreMenu(); }, icon: 'trash-outline' },
    { title: 'Cancel', onPress: handleCloseItemMoreMenu },
  ] : [];

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

  const renderItem = ({ item }: { item: VaultItem }) => {
    return (
      <FileListItem
        item={item as UIVaultItem}
        onPress={() => handleItemPress(item)}
        onMorePress={item.type === 'file' ? () => handleOpenItemMoreMenu(item as VaultFile) : undefined}
      />
    );
  };

  // MARK: - Main Return
  return (
    <View style={styles.screen}>
      <AppHeader
        title={pathHistory.length > 1 ? currentPathDisplay : 'Vault'}
        headerLeft={pathHistory.length > 1 ? getHeaderLeft : undefined}
      />
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
        {selectedFile && (
          <AnimatedActionSheet
            isVisible={isFileActionMenuVisible}
            onClose={handleCloseItemMoreMenu}
            title={`Actions for ${selectedFile.name}`}
            actions={fileActionMenuActions}
          />
        )}
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