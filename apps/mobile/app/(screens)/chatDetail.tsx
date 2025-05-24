import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Platform,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import FlashList from '../../components/ui/FlashList';
import { useEncryptedChat } from '../../hooks/useEncryptedChat';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { useThemeColor } from '../../hooks/useThemeColor';
import EncryptionIndicator from '../../components/encryption/EncryptionIndicator';
import KeyVerificationScreen from '../../components/encryption/KeyVerificationScreen';
import { EncryptionStatusBanner, MessageEncryptionIndicator } from '../../components/encryption/EncryptionStatusComponents';
import MediaGallery from '../../components/ui/MediaGallery';
import { useImageUpload } from '../../hooks/useImageUpload';
import IconButton from '../../components/ui/IconButton';
import MessageStatusIndicator from '../../components/ui/MessageStatusIndicator';
import MessageActionsSheet from '../../components/ui/MessageActionsSheet';
import VoiceMessageRecorder from '../../components/ui/VoiceMessageRecorder';
import VoiceMessagePlayer from '../../components/ui/VoiceMessagePlayer';
import ChatMediaGallery from '../../components/ui/ChatMediaGallery';
import TypingIndicator from '../../components/ui/TypingIndicator';
import TypingService from '../../src/services/TypingService';
import { MessageReactions, ReactionPicker } from '../../components/ui/MessageReactions';
import ChatEncryptionService from '../../src/services/encryption/ChatEncryptionService';

interface ChatDetailScreenProps {
  chatId: string;
  participantIds: string[];
  chatTitle?: string;
}

