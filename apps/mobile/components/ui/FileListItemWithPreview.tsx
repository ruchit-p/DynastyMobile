import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import Fonts from '../../constants/Fonts';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { useEncryptedPreview } from '../../hooks/useEncryptedPreview';

// Types from vault.tsx
interface VaultItemBase {
  id: string;
  name: string;
  type: 'folder' | 'file';
}

interface VaultFolder extends VaultItemBase {
  type: 'folder';
}

interface VaultFile extends VaultItemBase {
  type: 'file';
  fileType: 'image' | 'video' | 'audio' | 'document' | 'other';
  size?: string;
  mimeType?: string;
  uri?: string;
  isEncrypted?: boolean;
}

export type VaultListItemType = VaultFolder | VaultFile;

export interface FileListItemWithPreviewProps {
  item: VaultListItemType;
  onPress: (item: VaultListItemType) => void;
  onMorePress?: (item: VaultFile) => void;
  showPreview?: boolean;
  style?: any;
}

const FileListItemWithPreview: React.FC<FileListItemWithPreviewProps> = ({ 
  item, 
  onPress, 
  onMorePress,
  showPreview = true,
  style
}) => {
  const isFolder = item.type === 'folder';
  const vaultFile = item as VaultFile;
  
  // Use encrypted preview hook for files
  const { previewUri, isLoading } = useEncryptedPreview(
    !isFolder && showPreview ? vaultFile.id : undefined,
    !isFolder && showPreview ? vaultFile.uri : undefined,
    !isFolder && showPreview ? vaultFile.mimeType : undefined,
    { width: 60, height: 60, quality: 0.7 }
  );

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
        return 'document-text-outline';
      default:
        return 'document-attach-outline';
    }
  };

  const iconColor = isFolder ? Colors.dynastyGreen : Colors.palette.neutral.medium;
  const shouldShowPreview = !isFolder && showPreview && 
    (vaultFile.fileType === 'image' || vaultFile.fileType === 'video') && 
    !isLoading;

  return (
    <TouchableOpacity onPress={() => onPress(item)} style={[styles.container, style]}>
      <View style={styles.iconContainer}>
        {shouldShowPreview && previewUri ? (
          <View>
            <Image source={{ uri: previewUri }} style={styles.previewImage} />
            {vaultFile.fileType === 'video' && (
              <View style={styles.videoPlayOverlay}>
                <Ionicons name="play-circle" size={24} color="white" />
              </View>
            )}
          </View>
        ) : isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Colors.dynastyGreen} />
          </View>
        ) : (
          <Ionicons name={getIconName()} size={28} color={iconColor} />
        )}
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.light.background,
  },
  iconContainer: {
    width: 60,
    height: 60,
    marginRight: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.palette.neutral.extraLight,
    borderRadius: BorderRadius.md,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
  },
  loadingContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameText: {
    ...Fonts.regular,
    fontSize: 16,
    color: Colors.light.text.primary,
    marginBottom: 4,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sizeText: {
    ...Fonts.regular,
    fontSize: 13,
    color: Colors.light.text.secondary,
  },
  encryptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.palette.dynastyGreen.extraLight,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  encryptedText: {
    ...Fonts.regular,
    fontSize: 11,
    color: Colors.dynastyGreen,
  },
  actionIconContainer: {
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  moreButton: {
    padding: Spacing.xs,
  },
  videoPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: BorderRadius.md,
  },
});

export default FileListItemWithPreview;