import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { getNotificationService } from '../../src/services/NotificationService';
import { Colors } from '../../constants/Colors';

interface NotificationBellProps {
  color?: string;
  size?: number;
}

export default function NotificationBell({ color = Colors.light.primary, size = 24 }: NotificationBellProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setUnreadCount(0);
      return;
    }

    const notificationService = getNotificationService();
    
    // Subscribe to notifications to get unread count
    const unsubscribeFn = notificationService.subscribeToNotifications(
      user.uid,
      (notifications) => {
        const unread = notifications.filter(n => !n.isRead).length;
        setUnreadCount(unread);
      }
    );

    setUnsubscribe(() => unsubscribeFn);

    return () => {
      if (unsubscribeFn) {
        unsubscribeFn();
      }
    };
  }, [user?.uid]);

  const handlePress = () => {
    router.push('/(screens)/notifications');
  };

  return (
    <TouchableOpacity onPress={handlePress} style={styles.container}>
      <Ionicons name="notifications-outline" size={size} color={color} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    padding: 8,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: Colors.light.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: Colors.light.background.primary,
    fontSize: 11,
    fontWeight: 'bold',
  },
});