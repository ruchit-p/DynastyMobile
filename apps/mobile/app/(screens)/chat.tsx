import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Platform,
  TouchableOpacity,
  Image,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import FlashList from '../../components/ui/FlashList';
import { useOffline } from '../../src/contexts/OfflineContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../src/contexts/AuthContext';
import { getFirebaseDb } from '../../src/lib/firebase';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

// Helper function to format timestamps
const formatTimestamp = (timestamp: FirebaseFirestoreTypes.Timestamp | { seconds: number, nanoseconds: number }): string => {
  const date = timestamp instanceof FirebaseFirestoreTypes.Timestamp 
    ? timestamp.toDate() 
    : new Date(timestamp.seconds * 1000);
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
};

interface ChatListItem {
  id: string;
  userName: string;
  lastMessage: string;
  timestamp: string;
  avatarUrl: string;
  unreadCount?: number;
  isOnline?: boolean;
  chatType: 'direct' | 'group';
  participants: string[];
  participantNames?: { [userId: string]: string };
  lastMessageType?: 'text' | 'image' | 'video' | 'voice' | 'file';
}

const ChatListScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Chat List Error',
    trackCurrentScreen: true
  });
  const [searchText, setSearchText] = useState('');
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const { isOnline, forceSync } = useOffline();
  const { user } = useAuth();
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);

  React.useEffect(() => {
    if (!isError) {
      // Clear any local errors when global error state resets
    }
  }, [isError]);

  // Fetch chats with offline support
  const fetchChats = useCallback(withErrorHandling(async (forceRefresh = false) => {
    try {
      if (!user?.uid) {
        setChats([]);
        setIsLoadingChats(false);
        setIsRefreshing(false);
        return;
      }

      // Try to get cached data first if offline or not forcing refresh
      if (!isOnline || !forceRefresh) {
        const cachedChatsData = await AsyncStorage.getItem(`chats_${user.uid}`);
        if (cachedChatsData) {
          const cached = JSON.parse(cachedChatsData);
          // Check if cache is not too old (e.g., 30 minutes)
          const cacheAge = Date.now() - (cached.timestamp || 0);
          if (cacheAge < 1800000 || !isOnline) { // 30 minutes or offline
            console.log('ChatListScreen: Using cached chats');
            setChats(cached.chats || []);
            setIsLoadingChats(false);
            setIsRefreshing(false);
            
            // If online but using cache, still try to fetch fresh data in background
            if (isOnline && !forceRefresh) {
              // Fetch fresh data in background without blocking UI
              fetchChats(true).catch(error => {
                console.error('Background chat fetch failed:', error);
              });
            }
            return;
          }
        }
      }
      
      // If online, fetch fresh data
      if (isOnline) {
        console.log('ChatListScreen: Fetching chats from Firebase...');
        const db = getFirebaseDb();
        
        try {
          // Get user's chat references
          const userChatsSnapshot = await db
            .collection('users')
            .doc(user.uid)
            .collection('chats')
            .orderBy('lastRead', 'desc')
            .get();

          const chatPromises = userChatsSnapshot.docs.map(async (doc) => {
            const userChatData = doc.data();
            const chatId = doc.id;
            
            // Get the main chat document
            const chatDoc = await db.collection('chats').doc(chatId).get();
            if (!chatDoc.exists) return null;
            
            const chatData = chatDoc.data();
            if (!chatData) return null;

            // Get participant names
            const participantNames: { [key: string]: string } = {};
            const otherParticipants = chatData.participants.filter((p: string) => p !== user.uid);
            
            // Fetch user profiles for participants
            const userPromises = otherParticipants.map(async (participantId: string) => {
              const userDoc = await db.collection('users').doc(participantId).get();
              if (userDoc.exists) {
                const userData = userDoc.data();
                participantNames[participantId] = userData?.displayName || userData?.name || 'Unknown';
              }
            });
            await Promise.all(userPromises);

            // Format chat list item
            const chatName = chatData.type === 'direct' 
              ? participantNames[otherParticipants[0]] || 'Unknown'
              : chatData.name || `Group (${chatData.participants.length})`;

            const lastMessageContent = chatData.lastMessage?.content 
              ? '🔒 Encrypted message' // Will be decrypted by encryption service
              : 'No messages yet';
              
            const timestamp = chatData.lastMessageAt 
              ? formatTimestamp(chatData.lastMessageAt)
              : 'New chat';

            return {
              id: chatId,
              userName: chatName,
              lastMessage: lastMessageContent,
              timestamp,
              avatarUrl: '', // Will be populated later
              unreadCount: userChatData.unreadCount || 0,
              isOnline: false, // Will be populated by presence system
              chatType: chatData.type,
              participants: chatData.participants,
              participantNames,
              lastMessageType: chatData.lastMessage?.type,
            } as ChatListItem;
          });

          const chatsData = (await Promise.all(chatPromises)).filter(Boolean) as ChatListItem[];
          console.log(`ChatListScreen: Loaded ${chatsData.length} chats`);
          
          setChats(chatsData);
          
          // Cache the chats
          await AsyncStorage.setItem(`chats_${user.uid}`, JSON.stringify({
            chats: chatsData,
            timestamp: Date.now()
          }));
        } catch (error) {
          console.error("Error fetching chats: ", error);
          handleError(error, { action: 'fetch_chats', source: 'ChatListScreen' });
        }
      } else {
        // Offline with no cache
        setChats([]);
      }
      
      // Try to use cached data on error
      try {
        const cachedChatsData = await AsyncStorage.getItem(`chats_${user.uid}`);
        if (cachedChatsData) {
          const cached = JSON.parse(cachedChatsData);
          setChats(cached.chats || []);
        } else {
          setChats([]);
        }
      } catch (cacheError) {
        setChats([]);
      }
    } finally {
      setIsLoadingChats(false);
      setIsRefreshing(false);
    }
  }), [user, handleError, isOnline, withErrorHandling]);

  // Load chats on mount
  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Set up real-time listeners
  useEffect(() => {
    if (!user?.uid || !isOnline) return;

    console.log('ChatListScreen: Setting up real-time listeners...');
    const db = getFirebaseDb();
    
    // Listen to user's chat references for real-time updates
    const unsubscribeChats = db
      .collection('users')
      .doc(user.uid)
      .collection('chats')
      .onSnapshot(
        (snapshot) => {
          if (!snapshot.metadata.fromCache) {
            console.log('ChatListScreen: Real-time update detected');
            // Refresh chat list when changes occur
            fetchChats(false).catch(error => {
              console.error('Real-time chat refresh failed:', error);
            });
          }
        },
        (error) => {
          console.error('ChatListScreen: Real-time listener error:', error);
        }
      );

    setUnsubscribe(() => unsubscribeChats);

    return () => {
      console.log('ChatListScreen: Cleaning up real-time listeners');
      unsubscribeChats();
    };
  }, [user?.uid, isOnline, fetchChats]);

  // Handle pull to refresh
  const onRefresh = useCallback(withErrorHandling(async () => {
    try {
      setIsRefreshing(true);
      
      // If online, trigger sync first
      if (isOnline) {
        try {
          await forceSync();
          console.log('ChatListScreen: Sync completed, refreshing chats');
        } catch (error) {
          console.error('ChatListScreen: Sync failed:', error);
        }
      }
      
      // Force refresh to get latest data
      await fetchChats(true);
    } catch (error) {
      handleError(error, { action: 'refresh_chats', source: 'ChatListScreen' });
    }
  }), [fetchChats, withErrorHandling, handleError, isOnline, forceSync]);

  const filteredChats = chats.filter(chat => 
    chat.userName.toLowerCase().includes(searchText.toLowerCase()) ||
    chat.lastMessage.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleChatItemPress = withErrorHandling(async (item: ChatListItem) => {
    reset();
    try {
      // For chat detail, we need to pass participantIds
      const otherParticipants = item.participants.filter(p => p !== user?.uid);
      
      router.push({ 
        pathname: '/(screens)/chatDetail', 
        params: { 
          chatId: item.id,
          participantIds: otherParticipants.join(','),
          chatTitle: item.userName 
        } 
      });
    } catch (error: any) {
      handleError(error, {
        action: 'handleChatItemPress',
        metadata: {
          chatId: item.id,
          userName: item.userName,
          errorCode: error.code,
          errorMessage: error.message
        }
      });
    }
  });

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Messages',
      headerTitleAlign: 'center',
      headerStyle: { backgroundColor: '#FFFFFF' },
      headerTintColor: '#1A4B44',
      headerTitleStyle: { fontWeight: '600', fontSize: 18, color: '#1A4B44' },
      headerLeft: () => (
        <TouchableOpacity 
          onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)/')} 
          style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10, padding: 5 }}
        >
          <Ionicons name="arrow-back" size={28} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={() => router.push('/(screens)/newChat')} style={{ marginRight: 15 }}>
          <Ionicons name="add" size={30} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerBackTitleVisible: false,
    });
  }, [navigation, router]);

  const renderChatItem = ({ item }: { item: ChatListItem }) => {
    // Format last message based on type
    let lastMessageDisplay = item.lastMessage;
    if (item.lastMessageType && item.lastMessageType !== 'text') {
      const typeIcons = {
        image: '📷',
        video: '🎥',
        voice: '🎤',
        file: '📎'
      };
      lastMessageDisplay = `${typeIcons[item.lastMessageType] || ''} ${item.lastMessageType.charAt(0).toUpperCase() + item.lastMessageType.slice(1)}`;
    }

    // Use group icon for group chats
    const chatIcon = item.chatType === 'group' 
      ? <MaterialCommunityIcons name="account-group" size={40} color="#ccc" />
      : <MaterialCommunityIcons name="account" size={40} color="#ccc" />;

    return (
      <TouchableOpacity style={styles.chatItem} onPress={() => handleChatItemPress(item)}>
        <View style={styles.avatarContainer}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              {chatIcon}
            </View>
          )}
          {item.isOnline && <View style={styles.onlineIndicator} />}
        </View>
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <Text style={styles.userName}>{item.userName}</Text>
            <Text style={styles.timestamp}>{item.timestamp}</Text>
          </View>
          <View style={styles.messageRow}>
              <Text style={styles.lastMessage} numberOfLines={1}>{lastMessageDisplay}</Text>
              {(item.unreadCount || 0) > 0 && (
                  <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{item.unreadCount}</Text>
                  </View>
              )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ErrorBoundary screenName="ChatListScreen">
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor="#888"
        />
      </View>

      {!isOnline && (
        <View style={styles.offlineIndicator}>
          <MaterialCommunityIcons name="cloud-off" size={16} color="#666" />
          <Text style={styles.offlineText}>Offline - Showing cached chats</Text>
        </View>
      )}

      {filteredChats.length === 0 && !isLoadingChats ? (
        <View style={styles.emptyStateContainer}>
            <MaterialCommunityIcons name="message-text-outline" size={60} color="#CCC" />
            <Text style={styles.emptyStateText}>No Chats Yet</Text>
            <Text style={styles.emptyStateSubText}>Start a new conversation with your family.</Text>
            <TouchableOpacity style={styles.emptyStateButton} onPress={() => router.push('/(screens)/newChat')}>
                <Text style={styles.emptyStateButtonText}>Start New Chat</Text>
            </TouchableOpacity>
        </View>
      ) : (
        <FlashList
          data={filteredChats}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.id}
          style={styles.listContainer}
          estimatedItemSize={80}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={["#1A4B44"]}
              tintColor="#1A4B44"
            />
          }
        />
      )}
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    marginHorizontal: 15,
    marginVertical: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4, 
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    height: Platform.OS === 'ios' ? 25 : 40,
  },
  listContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  chatItem: {
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    alignItems: 'center',
  },
  avatarContainer: {
      position: 'relative',
      marginRight: 15,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#32CD32', // Green for online
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  chatContent: {
    flex: 1,
    justifyContent: 'center',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  timestamp: {
    fontSize: 12,
    color: '#888',
  },
  messageRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#555',
    flexShrink: 1, // Ensure message text does not push badge off screen
  },
  unreadBadge: {
    backgroundColor: '#1A4B44',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 10, // Space between message and badge
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#555',
    marginTop: 15,
  },
  emptyStateSubText: {
    fontSize: 14,
    color: '#777',
    marginTop: 8,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyStateButton: {
      backgroundColor: '#1A4B44',
      paddingVertical: 12,
      paddingHorizontal: 25,
      borderRadius: 20,
  },
  emptyStateButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFF3E0',
    marginHorizontal: 15,
    marginBottom: 10,
    borderRadius: 8,
  },
  offlineText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
});

export default ChatListScreen; 