import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidStyle, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseDb } from '../lib/firebase';
import { callFirebaseFunction } from '../lib/errorUtils';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import NetInfo from '@react-native-community/netinfo';
import DeviceInfo from 'react-native-device-info';

// Types
export type NotificationType = 
  | 'story:new' 
  | 'story:liked' 
  | 'comment:new' 
  | 'comment:reply' 
  | 'event:invitation' 
  | 'event:updated' 
  | 'event:reminder'
  | 'family:invitation'
  | 'system:announcement'
  | 'message:new';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  relatedItemId?: string;
  link?: string;
  imageUrl?: string;
  isRead: boolean;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}

interface NotificationPreferences {
  enabled: boolean;
  stories: boolean;
  comments: boolean;
  events: boolean;
  messages: boolean;
  family: boolean;
  system: boolean;
}

const STORAGE_KEYS = {
  FCM_TOKEN: 'fcm_token',
  NOTIFICATION_PREFS: 'notification_preferences',
  LAST_SYNC: 'notifications_last_sync',
};

export class NotificationService {
  private static instance: NotificationService;
  private fcmToken: string | null = null;
  private unsubscribeTokenRefresh: (() => void) | null = null;
  private unsubscribeMessageHandler: (() => void) | null = null;
  private notificationListener: ((notification: Notification) => void) | null = null;

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize notification service
   */
  async initialize(userId: string): Promise<void> {
    try {
      console.log('[NotificationService] Initializing for user:', userId);

      // Request permissions
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.log('[NotificationService] Notification permissions denied');
        return;
      }

      // Create notification channel for Android
      if (Platform.OS === 'android') {
        await this.createNotificationChannels();
      }

      // Get and register FCM token
      await this.registerFCMToken();

      // Set up message handlers
      this.setupMessageHandlers();

      // Load notification preferences
      await this.loadNotificationPreferences();

      console.log('[NotificationService] Initialization complete');
    } catch (error) {
      console.error('[NotificationService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Request notification permissions
   */
  private async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'ios') {
        console.log('[NotificationService] Requesting iOS notification permissions...');
        const authStatus = await messaging().requestPermission({
          alert: true,
          badge: true,
          sound: true,
          announcement: false,
          carPlay: false,
          criticalAlert: false,
          provisional: false,
        });
        
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          console.log('[NotificationService] iOS permissions granted:', authStatus);
        } else {
          console.log('[NotificationService] iOS permissions denied:', authStatus);
        }
        return enabled;
      } else {
        // Android permissions are granted during app install
        console.log('[NotificationService] Android permissions granted by default');
        return true;
      }
    } catch (error) {
      console.error('[NotificationService] Permission request failed:', error);
      return false;
    }
  }

  /**
   * Create notification channels for Android
   */
  private async createNotificationChannels(): Promise<void> {
    try {
      // General channel
      await notifee.createChannel({
        id: 'general',
        name: 'General Notifications',
        importance: AndroidImportance.HIGH,
        sound: 'default',
      });

      // Messages channel with higher priority
      await notifee.createChannel({
        id: 'messages',
        name: 'Messages',
        importance: AndroidImportance.HIGH,
        sound: 'default',
        vibration: true,
      });

      // Events channel
      await notifee.createChannel({
        id: 'events',
        name: 'Events',
        importance: AndroidImportance.DEFAULT,
        sound: 'default',
      });

      console.log('[NotificationService] Android channels created');
    } catch (error) {
      console.error('[NotificationService] Failed to create channels:', error);
    }
  }

  /**
   * Register FCM token with backend
   */
  private async registerFCMToken(): Promise<void> {
    try {
      // For iOS, always register device for remote messages first
      if (Platform.OS === 'ios') {
        console.log('[NotificationService] Registering iOS device for remote messages...');
        await messaging().registerDeviceForRemoteMessages();
        console.log('[NotificationService] iOS device registered for remote messages');
      }

      // Check for existing token
      const existingToken = await AsyncStorage.getItem(STORAGE_KEYS.FCM_TOKEN);
      
      // Get current FCM token
      console.log('[NotificationService] Getting FCM token...');
      const token = await messaging().getToken();
      
      if (token && token !== existingToken) {
        // Token is new or changed, register with backend
        const platform = Platform.OS as 'ios' | 'android';
        const deviceId = DeviceInfo.getUniqueId();
        
        const result = await callFirebaseFunction('registerDeviceToken', {
          token,
          platform,
          deviceId,
          deleteDuplicates: true,
        });

        if (result.success) {
          // Save token locally
          await AsyncStorage.setItem(STORAGE_KEYS.FCM_TOKEN, token);
          this.fcmToken = token;
          console.log('[NotificationService] FCM token registered');
        }
      } else if (token) {
        this.fcmToken = token;
        console.log('[NotificationService] Using existing FCM token');
      }

      // Listen for token refresh
      this.unsubscribeTokenRefresh = messaging().onTokenRefresh(async (newToken) => {
        console.log('[NotificationService] FCM token refreshed');
        await this.updateFCMToken(newToken);
      });
    } catch (error) {
      console.error('[NotificationService] Failed to register FCM token:', error);
    }
  }

  /**
   * Update FCM token when it changes
   */
  private async updateFCMToken(token: string): Promise<void> {
    try {
      const platform = Platform.OS as 'ios' | 'android';
      const deviceId = DeviceInfo.getUniqueId();
      
      await callFirebaseFunction('registerDeviceToken', {
        token,
        platform,
        deviceId,
        deleteDuplicates: true,
      });

      await AsyncStorage.setItem(STORAGE_KEYS.FCM_TOKEN, token);
      this.fcmToken = token;
    } catch (error) {
      console.error('[NotificationService] Failed to update FCM token:', error);
    }
  }

  /**
   * Set up message handlers
   */
  private setupMessageHandlers(): void {
    // Handle foreground messages
    this.unsubscribeMessageHandler = messaging().onMessage(async (remoteMessage) => {
      console.log('[NotificationService] Foreground message received:', remoteMessage);
      await this.displayLocalNotification(remoteMessage);
    });

    // Handle background message (when app is in background)
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log('[NotificationService] Background message received:', remoteMessage);
      // The notification will be displayed automatically by FCM
      // We can add custom handling here if needed
    });

    // Handle notification opened from background state
    messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log('[NotificationService] Notification opened app from background:', remoteMessage);
      this.handleNotificationPress(remoteMessage);
    });

    // Check if app was opened from a notification (when app was killed)
    messaging().getInitialNotification().then((remoteMessage) => {
      if (remoteMessage) {
        console.log('[NotificationService] App opened from notification:', remoteMessage);
        this.handleNotificationPress(remoteMessage);
      }
    });

    // Handle Notifee events (for local notifications)
    notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        console.log('[NotificationService] Local notification pressed:', detail);
        this.handleLocalNotificationPress(detail.notification);
      }
    });
  }

  /**
   * Display local notification using Notifee
   */
  private async displayLocalNotification(
    remoteMessage: FirebaseMessagingTypes.RemoteMessage
  ): Promise<void> {
    try {
      const { notification, data } = remoteMessage;
      
      if (!notification) return;

      // Determine channel based on notification type
      const channelId = this.getChannelForType(data?.type as NotificationType);

      // Basic notification options
      const notificationOptions: any = {
        title: notification.title,
        body: notification.body,
        data: data,
        android: {
          channelId,
          importance: AndroidImportance.HIGH,
          pressAction: {
            id: 'default',
          },
          sound: 'default',
        },
        ios: {
          sound: 'default',
        },
      };

      // Add image if available
      if (notification.android?.imageUrl || notification.ios?.imageUrl) {
        const imageUrl = Platform.OS === 'android' 
          ? notification.android.imageUrl 
          : notification.ios?.imageUrl;
          
        if (imageUrl) {
          notificationOptions.android.largeIcon = imageUrl;
          notificationOptions.android.style = {
            type: AndroidStyle.BIGPICTURE,
            picture: imageUrl,
          };
        }
      }

      await notifee.displayNotification(notificationOptions);
    } catch (error) {
      console.error('[NotificationService] Failed to display local notification:', error);
    }
  }

  /**
   * Get channel ID for notification type
   */
  private getChannelForType(type?: NotificationType): string {
    switch (type) {
      case 'message:new':
        return 'messages';
      case 'event:invitation':
      case 'event:updated':
      case 'event:reminder':
        return 'events';
      default:
        return 'general';
    }
  }

  /**
   * Handle notification press from FCM
   */
  private handleNotificationPress(remoteMessage: FirebaseMessagingTypes.RemoteMessage): void {
    const { data } = remoteMessage;
    
    if (data?.notificationId) {
      // Mark as read
      this.markAsRead(data.notificationId);
    }

    // Navigate based on notification type and data
    this.navigateToScreen(data);
  }

  /**
   * Handle local notification press
   */
  private handleLocalNotificationPress(notification: any): void {
    const { data } = notification;
    
    if (data?.notificationId) {
      // Mark as read
      this.markAsRead(data.notificationId);
    }

    // Navigate based on notification type and data
    this.navigateToScreen(data);
  }

  /**
   * Navigate to appropriate screen based on notification data
   */
  private navigateToScreen(data: any): void {
    // This should be handled by the app's navigation system
    // Emit an event or call a callback that the app can handle
    if (this.notificationListener && data) {
      const notification: Partial<Notification> = {
        id: data.notificationId,
        type: data.type,
        relatedItemId: data.relatedItemId,
        link: data.link,
      };
      this.notificationListener(notification as Notification);
    }
  }

  /**
   * Set notification press listener
   */
  setNotificationPressListener(listener: (notification: Notification) => void): void {
    this.notificationListener = listener;
  }

  /**
   * Get notifications from Firestore
   */
  async getNotifications(userId: string, limit: number = 50): Promise<Notification[]> {
    try {
      const db = getFirebaseDb();
      const snapshot = await db
        .collection('notifications')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const notifications: Notification[] = [];
      snapshot.forEach((doc) => {
        notifications.push({ id: doc.id, ...doc.data() } as Notification);
      });

      // Cache notifications
      await AsyncStorage.setItem(
        `notifications_${userId}`,
        JSON.stringify({
          notifications,
          timestamp: Date.now(),
        })
      );

      return notifications;
    } catch (error) {
      console.error('[NotificationService] Failed to get notifications:', error);
      
      // Try to return cached notifications
      const cached = await AsyncStorage.getItem(`notifications_${userId}`);
      if (cached) {
        const { notifications } = JSON.parse(cached);
        return notifications;
      }
      
      throw error;
    }
  }

  /**
   * Subscribe to real-time notifications
   */
  subscribeToNotifications(
    userId: string,
    onUpdate: (notifications: Notification[]) => void
  ): () => void {
    const db = getFirebaseDb();
    const unsubscribe = db
      .collection('notifications')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .onSnapshot(
        (snapshot) => {
          const notifications: Notification[] = [];
          snapshot.forEach((doc) => {
            notifications.push({ id: doc.id, ...doc.data() } as Notification);
          });
          onUpdate(notifications);
        },
        (error) => {
          console.error('[NotificationService] Subscription error:', error);
        }
      );

    return unsubscribe;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      await callFirebaseFunction('markNotificationAsRead', { notificationId });
    } catch (error) {
      console.error('[NotificationService] Failed to mark as read:', error);
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      await callFirebaseFunction('markAllNotificationsAsRead', { userId });
    } catch (error) {
      console.error('[NotificationService] Failed to mark all as read:', error);
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    try {
      await callFirebaseFunction('deleteNotification', { notificationId });
    } catch (error) {
      console.error('[NotificationService] Failed to delete notification:', error);
    }
  }

  /**
   * Get notification preferences
   */
  async getNotificationPreferences(): Promise<NotificationPreferences> {
    try {
      const prefs = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_PREFS);
      if (prefs) {
        return JSON.parse(prefs);
      }
      
      // Default preferences
      return {
        enabled: true,
        stories: true,
        comments: true,
        events: true,
        messages: true,
        family: true,
        system: true,
      };
    } catch (error) {
      console.error('[NotificationService] Failed to get preferences:', error);
      return {
        enabled: true,
        stories: true,
        comments: true,
        events: true,
        messages: true,
        family: true,
        system: true,
      };
    }
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    preferences: Partial<NotificationPreferences>
  ): Promise<void> {
    try {
      const current = await this.getNotificationPreferences();
      const updated = { ...current, ...preferences };
      
      await AsyncStorage.setItem(
        STORAGE_KEYS.NOTIFICATION_PREFS,
        JSON.stringify(updated)
      );

      // Update backend preferences
      await callFirebaseFunction('updateNotificationPreferences', updated);
    } catch (error) {
      console.error('[NotificationService] Failed to update preferences:', error);
      throw error;
    }
  }

  /**
   * Load notification preferences from storage
   */
  private async loadNotificationPreferences(): Promise<void> {
    try {
      const prefs = await this.getNotificationPreferences();
      console.log('[NotificationService] Loaded preferences:', prefs);
    } catch (error) {
      console.error('[NotificationService] Failed to load preferences:', error);
    }
  }

  /**
   * Check if notifications are enabled
   */
  async areNotificationsEnabled(): Promise<boolean> {
    try {
      const hasPermission = await messaging().hasPermission();
      return hasPermission === messaging.AuthorizationStatus.AUTHORIZED ||
             hasPermission === messaging.AuthorizationStatus.PROVISIONAL;
    } catch (error) {
      console.error('[NotificationService] Failed to check permissions:', error);
      return false;
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    if (this.unsubscribeTokenRefresh) {
      this.unsubscribeTokenRefresh();
      this.unsubscribeTokenRefresh = null;
    }
    
    if (this.unsubscribeMessageHandler) {
      this.unsubscribeMessageHandler();
      this.unsubscribeMessageHandler = null;
    }
    
    this.notificationListener = null;
    this.fcmToken = null;
  }
}

// Export singleton instance getter
export const getNotificationService = () => NotificationService.getInstance();