import { getFirebaseDb, getFirebaseAuth } from '../lib/firebase';
import { callFirebaseFunction } from '../lib/errorUtils';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { logger } from './LoggingService';

interface TypingUser {
  userId: string;
  timestamp: FirebaseFirestoreTypes.Timestamp;
}

export class TypingService {
  private static instance: TypingService;
  private typingTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private activeListeners: Map<string, () => void> = new Map();
  private db = getFirebaseDb();
  private typingDuration = 5000; // Stop showing typing after 5 seconds of inactivity

  private constructor() {}

  static getInstance(): TypingService {
    if (!TypingService.instance) {
      TypingService.instance = new TypingService();
    }
    return TypingService.instance;
  }

  /**
   * Start showing typing indicator for a chat
   */
  async startTyping(chatId: string) {
    try {
      const userId = getFirebaseAuth().currentUser?.uid;
      if (!userId) return;

      // Clear existing timeout
      const existingTimeout = this.typingTimeouts.get(chatId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Send typing notification to Firebase
      await callFirebaseFunction('sendTypingNotification', {
        chatId,
        isTyping: true,
      });

      // Set timeout to stop typing
      const timeout = setTimeout(() => {
        this.stopTyping(chatId);
      }, this.typingDuration);

      this.typingTimeouts.set(chatId, timeout);
    } catch (error) {
      logger.error('Failed to start typing:', error);
    }
  }

  /**
   * Stop showing typing indicator for a chat
   */
  async stopTyping(chatId: string) {
    try {
      const userId = getFirebaseAuth().currentUser?.uid;
      if (!userId) return;

      // Clear timeout
      const existingTimeout = this.typingTimeouts.get(chatId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        this.typingTimeouts.delete(chatId);
      }

      // Send stop typing notification to Firebase
      await callFirebaseFunction('sendTypingNotification', {
        chatId,
        isTyping: false,
      });
    } catch (error) {
      logger.error('Failed to stop typing:', error);
    }
  }

  /**
   * Subscribe to typing indicators for a chat
   */
  subscribeToTypingIndicators(
    chatId: string,
    onTypingUsersChange: (typingUsers: string[]) => void
  ): () => void {
    try {
      const userId = getFirebaseAuth().currentUser?.uid;
      if (!userId) return () => {};

      // Unsubscribe from existing listener if any
      const existingUnsubscribe = this.activeListeners.get(chatId);
      if (existingUnsubscribe) {
        existingUnsubscribe();
      }

      // Subscribe to typing collection
      const typingRef = this.db
        .collection('chats')
        .doc(chatId)
        .collection('typing');

      const unsubscribe = typingRef.onSnapshot(
        (snapshot) => {
          const typingUsers: string[] = [];
          const now = Date.now();

          snapshot.forEach((doc) => {
            const data = doc.data() as TypingUser;
            
            // Only show typing if timestamp is recent (within 10 seconds)
            const timestamp = data.timestamp?.toMillis() || 0;
            if (now - timestamp < 10000 && data.userId !== userId) {
              typingUsers.push(data.userId);
            }
          });

          onTypingUsersChange(typingUsers);
        },
        (error) => {
          logger.error('Error subscribing to typing indicators:', error);
        }
      );

      this.activeListeners.set(chatId, unsubscribe);

      return () => {
        unsubscribe();
        this.activeListeners.delete(chatId);
      };
    } catch (error) {
      logger.error('Failed to subscribe to typing indicators:', error);
      return () => {};
    }
  }

  /**
   * Clean up typing indicators when leaving a chat
   */
  async cleanup(chatId: string) {
    // Stop typing
    await this.stopTyping(chatId);

    // Unsubscribe from typing indicators
    const unsubscribe = this.activeListeners.get(chatId);
    if (unsubscribe) {
      unsubscribe();
      this.activeListeners.delete(chatId);
    }
  }

  /**
   * Get user names for typing users
   */
  async getTypingUserNames(userIds: string[]): Promise<string[]> {
    try {
      if (userIds.length === 0) return [];

      const userPromises = userIds.map(async (userId) => {
        const userDoc = await this.db.collection('users').doc(userId).get();
        return userDoc.data()?.displayName || 'Someone';
      });

      return await Promise.all(userPromises);
    } catch (error) {
      logger.error('Failed to get typing user names:', error);
      return userIds.map(() => 'Someone');
    }
  }

  /**
   * Clean up all resources
   */
  cleanupAll() {
    // Clear all timeouts
    this.typingTimeouts.forEach(timeout => clearTimeout(timeout));
    this.typingTimeouts.clear();

    // Unsubscribe from all listeners
    this.activeListeners.forEach(unsubscribe => unsubscribe());
    this.activeListeners.clear();
  }
}

export default TypingService.getInstance();