import React, { useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList } from '../../components/ui/FlashList';
import { useRouter, useNavigation } from 'expo-router';
import AppHeader from '../../components/ui/AppHeader';
import IconButton, { IconSet } from '../../components/ui/IconButton';
import { Ionicons } from '@expo/vector-icons'; // For placeholder icons
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { useAuth } from '../../src/contexts/AuthContext';
import { getNotificationService, Notification, NotificationType } from '../../src/services/NotificationService';
import { format, formatDistanceToNow } from 'date-fns';
import { Colors } from '../../constants/Colors';

// Format timestamp helper
const formatTimestamp = (timestamp: any): string => {
  try {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return formatDistanceToNow(date, { addSuffix: true });
    } else {
      return format(date, 'MMM d, h:mm a');
    }
  } catch (error) {
    return 'Unknown time';
  }
};

// Get icon for notification type
const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'story:new':
    case 'story:liked':
    case 'story:tagged':
      return 'book-outline';
    case 'comment:new':
    case 'comment:reply':
      return 'chatbubble-outline';
    case 'event:invitation':
    case 'event:updated':
    case 'event:reminder':
    case 'event:rsvp':
      return 'calendar-outline';
    case 'family:invitation':
      return 'people-outline';
    case 'message:new':
      return 'mail-outline';
    case 'system:announcement':
      return 'megaphone-outline';
    default:
      return 'notifications-outline';
  }
};

const NotificationsScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);
  
  // Initialize error handler for this screen
  const { handleError, withErrorHandling, isError, error, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Notifications Error',
    trackCurrentScreen: true
  });

  const notificationService = getNotificationService();

  // Clear local errors when global error state resets
  useEffect(() => {
    if (!isError && error === null) {
      // Global error state was reset, clear any local error state if needed
    }
  }, [isError, error]);

  // Load notifications
  const loadNotifications = useCallback(withErrorHandling(async (showLoading = true) => {
    if (!user?.uid) return;
    
    try {
      if (showLoading) setIsLoading(true);
      
      const fetchedNotifications = await notificationService.getNotifications(user.uid);
      setNotifications(fetchedNotifications);
    } catch (err) {
      handleError(err, {
        action: 'loadNotifications',
        severity: ErrorSeverity.ERROR
      });
      throw err;
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }), [user, notificationService, handleError]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user?.uid) return;

    // Load initial notifications
    loadNotifications();

    // Subscribe to real-time updates
    const unsubscribeFn = notificationService.subscribeToNotifications(
      user.uid,
      (updatedNotifications) => {
        setNotifications(updatedNotifications);
      }
    );

    setUnsubscribe(() => unsubscribeFn);

    return () => {
      if (unsubscribeFn) {
        unsubscribeFn();
      }
    };
  }, [user?.uid, loadNotifications, notificationService]);

  // Set up notification press listener
  useEffect(() => {
    notificationService.setNotificationPressListener((notification) => {
      // Handle navigation based on notification type
      if (notification.link) {
        router.push(notification.link as any);
      } else if (notification.type === 'message:new' && notification.relatedItemId) {
        router.push({
          pathname: '/(screens)/chatDetail',
          params: { chatId: notification.relatedItemId }
        });
      } else if ((notification.type === 'event:invitation' || notification.type === 'event:updated' || notification.type === 'event:rsvp') && notification.relatedItemId) {
        router.push({
          pathname: '/(screens)/eventDetail',
          params: { eventId: notification.relatedItemId }
        });
      } else if (notification.type.startsWith('story:') && notification.relatedItemId) {
        router.push({
          pathname: '/(screens)/storyDetail',
          params: { storyId: notification.relatedItemId }
        });
      }
    });
  }, [router]);

  const handleMarkAllAsRead = withErrorHandling(async () => {
    if (!user?.uid) return;
    
    try {
      await notificationService.markAllAsRead(user.uid);
      
      // Update local state to mark all as read
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      handleError(err, {
        action: 'markAllAsRead',
        notificationCount: notifications.length
      });
      throw err;
    }
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      header: (props: any) => (
        <AppHeader
          title="Notifications"
          headerLeft={() => (
            <IconButton
              iconName="arrow-back"
              iconSet={IconSet.Ionicons}
              size={28}
              color={Colors.primary}
              onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)/feed')}
              accessibilityLabel="Go back"
            />
          )}
          headerRight={() => (
            <IconButton
              iconName="checkmark-done" // Using Ionicons' double checkmark
              iconSet={IconSet.Ionicons}
              size={28}
              color={notifications.length > 0 ? Colors.primary : Colors.gray}
              onPress={notifications.length > 0 ? () => handleMarkAllAsRead() : () => {}}
              accessibilityLabel="Mark all notifications as read"
            />
          )}
        />
      ),
    });
  }, [navigation, notifications, router]); // Added router to dependencies

  const handleNotificationPress = withErrorHandling(async (item: Notification) => {
    try {
      if (!item.isRead) {
        await notificationService.markAsRead(item.id);
        
        setNotifications(prev =>
          prev.map(n => (n.id === item.id ? { ...n, isRead: true } : n))
        );
      }
      
      // Navigate based on notification type and data
      if (item.link) {
        router.push(item.link as any);
      } else if (item.type === 'message:new' && item.relatedItemId) {
        router.push({
          pathname: '/(screens)/chatDetail',
          params: { chatId: item.relatedItemId }
        });
      } else if ((item.type === 'event:invitation' || item.type === 'event:updated' || item.type === 'event:rsvp') && item.relatedItemId) {
        router.push({
          pathname: '/(screens)/eventDetail',
          params: { eventId: item.relatedItemId }
        });
      } else if (item.type.startsWith('story:') && item.relatedItemId) {
        router.push({
          pathname: '/(screens)/storyDetail',
          params: { storyId: item.relatedItemId }
        });
      }
    } catch (err) {
      handleError(err, {
        action: 'markNotificationAsRead',
        notificationId: item.id,
        notificationType: item.type,
        navigateTo: item.link
      });
      throw err;
    }
  });

  const handleDismissNotification = withErrorHandling(async (id: string) => {
    try {
      await notificationService.deleteNotification(id);
      
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      handleError(err, {
        action: 'dismissNotification',
        notificationId: id
      });
      throw err;
    }
  });

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadNotifications(false);
  }, [loadNotifications]);
  
  const renderNotificationItem = ({ item }: { item: Notification }) => {
    try {
      const iconName = getNotificationIcon(item.type);
      
      return (
        <TouchableOpacity
          style={[
            styles.notificationItem,
            !item.isRead && styles.unreadItem,
          ]}
          onPress={() => handleNotificationPress(item)}
        >
          <View style={styles.avatarContainer}>
            <View style={[styles.avatarPlaceholder, !item.isRead && styles.unreadAvatar]}>
              <Ionicons name={iconName as any} size={24} color={!item.isRead ? Colors.light.primary : Colors.light.icon.secondary} />
            </View>
          </View>
          <View style={styles.notificationContent}>
            <Text style={[styles.notificationTitle, !item.isRead && styles.unreadText]}>
              {item.title}
            </Text>
            <Text style={styles.notificationBody} numberOfLines={2}>
              {item.body}
            </Text>
            <Text style={styles.timestamp}>
              {formatTimestamp(item.createdAt)}
            </Text>
          </View>
          <IconButton
            iconName="close-circle-outline"
            iconSet={IconSet.Ionicons}
            size={22}
            color={Colors.light.icon.secondary}
            onPress={() => handleDismissNotification(item.id)}
            style={styles.dismissButton}
            accessibilityLabel={`Dismiss notification`}
          />
        </TouchableOpacity>
      );
    } catch (err) {
      handleError(err, {
        action: 'renderNotificationItem',
        notificationId: item?.id,
        notificationType: item?.type
      });
      
      // Return a fallback UI for this item
      return (
        <View style={styles.notificationItem}>
          <Text style={styles.notificationText}>Error loading notification</Text>
        </View>
      );
    }
  };

  if (isLoading && notifications.length === 0) {
    return (
      <ErrorBoundary screenName="NotificationsScreen">
        <View style={[styles.container, styles.centerContainer]}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      </ErrorBoundary>
    );
  }

  if (notifications.length === 0 && !isLoading) {
    return (
      <ErrorBoundary screenName="NotificationsScreen">
        <View style={styles.container}>
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={60} color={Colors.light.icon.secondary} />
            <Text style={styles.emptyText}>No Notifications</Text>
            <Text style={styles.emptySubText}>
              When you have new interactions like comments, likes, or family updates, 
              they&apos;ll appear here.
            </Text>
          </View>
        </View>
      </ErrorBoundary>
    );
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <ErrorBoundary screenName="NotificationsScreen">
      <View style={styles.container}>
        {unreadCount > 0 && (
          <View style={styles.unreadHeader}>
            <Text style={styles.unreadHeaderText}>
              {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
            </Text>
          </View>
        )}
        <FlashList
          data={notifications}
          renderItem={renderNotificationItem}
          keyExtractor={item => item.id}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          estimatedItemSize={80}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={[Colors.light.primary]}
              tintColor={Colors.light.primary}
            />
          }
        />
      </View>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background.primary,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: Colors.light.background.primary,
    alignItems: 'center',
  },
  unreadItem: {
    backgroundColor: Colors.light.background.secondary,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.primary,
  },
  avatarContainer: {
    marginRight: 15,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadAvatar: {
    backgroundColor: Colors.light.primary + '20', // 20% opacity
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text.primary,
    marginBottom: 2,
  },
  notificationBody: {
    fontSize: 14,
    color: Colors.light.text.secondary,
    marginBottom: 4,
  },
  unreadText: {
    color: Colors.light.primary,
  },
  notificationText: {
    fontSize: 15,
    color: Colors.light.text.primary,
    marginBottom: 3,
  },
  userName: {
    fontWeight: 'bold',
    color: Colors.light.primary,
  },
  timestamp: {
    fontSize: 12,
    color: Colors.light.text.tertiary,
  },
  dismissButton: {
    marginLeft: 10,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.light.border.default,
    marginLeft: 70, // Align with text content, not avatar
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.light.text.primary,
    marginTop: 15,
  },
  emptySubText: {
    fontSize: 14,
    color: Colors.light.text.secondary,
    textAlign: 'center',
    marginTop: 5,
  },
  unreadHeader: {
    backgroundColor: Colors.light.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
  },
  unreadHeaderText: {
    color: Colors.light.background.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default NotificationsScreen; 