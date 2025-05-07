import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Platform,
  TouchableOpacity,
  Alert,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';

interface SettingsItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  onPress: () => void;
  isDestructive?: boolean;
}

const AccountSettingsScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();

  const userData = {
    name: 'Ruchit Patel',
    email: 'user@example.com',
    avatarUrl: 'https://via.placeholder.com/80',
    bio: 'Lover of family history and connecting with relatives.'
  };

  React.useEffect(() => {
    navigation.setOptions({
      title: 'Account Settings',
      headerTitleAlign: 'center',
    });
  }, [navigation]);

  const settingsItems: SettingsItem[] = [
    {
      id: 'editProfile',
      title: 'Edit Profile',
      icon: <Ionicons name="person-circle-outline" size={24} color="#1A4B44" />,
      onPress: () => router.push('/(screens)/editProfile'),
    },
    {
      id: 'privacy',
      title: 'Privacy Settings',
      icon: <Ionicons name="lock-closed-outline" size={24} color="#1A4B44" />,
      onPress: () => router.push('/(screens)/privacySecuritySettings'),
    },
    {
      id: 'notifications',
      title: 'Notification Preferences',
      icon: <Ionicons name="notifications-outline" size={24} color="#1A4B44" />,
      onPress: () => router.push('/(screens)/notificationSettings'),
    },
    {
      id: 'security',
      title: 'Account Security',
      icon: <Ionicons name="shield-checkmark-outline" size={24} color="#1A4B44" />,
      onPress: () => router.push('/(screens)/privacySecuritySettings'),
    },
    {
      id: 'help',
      title: 'Help & Support',
      icon: <Ionicons name="help-circle-outline" size={24} color="#1A4B44" />,
      onPress: () => router.push('/(screens)/helpSupport'),
    },
    {
      id: 'about',
      title: 'About Dynasty',
      icon: <Ionicons name="information-circle-outline" size={24} color="#1A4B44" />,
      onPress: () => router.push('/(screens)/aboutScreen'),
    },
    {
      id: 'logout',
      title: 'Logout',
      icon: <Ionicons name="log-out-outline" size={24} color="#D32F2F" />,
      onPress: () => {
        Alert.alert(
          'Logout',
          'Are you sure you want to logout?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', onPress: () => console.log('User logged out'), style: 'destructive' },
          ]
        );
      },
      isDestructive: true,
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.profileHeader}>
          <Image source={{ uri: userData.avatarUrl }} style={styles.avatar} />
          <Text style={styles.userName}>{userData.name}</Text>
          <Text style={styles.userEmail}>{userData.email}</Text>
        </View>

        {settingsItems.map((item) => (
          <TouchableOpacity 
            key={item.id} 
            style={styles.settingsItem}
            onPress={item.onPress}
          >
            <View style={styles.itemIcon}>{item.icon}</View>
            <Text style={[styles.settingsItemText, item.isDestructive && styles.destructiveText]}>
              {item.title}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#B0B0B0" />
          </TouchableOpacity>
        ))}
        
        <View style={styles.footer}>
            <Text style={styles.footerText}>Dynasty App v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
  profileHeader: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 20,
    paddingHorizontal: 15,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 10,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 10,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  userEmail: {
    fontSize: 14,
    color: '#777',
    marginTop: 2,
  },
  settingsItem: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  itemIcon: {
    marginRight: 15,
  },
  settingsItemText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  destructiveText: {
    color: '#D32F2F',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
});

export default AccountSettingsScreen; 