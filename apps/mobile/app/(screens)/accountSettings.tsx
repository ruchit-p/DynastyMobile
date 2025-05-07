import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, Alert } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth } from '../../src/lib/firebase';
import ListItem, { ListItemProps } from '../../components/ListItem'; // Import shared ListItem

// Reusable ListItem component - REMOVED
// interface ListItemProps { ... }
// const ListItem: React.FC<ListItemProps> = ({ icon, text, onPress }) => { ... };

const AccountSettingsScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      title: 'Account Settings',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/login');
    } catch (error) {
      console.error("Logout error:", error);
      Alert.alert("Logout Failed", error instanceof Error ? error.message : "An unexpected error occurred.");
    }
  };

  const settingsOptions: ListItemProps[] = [
    {
        icon: 'person-circle-outline',
        text: 'Edit Profile',
        onPress: () => router.push('/(screens)/editProfile'),
    },
    {
        icon: 'lock-closed-outline',
        text: 'Privacy Settings',
        onPress: () => router.push('/(screens)/privacySettings'),
    },
    {
        icon: 'notifications-outline',
        text: 'Notification Preferences',
        onPress: () => router.push('/(screens)/notificationPreferences'),
    },
    {
        icon: 'shield-checkmark-outline',
        text: 'Account Security',
        onPress: () => router.push('/(screens)/accountSecurity'),
    },
    {
        icon: 'help-circle-outline',
        text: 'Help & Support',
        onPress: () => router.push('/(screens)/helpAndSupport'),
    },
    {
        icon: 'information-circle-outline',
        text: 'About Dynasty',
        onPress: () => router.push('/(screens)/aboutDynasty'),
    },
    {
        icon: 'log-out-outline',
        text: 'Logout',
        onPress: handleLogout,
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={settingsOptions}
        keyExtractor={(item) => item.text}
        renderItem={({ item }) => <ListItem {...item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={() => (
          // Optional: Add user info header if needed, like in screenshot
          <View style={styles.userInfoHeader}>
            <Text style={styles.userName}>Ruchit Patel</Text>
            <Text style={styles.userEmail}>user@example.com</Text>
          </View>
        )}
        ListFooterComponent={() => (
            <Text style={styles.footerText}>Dynasty App v1.0.0</Text>
        )}
        style={styles.listContainer}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  listContainer: {
      flex: 1,
  },
  userInfoHeader: {
    paddingVertical: 30,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF', // White background for this section
    marginBottom: 20, // Space before the list items
  },
  userName: {
      fontSize: 22,
      fontWeight: 'bold',
      color: '#333',
      marginBottom: 5,
  },
  userEmail: {
      fontSize: 16,
      color: '#777',
  },
  separator: {
    height: StyleSheet.hairlineWidth, // Use hairline for subtle separator
    backgroundColor: '#E0E0E0',
    marginLeft: 15 + 24 + 15, // Align with text
  },
  footerText: {
      textAlign: 'center',
      paddingVertical: 20,
      fontSize: 14,
      color: '#999',
  }
});

export default AccountSettingsScreen; 