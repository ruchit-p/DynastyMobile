import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors'; // Assuming Colors.ts exists
import Fonts from '../../constants/Fonts'; // Assuming Fonts.ts exists
import { Spacing, BorderRadius } from '../../constants/Spacing'; // Assuming Spacing.ts exists

// Types from vault.tsx (consider moving to a shared types file)
interface VaultItemBase {
  id: string;
  name: string;
  type: 'folder' | 'file';
  // path: string; 
  // parentId: string | null;
}

interface VaultFolder extends VaultItemBase {
  type: 'folder';
}

interface VaultFile extends VaultItemBase {
  type: 'file';
  fileType: 'image' | 'video' | 'audio' | 'document' | 'other';
  size?: string;
  mimeType?: string;
  uri?: string;  // Added for mobile file access and sharing
  isEncrypted?: boolean; // Added for encryption status
}

export type VaultListItemType = VaultFolder | VaultFile;

export interface FileListItemProps {
  item: VaultListItemType;
  onPress: (item: VaultListItemType) => void;
  onMorePress?: (item: VaultFile) => void; // Only for files
}

const FileListItem: React.FC<FileListItemProps> = ({ item, onPress, onMorePress }) => {
  const isFolder = item.type === 'folder';
  const vaultFile = item as VaultFile; // Safe to cast for file-specific props if not a folder

  const getIconName = (): keyof typeof Ionicons.glyphMap => {
    if (isFolder) {
      return 'folder-outline';
    }
    switch (vaultFile.fileType) {
      case 'image':
        return 'image-outline';
      case 'video':
        return 'videocam-outline';
      case 'audio':
        return 'musical-notes-outline';
      case 'document':
        // More specific document icons can be added based on mimeType if needed
        if (vaultFile.mimeType === 'application/pdf') return 'document-text-outline'; // Or 'reader-outline' for PDF
        if (vaultFile.name.endsWith('.doc') || vaultFile.name.endsWith('.docx')) return 'document-text-outline';
        if (vaultFile.name.endsWith('.ppt') || vaultFile.name.endsWith('.pptx')) return 'document-text-outline'; // Consider 'easel-outline' for presentations
        if (vaultFile.name.endsWith('.xls') || vaultFile.name.endsWith('.xlsx')) return 'document-text-outline'; // Consider 'stats-chart-outline' for spreadsheets
        return 'document-outline';
      default:
        return 'document-attach-outline'; // Generic file icon
    }
  };

  const iconColor = isFolder ? Colors.dynastyGreen : Colors.palette.neutral.medium;

  return (
    <TouchableOpacity onPress={() => onPress(item)} style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name={getIconName()} size={28} color={iconColor} />
      </View>
      <View style={styles.infoContainer}>
        <Text style={styles.nameText} numberOfLines={1} ellipsizeMode="middle">
          {item.name}
        </Text>
        <View style={styles.metaContainer}>
          {!isFolder && vaultFile.size && (
            <Text style={styles.sizeText}>{vaultFile.size}</Text>
          )}
          {!isFolder && vaultFile.isEncrypted && (
            <View style={styles.encryptedBadge}>
              <Ionicons name="lock-closed" size={12} color={Colors.dynastyGreen} />
              <Text style={styles.encryptedText}>Encrypted</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.actionIconContainer}>
        {isFolder ? (
          <Ionicons name="chevron-forward-outline" size={24} color={Colors.palette.neutral.medium} />
        ) : (
          onMorePress && (
            <TouchableOpacity onPress={() => onMorePress(vaultFile)} style={styles.moreButton}>
              <Ionicons name="ellipsis-horizontal" size={24} color={Colors.palette.neutral.medium} />
            </TouchableOpacity>
          )
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.light.background.primary,
    minHeight: 70, // Ensure good touch target height
    borderRadius: BorderRadius.md, // Added for rounded corners
    marginBottom: Spacing.sm, // Added for separation
  },
  iconContainer: {
    marginRight: Spacing.md,
    width: 40, // Fixed width for alignment
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameText: {
    fontFamily: Fonts.type.base,
    fontSize: Fonts.size.medium,
    color: Colors.light.text.primary,
    marginBottom: 2,
  },
  sizeText: {
    fontFamily: Fonts.type.base,
    fontSize: Fonts.size.small,
    color: Colors.light.text.tertiary,
  },
  actionIconContainer: {
    marginLeft: Spacing.md,
    width: 30, // Fixed width for alignment
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButton: {
    padding: 8, // Larger touch target
    borderRadius: 20,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  encryptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: BorderRadius.sm,
  },
  encryptedText: {
    fontFamily: Fonts.type.base,
    fontSize: Fonts.size.small,
    color: Colors.dynastyGreen,
  },
});

export default FileListItem; 