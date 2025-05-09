import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
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

// Mock messages - will be removed/commented
// const getMockMessages = (chatId: string): Message[] => {
//   if (chatId === 'chat1') {
//     return [
//       { id: 'm1', text: 'Hey Alice, how are you?', timestamp: '10:25 AM', senderId: 'otherUser', userName: 'Bob', avatarUrl: 'https://via.placeholder.com/30/ADD8E6/000000?Text=B' },
//       { id: 'm2', text: 'Hi Bob! I am good, thanks for asking. Excited for tea tomorrow!', timestamp: '10:28 AM', senderId: 'currentUser', userName: 'Alice', avatarUrl: 'https://via.placeholder.com/30/FFA07A/000000?Text=A' },
//       { id: 'm3', text: 'Me too! See you then.', timestamp: '10:29 AM', senderId: 'otherUser', userName: 'Bob', avatarUrl: 'https://via.placeholder.com/30/ADD8E6/000000?Text=B' },
//       { id: 'm4', text: 'See you tomorrow for tea!', timestamp: '10:30 AM', senderId: 'currentUser', userName: 'Alice', avatarUrl: 'https://via.placeholder.com/30/FFA07A/000000?Text=A' },
//     ];
//   }
//   return [
//       { id: 'm_default1', text: 'Hello there!', timestamp: '09:00 AM', senderId: 'otherUser', userName: 'Some User'},
//       { id: 'm_default2', text: 'Hi! How can I help?', timestamp: '09:01 AM', senderId: 'currentUser', userName: 'Me'},
//   ];
// };

const ChatDetailScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ chatId: string; userName?: string; userAvatar?: string }>();
  const { chatId, userName = 'Chat', userAvatar } = params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: userName,
      headerTitleAlign: 'center',
      headerStyle: { backgroundColor: '#FFFFFF' },
      headerTintColor: '#1A4B44',
      headerTitleStyle: { fontWeight: '600', fontSize: 18, color: '#1A4B44' },
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={styles.headerLeftButton}>
          <Ionicons name="arrow-back" size={28} color="#1A4B44" />
          <Text style={styles.headerLeftButtonText}>Messages</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={() => Alert.alert("Chat Info", "Navigate to chat info/settings screen")} style={{ paddingHorizontal: 15 }}>
          <Ionicons name="ellipsis-vertical" size={22} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerBackTitleVisible: false,
    });
  }, [navigation, userName, router]);

  useEffect(() => {
    // Fetch or load messages for the given chatId
    // This is where you would typically fetch messages from a backend or local storage.
    // For now, it will remain empty since mock data is removed.
    if (chatId) {
      // Example: fetchMessages(chatId).then(setMessages);
      console.log(`Attempting to load messages for chatId: ${chatId}, userName: ${userName}`);
      // setMessages(getMockMessages(chatId as string)); // Mock data removed
    }
  }, [chatId, userName]);

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
      // avatarUrl: currentUser?.avatarUrl // Replace with actual current user avatar
    };
    setMessages(prevMessages => [...prevMessages, newMessage]);
    setInputText('');
    // TODO: Add logic to send message to backend/service
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isCurrentUser = item.senderId === 'currentUser';
    // Use passed userAvatar for the other user if item.avatarUrl is not present
    const messageAvatar = isCurrentUser ? undefined /* or currentUser.avatar */ : item.avatarUrl || userAvatar;

    return (
      <View style={[styles.messageRow, isCurrentUser ? styles.currentUserMessageRow : styles.otherUserMessageRow]}>
        {!isCurrentUser && messageAvatar && <Image source={{uri: messageAvatar}} style={styles.avatarSmall} />}
        <View style={[styles.messageBubble, isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble]}>
          {!isCurrentUser && item.userName && <Text style={styles.messageSenderName}>{item.userName}</Text>}
          <Text style={isCurrentUser ? styles.currentUserMessageText : styles.otherUserMessageText}>{item.text}</Text>
          <Text style={isCurrentUser ? styles.currentUserTimestamp : styles.otherUserTimestamp}>{item.timestamp}</Text>
        </View>
        {/* Current user avatar could be on the right, if desired and available */}
        {/* {isCurrentUser && currentUserAvatar && <Image source={{uri: currentUserAvatar}} style={styles.avatarSmall} /> } */}
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
  headerLeftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: Platform.OS === 'ios' ? 10 : 10, 
    paddingVertical: 5,
  },
  headerLeftButtonText: {
    color: '#1A4B44',
    fontSize: 17, 
    marginLeft: Platform.OS === 'ios' ? 6 : 8,
  },
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