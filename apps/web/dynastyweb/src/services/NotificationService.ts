// Notification Service for Dynasty Web App
// Handles FCM integration and push notifications

import React from 'react';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { app } from '@/lib/firebase';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';
import { cacheService, cacheKeys } from './CacheService';
import { CSRFProtectedClient } from '@/lib/csrf-client';

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
  private csrfClient: CSRFProtectedClient | null = null;

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // Set the CSRF client (should be called when the app initializes)
  setCSRFClient(client: CSRFProtectedClient) {
    this.csrfClient = client;
  }

  // Get CSRF client with error if not set
  private getCSRFClient(): CSRFProtectedClient {
    if (!this.csrfClient) {
      throw new Error('CSRF client not initialized. Please ensure CSRFProvider is set up.');
    }
    return this.csrfClient;
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
        userId
      });
    }
  }

  private async registerToken() {
    if (!this.messaging || !this.userId) return;

    try {
      // Get registration token
      const token = await getToken(this.messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
      });

      if (token && token !== this.currentToken) {
        this.currentToken = token;

        // Register token with backend
        await this.getCSRFClient().callFunction('registerDeviceToken', {
          token,
          platform: 'web',
          deviceInfo: {
            userAgent: navigator.userAgent,
            language: navigator.language
          }
        });

        console.log('FCM token registered successfully');
      }
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'register-fcm-token'
      });
    }
  }

  private setupMessageListener() {
    if (!this.messaging) return;

    onMessage(this.messaging, (payload) => {
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
        imageUrl: payload.notification?.image
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
      silent: false
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
          const result = await this.getCSRFClient().callFunction('getNotifications', { page, limit });
          const data = result.data as { notifications?: DynastyNotification[] };
          return data.notifications || [];
        },
        { ttl: 5 * 60 * 1000 } // 5 minutes
      );
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'get-notifications'
      });
      return [];
    }
  }

  async markAsRead(notificationIds: string[]): Promise<void> {
    try {
      await this.getCSRFClient().callFunction('markNotificationsRead', { notificationIds });

      // Invalidate cache
      if (this.userId) {
        cacheService.invalidatePattern(cacheKeys.notifications(this.userId));
      }
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'mark-notifications-read'
      });
    }
  }

  async updatePreferences(preferences: NotificationPreferences): Promise<void> {
    try {
      await this.getCSRFClient().callFunction('updateNotificationPreferences', { preferences });
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'update-notification-preferences'
      });
      throw error;
    }
  }

  async getPreferences(): Promise<NotificationPreferences> {
    try {
      const result = await this.getCSRFClient().callFunction('getNotificationPreferences', {});
      const data = result.data as { preferences: NotificationPreferences };
      return data.preferences;
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'get-notification-preferences'
      });
      
      // Return default preferences
      return {
        enabled: true,
        stories: true,
        events: true,
        messages: true,
        familyUpdates: true,
        sound: true,
        vibration: true
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
        await this.getCSRFClient().callFunction('unregisterDeviceToken', { token: this.currentToken });
      } catch (error) {
        console.error('Failed to unregister token:', error);
      }
    }

    this.currentToken = undefined;
    this.userId = undefined;
    this.isInitialized = false;
    this.messageListeners.clear();
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
    const unsubscribe = service.addMessageListener((notification) => {
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
    
    setNotifications(prev => 
      prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - ids.length));
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead
  };
}