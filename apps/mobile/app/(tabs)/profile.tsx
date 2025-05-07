import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Platform,
  TouchableOpacity,
  Image,
  ScrollView
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// Placeholder user data - replace with actual data from auth context or API
const userData = {
  name: 'Ruchit Patel',
  email: 'user@example.com',
  avatarUrl: 'https://via.placeholder.com/100', // Larger avatar for profile screen
  bio: 'Passionate about connecting family and preserving our shared history. Exploring our roots, one story at a time.',
  memberSince: 'Joined January 2023',
  familyConnections: 15, // Example stat
  storiesContributed: 7,  // Example stat
};

interface ProfileOption {
  id: string;
  title: string;
  icon: React.ReactNode;
  onPress: () => void;
  navigateTo?: string;
}

const ProfileScreen = () => {
  const router = useRouter();

  const profileOptions: ProfileOption[] = [
    {
      id: 'accountSettings',
      title: 'Account Settings',
      icon: <Ionicons name="settings-outline" size={24} color="#444" />,
      onPress: () => router.push('/(screens)/accountSettings'),
    },
    {
      id: 'myStories',
      title: 'My Authored Stories',
      icon: <MaterialCommunityIcons name="book-edit-outline" size={24} color="#444" />,
      onPress: () => router.push('/user/my-stories'), // Placeholder for actual route
    },
    {
      id: 'myEvents',
      title: 'My Created Events',
      icon: <Ionicons name="calendar-outline" size={24} color="#444" />,
      onPress: () => router.push('/user/my-events'), // Placeholder for actual route
    },
    {
      id: 'familyManagement',
      title: 'Family Management',
      icon: <Ionicons name="people-outline" size={24} color="#444" />,
      onPress: () => router.push('/family/manage'), // Placeholder for actual route
    },
    {
      id: 'help',
      title: 'Help & Support',
      icon: <Ionicons name="help-circle-outline" size={24} color="#444" />,
      onPress: () => router.push('/(screens)/helpSupport'), // Needs a Help/Support screen
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.profileInfoContainer}>
          <Image source={{ uri: userData.avatarUrl }} style={styles.avatar} />
          <Text style={styles.userName}>{userData.name}</Text>
          <Text style={styles.userEmail}>{userData.email}</Text>
          <Text style={styles.userBio}>{userData.bio}</Text>
          <Text style={styles.memberSince}>{userData.memberSince}</Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{userData.familyConnections}</Text>
            <Text style={styles.statLabel}>Connections</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{userData.storiesContributed}</Text>
            <Text style={styles.statLabel}>Stories</Text>
          </View>
        </View>

        <View style={styles.optionsContainer}>
          {profileOptions.map((item) => (
            <TouchableOpacity 
              key={item.id} 
              style={styles.optionItem}
              onPress={item.onPress}
            >
              <View style={styles.optionIcon}>{item.icon}</View>
              <Text style={styles.optionText}>{item.title}</Text>
              <Ionicons name="chevron-forward" size={20} color="#B0B0B0" />
            </TouchableOpacity>
          ))}
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
  profileInfoContainer: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 25,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 15,
    borderWidth: 3,
    borderColor: '#1A4B44',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  userEmail: {
    fontSize: 15,
    color: '#777',
    marginBottom: 10,
  },
  userBio: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 20,
  },
  memberSince: {
    fontSize: 12,
    color: '#888',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 10,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A4B44',
  },
  statLabel: {
    fontSize: 13,
    color: '#777',
    marginTop: 3,
  },
  optionsContainer: {
    marginTop: 0, // Removed margin as statsContainer has marginBottom
  },
  optionItem: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 18, // Slightly more padding
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  optionIcon: {
    marginRight: 15,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
});

export default ProfileScreen; 