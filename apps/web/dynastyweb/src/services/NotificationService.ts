// Notification Service for Dynasty Web App
// Handles FCM integration and push notifications

import React from 'react';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { app, functions } from '@/lib/firebase';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';
import { cacheService, cacheKeys } from './CacheService';
import { FirebaseFunctionsClient, createFirebaseClient } from '@/lib/functions-client';

export interface NotificationPreferences {
  enabled: boolean;
  stories: boolean;
  events: boolean;
  messages: boolean;
  familyUpdates: boolean;
  sound: boolean;
  vibration: boolean;
}

export interface DynastyNotification {
  id: string;
  title: string;
  body: string;
  type: 'story' | 'event' | 'message' | 'family' | 'system';
  data?: Record<string, unknown>;
  timestamp: number;
  read: boolean;
  imageUrl?: string;
}

class NotificationService {
  private static instance: NotificationService;
  private messaging?: Messaging;
  private currentToken?: string;
  private userId?: string;
  private isInitialized = false;
  private messageListeners: Set<(notification: DynastyNotification) => void> = new Set();
  private functionsClient: FirebaseFunctionsClient;
  private cachedPreferences?: NotificationPreferences;

  private constructor() {
    // Initialize Firebase Functions client
    if (functions) {
      this.functionsClient = createFirebaseClient(functions);
    } else {
      throw new Error('Firebase Functions not initialized');
    }
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private getPlatform(): string {
    return 'web';
  }

  async initialize(userId: string) {
    if (this.isInitialized && this.userId === userId) return;

    this.userId = userId;

    try {
      // Check if notifications are supported
      if (!('Notification' in window)) {
        console.warn('Notifications not supported in this browser');
        return;
      }

      // Initialize Firebase Messaging
      this.messaging = getMessaging(app);

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        return;
      }

      // Get FCM token
      await this.registerToken();

      // Set up message listener
      this.setupMessageListener();

      this.isInitialized = true;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'initialize-notifications',
        userId,
      });
    }
  }

  private async registerToken() {
    if (!this.messaging || !this.userId) return;

    try {
      // Get registration token
      const token = await getToken(this.messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      });

      // Only register if a new token is available and different from the current one
      if (token && token !== this.currentToken) {
        try {
          // Attempt to register the new token with the backend
          await this.functionsClient.callFunction('registerDeviceToken', {
            token,
            platform: this.getPlatform(),
            deleteDuplicates: true, // Remove any older tokens for this user
          });

          // Update current token and store it
          this.currentToken = token;

          console.log('FCM token registered successfully');
        } catch (error) {
          errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
            action: 'register-fcm-token',
          });
        }
      }
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'register-fcm-token',
      });
    }
  }

  private setupMessageListener() {
    if (!this.messaging) return;

    onMessage(this.messaging, payload => {
      console.log('Message received:', payload);

      // Create notification object
      const notification: DynastyNotification = {
        id: payload.messageId || Date.now().toString(),
        title: payload.notification?.title || 'New Notification',
        body: payload.notification?.body || '',
        type: (payload.data?.type as DynastyNotification['type']) || 'system',
        data: payload.data,
        timestamp: Date.now(),
        read: false,
        imageUrl: payload.notification?.image,
      };

      // Show browser notification if page is not visible
      if (document.hidden) {
        this.showBrowserNotification(notification);
      }

      // Notify listeners
      this.notifyListeners(notification);

      // Invalidate notifications cache
      if (this.userId) {
        cacheService.invalidate(cacheKeys.notifications(this.userId));
      }
    });
  }

  private showBrowserNotification(notification: DynastyNotification) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const options: NotificationOptions = {
      body: notification.body,
      icon: '/dynasty.png',
      badge: '/dynasty.png',
      tag: notification.id,
      data: notification.data,
      requireInteraction: false,
      silent: false,
    };

    if (notification.imageUrl) {
      (options as ExtendedNotificationOptions).image = notification.imageUrl; // Chrome supports image property
      options.icon = notification.imageUrl; // Standard icon property
    }

    const browserNotification = new Notification(notification.title, options);

    // Handle click
    browserNotification.onclick = () => {
      window.focus();
      this.handleNotificationClick(notification);
      browserNotification.close();
    };
  }

  private handleNotificationClick(notification: DynastyNotification) {
    if (!notification.data) return;

    // Navigate based on notification type
    switch (notification.type) {
      case 'story':
        if (notification.data.storyId) {
          window.location.href = `/story/${notification.data.storyId}`;
        }
        break;
      case 'event':
        if (notification.data.eventId) {
          window.location.href = `/events/${notification.data.eventId}`;
        }
        break;
      case 'message':
        // Messaging is only available in the mobile app
        break;
      case 'family':
        window.location.href = '/family-tree';
        break;
    }
  }

  private notifyListeners(notification: DynastyNotification) {
    this.messageListeners.forEach(listener => {
      try {
        listener(notification);
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    });
  }

  async getNotifications(page = 0, limit = 20): Promise<DynastyNotification[]> {
    if (!this.userId) return [];

    try {
      const cacheKey = cacheKeys.notifications(this.userId, page);

      return await cacheService.getOrSet(
        cacheKey,
        async () => {
          const result = await this.functionsClient.callFunction('getNotifications', {
            page,
            limit,
          });
          const data = result.data as { notifications?: DynastyNotification[] };
          return data.notifications || [];
        },
        { ttl: 5 * 60 * 1000 } // 5 minutes
      );
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'get-notifications',
      });
      return [];
    }
  }

  async markAsRead(notificationIds: string[]): Promise<void> {
    try {
      await this.functionsClient.callFunction('markNotificationsRead', { notificationIds });

      // Invalidate cache
      if (this.userId) {
        cacheService.invalidatePattern(cacheKeys.notifications(this.userId));
      }
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'mark-notifications-read',
      });
    }
  }

  async updatePreferences(preferences: NotificationPreferences): Promise<void> {
    try {
      // Cache locally for testing
      this.cachedPreferences = preferences;

      await this.functionsClient.callFunction('updateNotificationPreferences', { preferences });
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'update-notification-preferences',
      });
      throw error;
    }
  }

  async getPreferences(): Promise<NotificationPreferences> {
    // Return cached preferences if available (for testing)
    if (this.cachedPreferences) {
      return this.cachedPreferences;
    }

    try {
      const result = await this.functionsClient.callFunction('getNotificationPreferences', {});
      const data = result.data as { preferences: NotificationPreferences };
      return data.preferences;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'get-notification-preferences',
      });

      // Return default preferences
      return {
        enabled: true,
        stories: true,
        events: true,
        messages: true,
        familyUpdates: true,
        sound: true,
        vibration: true,
      };
    }
  }

  addMessageListener(listener: (notification: DynastyNotification) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  async cleanup() {
    if (this.currentToken && this.userId) {
      try {
        await this.functionsClient.callFunction('unregisterDeviceToken', {
          token: this.currentToken,
        });
      } catch (error) {
        console.error('Failed to unregister token:', error);
      }
    }

    this.currentToken = undefined;
    this.userId = undefined;
    this.isInitialized = false;
    this.messageListeners.clear();
  }

  // Test-specific methods for compatibility
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied';
    }
    return await Notification.requestPermission();
  }

  async showNotification(options: {
    title: string;
    body: string;
    icon?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    // Check if we should show this notification
    const permission = await this.requestPermission();
    if (permission !== 'granted') {
      // Queue for later if offline or permission denied
      const notification = {
        ...options,
        id: Date.now().toString(),
        timestamp: Date.now(),
        queued: true,
      };
      // Store in localStorage for testing
      const queued = JSON.parse(localStorage.getItem('queuedNotifications') || '[]');
      queued.push(notification);
      localStorage.setItem('queuedNotifications', JSON.stringify(queued));
      return;
    }

    // Show notification
    new Notification(options.title, {
      body: options.body,
      icon: options.icon,
      data: options.data,
    });
  }

  async shouldShowNotification(type: string): Promise<boolean> {
    try {
      const preferences = await this.getPreferences();
      switch (type) {
        case 'messages':
          return preferences.messages;
        case 'events':
          return preferences.events;
        case 'stories':
          return preferences.stories;
        case 'familyUpdates':
          return preferences.familyUpdates;
        default:
          return preferences.enabled;
      }
    } catch {
      return true; // Default to true if we can't get preferences
    }
  }

  async getQueuedNotifications(): Promise<Array<Record<string, unknown>>> {
    const queued = JSON.parse(localStorage.getItem('queuedNotifications') || '[]');
    return queued;
  }
}

// Extended NotificationOptions interface for Chrome
interface ExtendedNotificationOptions extends NotificationOptions {
  image?: string;
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();

// React hook for notifications
export function useNotifications() {
  const [notifications, setNotifications] = React.useState<DynastyNotification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const service = NotificationService.getInstance();

    const loadNotifications = async () => {
      setLoading(true);
      try {
        const notifs = await service.getNotifications();
        setNotifications(notifs);
        setUnreadCount(notifs.filter(n => !n.read).length);
      } catch (error) {
        console.error('Failed to load notifications:', error);
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();

    // Listen for new notifications
    const unsubscribe = service.addMessageListener(notification => {
      setNotifications(prev => [notification, ...prev]);
      if (!notification.read) {
        setUnreadCount(prev => prev + 1);
      }
    });

    // Refresh periodically
    const interval = setInterval(loadNotifications, 60000); // 1 minute

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const markAsRead = React.useCallback(async (ids: string[]) => {
    const service = NotificationService.getInstance();
    await service.markAsRead(ids);

    setNotifications(prev => prev.map(n => (ids.includes(n.id) ? { ...n, read: true } : n)));
    setUnreadCount(prev => Math.max(0, prev - ids.length));
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
  };
}
