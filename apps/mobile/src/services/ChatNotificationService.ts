import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidColor, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseDb, getFirebaseAuth } from '../lib/firebase';
import { callFirebaseFunction } from '../lib/errorUtils';
import ChatEncryptionService from './encryption/ChatEncryptionService';

const NOTIFICATION_SETTINGS_KEY = '@dynasty_notification_settings';
const NOTIFICATION_CHANNEL_ID = 'dynasty_messages';

interface NotificationSettings {
  enabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  showPreview: boolean;
  mutedChats: string[];
}

export class ChatNotificationService {
  private static instance: ChatNotificationService;
  private settings: NotificationSettings = {
    enabled: true,
    soundEnabled: true,
    vibrationEnabled: true,
    showPreview: true,
    mutedChats: [],
  };

  private constructor() {
    this.initialize();
  }

  static getInstance(): ChatNotificationService {
    if (!ChatNotificationService.instance) {
      ChatNotificationService.instance = new ChatNotificationService();
    }
    return ChatNotificationService.instance;
  }

  private async initialize() {
    try {
      // Load settings
      await this.loadSettings();

      // Create notification channel for Android
      if (Platform.OS === 'android') {
        await notifee.createChannel({
          id: NOTIFICATION_CHANNEL_ID,
          name: 'Dynasty Messages',
          description: 'Notifications for new messages',
          importance: AndroidImportance.HIGH,
          sound: 'default',
          vibration: true,
          badge: true,
        });
      }

      // Request permissions
      await this.requestPermissions();

      // Set up message handlers
      this.setupMessageHandlers();

      // Register FCM token
      await this.registerFCMToken();
    } catch (error) {
      console.error('Failed to initialize chat notifications:', error);
    }
  }

