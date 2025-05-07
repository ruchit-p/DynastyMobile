import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Platform,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';

interface Message {
  id: string;
  text: string;
  timestamp: string;
  senderId: string; // 'currentUser' or other user's ID
  userName?: string; // Optional, for group chats or if sender name is needed
  avatarUrl?: string; // Optional
}

// Mock messages - in a real app, fetch based on chatId
const getMockMessages = (chatId: string): Message[] => {
  if (chatId === 'chat1') {
    return [
      { id: 'm1', text: 'Hey Alice, how are you?', timestamp: '10:25 AM', senderId: 'otherUser', userName: 'Bob', avatarUrl: 'https://via.placeholder.com/30/ADD8E6/000000?Text=B' },
      { id: 'm2', text: 'Hi Bob! I am good, thanks for asking. Excited for tea tomorrow!', timestamp: '10:28 AM', senderId: 'currentUser', userName: 'Alice', avatarUrl: 'https://via.placeholder.com/30/FFA07A/000000?Text=A' },
      { id: 'm3', text: 'Me too! See you then.', timestamp: '10:29 AM', senderId: 'otherUser', userName: 'Bob', avatarUrl: 'https://via.placeholder.com/30/ADD8E6/000000?Text=B' },
      { id: 'm4', text: 'See you tomorrow for tea!', timestamp: '10:30 AM', senderId: 'currentUser', userName: 'Alice', avatarUrl: 'https://via.placeholder.com/30/FFA07A/000000?Text=A' },
    ];
  }
  return [
      { id: 'm_default1', text: 'Hello there!', timestamp: '09:00 AM', senderId: 'otherUser', userName: 'Some User'},
      { id: 'm_default2', text: 'Hi! How can I help?', timestamp: '09:01 AM', senderId: 'currentUser', userName: 'Me'},
  ];
};

const ChatDetailScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ chatId: string; userName?: string }>();
  const { chatId, userName = 'Chat' } = params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Set navigator header options
    navigation.setOptions({
      title: userName,
      headerRight: () => (
        <TouchableOpacity onPress={() => Alert.alert("Chat Info", "Navigate to chat info/settings screen")} style={{ paddingHorizontal: 15 }}>
          <Ionicons name="ellipsis-vertical" size={22} color="#1A4B44" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, userName, router]);

  useEffect(() => {
    // Fetch or load messages for the given chatId
    if (chatId) {
      setMessages(getMockMessages(chatId as string));
    }
  }, [chatId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (inputText.trim().length === 0) return;
    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      text: inputText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      senderId: 'currentUser',
      userName: 'Me', // Replace with actual current user name
      // avatarUrl: currentUserAvatar // Replace with actual current user avatar
    };
    setMessages(prevMessages => [...prevMessages, newMessage]);
    setInputText('');
    // TODO: Add logic to send message to backend/service
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isCurrentUser = item.senderId === 'currentUser';
    return (
      <View style={[styles.messageRow, isCurrentUser ? styles.currentUserMessageRow : styles.otherUserMessageRow]}>
        {!isCurrentUser && item.avatarUrl && <Image source={{uri: item.avatarUrl}} style={styles.avatarSmall} />}
        <View style={[styles.messageBubble, isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble]}>
          {!isCurrentUser && item.userName && <Text style={styles.messageSenderName}>{item.userName}</Text>}
          <Text style={isCurrentUser ? styles.currentUserMessageText : styles.otherUserMessageText}>{item.text}</Text>
          <Text style={isCurrentUser ? styles.currentUserTimestamp : styles.otherUserTimestamp}>{item.timestamp}</Text>
        </View>
        {isCurrentUser && item.avatarUrl && <Image source={{uri: item.avatarUrl}} style={styles.avatarSmall} /> }
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={styles.keyboardAvoidingContainer}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0} // Adjusted offset, may need tuning
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessageItem}
          keyExtractor={(item) => item.id}
          style={styles.messagesList}
          contentContainerStyle={{ paddingVertical: 10 }}
        />

        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.inputActionButton} onPress={() => Alert.alert("Attach File", "File attachment UI")}>
            <Ionicons name="add-circle-outline" size={28} color="#1A4B44" />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={`Message ${userName}...`}
            placeholderTextColor="#888"
            multiline
          />
          <TouchableOpacity style={styles.inputActionButton} onPress={handleSendMessage}>
            <Ionicons name="send" size={26} color={inputText.trim() ? "#1A4B44" : "#B0B0B0"} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  keyboardAvoidingContainer: { flex: 1 }, 
  messagesList: { flex: 1, backgroundColor: '#F4F4F4' },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 5,
    paddingHorizontal: 10,
    alignItems: 'flex-end',
  },
  currentUserMessageRow: { justifyContent: 'flex-end' },
  otherUserMessageRow: { justifyContent: 'flex-start' },
  avatarSmall: {
      width: 30,
      height: 30,
      borderRadius: 15,
      marginHorizontal: 5,
      marginBottom: 5, // Align with bottom of bubble
  },
  messageBubble: {
    maxWidth: '75%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  currentUserBubble: {
    backgroundColor: '#1A4B44',
    borderTopRightRadius: 5, 
  },
  otherUserBubble: {
    backgroundColor: '#E0E0E0',
    borderTopLeftRadius: 5,
  },
  messageSenderName: {
      fontSize: 12,
      fontWeight: 'bold',
      color: '#555',
      marginBottom: 2,
  },
  currentUserMessageText: { fontSize: 15, color: '#FFFFFF' },
  otherUserMessageText: { fontSize: 15, color: '#333333' },
  currentUserTimestamp: { fontSize: 10, color: '#E0E0E0', alignSelf: 'flex-end', marginTop: 3 },
  otherUserTimestamp: { fontSize: 10, color: '#777', alignSelf: 'flex-start', marginTop: 3 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120, // Allow for multiple lines but not too many
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    marginHorizontal: 8,
  },
  inputActionButton: { padding: 5 },
});

export default ChatDetailScreen; 