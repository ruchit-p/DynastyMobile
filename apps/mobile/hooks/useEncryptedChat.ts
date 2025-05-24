import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { ChatEncryptionService, Message } from '../src/services/encryption';

interface UseEncryptedChatOptions {
  chatId: string;
  participants: string[];
  onError?: (error: Error) => void;
}

interface UseEncryptedChatReturn {
  messages: Message[];
  isLoading: boolean;
  isEncryptionReady: boolean;
  sendTextMessage: (text: string) => Promise<void>;
  sendMediaMessage: (uri: string, fileName: string, mimeType: string) => Promise<void>;
  downloadMedia: (message: Message) => Promise<string | null>;
  markAsRead: (messageId: string) => Promise<void>;
  refreshEncryption: () => Promise<void>;
}

export const useEncryptedChat = ({
  chatId,
  participants,
  onError,
}: UseEncryptedChatOptions): UseEncryptedChatReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEncryptionReady, setIsEncryptionReady] = useState(false);
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;

    const initializeChat = async () => {
      try {
        setIsLoading(true);

        // Check and initialize encryption
        const ready = await ChatEncryptionService.isEncryptionReady();
        if (!ready) {
          await ChatEncryptionService.initializeEncryption();
        }
        
        if (!mounted) return;
        setIsEncryptionReady(true);

        // Create or get chat
        const chat = await ChatEncryptionService.createOrGetChat(participants);

        // Subscribe to messages
        const unsub = ChatEncryptionService.subscribeToMessages(
          chat.id,
          (message) => {
            if (!mounted) return;
            setMessages((prev) => {
              const exists = prev.some((m) => m.id === message.id);
              if (exists) return prev;
              return [...prev, message].sort((a, b) => 
                a.timestamp.toMillis() - b.timestamp.toMillis()
              );
            });
          },
          (error) => {
            console.error('Message subscription error:', error);
            onError?.(error);
          }
        );

        if (!mounted) return;
        setUnsubscribe(() => unsub);
      } catch (error) {
        console.error('Failed to initialize encrypted chat:', error);
        if (mounted) {
          onError?.(error as Error);
          Alert.alert(
            'Encryption Error',
            'Failed to initialize encrypted chat. Please try again.'
          );
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeChat();

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [chatId, participants, onError]);

  const sendTextMessage = useCallback(async (text: string) => {
    if (!isEncryptionReady || !text.trim()) return;

    try {
      await ChatEncryptionService.sendTextMessage(chatId, text.trim());
    } catch (error) {
      console.error('Failed to send encrypted message:', error);
      onError?.(error as Error);
      Alert.alert('Send Failed', 'Failed to send encrypted message. Please try again.');
      throw error;
    }
  }, [chatId, isEncryptionReady, onError]);

  const sendMediaMessage = useCallback(async (
    uri: string,
    fileName: string,
    mimeType: string,
    duration?: number
  ) => {
    if (!isEncryptionReady) return;

    try {
      await ChatEncryptionService.sendMediaMessage(chatId, uri, fileName, mimeType, duration);
    } catch (error) {
      console.error('Failed to send encrypted media:', error);
      onError?.(error as Error);
      Alert.alert('Upload Failed', 'Failed to send encrypted file. Please try again.');
      throw error;
    }
  }, [chatId, isEncryptionReady, onError]);

  const downloadMedia = useCallback(async (message: Message): Promise<string | null> => {
    if (!message.media) return null;

    try {
      const localUri = await ChatEncryptionService.downloadMediaFile(message.media);
      return localUri;
    } catch (error) {
      console.error('Failed to download media:', error);
      onError?.(error as Error);
      Alert.alert('Download Failed', 'Failed to download and decrypt file.');
      return null;
    }
  }, [onError]);

  const markAsRead = useCallback(async (messageId: string) => {
    try {
      await ChatEncryptionService.markMessageAsRead(chatId, messageId);
    } catch (error) {
      console.error('Failed to mark message as read:', error);
      // Don't show alert for this non-critical error
    }
  }, [chatId]);

  const refreshEncryption = useCallback(async () => {
    try {
      await ChatEncryptionService.initializeEncryption();
      setIsEncryptionReady(true);
    } catch (error) {
      console.error('Failed to refresh encryption:', error);
      onError?.(error as Error);
    }
  }, [onError]);

  return {
    messages,
    isLoading,
    isEncryptionReady,
    sendTextMessage,
    sendMediaMessage,
    downloadMedia,
    markAsRead,
    refreshEncryption,
  };
};