  private async loadSettings() {
    try {
      const saved = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (saved) {
        this.settings = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    }
  }

  private async saveSettings() {
    try {
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Failed to save notification settings:', error);
    }
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('Notification permissions granted');
      }

      return enabled;
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
      return false;
    }
  }

  private async registerFCMToken() {
    try {
      const token = await messaging().getToken();
      const userId = getFirebaseAuth().currentUser?.uid;
      
      if (token && userId) {
        // Save token to Firestore
        await getFirebaseDb()
          .collection('users')
          .doc(userId)
          .update({
            fcmTokens: getFirebaseDb().FieldValue.arrayUnion(token),
            lastTokenUpdate: getFirebaseDb().FieldValue.serverTimestamp(),
          });

        console.log('FCM token registered');
      }
    } catch (error) {
      console.error('Failed to register FCM token:', error);
    }
  }

  private setupMessageHandlers() {
    // Handle foreground messages
    messaging().onMessage(async (remoteMessage) => {
      console.log('Foreground message received:', remoteMessage);
      
      if (this.settings.enabled && remoteMessage.data) {
        await this.showNotification(remoteMessage);
      }
    });

    // Handle background message
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log('Background message received:', remoteMessage);
      
      if (this.settings.enabled && remoteMessage.data) {
        await this.showNotification(remoteMessage);
      }
    });

    // Handle notification interactions
    notifee.onForegroundEvent(({ type, detail }) => {
      switch (type) {
        case EventType.PRESS:
          console.log('Notification pressed:', detail.notification);
          if (detail.notification?.data?.chatId) {
            this.handleNotificationPress(detail.notification.data.chatId as string);
          }
          break;
        case EventType.ACTION_PRESS:
          if (detail.pressAction?.id === 'reply' && detail.input) {
            this.handleQuickReply(
              detail.notification?.data?.chatId as string,
              detail.input
            );
          }
          break;
      }
    });
  }

  private async showNotification(remoteMessage: FirebaseMessagingTypes.RemoteMessage) {
    try {
      const { data } = remoteMessage;
      
      if (!data?.chatId || !data?.messageId) {
        return;
      }

      // Check if chat is muted
      if (this.settings.mutedChats.includes(data.chatId)) {
        return;
      }

      // Get message details
      const messageDoc = await getFirebaseDb()
        .collection('chats')
        .doc(data.chatId)
        .collection('messages')
        .doc(data.messageId)
        .get();

      if (!messageDoc.exists) {
        return;
      }

      const messageData = messageDoc.data();
      
      // Decrypt message if needed
      let title = data.senderName || 'New Message';
      let body = 'You have a new message';
      
      if (this.settings.showPreview && messageData) {
        try {
          const decryptedMessage = await ChatEncryptionService.decryptMessage({
            ...messageData,
            id: messageDoc.id,
          } as any);

          if (decryptedMessage.type === 'text') {
            body = decryptedMessage.text || body;
          } else if (decryptedMessage.type === 'voice') {
            body = '🎤 Voice message';
          } else if (decryptedMessage.type === 'media') {
            body = '📷 Photo';
          } else if (decryptedMessage.type === 'file') {
            body = '📎 File';
          }
        } catch (error) {
          console.error('Failed to decrypt message for notification:', error);
        }
      }

      // Show notification
      await notifee.displayNotification({
        id: data.messageId,
        title,
        body,
        data: {
          chatId: data.chatId,
          messageId: data.messageId,
        },
        android: {
          channelId: NOTIFICATION_CHANNEL_ID,
          smallIcon: 'ic_launcher',
          color: AndroidColor.GREEN,
          pressAction: {
            id: 'default',
          },
          actions: [
            {
              title: 'Reply',
              pressAction: { id: 'reply' },
              input: {
                allowFreeFormInput: true,
                placeholder: 'Type your reply...',
              },
            },
            {
              title: 'Mark as Read',
              pressAction: { id: 'mark_read' },
            },
          ],
        },
        ios: {
          sound: this.settings.soundEnabled ? 'default' : undefined,
          categoryId: 'message',
          threadId: data.chatId,
        },
      });
    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  }

  private async handleNotificationPress(chatId: string) {
    // Navigation will be handled by the app
    console.log('Navigate to chat:', chatId);
  }

  private async handleQuickReply(chatId: string, message: string) {
    try {
      await ChatEncryptionService.sendTextMessage(chatId, message);
      console.log('Quick reply sent');
    } catch (error) {
      console.error('Failed to send quick reply:', error);
    }
  }

  // Public methods

  async updateSettings(settings: Partial<NotificationSettings>) {
    this.settings = { ...this.settings, ...settings };
    await this.saveSettings();
  }

  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  async muteChat(chatId: string) {
    if (!this.settings.mutedChats.includes(chatId)) {
      this.settings.mutedChats.push(chatId);
      await this.saveSettings();
    }
  }

  async unmuteChat(chatId: string) {
    this.settings.mutedChats = this.settings.mutedChats.filter(id => id !== chatId);
    await this.saveSettings();
  }

  isChatMuted(chatId: string): boolean {
    return this.settings.mutedChats.includes(chatId);
  }

  async sendMessageNotification(chatId: string, messageId: string) {
    try {
      await callFirebaseFunction('sendMessageNotification', {
        chatId,
        messageId,
      });
    } catch (error) {
      console.error('Failed to send message notification:', error);
    }
  }

  async clearChatNotifications(chatId: string) {
    try {
      const notifications = await notifee.getDisplayedNotifications();
      
      for (const notification of notifications) {
        if (notification.notification?.data?.chatId === chatId) {
          await notifee.cancelNotification(notification.id);
        }
      }
    } catch (error) {
      console.error('Failed to clear chat notifications:', error);
    }
  }

  async updateBadgeCount() {
    try {
      const userId = getFirebaseAuth().currentUser?.uid;
      if (!userId) return;

      // Get unread message count
      const unreadSnapshot = await getFirebaseDb()
        .collectionGroup('messages')
        .where('read', 'array-contains', userId)
        .where('senderId', '!=', userId)
        .get();

      const unreadCount = unreadSnapshot.size;
      
      // Update badge
      if (Platform.OS === 'ios') {
        notifee.setBadgeCount(unreadCount);
      } else {
        notifee.setBadgeCount(unreadCount);
      }
    } catch (error) {
      console.error('Failed to update badge count:', error);
    }
  }
}

export default ChatNotificationService.getInstance();