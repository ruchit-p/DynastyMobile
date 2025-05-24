import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MediaGallery from './MediaGallery';
import { Colors } from '../../constants/Colors';
import { useThemeColor } from '../../hooks/useThemeColor';
import { getFirebaseDb } from '../../src/lib/firebase';
import ChatEncryptionService from '../../src/services/encryption/ChatEncryptionService';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

interface MediaItem {
  id: string;
  uri: string;
  type: 'image' | 'video';
  timestamp: Date;
  senderId: string;
  thumbnailUri?: string;
}

interface ChatMediaGalleryProps {
  chatId: string;
  isVisible: boolean;
  onClose: () => void;
}

export default function ChatMediaGallery({ chatId, isVisible, onClose }: ChatMediaGalleryProps) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'all' | 'images' | 'videos'>('all');
  
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');

  // Load media from chat
  useEffect(() => {
    if (!isVisible) return;

    const loadMedia = async () => {
      setIsLoading(true);
      try {
        const db = getFirebaseDb();
        const messagesSnapshot = await db
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .where('type', 'in', ['media', 'file'])
          .orderBy('timestamp', 'desc')
          .limit(100)
          .get();

        const items: MediaItem[] = [];
        
        for (const doc of messagesSnapshot.docs) {
          const data = doc.data();
          
          // Only process media messages with valid media data
          if (data.media && data.media.encryptedUrl) {
            try {
              // Decrypt the message to get media info
              const decryptedMessage = await ChatEncryptionService.decryptMessage({
                ...data,
                id: doc.id,
              } as any);

              if (decryptedMessage.media) {
                const mimeType = decryptedMessage.media.metadata.mimeType;
                const isVideo = mimeType.startsWith('video/');
                const isImage = mimeType.startsWith('image/');

                if (isVideo || isImage) {
                  // Download and decrypt the media file
                  const decryptedUri = await ChatEncryptionService.downloadMediaFile(
                    decryptedMessage.media
                  );

                  items.push({
                    id: doc.id,
                    uri: decryptedUri,
                    type: isVideo ? 'video' : 'image',
                    timestamp: decryptedMessage.timestamp instanceof FirebaseFirestoreTypes.Timestamp
                      ? decryptedMessage.timestamp.toDate()
                      : new Date(decryptedMessage.timestamp),
                    senderId: decryptedMessage.senderId,
                  });
                }
              }
            } catch (error) {
              console.error('Failed to decrypt media item:', error);
            }
          }
        }

        setMediaItems(items);
      } catch (error) {
        console.error('Failed to load media:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMedia();
  }, [chatId, isVisible]);

  const filteredItems = useCallback(() => {
    switch (selectedTab) {
      case 'images':
        return mediaItems.filter(item => item.type === 'image');
      case 'videos':
        return mediaItems.filter(item => item.type === 'video');
      default:
        return mediaItems;
    }
  }, [mediaItems, selectedTab]);

  const renderTabButton = (tab: 'all' | 'images' | 'videos', label: string) => (
    <TouchableOpacity
      style={[
        styles.tabButton,
        selectedTab === tab && styles.activeTabButton,
        { borderBottomColor: selectedTab === tab ? Colors.light.primary : 'transparent' }
      ]}
      onPress={() => setSelectedTab(tab)}
    >
      <Text style={[
        styles.tabText,
        selectedTab === tab && styles.activeTabText,
        { color: selectedTab === tab ? Colors.light.primary : textColor }
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: textColor }]}>Media Gallery</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={[styles.tabContainer, { borderBottomColor: borderColor }]}>
          {renderTabButton('all', `All (${mediaItems.length})`)}
          {renderTabButton('images', `Images (${mediaItems.filter(i => i.type === 'image').length})`)}
          {renderTabButton('videos', `Videos (${mediaItems.filter(i => i.type === 'video').length})`)}
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={[styles.loadingText, { color: textColor }]}>
              Loading media...
            </Text>
          </View>
        ) : filteredItems().length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={64} color={borderColor} />
            <Text style={[styles.emptyText, { color: textColor }]}>
              No {selectedTab === 'all' ? 'media' : selectedTab} found
            </Text>
          </View>
        ) : (
          <MediaGallery
            media={filteredItems().map(item => ({
              id: item.id,
              uri: item.uri,
              type: item.type,
              thumbnailUri: item.thumbnailUri,
              metadata: {
                timestamp: item.timestamp.toISOString(),
                senderId: item.senderId,
              }
            }))}
            columns={3}
            enableFullscreen
            showTimestamp
            style={styles.gallery}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 32,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
  },
  activeTabButton: {
    // Active styles applied via inline
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
  },
  gallery: {
    flex: 1,
  },
});