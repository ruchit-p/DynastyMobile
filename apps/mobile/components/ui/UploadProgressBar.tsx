import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../ThemedText';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import Fonts from '../../constants/Fonts';
import { getVaultService } from '../../src/services/VaultService';

interface UploadProgress {
  uploadId: string;
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  error?: any;
}

interface UploadProgressBarProps {
  onDismiss?: () => void;
}

const UploadProgressBar: React.FC<UploadProgressBarProps> = ({ onDismiss }) => {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const slideAnim = new Animated.Value(0);

  useEffect(() => {
    const vaultService = getVaultService();
    
    const updateProgress = () => {
      const uploadStatuses = vaultService.getAllUploadStatuses();
      const uploadArray: UploadProgress[] = [];
      
      uploadStatuses.forEach((upload, uploadId) => {
        uploadArray.push({
          uploadId,
          fileName: upload.fileName,
          progress: upload.progress || 0,
          status: upload.status,
          error: upload.error
        });
      });
      
      setUploads(uploadArray.filter(u => u.status !== 'completed' || Date.now() - u.completedAt < 3000));
    };

    // Update every 500ms
    const interval = setInterval(updateProgress, 500);
    updateProgress();

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isExpanded]);

  if (uploads.length === 0) {
    return null;
  }

  const activeUploads = uploads.filter(u => u.status === 'pending' || u.status === 'uploading');
  const failedUploads = uploads.filter(u => u.status === 'failed');
  const completedUploads = uploads.filter(u => u.status === 'completed');

  const totalProgress = activeUploads.length > 0 
    ? activeUploads.reduce((sum, u) => sum + u.progress, 0) / activeUploads.length 
    : 100;

  const maxHeight = uploads.length * 60 + 80;

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.header} 
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <Ionicons 
              name={failedUploads.length > 0 ? 'alert-circle' : 'cloud-upload'} 
              size={20} 
              color={failedUploads.length > 0 ? Colors.light.text.error : Colors.dynastyGreen} 
            />
            <ThemedText variant="bodyMedium" weight="semibold" style={styles.headerText}>
              {activeUploads.length > 0 
                ? `Uploading ${activeUploads.length} file${activeUploads.length > 1 ? 's' : ''}...`
                : failedUploads.length > 0
                ? `${failedUploads.length} upload${failedUploads.length > 1 ? 's' : ''} failed`
                : `${completedUploads.length} upload${completedUploads.length > 1 ? 's' : ''} completed`
              }
            </ThemedText>
          </View>
          <View style={styles.headerRight}>
            <Ionicons 
              name={isExpanded ? 'chevron-down' : 'chevron-up'} 
              size={20} 
              color={Colors.light.text.secondary} 
            />
            {onDismiss && uploads.every(u => u.status === 'completed' || u.status === 'failed') && (
              <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
                <Ionicons name="close" size={20} color={Colors.light.text.secondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {activeUploads.length > 0 && (
          <View style={styles.totalProgressContainer}>
            <View style={styles.totalProgressBar}>
              <View 
                style={[
                  styles.totalProgressFill, 
                  { width: `${totalProgress}%` }
                ]} 
              />
            </View>
          </View>
        )}
      </TouchableOpacity>

      <Animated.View 
        style={[
          styles.expandedContent,
          {
            maxHeight: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, maxHeight]
            }),
            opacity: slideAnim
          }
        ]}
      >
        {uploads.map((upload) => (
          <View key={upload.uploadId} style={styles.uploadItem}>
            <View style={styles.uploadInfo}>
              <ThemedText variant="bodySmall" numberOfLines={1} style={styles.fileName}>
                {upload.fileName}
              </ThemedText>
              <View style={styles.statusContainer}>
                {upload.status === 'failed' ? (
                  <ThemedText variant="bodySmall" color="error">
                    Failed
                  </ThemedText>
                ) : upload.status === 'completed' ? (
                  <ThemedText variant="bodySmall" color="success">
                    Complete
                  </ThemedText>
                ) : (
                  <ThemedText variant="bodySmall" color="secondary">
                    {upload.progress}%
                  </ThemedText>
                )}
              </View>
            </View>
            {upload.status !== 'completed' && upload.status !== 'failed' && (
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${upload.progress}%` },
                    upload.status === 'failed' && styles.progressFillError
                  ]} 
                />
              </View>
            )}
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.light.background.primary,
    borderRadius: BorderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerText: {
    marginLeft: Spacing.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dismissButton: {
    marginLeft: Spacing.md,
    padding: Spacing.xs,
  },
  totalProgressContainer: {
    marginTop: Spacing.sm,
  },
  totalProgressBar: {
    height: 4,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  totalProgressFill: {
    height: '100%',
    backgroundColor: Colors.dynastyGreen,
    borderRadius: 2,
  },
  expandedContent: {
    overflow: 'hidden',
  },
  uploadItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  uploadInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  fileName: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.dynastyGreen,
    borderRadius: 1.5,
  },
  progressFillError: {
    backgroundColor: Colors.light.text.error,
  },
});

export default UploadProgressBar;