import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import AppHeader from '../../components/ui/AppHeader';
import ListItem, { ListItemProps } from '../../components/ListItem';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';

interface UserProfile {
  name: string;
  email: string;
  phoneNumber?: string;
  bio?: string;
  joinDate?: string;
  connections?: number;
  stories?: number;
  profilePicture?: string | null;
  firstName?: string;
  lastName?: string;
  createdAt?: any;
}

const ProfileScreen = () => {
  const router = useRouter();
  const scheme = useColorScheme();
  const colorScheme: 'light' | 'dark' = scheme === 'dark' ? 'dark' : 'light';
  const currentColors = Colors[colorScheme];

  const [userProfile, setUserProfile] = useState<UserProfile | null>({
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    joinDate: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
    connections: 150,
    stories: 25,
    profilePicture: null,
    firstName: 'Jane',
    lastName: 'Doe',
    createdAt: new Date(),
    phoneNumber: '123-456-7890',
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useFocusEffect(
    React.useCallback(() => {
      setIsLoading(false);
    }, [])
  );

  const handleEditProfile = () => {
    router.push('/(screens)/editProfile' as any);
  };

  const menuItems: ListItemProps[] = [
    {
      icon: 'settings-outline',
      text: 'Account Settings',
      onPress: () => router.push('/(screens)/accountSettings' as any),
    },
    {
      icon: 'book-outline',
      text: 'Story Settings',
      onPress: () => router.push('/(screens)/storySettings' as any),
    },
    {
      icon: 'calendar-outline',
      text: 'Events Settings',
      onPress: () => router.push('/(screens)/eventSettings' as any),
    },
    {
      icon: 'people-outline',
      text: 'Family Management',
      onPress: () => router.push('/(screens)/familyManagement' as any),
    },
    {
      icon: 'help-circle-outline',
      text: 'Help & Support',
      onPress: () => router.push('/(screens)/helpAndSupport' as any),
    },
  ];

  if (isLoading) {
    return (
      <View style={[styles.safeArea, { backgroundColor: currentColors.background }]}>
        <AppHeader title="Profile" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentColors.primary} />
          <Text style={[styles.loadingText, { color: currentColors.text }]}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  if (!userProfile && !isLoading) {
    return (
      <View style={[styles.safeArea, { backgroundColor: currentColors.background }]}>
        <AppHeader title="Profile" />
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={40} color={currentColors.textSecondary} />
          <Text style={[styles.loadingText, { color: currentColors.text }]}>Could not load profile.</Text>
        </View>
      </View>
    );
  }

  const displayName = userProfile?.name || `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || 'User';
  const displayEmailOrPhone = userProfile?.email || userProfile?.phoneNumber || 'No contact info';
  
  let displayJoinDate = 'May 2025';
  if (userProfile?.joinDate) {
    try {
      const date = new Date(userProfile.joinDate);
      if (!isNaN(date.getTime())) {
        displayJoinDate = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      } else if (typeof userProfile.joinDate === 'string') {
        displayJoinDate = userProfile.joinDate; 
      }
    } catch (e) {
      if (typeof userProfile.joinDate === 'string') { 
        displayJoinDate = userProfile.joinDate;
      }
      console.warn("Could not parse joinDate:", userProfile.joinDate);
    }
  } else if (userProfile?.createdAt) {
    try {
        const date = userProfile.createdAt.toDate ? userProfile.createdAt.toDate() : new Date(userProfile.createdAt);
        if (!isNaN(date.getTime())) {
           displayJoinDate = date.toLocaleString('default', { month: 'long', year: 'numeric' });
        }
    } catch (e) {
        console.warn("Could not parse createdAt for join date:", userProfile.createdAt);
    }
  }

  const displayProfilePic = userProfile?.profilePicture;

  return (
    <View style={[styles.safeArea, { backgroundColor: currentColors.background }]}>
      <AppHeader title="Profile" />
      <ScrollView style={styles.container}>
        <View style={[styles.profileHeader, { backgroundColor: currentColors.surface }]}>
          <TouchableOpacity onPress={handleEditProfile} style={styles.profilePicContainer}>
            <Image 
              source={displayProfilePic ? { uri: displayProfilePic } : require('../../assets/images/avatar-placeholder.png')} 
              style={styles.profilePic} 
            />
            <View style={styles.editIconOverlay}>
              <Ionicons name="pencil-outline" size={18} color={Colors.light.background} />
            </View>
          </TouchableOpacity>
          <Text style={[styles.profileName, { color: currentColors.text }]}>{displayName}</Text>
          <Text style={[styles.profileEmail, { color: currentColors.textSecondary }]}>{displayEmailOrPhone}</Text>
          <Text style={[styles.profileJoinDate, { color: currentColors.textSecondary }]}>Joined {displayJoinDate}</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: currentColors.text }]}>{userProfile?.connections || 0}</Text>
              <Text style={[styles.statLabel, { color: currentColors.textSecondary }]}>Family Members</Text>
            </View>
            <View style={[styles.statSeparator, { backgroundColor: currentColors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: currentColors.text }]}>{userProfile?.stories || 0}</Text>
              <Text style={[styles.statLabel, { color: currentColors.textSecondary }]}>Stories</Text>
            </View>
          </View>
        </View>

        <View style={[styles.menuContainer, { backgroundColor: currentColors.surface }]}>
          {menuItems.map((item, index) => (
            <React.Fragment key={item.text}>
              <ListItem 
                icon={item.icon} 
                text={item.text} 
                onPress={item.onPress} 
                iconColor={currentColors.primary}
                textColor={currentColors.text}
              />
              {index < menuItems.length - 1 && <View style={[styles.separator, { backgroundColor: currentColors.border }]} />}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 15,
  },
  profilePicContainer: {
    marginBottom: 15,
    position: 'relative',
  },
  profilePic: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: Colors.light.primary,
  },
  editIconOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.light.primary,
    borderRadius: 15,
    padding: 6,
    borderWidth: 2,
    borderColor: Colors.light.background,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    marginBottom: 8,
  },
  profileJoinDate: {
    fontSize: 12,
    marginBottom: 15,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    maxWidth: 300,
    paddingVertical: 10,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  statSeparator: {
    width: 1,
    marginHorizontal: 10,
  },
  menuContainer: {
    marginTop: 10,
    borderRadius: 8,
    marginHorizontal: 10,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
  },
  separator: {
    height: 1,
    marginLeft: 58,
  },
});

export default ProfileScreen; 