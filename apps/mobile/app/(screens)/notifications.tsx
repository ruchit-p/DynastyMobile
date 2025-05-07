import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Platform,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Stack, useFocusEffect, useNavigation } from 'expo-router'; // For potential navigation from notifications

// Re-using the same interface and mock data from the (screens) version for consistency
interface Notification {
  id: string;
  type: 'like' | 'comment' | 'event_reminder' | 'new_story' | 'general';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  avatarUrl?: string;
  relatedContentId?: string;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'like',
    title: 'New Like',
    message: 'Sarah liked your recent story about your family vacation.',
    timestamp: '15m ago',
    read: false,
    avatarUrl: 'https://via.placeholder.com/40',
    relatedContentId: 'story123',
  },
  {
    id: '2',
    type: 'comment',
    title: 'New Comment',
    message: 'John commented: "Looks like a lot of fun!"',
    timestamp: '1h ago',
    read: true,
    avatarUrl: 'https://via.placeholder.com/40',
    relatedContentId: 'story123',
  },
  // ... add more mock notifications if desired or keep as is from previous screen
];

const NotificationsScreen = () => { // Renamed from TabNotificationsScreen
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const router = useRouter();
  const navigation = useNavigation();

  const handleNotificationPress = (notification: Notification) => {
    if (notification.relatedContentId) {
      // Example navigation, adjust path as per your routing structure for content
      // router.push(`/content/${notification.type}/${notification.relatedContentId}`);
      Alert.alert('Navigate', `Would navigate to ${notification.type} ID: ${notification.relatedContentId}`);
    } else {
      Alert.alert(notification.title, notification.message);
    }
    setNotifications(prev => 
      prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
    );
  };

  const handleClearAllRead = () => {
    const unreadCount = notifications.filter(n => !n.read).length;
    if (notifications.length === 0 || unreadCount === notifications.length) {
        Alert.alert("No Read Notifications", "There are no read notifications to clear at the moment.");
        return;
    }

    Alert.alert(
      "Clear Read Notifications",
      "Are you sure you want to clear all read notifications? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear Read", 
          onPress: () => setNotifications(prev => prev.filter(n => !n.read)), 
          style: "destructive" 
        }
      ]
    );
  };
  
  const handleMarkAllAsRead = () => {
     if (notifications.every(n => n.read)) {
        Alert.alert("All Read", "All notifications are already marked as read.");
        return;
    }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    Alert.alert("Marked All As Read", "All notifications have been marked as read.");
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Notifications', // Ensure correct title
      headerRight: () => (
        <TouchableOpacity onPress={handleMarkAllAsRead} style={{ marginRight: 15 }}>
          <Ionicons name="checkmark-done-outline" size={28} color="#1A4B44" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleMarkAllAsRead]);

  useFocusEffect(
    useCallback(() => {
      // This function runs when the screen comes into focus
      // Nothing specific to do on focus for this requirement

      return () => {
        // This function runs when the screen loses focus
        setNotifications(prevNotifications => prevNotifications.filter(n => !n.read));
      };
    }, []) // Empty dependency array means this effect doesn't re-run unless component unmounts/remounts
  );

  const renderNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'like':
        return <Ionicons name="heart" size={24} color="#FF6347" />;
      case 'comment':
        return <Ionicons name="chatbubble-ellipses" size={24} color="#1E90FF" />;
      case 'event_reminder':
        return <Ionicons name="calendar" size={24} color="#32CD32" />;
      case 'new_story':
        return <MaterialCommunityIcons name="book-open-page-variant" size={24} color="#FFBF00" />;
      default:
        return <Ionicons name="notifications" size={24} color="#888" />;
    }
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity 
      style={[styles.notificationItem, !item.read && styles.unreadItem]} 
      onPress={() => handleNotificationPress(item)}
    >
      <View style={styles.notificationIconContainer}>
        {renderNotificationIcon(item.type)}
      </View>
      <View style={styles.notificationContent}>
        <Text style={styles.notificationTitle}>{item.title}</Text>
        <Text style={styles.notificationMessage} numberOfLines={2}>{item.message}</Text>
        <Text style={styles.notificationTimestamp}>{item.timestamp}</Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* <Stack.Screen options={{ title: 'Notifications' }} /> */}
      {/* Custom pageHeader View removed - Header is now managed by Tab Navigator options */}
      
      {notifications.length === 0 ? (
        <View style={styles.emptyStateContainer}>
            <MaterialCommunityIcons name="bell-off-outline" size={60} color="#CCC" />
            <Text style={styles.emptyStateText}>No Notifications</Text>
            <Text style={styles.emptyStateSubText}>You&apos;re all caught up!</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          style={styles.listContainer}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  listContainer: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
  notificationItem: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadItem: {
    backgroundColor: '#E8F5E9', 
  },
  notificationIconContainer: {
    marginRight: 15,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 3,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  notificationTimestamp: {
    fontSize: 12,
    color: '#888',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1A4B44',
    marginLeft: 10,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F4F4F4',
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#555',
    marginTop: 15,
  },
  emptyStateSubText: {
    fontSize: 14,
    color: '#777',
    marginTop: 5,
    textAlign: 'center',
  },
});

export default NotificationsScreen; // Renamed from TabNotificationsScreen 