import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { useThemeColor } from '../../hooks/useThemeColor';
import FlashList from '../../components/ui/FlashList';
import ChatEncryptionService, { Message, Chat } from '../../src/services/encryption/ChatEncryptionService';
import { getFirebaseDb } from '../../src/lib/firebase';
import { debounce } from 'lodash';
import { format } from 'date-fns';

interface SearchResult extends Message {
  highlightedText?: string;
  chatName?: string;
}

interface ChatSearchResult {
  chat: Chat;
  lastMessage?: string;
  participantNames: string[];
}

export default function GlobalChatSearchScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [messageResults, setMessageResults] = useState<SearchResult[]>([]);
  const [chatResults, setChatResults] = useState<ChatSearchResult[]>([]);
  const [activeTab, setActiveTab] = useState<'messages' | 'chats'>('messages');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');
  const db = getFirebaseDb();

  // Search for messages
  const searchMessages = useCallback(async (query: string) => {
    try {
      const results = await ChatEncryptionService.searchMessages(query);
      
      // Get chat names for results
      const chatIds = [...new Set(results.map(r => r.chatId))];
      const chatNames: { [key: string]: string } = {};
      
      for (const chatId of chatIds) {
        const chatDoc = await db.collection('chats').doc(chatId).get();
        if (chatDoc.exists) {
          const chatData = chatDoc.data() as Chat;
          // In production, get actual participant names
          chatNames[chatId] = chatData.type === 'direct' ? 'Direct Chat' : 'Group Chat';
        }
      }
      
      // Process results
      const processedResults: SearchResult[] = results.map(message => {
        const text = message.text || '';
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const highlightIndex = lowerText.indexOf(lowerQuery);
        
        let highlightedText = text;
        if (highlightIndex !== -1) {
          const before = text.substring(0, highlightIndex);
          const match = text.substring(highlightIndex, highlightIndex + query.length);
          const after = text.substring(highlightIndex + query.length);
          highlightedText = `${before}[HL]${match}[/HL]${after}`;
        }
        
        return {
          ...message,
          highlightedText,
          chatName: chatNames[message.chatId],
        };
      });
      
      setMessageResults(processedResults);
    } catch (error) {
      console.error('Message search failed:', error);
      setMessageResults([]);
    }
  }, [db]);

  // Search for chats
  const searchChats = useCallback(async (query: string) => {
    try {
      if (!user) return;
      
      const lowerQuery = query.toLowerCase();
      
      // Get all user's chats
      const chatsSnapshot = await db
        .collection('chats')
        .where('participants', 'array-contains', user.uid)
        .get();
      
      const results: ChatSearchResult[] = [];
      
      for (const doc of chatsSnapshot.docs) {
        const chat = { id: doc.id, ...doc.data() } as Chat;
        
        // Get participant names
        const participantNames: string[] = [];
        let matchFound = false;
        
        for (const participantId of chat.participants) {
          if (participantId !== user.uid) {
            const userDoc = await db.collection('users').doc(participantId).get();
            const displayName = userDoc.data()?.displayName || 'Unknown User';
            participantNames.push(displayName);
            
            if (displayName.toLowerCase().includes(lowerQuery)) {
              matchFound = true;
            }
          }
        }
        
        if (matchFound) {
          // Get last message preview
          const lastMessageDoc = await db
            .collection('chats')
            .doc(chat.id)
            .collection('messages')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
          
          let lastMessage = 'No messages yet';
          if (!lastMessageDoc.empty) {
            const messageData = lastMessageDoc.docs[0].data();
            try {
              const decrypted = await ChatEncryptionService.decryptMessage({
                ...messageData,
                id: lastMessageDoc.docs[0].id,
              } as any);
              
              if (decrypted.type === 'text') {
                lastMessage = decrypted.text || '';
              } else if (decrypted.type === 'voice') {
                lastMessage = '🎤 Voice message';
              } else if (decrypted.type === 'media') {
                lastMessage = '📷 Photo';
              } else {
                lastMessage = '📎 File';
              }
            } catch (error) {
              lastMessage = 'Message unavailable';
            }
          }
          
          results.push({
            chat,
            lastMessage,
            participantNames,
          });
        }
      }
      
      setChatResults(results);
    } catch (error) {
      console.error('Chat search failed:', error);
      setChatResults([]);
    }
  }, [db, user]);

  // Debounced search function
  const performSearch = useMemo(
    () => debounce(async (query: string) => {
      if (!query.trim() || query.length < 2) {
        setMessageResults([]);
        setChatResults([]);
        setHasSearched(false);
        return;
      }

      setIsSearching(true);
      setHasSearched(true);
      
      if (activeTab === 'messages') {
        await searchMessages(query);
      } else {
        await searchChats(query);
      }
      
      setIsSearching(false);
    }, 500),
    [activeTab, searchMessages, searchChats]
  );

  // Handle search input change
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    performSearch(text);
  }, [performSearch]);

  // Handle tab change
  const handleTabChange = useCallback((tab: 'messages' | 'chats') => {
    setActiveTab(tab);
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    }
  }, [searchQuery, performSearch]);

  // Navigate to chat
  const handleChatPress = useCallback((chatId: string, participantIds: string[], chatTitle: string) => {
    router.push({
      pathname: '/(screens)/chatDetail',
      params: {
        chatId,
        participantIds: participantIds.join(','),
        chatTitle,
      },
    });
  }, [router]);

  // Render message result
  const renderMessageResult = useCallback(({ item }: { item: SearchResult }) => {
    const isOwnMessage = item.senderId === user?.uid;
    const timestamp = item.timestamp instanceof Date 
      ? item.timestamp 
      : item.timestamp.toDate();
    
    const renderHighlightedText = (text: string) => {
      const parts = text.split(/\[HL\]|\[\/HL\]/);
      return parts.map((part, index) => {
        const isHighlighted = index % 2 === 1;
        return (
          <Text
            key={index}
            style={[
              styles.resultText,
              { color: textColor },
              isHighlighted && styles.highlightedText,
            ]}
          >
            {part}
          </Text>
        );
      });
    };

    return (
      <TouchableOpacity
        style={[styles.resultItem, { borderBottomColor: borderColor }]}
        onPress={() => {
          // Get chat details and navigate
          db.collection('chats').doc(item.chatId).get().then(doc => {
            if (doc.exists) {
              const chat = doc.data() as Chat;
              const participantIds = chat.participants.filter(id => id !== user?.uid);
              handleChatPress(item.chatId, participantIds, item.chatName || 'Chat');
            }
          });
        }}
      >
        <View style={styles.resultHeader}>
          <Text style={[styles.resultSender, { color: Colors.light.primary }]}>
            {isOwnMessage ? 'You' : 'Other'}
          </Text>
          <Text style={[styles.resultDate, { color: textColor }]}>
            {format(timestamp, 'MMM d, yyyy')}
          </Text>
        </View>
        <View style={styles.resultContent}>
          {item.type === 'text' ? (
            renderHighlightedText(item.highlightedText || item.text || '')
          ) : (
            <Text style={[styles.resultText, { color: textColor, fontStyle: 'italic' }]}>
              {item.type === 'voice' ? '🎤 Voice message' : 
               item.type === 'media' ? '📷 Photo' : '📎 File'}
            </Text>
          )}
        </View>
        {item.chatName && (
          <Text style={[styles.resultChat, { color: textColor }]}>
            in {item.chatName}
          </Text>
        )}
      </TouchableOpacity>
    );
  }, [user, textColor, borderColor, db, handleChatPress]);

  // Render chat result
  const renderChatResult = useCallback(({ item }: { item: ChatSearchResult }) => {
    const participantIds = item.chat.participants.filter(id => id !== user?.uid);
    const chatTitle = item.participantNames.join(', ');
    
    return (
      <TouchableOpacity
        style={[styles.chatItem, { borderBottomColor: borderColor }]}
        onPress={() => handleChatPress(item.chat.id, participantIds, chatTitle)}
      >
        <View style={styles.chatAvatar}>
          <Ionicons 
            name={item.chat.type === 'group' ? 'people' : 'person'} 
            size={24} 
            color={Colors.light.primary} 
          />
        </View>
        <View style={styles.chatInfo}>
          <Text style={[styles.chatName, { color: textColor }]}>
            {chatTitle}
          </Text>
          <Text style={[styles.chatLastMessage, { color: textColor + '80' }]} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={borderColor} />
      </TouchableOpacity>
    );
  }, [user, textColor, borderColor, handleChatPress]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Search Header */}
        <View style={[styles.searchHeader, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <View style={[styles.searchInputContainer, { backgroundColor: borderColor }]}>
            <Ionicons name="search" size={20} color={textColor} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search messages and chats..."
              placeholderTextColor={textColor + '80'}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearchChange('')}>
                <Ionicons name="close-circle" size={20} color={textColor} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabContainer, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'messages' && styles.activeTab,
              { borderBottomColor: activeTab === 'messages' ? Colors.light.primary : 'transparent' }
            ]}
            onPress={() => handleTabChange('messages')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'messages' ? Colors.light.primary : textColor }
            ]}>
              Messages
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'chats' && styles.activeTab,
              { borderBottomColor: activeTab === 'chats' ? Colors.light.primary : 'transparent' }
            ]}
            onPress={() => handleTabChange('chats')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'chats' ? Colors.light.primary : textColor }
            ]}>
              Chats
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Results */}
        {isSearching ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={[styles.statusText, { color: textColor }]}>Searching...</Text>
          </View>
        ) : !hasSearched ? (
          <View style={styles.centerContainer}>
            <Ionicons name="search" size={64} color={borderColor} />
            <Text style={[styles.statusText, { color: textColor }]}>
              Enter at least 2 characters to search
            </Text>
          </View>
        ) : activeTab === 'messages' && messageResults.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="search-outline" size={64} color={borderColor} />
            <Text style={[styles.statusText, { color: textColor }]}>
              No messages found for &quot;{searchQuery}&quot;
            </Text>
          </View>
        ) : activeTab === 'chats' && chatResults.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="people-outline" size={64} color={borderColor} />
            <Text style={[styles.statusText, { color: textColor }]}>
              No chats found for &quot;{searchQuery}&quot;
            </Text>
          </View>
        ) : (
          <FlashList
            data={activeTab === 'messages' ? messageResults : chatResults}
            renderItem={activeTab === 'messages' ? renderMessageResult : renderChatResult}
            keyExtractor={(item) => activeTab === 'messages' ? (item as SearchResult).id : (item as ChatSearchResult).chat.id}
            estimatedItemSize={80}
            contentContainerStyle={styles.resultsList}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
  },
  activeTab: {
    // Applied via inline styles
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  statusText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  resultsList: {
    paddingBottom: 20,
  },
  resultItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  resultSender: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultDate: {
    fontSize: 12,
  },
  resultContent: {
    marginBottom: 4,
  },
  resultText: {
    fontSize: 15,
    lineHeight: 20,
  },
  highlightedText: {
    backgroundColor: Colors.light.primary + '30',
    fontWeight: '600',
  },
  resultChat: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  chatAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.light.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatInfo: {
    flex: 1,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  chatLastMessage: {
    fontSize: 14,
  },
});