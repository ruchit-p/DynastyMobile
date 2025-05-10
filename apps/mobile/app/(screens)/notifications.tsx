import React, { useState, useLayoutEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import AppHeader from '../../components/ui/AppHeader';
import IconButton, { IconSet } from '../../components/ui/IconButton';
import { Ionicons } from '@expo/vector-icons'; // For placeholder icons

// Placeholder for Colors (ideally from a central theme file)
const Colors = {
  primary: '#1A4B44', // From your _layout.tsx
  white: '#FFFFFF',
  lightGray: '#F0F0F0',
  gray: '#888888',
  darkGray: '#333333',
  accent: '#FF6347', // Example accent color for unread items
};

// Define the shape of a notification
interface Notification {
  id: string;
  user: {
    name: string;
    avatarUrl?: string; // Optional: if you have actual avatar URLs
  };
  text: string;
  timestamp: Date;
  isRead: boolean;
  navigateTo?: string; // Route path, e.g., '/(screens)/postDetail'
  params?: Record<string, any>; // Params for the route
  type: 'like' | 'comment' | 'follow' | 'event_reminder' | 'new_post'; // Example types
}

// Mock Data
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    user: { name: 'Alice Wonderland' },
    text: 'liked your recent story about the Mad Hatter.',
    timestamp: new Date(Date.now() - 3600000 * 2), // 2 hours ago
    isRead: false,
    navigateTo: '/(screens)/storyDetail', // Example route
    params: { storyId: 'story123' },
    type: 'like',
  },
  {
    id: '2',
    user: { name: 'Bob The Builder' },
    text: 'commented: "Can we fix it? Yes, we can!"',
    timestamp: new Date(Date.now() - 3600000 * 5), // 5 hours ago
    isRead: true,
    navigateTo: '/(screens)/storyDetail', // Example route
    params: { storyId: 'story456', commentId: 'comment789' },
    type: 'comment',
  },
  {
    id: '3',
    user: { name: 'Charlie Chaplin' },
    text: 'started following you.',
    timestamp: new Date(Date.now() - 3600000 * 24), // 1 day ago
    isRead: false,
    navigateTo: '/(screens)/ViewProfileScreen', // Example route
    params: { userId: 'charlieC' },
    type: 'follow',
  },
  {
    id: '4',
    user: { name: 'Dynasty System' },
    text: 'Reminder: Family Reunion event is tomorrow!',
    timestamp: new Date(Date.now() - 3600000 * 48), // 2 days ago
    isRead: true,
    navigateTo: '/(screens)/eventDetail',
    params: { eventId: 'eventXYZ' },
    type: 'event_reminder',
  },
];

const NotificationsScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);

  const handleMarkAllAsRead = () => {
    setNotifications([]); // Clear all notifications
    // You might want to also inform the user, e.g., with a toast message
    // Potentially call an API to mark all as read on the server
  };

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
              color={Colors.primary}
              onPress={handleMarkAllAsRead}
              accessibilityLabel="Mark all notifications as read"
            />
          )}
        />
      ),
    });
  }, [navigation, notifications]); // Re-render header if notifications change (e.g. to disable button if all read)

  const handleNotificationPress = (item: Notification) => {
    if (!item.isRead) {
      setNotifications(prev =>
        prev.map(n => (n.id === item.id ? { ...n, isRead: true } : n))
      );
    }
    if (item.navigateTo) {
      router.push(item.navigateTo as any); // `as any` for now, ensure paths are valid
    }
  };

  const handleDismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    // Potentially call an API to dismiss/delete notification
  };
  
  const renderNotificationItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        !item.isRead && styles.unreadItem,
      ]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={styles.avatarContainer}>
        {item.user.avatarUrl ? (
          <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person-outline" size={24} color={Colors.primary} />
          </View>
        )}
      </View>
      <View style={styles.notificationContent}>
        <Text style={styles.notificationText}>
          <Text style={styles.userName}>{item.user.name}</Text> {item.text}
        </Text>
        <Text style={styles.timestamp}>
          {item.timestamp.toLocaleDateString()} - {item.timestamp.toLocaleTimeString()}
        </Text>
      </View>
      <IconButton
        iconName="close-circle-outline"
        iconSet={IconSet.Ionicons}
        size={22}
        color={Colors.gray}
        onPress={() => handleDismissNotification(item.id)}
        style={styles.dismissButton}
        accessibilityLabel={`Dismiss notification from ${item.user.name}`}
      />
    </TouchableOpacity>
  );

  if (notifications.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={60} color={Colors.gray} />
          <Text style={styles.emptyText}>No notifications yet.</Text>
          <Text style={styles.emptySubText}>Check back later for updates!</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* AppHeader is now set via navigation.setOptions */}
      <FlatList
        data={notifications}
        renderItem={renderNotificationItem}
        keyExtractor={item => item.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: Colors.white,
    alignItems: 'center',
  },
  unreadItem: {
    backgroundColor: Colors.lightGray, // Or a more distinct color like a light shade of primary/accent
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
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
    backgroundColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
  },
  notificationText: {
    fontSize: 15,
    color: Colors.darkGray,
    marginBottom: 3,
  },
  userName: {
    fontWeight: 'bold',
    color: Colors.primary,
  },
  timestamp: {
    fontSize: 12,
    color: Colors.gray,
  },
  dismissButton: {
    marginLeft: 10,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.lightGray,
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
    color: Colors.darkGray,
    marginTop: 15,
  },
  emptySubText: {
    fontSize: 14,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 5,
  },
});

export default NotificationsScreen; 