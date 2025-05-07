'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { 
  initializeMessaging, 
  setupForegroundNotificationHandler,
  useNotifications,
  Notification 
} from '@/utils/notificationUtils';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (notificationId: string) => Promise<boolean>;
  markAllAsRead: () => Promise<boolean>;
  deleteNotification: (notificationId: string) => Promise<boolean>;
  isTokenRegistered: boolean;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  loading: false,
  markAsRead: async () => false,
  markAllAsRead: async () => false,
  deleteNotification: async () => false,
  isTokenRegistered: false,
});

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  const [isTokenRegistered, setIsTokenRegistered] = useState<boolean>(false);
  const setupComplete = useRef<boolean>(false);
  
  const { 
    notifications, 
    unreadCount, 
    loading, 
    markAsRead, 
    markAllAsRead,
    deleteNotification
  } = useNotifications();
  
  // Initialize FCM
  useEffect(() => {
    if (!currentUser) {
      setIsTokenRegistered(false);
      setupComplete.current = false;
      return;
    }
    
    // Skip if already set up for this user
    if (setupComplete.current) {
      return;
    }
    
    let unsubscribe: (() => void) | null = null;
    
    const setupMessaging = async () => {
      try {
        // Initialize messaging and register token
        const token = await initializeMessaging();
        setIsTokenRegistered(!!token);
        
        if (token) {
          // Set up foreground notification handler
          unsubscribe = setupForegroundNotificationHandler();
          // Mark setup as complete for this user session
          setupComplete.current = true;
        }
      } catch (error) {
        console.error('Error setting up messaging:', error);
      }
    };
    
    setupMessaging();
    
    // Clean up
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser]);
  
  const value = {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    isTokenRegistered,
  };
  
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotificationContext = () => useContext(NotificationContext); 