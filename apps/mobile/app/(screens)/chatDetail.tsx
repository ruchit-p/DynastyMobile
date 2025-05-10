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
  timestamp: Date; // Changed to Date for better sorting/formatting
  senderId: string; // 'currentUser' or other user's ID
  userName?: string; // Optional, for group chats or if sender name is needed
  avatarUrl?: string; // Optional
}

// Mock user data for group chat participant identification
const MOCK_USERS_DB: Record<string, { name: string, avatarUrl?: string }> = {
  'currentUser': { name: 'Me', avatarUrl: 'https://via.placeholder.com/30/008080/FFFFFF?Text=Me' }, // Current user
  '1': { name: 'Eleanor Vance', avatarUrl: 'https://via.placeholder.com/30/FF7F50/000000?Text=EV' },
  '2': { name: 'Marcus Thorne', avatarUrl: 'https://via.placeholder.com/30/6495ED/FFFFFF?Text=MT' },
  '3': { name: 'Julia Chen', avatarUrl: 'https://via.placeholder.com/30/DC143C/FFFFFF?Text=JC' },
  // Add more users from MOCK_FAMILY_MEMBERS in newChat.tsx if needed for detailed mock messages
};

const CURRENT_USER_ID = 'currentUser'; // Define current user's ID

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
  const params = useLocalSearchParams<{
    chatId?: string; // For existing chats
    userName?: string; // For 1-on-1 from newChat
    userAvatar?: string;
    userId?: string; // For 1-on-1 from newChat (target user's ID)
    isGroupChat?: string; // Will be "true" or undefined
    groupName?: string;
    participantIds?: string; // JSON string array of user IDs
  }>();

  const isGroup = params.isGroupChat === 'true';
  const chatTitle = isGroup ? params.groupName : params.userName;
  const parsedParticipantIds: string[] = isGroup && params.participantIds ? JSON.parse(params.participantIds) : [];
  
  // For one-on-one chats initiated from newChat, use userId as the effective chatId for fetching/identifying the other user
  // For existing chats, params.chatId would be used.
  const effectiveChatId = params.chatId || params.userId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: chatTitle || 'Chat',
      headerTitleAlign: 'center',
      headerStyle: { backgroundColor: '#FFFFFF' },
      headerTintColor: '#1A4B44',
      headerTitleStyle: { fontWeight: '600', fontSize: 18, color: '#1A4B44' },
      headerLeft: () => (
        <TouchableOpacity 
          onPress={() => router.canGoBack() ? router.back() : router.push('/(screens)/chat')} 
          style={styles.headerLeftButton}
        >
          <Ionicons name="arrow-back" size={28} color="#1A4B44" />
          {/* Removed "Messages" text to simplify header */}
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={() => Alert.alert("Chat Info", "Navigate to chat info/settings screen")} style={{ paddingHorizontal: 15 }}>
          <Ionicons name="ellipsis-vertical" size={22} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerBackTitleVisible: false,
    });
  }, [navigation, chatTitle, router, isGroup]);

  useEffect(() => {
    // Fetch or load messages for the given chatId
    console.log("ChatDetailScreen Params:", params);
    if (isGroup) {
      console.log(`Loading group chat: ${params.groupName}, Participants: ${params.participantIds}`);
      // Simulate group messages
      const groupMessages: Message[] = [
        { id: 'gm1', text: 'Hey everyone! Planning the weekend?', senderId: parsedParticipantIds[0] || '1', userName: MOCK_USERS_DB[parsedParticipantIds[0] || '1']?.name, timestamp: new Date(Date.now() - 3600000 * 3) },
        { id: 'gm2', text: 'I am in for a movie!', senderId: parsedParticipantIds[1] || '2', userName: MOCK_USERS_DB[parsedParticipantIds[1] || '2']?.name, timestamp: new Date(Date.now() - 3600000 * 2.5) },
        { id: 'gm3', text: 'Sounds good to me!', senderId: CURRENT_USER_ID, userName: MOCK_USERS_DB[CURRENT_USER_ID]?.name, timestamp: new Date(Date.now() - 3600000 * 2) },
      ];
      setMessages(groupMessages);
    } else if (effectiveChatId) {
      console.log(`Loading 1-on-1 chat with: ${params.userName} (ID: ${effectiveChatId})`);
      // Simulate 1-on-1 messages
      const directMessages: Message[] = [
        { id: 'dm1', text: `Hello ${params.userName}!`, senderId: CURRENT_USER_ID, userName: MOCK_USERS_DB[CURRENT_USER_ID]?.name, timestamp: new Date(Date.now() - 3600000) },
        { id: 'dm2', text: 'Hi there! How are you?', senderId: effectiveChatId, userName: params.userName, timestamp: new Date(Date.now() - 3000000) },
      ];
      setMessages(directMessages);
    }
    // This is a simplified mock load. In a real app, you'd fetch based on IDs.
  }, [isGroup, params.groupName, params.participantIds, effectiveChatId, params.userName]);

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
      timestamp: new Date(), // Use Date object
      senderId: CURRENT_USER_ID,
      userName: MOCK_USERS_DB[CURRENT_USER_ID]?.name,
      avatarUrl: MOCK_USERS_DB[CURRENT_USER_ID]?.avatarUrl,
    };
    setMessages(prevMessages => [...prevMessages, newMessage]);
    setInputText('');
    if (isGroup) {
      // TODO: Add logic to send message to group backend/service with participantIds
      console.log("Sending group message:", newMessage.text, "to participants:", parsedParticipantIds);
    } else {
      // TODO: Add logic to send message to 1-on-1 backend/service with effectiveChatId (recipient's ID)
      console.log("Sending 1-on-1 message:", newMessage.text, "to user:", effectiveChatId);
    }
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isCurrentUser = item.senderId === CURRENT_USER_ID;
    
    // Determine avatar and sender name
    // For group chats, or if item.userName is already set (e.g. from fetched data)
    let senderName = item.userName;
    let avatar = item.avatarUrl;

    if (!isCurrentUser) {
      if (isGroup) {
        // In group chats, senderId should be one of the participant IDs
        senderName = MOCK_USERS_DB[item.senderId]?.name || 'Unknown User';
        avatar = MOCK_USERS_DB[item.senderId]?.avatarUrl;
      } else {
        // In 1-on-1 chats, the other user's name is from params.userName
        senderName = params.userName;
        avatar = params.userAvatar; // Use avatar passed from previous screen for the other user
      }
    }

    return (
      <View style={[styles.messageRow, isCurrentUser ? styles.currentUserMessageRow : styles.otherUserMessageRow]}>
        {!isCurrentUser && avatar && <Image source={{uri: avatar}} style={styles.avatarSmall} />}
        <View style={[styles.messageBubble, isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble]}>
          {!isCurrentUser && senderName && <Text style={styles.messageSenderName}>{senderName}</Text>}
          <Text style={isCurrentUser ? styles.currentUserMessageText : styles.otherUserMessageText}>{item.text}</Text>
          <Text style={isCurrentUser ? styles.currentUserTimestamp : styles.otherUserTimestamp}>
            {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
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
            placeholder={`Message ${chatTitle}...`}
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
    // paddingVertical: 5, // Removed to make icon primary touch target
  },
  headerLeftButtonText: {
    color: '#1A4B44',
    fontSize: 17, 
    // marginLeft: Platform.OS === 'ios' ? 6 : 8, // Removed as text is removed
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