import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Platform,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';

interface ChatListItem {
  id: string;
  userName: string;
  lastMessage: string;
  timestamp: string;
  avatarUrl: string;
  unreadCount?: number;
  isOnline?: boolean;
}

const mockChatList: ChatListItem[] = [
  {
    id: 'chat1',
    userName: 'Alice Wonderland',
    lastMessage: 'See you tomorrow for tea!',
    timestamp: '10:30 AM',
    avatarUrl: 'https://via.placeholder.com/50/FFA07A/000000?Text=A',
    unreadCount: 2,
    isOnline: true,
  },
  {
    id: 'chat2',
    userName: 'Bob The Builder',
    lastMessage: 'Can we fix it? Yes, we can!',
    timestamp: 'Yesterday',
    avatarUrl: 'https://via.placeholder.com/50/ADD8E6/000000?Text=B',
  },
  {
    id: 'chat3',
    userName: 'Charlie Brown',
    lastMessage: 'Good grief! Snoopy is at it again.',
    timestamp: 'Mon',
    avatarUrl: 'https://via.placeholder.com/50/FFFFE0/000000?Text=C',
    unreadCount: 0,
    isOnline: false,
  },
  {
    id: 'chat4',
    userName: 'Diana Prince',
    lastMessage: 'Duty calls! Saving the world.',
    timestamp: 'Sun',
    avatarUrl: 'https://via.placeholder.com/50/FFC0CB/000000?Text=D',
    isOnline: true,
  },
];

const ChatListScreen = () => {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [chats, setChats] = useState<ChatListItem[]>(mockChatList);

  const filteredChats = chats.filter(chat => 
    chat.userName.toLowerCase().includes(searchText.toLowerCase()) ||
    chat.lastMessage.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleChatItemPress = (chatId: string, userName: string) => {
    router.push({ pathname: '/(screens)/chatDetail', params: { chatId, userName } });
  };

  const renderChatItem = ({ item }: { item: ChatListItem }) => (
    <TouchableOpacity style={styles.chatItem} onPress={() => handleChatItemPress(item.id, item.userName)}>
      <View style={styles.avatarContainer}>
        <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        {item.isOnline && <View style={styles.onlineIndicator} />}
      </View>
      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text style={styles.userName}>{item.userName}</Text>
          <Text style={styles.timestamp}>{item.timestamp}</Text>
        </View>
        <View style={styles.messageRow}>
            <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
            {(item.unreadCount || 0) > 0 && (
                <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
                </View>
            )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen 
        options={{
          title: 'Messages',
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/(screens)/newChat')} style={{ marginRight: 15 }}>
              <Ionicons name="add-circle-outline" size={28} color="#1A4B44" />
            </TouchableOpacity>
          ),
        }} 
      />
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

      {filteredChats.length === 0 ? (
        <View style={styles.emptyStateContainer}>
            <MaterialCommunityIcons name="message-text-outline" size={60} color="#CCC" />
            <Text style={styles.emptyStateText}>No Chats Yet</Text>
            <Text style={styles.emptyStateSubText}>Start a new conversation with your family.</Text>
            <TouchableOpacity style={styles.emptyStateButton} onPress={() => router.push('/(screens)/newChat')}>
                <Text style={styles.emptyStateButtonText}>Start New Chat</Text>
            </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.id}
          style={styles.listContainer}
        />
      )}
    </SafeAreaView>
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
  }
});

export default ChatListScreen; 