export default function ChatDetailScreen() {
  const params = useLocalSearchParams<ChatDetailScreenProps>();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { handleError, withErrorHandling } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Chat Error',
    trackCurrentScreen: true
  });

  const [inputText, setInputText] = useState('');
  const [showKeyVerification, setShowKeyVerification] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [showMessageActions, setShowMessageActions] = useState(false);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [typingUserNames, setTypingUserNames] = useState<string[]>([]);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionPickerPosition, setReactionPickerPosition] = useState<{ x: number; y: number } | undefined>();
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const messageListRef = useRef<any>(null);
  const typingTimerRef = useRef<NodeJS.Timeout>();

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({ light: Colors.light.border, dark: Colors.dark.border }, 'border');
  
  // Message action handlers
  const handleMessageCopy = useCallback(() => {
    Alert.alert('Copied', 'Message copied to clipboard');
  }, []);
  
  const handleMessageReply = useCallback(() => {
    // TODO: Implement reply functionality
    Alert.alert('Reply', 'Reply feature coming soon');
  }, []);
  
  const handleMessageEdit = useCallback(() => {
    if (selectedMessage) {
      setEditingMessage(selectedMessage);
      setInputText(selectedMessage.text || '');
    }
  }, [selectedMessage]);
  
  const handleMessageDelete = useCallback(async (forEveryone: boolean) => {
    if (!selectedMessage) return;
    
    try {
      // TODO: Implement delete functionality
      Alert.alert(
        'Delete Message',
        `Message will be deleted ${forEveryone ? 'for everyone' : 'for you'}.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      handleError(error);
    }
  }, [selectedMessage, handleError]);
  
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    
    try {
      if (editingMessage) {
        // TODO: Implement message editing
        Alert.alert('Edit', 'Message editing feature coming soon');
        setEditingMessage(null);
      } else {
        await sendMessage(text);
      }
      setInputText('');
    } catch (error) {
      handleError(error);
    }
  }, [inputText, editingMessage, sendMessage, handleError]);
  
  const handleVoiceRecordingComplete = useCallback(async (uri: string, duration: number) => {
    try {
      setShowVoiceRecorder(false);
      
      // Get file info
      const fileName = `voice_${Date.now()}.m4a`;
      const mimeType = 'audio/m4a';
      
      // Send as voice message with duration
      await sendMediaMessage(uri, fileName, mimeType, duration);
    } catch (error) {
      handleError(error);
    }
  }, [sendMediaMessage, handleError]);
  
  // Handle reaction
  const handleReaction = useCallback(async (messageId: string, emoji: string) => {
    try {
      await ChatEncryptionService.toggleReaction(params.chatId, messageId, emoji);
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  }, [params.chatId]);
  
  // Handle typing
  const handleTyping = useCallback((text: string) => {
    setInputText(text);
    
    // Clear existing timer
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    
    // Start typing if text is not empty
    if (text.trim()) {
      TypingService.startTyping(params.chatId);
      
      // Set timer to stop typing after 3 seconds of inactivity
      typingTimerRef.current = setTimeout(() => {
        TypingService.stopTyping(params.chatId);
      }, 3000);
    } else {
      // Stop typing if text is empty
      TypingService.stopTyping(params.chatId);
    }
  }, [params.chatId]);

  // Parse participant IDs
  const participantIds = Array.isArray(params.participantIds) 
    ? params.participantIds 
    : params.participantIds?.split(',') || [];
    
  // Determine if this is a group chat
  const isGroupChat = participantIds.length > 1;

  // Use the encrypted chat hook
  const {
    messages,
    isLoading,
    isInitialized,
    encryptionStatus,
    sendMessage,
    sendMediaMessage,
    initializeChat,
    verifyParticipant,
    refreshMessages,
    markAsRead,
  } = useEncryptedChat(params.chatId || '', participantIds);

  // Initialize chat when component mounts
  useEffect(() => {
    if (params.chatId && participantIds.length > 0 && !isInitialized) {
      withErrorHandling(async () => {
        await initializeChat(params.chatId, participantIds);
      }, 'Failed to initialize encrypted chat')();
    }
  }, [params.chatId, participantIds, isInitialized]);

  // Subscribe to typing indicators
  useEffect(() => {
    if (!params.chatId) return;

    const unsubscribe = TypingService.subscribeToTypingIndicators(
      params.chatId,
      async (userIds) => {
        setTypingUsers(userIds);
        if (userIds.length > 0) {
          const names = await TypingService.getTypingUserNames(userIds);
          setTypingUserNames(names);
        } else {
          setTypingUserNames([]);
        }
      }
    );

    return () => {
      unsubscribe();
      TypingService.cleanup(params.chatId);
    };
  }, [params.chatId]);

  // Set up navigation header
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitleText, { color: textColor }]}>
            {params.chatTitle || 'Encrypted Chat'}
          </Text>
          {isGroupChat && (
            <View style={styles.groupBadge}>
              <Ionicons name="people" size={12} color={Colors.dynastyGreen} />
              <Text style={styles.groupBadgeText}>{participantIds.length + 1}</Text>
            </View>
          )}
        </View>
      ),
      headerRight: () => (
        <View style={styles.headerRight}>
          <EncryptionIndicator status={encryptionStatus} />
          <TouchableOpacity
            onPress={() => router.push({
              pathname: '/(screens)/chatSearch',
              params: { chatId: params.chatId }
            })}
            style={styles.headerButton}
          >
            <Ionicons name="search" size={24} color={textColor} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowMediaGallery(true)}
            style={styles.headerButton}
          >
            <Ionicons name="images" size={24} color={textColor} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowKeyVerification(true)}
            style={styles.headerButton}
          >
            <Ionicons name="shield-checkmark" size={24} color={textColor} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push({
              pathname: '/(screens)/chatInfo',
              params: { 
                chatId: params.chatId,
                chatTitle: params.chatTitle 
              }
            })}
            style={styles.headerButton}
          >
            <Ionicons name="information-circle" size={24} color={textColor} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, params.chatTitle, encryptionStatus, textColor, isGroupChat, participantIds, router, params.chatId]);

  // Handle media selection
  const { selectImages } = useImageUpload({
    onImagesSelected: async (images) => {
      if (images.length > 0 && user) {
        await withErrorHandling(async () => {
          for (const image of images) {
            await sendMediaMessage(image.uri, 'image');
          }
        }, 'Failed to send media')();
      }
    },
  });

  // Render individual message
  const renderMessage = useCallback(({ item }: { item: any }) => {
    const isOwnMessage = item.senderId === user?.uid;
    
    // Mark message as read when rendering (if not own message)
    if (!isOwnMessage && item.read && !item.read.includes(user?.uid)) {
      // Use setTimeout to avoid state updates during render
      setTimeout(() => markAsRead(item.id), 0);
    }
    
    const handleLongPress = () => {
      setSelectedMessage(item);
      setShowMessageActions(true);
    };
    
    return (
      <TouchableOpacity
        onLongPress={handleLongPress}
        delayLongPress={300}
        style={[
          styles.messageContainer,
          isOwnMessage ? styles.ownMessage : styles.otherMessage
        ]}
      >
        <View style={[
          styles.messageBubble,
          isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble,
          { backgroundColor: isOwnMessage ? Colors.light.primary : borderColor }
        ]}>
          {item.type === 'text' ? (
            <Text style={[
              styles.messageText,
              { color: isOwnMessage ? 'white' : textColor }
            ]}>
              {item.text || item.content}
            </Text>
          ) : item.type === 'voice' ? (
            <VoiceMessagePlayer
              uri={item.mediaUrl}
              duration={item.duration}
              isOwnMessage={isOwnMessage}
            />
          ) : (
            <MediaGallery
              media={[{ 
                id: item.id, 
                uri: item.mediaUrl, 
                type: item.mediaType || 'image',
                metadata: { encrypted: true }
              }]}
              enableFullscreen
              style={styles.mediaMessage}
            />
          )}
          <View style={styles.messageFooter}>
            <Text style={[
              styles.timestamp,
              { color: isOwnMessage ? 'rgba(255,255,255,0.7)' : 'gray' }
            ]}>
              {new Date(item.timestamp).toLocaleTimeString()}
            </Text>
            <MessageEncryptionIndicator encrypted={item.encrypted} />
            <MessageStatusIndicator
              status={item.status || 'sent'}
              delivered={item.delivered || []}
              read={item.read || []}
              isOwnMessage={isOwnMessage}
              participantCount={participantIds.length + 1}
              color={isOwnMessage ? 'rgba(255,255,255,0.7)' : 'gray'}
            />
          </View>
          {item.reactions && item.reactions.length > 0 && (
            <MessageReactions
              reactions={item.reactions}
              onReact={(emoji) => handleReaction(item.id, emoji)}
              currentUserId={user?.uid || ''}
            />
          )}
        </View>
        
        {/* Add reaction button for double tap or special gesture */}
        <TouchableOpacity
          onPress={(event) => {
            const { pageX, pageY } = event.nativeEvent;
            setReactionPickerPosition({ x: pageX, y: pageY });
            setReactionMessageId(item.id);
            setShowReactionPicker(true);
          }}
          style={styles.reactionTouchArea}
        />
      </TouchableOpacity>
    );
  }, [user, textColor, borderColor, handleReaction]);

  if (isLoading && !isInitialized) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor }]}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={[styles.loadingText, { color: textColor }]}>
          Initializing encrypted chat...
        </Text>
      </View>
    );
  }

  if (showKeyVerification && selectedParticipantId) {
    return (
      <KeyVerificationScreen
        targetUserId={selectedParticipantId}
        onVerified={() => {
          verifyParticipant(selectedParticipantId);
          setShowKeyVerification(false);
          setSelectedParticipantId(null);
        }}
        onCancel={() => {
          setShowKeyVerification(false);
          setSelectedParticipantId(null);
        }}
      />
    );
  }

  return (
    <ErrorBoundary screenName="ChatDetail">
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <EncryptionStatusBanner 
            status={encryptionStatus}
            onVerifyTap={() => {
              // For group chats, show participant list for verification
              if (participantIds.length > 1) {
                Alert.alert(
                  'Verify Participants',
                  'Select a participant to verify their encryption keys',
                  participantIds
                    .filter(id => id !== user?.uid)
                    .map(id => ({
                      text: id, // In production, show actual names
                      onPress: () => {
                        setSelectedParticipantId(id);
                        setShowKeyVerification(true);
                      }
                    }))
                );
              } else {
                // Direct chat - verify the other participant
                const otherParticipant = participantIds.find(id => id !== user?.uid);
                if (otherParticipant) {
                  setSelectedParticipantId(otherParticipant);
                  setShowKeyVerification(true);
                }
              }
            }}
          />

          <FlashList
            ref={messageListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            estimatedItemSize={80}
            inverted
            contentContainerStyle={styles.messagesList}
            onRefresh={refreshMessages}
            refreshing={isLoading}
          />
          
          <TypingIndicator
            userNames={typingUserNames}
            isVisible={typingUsers.length > 0}
          />

          {!showVoiceRecorder && (
            <View style={[styles.inputContainer, { borderTopColor: borderColor }]}>
            {editingMessage ? (
              <TouchableOpacity 
                onPress={() => {
                  setEditingMessage(null);
                  setInputText('');
                }}
                style={styles.attachButton}
              >
                <Ionicons name="close" size={24} color={textColor} />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity 
                  onPress={() => setShowVoiceRecorder(true)}
                  style={styles.attachButton}
                >
                  <Ionicons name="mic" size={24} color={textColor} />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={selectImages}
                  style={styles.attachButton}
                >
                  <Ionicons name="attach" size={24} color={textColor} />
                </TouchableOpacity>
              </>
            )}
            
            <TextInput
              style={[styles.input, { color: textColor, borderColor }]}
              value={inputText}
              onChangeText={handleTyping}
              placeholder={editingMessage ? "Edit message..." : "Type a secure message..."}
              placeholderTextColor="gray"
              multiline
              maxLength={1000}
            />
            
            <TouchableOpacity
              onPress={handleSend}
              disabled={!inputText.trim()}
              style={[
                styles.sendButton,
                { opacity: inputText.trim() ? 1 : 0.5 }
              ]}
            >
              <Ionicons 
                name={editingMessage ? "checkmark" : "send"} 
                size={24} 
                color={Colors.light.primary}
              />
            </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
        
        <VoiceMessageRecorder
          isVisible={showVoiceRecorder}
          onRecordingComplete={handleVoiceRecordingComplete}
          onCancel={() => setShowVoiceRecorder(false)}
        />
        
        <MessageActionsSheet
          visible={showMessageActions}
          message={selectedMessage || {}}
          isOwnMessage={selectedMessage?.senderId === user?.uid}
          onClose={() => {
            setShowMessageActions(false);
            setSelectedMessage(null);
          }}
          onCopy={handleMessageCopy}
          onReply={handleMessageReply}
          onEdit={handleMessageEdit}
          onDelete={handleMessageDelete}
        />
        
        <ChatMediaGallery
          chatId={params.chatId}
          isVisible={showMediaGallery}
          onClose={() => setShowMediaGallery(false)}
        />
        
        <ReactionPicker
          visible={showReactionPicker}
          onSelect={(emoji) => {
            if (reactionMessageId) {
              handleReaction(reactionMessageId, emoji);
            }
          }}
          onClose={() => {
            setShowReactionPicker(false);
            setReactionMessageId(null);
            setReactionPickerPosition(undefined);
          }}
          anchorPosition={reactionPickerPosition}
        />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    marginLeft: 15,
    padding: 5,
  },
  messagesList: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  messageContainer: {
    marginVertical: 5,
    maxWidth: '80%',
  },
  ownMessage: {
    alignSelf: 'flex-end',
  },
  otherMessage: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    padding: 12,
    borderRadius: 18,
    minWidth: 80,
  },
  ownMessageBubble: {
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  mediaMessage: {
    width: 200,
    height: 200,
    borderRadius: 10,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    justifyContent: 'flex-end',
  },
  timestamp: {
    fontSize: 12,
    marginRight: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  attachButton: {
    padding: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginHorizontal: 10,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    padding: 10,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: '600',
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7F5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
    gap: 2,
  },
  groupBadgeText: {
    fontSize: 12,
    color: Colors.dynastyGreen,
    fontWeight: '500',
  },
  reactionTouchArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 40,
    height: 40,
  },
});