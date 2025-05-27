import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { SecureFileSharingService } from '../../src/services/encryption';
import { format } from 'date-fns';
import { useColorScheme } from '../../hooks/useColorScheme';
import { ErrorBoundary } from './ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

interface ShareLink {
  id: string;
  fileId: string;
  fileName: string;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  accessLimit?: number;
  allowedEmails?: string[];
  requireAuth: boolean;
  isRevoked: boolean;
  shareUrl: string;
}

interface ShareLinkManagerProps {
  fileId?: string;
  userId: string;
  onCreateShare?: (shareLink: ShareLink) => void;
}

export default function ShareLinkManager({ fileId, userId, onCreateShare }: ShareLinkManagerProps) {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';

  const { handleError, withErrorHandling } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Share Link Manager Error',
    trackCurrentScreen: true
  });

  const loadShareLinks = useCallback(
    withErrorHandling(async () => {
      try {
        setLoading(true);
        const links = await SecureFileSharingService.getInstance().getUserShareLinks(userId);
        setShareLinks(links);
      } catch (error) {
        console.error('Failed to load share links:', error);
        throw error;
      } finally {
        setLoading(false);
      }
    }, { action: 'loadShareLinks', userId }),
    [userId, withErrorHandling]
  );

  useEffect(() => {
    loadShareLinks();
  }, [loadShareLinks]);

  const handleCopyLink = withErrorHandling(async (shareUrl: string) => {
    try {
      await Clipboard.setStringAsync(shareUrl);
      Alert.alert('Success', 'Share link copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy link');
      throw error;
    }
  }, { action: 'copyShareLink', shareUrl: 'provided' });

  const handleShareLink = withErrorHandling(async (shareLink: ShareLink) => {
    try {
      await Share.share({
        message: `Access my shared file: ${shareLink.shareUrl}`,
        url: shareLink.shareUrl,
      });
    } catch (error) {
      console.error('Error sharing link:', error);
      throw error;
    }
  }, { action: 'shareLink' });

  const handleRevokeLink = withErrorHandling(async (shareId: string) => {
    Alert.alert(
      'Revoke Share Link',
      'Are you sure you want to revoke this share link? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await SecureFileSharingService.getInstance().revokeShareLink(shareId, userId);
              await loadShareLinks();
              Alert.alert('Success', 'Share link revoked');
            } catch (error) {
              Alert.alert('Error', 'Failed to revoke share link');
              throw error;
            }
          },
        },
      ]
    );
  }, { action: 'revokeShareLink' });

  const renderShareLink = ({ item }: { item: ShareLink }) => {
    const isExpired = item.expiresAt < Date.now();
    const hasReachedLimit = item.accessLimit && item.accessCount >= item.accessLimit;
    const isActive = !item.isRevoked && !isExpired && !hasReachedLimit;

    return (
      <View style={[styles.linkCard, { backgroundColor: isDark ? Colors.dark.background.tertiary : Colors.light.background.secondary }]}>
        <View style={styles.linkHeader}>
          <Text style={[styles.fileName, { color: isDark ? Colors.dark.text.primary : Colors.light.text.primary }]} numberOfLines={1}>
            {item.fileName}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: isActive ? (isDark ? Colors.dark.status.success : Colors.light.status.success) : (isDark ? Colors.dark.status.error : Colors.light.status.error) }]}>
            <Text style={styles.statusText}>{isActive ? 'Active' : 'Inactive'}</Text>
          </View>
        </View>

        <View style={styles.linkDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color={isDark ? Colors.dark.text.secondary : Colors.light.text.secondary} />
            <Text style={[styles.detailText, { color: isDark ? Colors.dark.text.secondary : Colors.light.text.secondary }]}>
              Expires: {format(new Date(item.expiresAt), 'MMM d, yyyy')}
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Ionicons name="eye-outline" size={16} color={isDark ? Colors.dark.text.secondary : Colors.light.text.secondary} />
            <Text style={[styles.detailText, { color: isDark ? Colors.dark.text.secondary : Colors.light.text.secondary }]}>
              Accessed: {item.accessCount} {item.accessLimit ? `/ ${item.accessLimit}` : ''}
            </Text>
          </View>

          {item.requireAuth && (
            <View style={styles.detailRow}>
              <Ionicons name="lock-closed-outline" size={16} color={isDark ? Colors.dark.text.secondary : Colors.light.text.secondary} />
              <Text style={[styles.detailText, { color: isDark ? Colors.dark.text.secondary : Colors.light.text.secondary }]}>
                Authentication required
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.linkActions, { borderTopColor: isDark ? Colors.dark.border.primary : Colors.light.border.primary }]}>
          <TouchableOpacity onPress={() => handleCopyLink(item.shareUrl)} style={styles.actionButton}>
            <Ionicons name="copy-outline" size={20} color={Colors.dynastyGreen} />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => handleShareLink(item)} style={styles.actionButton}>
            <Ionicons name="share-outline" size={20} color={Colors.dynastyGreen} />
          </TouchableOpacity>
          
          {isActive && (
            <TouchableOpacity onPress={() => handleRevokeLink(item.id)} style={styles.actionButton}>
              <Ionicons name="trash-outline" size={20} color={isDark ? Colors.dark.status.error : Colors.light.status.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const EmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="link-outline" size={48} color={isDark ? Colors.dark.text.secondary : Colors.light.text.secondary} />
      <Text style={[styles.emptyText, { color: isDark ? Colors.dark.text.secondary : Colors.light.text.secondary }]}>
        No share links yet
      </Text>
      <Text style={[styles.emptySubtext, { color: isDark ? Colors.dark.text.secondary : Colors.light.text.secondary }]}>
        Create share links to securely share files with others
      </Text>
    </View>
  );

  return (
    <ErrorBoundary screenName="ShareLinkManagerScreen">
      <View style={styles.container}>
        <FlatList
          data={shareLinks}
          renderItem={renderShareLink}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={EmptyComponent}
          refreshing={loading}
          onRefresh={loadShareLinks}
        />
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    padding: Spacing.md,
  },
  linkCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  linkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  fileName: {
    ...Typography.styles.bodyLarge,
    fontSize: 16,
    fontWeight: Typography.weight.semiBold,
    flex: 1,
    marginRight: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.styles.caption,
    color: Colors.palette.neutral.white,
    fontSize: 14,
    fontWeight: Typography.weight.medium,
  },
  linkDetails: {
    marginBottom: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  detailText: {
    ...Typography.styles.bodySmall,
    marginLeft: Spacing.xs,
  },
  linkActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    paddingTop: Spacing.sm,
  },
  actionButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing['5xl'],
  },
  emptyText: {
    ...Typography.styles.bodyLarge,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.styles.bodySmall,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
});