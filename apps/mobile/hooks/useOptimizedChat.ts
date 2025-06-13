import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import ChatEncryptionService, { Message } from '../src/services/encryption/ChatEncryptionService';
import MessageOptimizationService from '../src/services/MessageOptimizationService';
import MessageSyncService from '../src/services/MessageSyncService';
import { useNetworkStatus } from '../src/hooks/useNetworkStatus';
import { debounce } from 'lodash';

interface UseOptimizedChatOptions {
  chatId: string;
  participants: string[];
  pageSize?: number;
  enableAutoSync?: boolean;
  enableOfflineQueue?: boolean;
}

interface UseOptimizedChatReturn {
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  sendMessage: (text: string) => Promise<void>;
  sendMediaMessage: (uri: string, fileName: string, mimeType: string, duration?: number) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  markAsRead: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  retryFailedMessages: () => Promise<void>;
  clearCache: () => void;
}

export function useOptimizedChat({
  chatId,
  participants,
  pageSize = 50,
  enableAutoSync = true,
  enableOfflineQueue = true,
}: UseOptimizedChatOptions): UseOptimizedChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const messagesRef = useRef<Message[]>([]);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lastMessageTimestamp = useRef<any>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  
  const { isOnline } = useNetworkStatus();

  // Initialize chat and load messages
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize encryption
        await ChatEncryptionService.initializeEncryption();

        // Create or get chat
        await ChatEncryptionService.createOrGetChat(participants);

        // Load initial messages from cache/database
        if (enableOfflineQueue) {
          const cachedMessages = await MessageSyncService.getMessagesForChat(chatId, pageSize);
          if (cachedMessages.length > 0 && mounted) {
            messagesRef.current = cachedMessages;
            setMessages(cachedMessages);
            lastMessageTimestamp.current = cachedMessages[0].timestamp;
          }
        }

        // Subscribe to real-time updates
        const unsubscribe = ChatEncryptionService.subscribeToMessages(
          chatId,
          (newMessage) => {
            if (!mounted) return;

            // Check if message already exists
            const exists = messagesRef.current.some(m => m.id === newMessage.id);
            if (!exists) {
              // Add to messages with optimization
              const updatedMessages = [...messagesRef.current, newMessage];
              messagesRef.current = updatedMessages;
              setMessages(updatedMessages);
              
              // Cache the new message
              MessageOptimizationService.cacheMessage(newMessage);
            } else {
              // Update existing message (for status updates, reactions, etc.)
              const updatedMessages = messagesRef.current.map(m => 
                m.id === newMessage.id ? newMessage : m
              );
              messagesRef.current = updatedMessages;
              setMessages(updatedMessages);
            }
          },
          (error) => {
            console.error('Message subscription error:', error);
            if (mounted) {
              setError(error);
            }
          }
        );

        unsubscribeRef.current = unsubscribe;

        // Sync with server if online
        if (isOnline && enableAutoSync) {
          await MessageSyncService.syncMessages(chatId);
        }
      } catch (err) {
        console.error('Failed to initialize chat:', err);
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initialize();

    // Handle app state changes
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        enableAutoSync
      ) {
        // App came to foreground, sync messages
        MessageSyncService.syncMessages(chatId);
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      mounted = false;
      unsubscribeRef.current?.();
      appStateSubscription.remove();
    };
  }, [chatId, participants, pageSize, isOnline, enableAutoSync, enableOfflineQueue]);

  // Load more messages
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !lastMessageTimestamp.current) return;

    try {
      setIsLoadingMore(true);

      // Load from cache/database
      const olderMessages = await MessageSyncService.getMessagesForChat(
        chatId,
        pageSize,
        lastMessageTimestamp.current
      );

      if (olderMessages.length > 0) {
        const newMessages = [...olderMessages, ...messagesRef.current];
        messagesRef.current = newMessages;
        setMessages(newMessages);
        lastMessageTimestamp.current = olderMessages[0].timestamp;
        
        // Batch cache older messages
        olderMessages.forEach(msg => MessageOptimizationService.cacheMessage(msg));
      }

      setHasMore(olderMessages.length === pageSize);
    } catch (err) {
      console.error('Failed to load more messages:', err);
      setError(err as Error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatId, pageSize, isLoadingMore, hasMore]);

  // Refresh messages
  const refresh = useCallback(async () => {
    if (isLoading) return;

    try {
      setIsLoading(true);
      setError(null);

      // Force sync with server
      if (isOnline) {
        await MessageSyncService.syncMessages(chatId, true);
      }

      // Reload messages
      const freshMessages = await MessageSyncService.getMessagesForChat(chatId, pageSize);
      messagesRef.current = freshMessages;
      setMessages(freshMessages);
      
      if (freshMessages.length > 0) {
        lastMessageTimestamp.current = freshMessages[0].timestamp;
      }
    } catch (err) {
      console.error('Failed to refresh messages:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [chatId, pageSize, isOnline, isLoading]);

  // Send text message
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    try {
      if (isOnline) {
        // Send directly if online
        await ChatEncryptionService.sendTextMessage(chatId, text);
      } else if (enableOfflineQueue) {
        // Queue for offline sending
        await MessageSyncService.queueMessage({
          chatId,
          type: 'text',
          text,
          senderId: ChatEncryptionService['currentUserId'] || '',
          timestamp: new Date(),
          encrypted: true,
          delivered: [],
          read: [],
          status: 'sending',
        } as any);
      } else {
        throw new Error('No internet connection');
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      throw err;
    }
  }, [chatId, isOnline, enableOfflineQueue]);

  // Send media message
  const sendMediaMessage = useCallback(async (
    uri: string,
    fileName: string,
    mimeType: string,
    duration?: number
  ) => {
    try {
      if (isOnline) {
        // Send directly if online
        await ChatEncryptionService.sendMediaMessage(chatId, uri, fileName, mimeType, duration);
      } else if (enableOfflineQueue) {
        // Queue for offline sending
        await MessageSyncService.queueMessage({
          chatId,
          type: mimeType.startsWith('image/') ? 'media' : 
                mimeType.startsWith('audio/') ? 'voice' : 'file',
          media: { uri, fileName, mimeType } as any,
          duration,
          senderId: ChatEncryptionService['currentUserId'] || '',
          timestamp: new Date(),
          encrypted: true,
          delivered: [],
          read: [],
          status: 'sending',
        } as any);
      } else {
        throw new Error('No internet connection');
      }
    } catch (err) {
      console.error('Failed to send media message:', err);
      throw err;
    }
  }, [chatId, isOnline, enableOfflineQueue]);

  // Mark message as read (debounced)
  const markAsReadDebounced = useMemo(
    () => debounce(async (messageId: string) => {
      try {
        await ChatEncryptionService.markMessageAsRead(chatId, messageId);
      } catch (err) {
        console.error('Failed to mark message as read:', err);
      }
    }, 1000),
    [chatId]
  );

  const markAsRead = useCallback((messageId: string) => {
    markAsReadDebounced(messageId);
  }, [markAsReadDebounced]);

  // Toggle reaction
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    try {
      await ChatEncryptionService.toggleReaction(chatId, messageId, emoji);
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
      throw err;
    }
  }, [chatId]);

  // Retry failed messages
  const retryFailedMessages = useCallback(async () => {
    if (!enableOfflineQueue) return;

    try {
      await MessageSyncService.processMessageQueue();
    } catch (err) {
      console.error('Failed to retry messages:', err);
      throw err;
    }
  }, [enableOfflineQueue]);

  // Clear cache
  const clearCache = useCallback(() => {
    MessageOptimizationService.clearChatCache(chatId);
  }, [chatId]);

  return {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    sendMessage,
    sendMediaMessage,
    loadMore,
    refresh,
    markAsRead,
    toggleReaction,
    retryFailedMessages,
    clearCache,
  };
}