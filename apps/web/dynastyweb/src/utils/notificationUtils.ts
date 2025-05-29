import { useState, useEffect } from 'react';
import { db, messaging } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { getToken, onMessage } from 'firebase/messaging';
import { CSRFProtectedClient } from '@/lib/csrf-client';

// Token registration lock to prevent race conditions
let isTokenRegistrationInProgress = false;

// CSRF client for API calls
let csrfClient: CSRFProtectedClient | null = null;

export function setNotificationUtilsCSRFClient(client: CSRFProtectedClient) {
  csrfClient = client;
}

function getCSRFClient(): CSRFProtectedClient {
  if (!csrfClient) {
    throw new Error('CSRF client not initialized for notificationUtils. Please ensure CSRFProvider is set up.');
  }
  return csrfClient;
}

// Notification types
export type NotificationType = 
  | 'story:new' 
  | 'story:liked' 
  | 'comment:new' 
  | 'comment:reply' 
  | 'event:invitation' 
  | 'event:updated' 
  | 'event:reminder'
  | 'family:invitation'
  | 'system:announcement';

// Notification interface
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
  createdAt: string;
  updatedAt: string;
}

// Function to register a device token
export const registerDeviceToken = async (token: string, platform: 'web' | 'ios' | 'android' = 'web') => {
  try {
    await getCSRFClient().callFunction('registerDeviceToken', { token, platform, deleteDuplicates: true });
    console.log('Device token registered successfully');
    return true;
  } catch (error) {
    console.error('Error registering device token:', error);
    return false;
  }
};

// Function to initialize Firebase messaging
export const initializeMessaging = async () => {
  // If registration is already in progress, wait
  if (isTokenRegistrationInProgress) {
    console.log('Token registration already in progress, waiting...');
    // Wait for the current registration to complete (using a delay)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if a token now exists in localStorage after waiting
    const existingToken = localStorage.getItem('fcm_token');
    if (existingToken) {
      console.log('Token was registered by another process');
      return existingToken;
    }
  }
  
  // Set the registration lock
  isTokenRegistrationInProgress = true;
  
  try {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && messaging) {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        isTokenRegistrationInProgress = false;
        return null;
      }
      
      // Check if we have a token in localStorage first
      const existingToken = localStorage.getItem('fcm_token');
      
      if (existingToken) {
        console.log('Reusing existing FCM token from localStorage');
        // Still register with backend to update lastActive timestamp
        await registerDeviceToken(existingToken);
        isTokenRegistrationInProgress = false;
        return existingToken;
      }
      
      // Register service worker explicitly
      const serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log('Service Worker registered successfully', serviceWorkerRegistration);
      
      // Get token
      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration
      });
      
      if (token) {
        // Save token to localStorage for reuse
        localStorage.setItem('fcm_token', token);
        // Register token with backend
        await registerDeviceToken(token);
        isTokenRegistrationInProgress = false;
        return token;
      } else {
        console.log('No token available');
        isTokenRegistrationInProgress = false;
        return null;
      }
    }
    isTokenRegistrationInProgress = false;
    return null;
  } catch (error) {
    console.error('Error initializing messaging:', error);
    isTokenRegistrationInProgress = false;
    return null;
  }
};

// Function to set up foreground notification handler
export const setupForegroundNotificationHandler = () => {
  try {
    if (!messaging) {
      console.error('Messaging is not initialized');
      return null;
    }
    
    return onMessage(messaging, (payload) => {
      console.log('Message received in foreground:', payload);
      
      // Display foreground notification using browser Notification API
      if (payload.notification) {
        const { title, body } = payload.notification;
        const notificationOptions = {
          body,
          icon: '/dynasty.png',
          data: payload.data,
        };
        
        // Show browser notification
        const notification = new Notification(title as string, notificationOptions);
        
        // Handle notification click
        notification.onclick = () => {
          const link = payload.data?.link || '/notifications';
          window.open(link, '_blank');
          notification.close();
        };
      }
    });
  } catch (error) {
    console.error('Error setting up foreground notification handler:', error);
    return null;
  }
};

// Function to log notification interactions
export const logNotificationInteraction = async (notificationId: string, action: 'viewed' | 'clicked' | 'dismissed') => {
  try {
    await getCSRFClient().callFunction('logNotificationInteraction', { notificationId, action });
    return true;
  } catch (error) {
    console.error('Error logging notification interaction:', error);
    return false;
  }
};

// Hook to get user notifications with real-time updates
export const useNotifications = (limit = 20, includeRead = true) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    // Create query for user's notifications
    let notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    
    // Apply read filter if needed
    if (!includeRead) {
      notificationsQuery = query(
        notificationsQuery,
        where('isRead', '==', false)
      );
    }
    
    // Subscribe to notifications with a limit
    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const notificationsList: Notification[] = snapshot.docs
          .slice(0, limit)
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              userId: data.userId,
              title: data.title,
              body: data.body,
              type: data.type,
              relatedItemId: data.relatedItemId,
              link: data.link,
              imageUrl: data.imageUrl,
              isRead: data.isRead,
              createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
              updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            };
          });
        
        setNotifications(notificationsList);
        setUnreadCount(snapshot.docs.filter(doc => !doc.data().isRead).length);
        setLoading(false);
      },
      (err) => {
        console.error('Error getting notifications:', err);
        setError('Failed to load notifications');
        setLoading(false);
      }
    );
    
    return () => unsubscribe();
  }, [currentUser, limit, includeRead]);
  
  // Function to mark a notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await getCSRFClient().callFunction('markNotificationRead', { notificationId });
      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  };
  
  // Function to mark all notifications as read
  const markAllAsRead = async () => {
    try {
      await getCSRFClient().callFunction('markAllNotificationsRead', {});
      return true;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return false;
    }
  };
  
  // Function to delete a notification
  const deleteNotification = async (notificationId: string) => {
    try {
      await getCSRFClient().callFunction('deleteNotification', { notificationId });
      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  };
  
  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}; 