import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
// import { auth, db } from '../../src/lib/firebase'; // Commented out Firebase
import ListItem, { ListItemProps } from '../../components/ListItem';
import { useAuth } from '../contexts/AuthContext'; // Added AuthContext
// AppHeader might not be needed here if the _layout.tsx handles it for the 'profile' tab.
// However, if this screen can be pushed onto the stack independently, it might need its own header call.
// For now, let's assume _layout.tsx handles the primary tab header.

interface UserProfile { // This interface might become partially redundant or could be augmented by FirebaseUser
  name: string; // This will come from user.displayName
  email: string; // This will come from user.email
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
  const navigation = useNavigation();
  const { user, isLoading: authIsLoading, firestoreUser } = useAuth(); // Use AuthContext

  // isLoading state can now primarily rely on authIsLoading
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // This local userProfile state can be derived from auth context's user and firestoreUser
  const [userProfileData, setUserProfileData] = useState<UserProfile | null>(null);

  useEffect(() => {
    setIsLoading(authIsLoading);
    if (user) {
      // Combine Firebase Auth user data with Firestore user data
      const profile: UserProfile = {
        name: user.displayName || `${firestoreUser?.firstName || ''} ${firestoreUser?.lastName || ''}`.trim() || 'User',
        email: user.email || 'No email',
        phoneNumber: user.phoneNumber || firestoreUser?.phoneNumber,
        bio: firestoreUser?.bio,
        joinDate: user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleString('default', { month: 'long', year: 'numeric' }) : (firestoreUser?.createdAt ? new Date(firestoreUser.createdAt.toDate()).toLocaleString('default', { month: 'long', year: 'numeric' }) : 'N/A'),
        // connections and stories would typically come from Firestore or a dedicated backend
        connections: firestoreUser?.connectionsCount || 0, // Example, assuming this field exists in firestoreUser
        stories: firestoreUser?.storiesCount || 0,       // Example
        profilePicture: user.photoURL || firestoreUser?.profilePictureUrl,
        firstName: firestoreUser?.firstName || user.displayName?.split(' ')[0],
        lastName: firestoreUser?.lastName || user.displayName?.split(' ').slice(1).join(' '),
        createdAt: firestoreUser?.createdAt || (user.metadata?.creationTime ? new Date(user.metadata.creationTime) : undefined),
      };
      setUserProfileData(profile);
    } else {
      setUserProfileData(null);
    }
  }, [user, firestoreUser, authIsLoading]);

  // Fetch user profile data and listen for real-time updates
  // useFocusEffect can be used to refresh data if necessary, but AuthContext should provide live updates.
  // The existing useFocusEffect logic related to Firebase direct calls is removed as AuthContext handles it.

  // useEffect(() => {
  //   navigation.setOptions({
  //     title: 'Profile', // This is handled by _layout.tsx for the tab
  //     // AppHeader should be used via _layout.tsx for consistency
  //   });
  // }, [navigation]);

  const handleEditProfile = () => {
    router.push('/(screens)/editProfile');
  };

  const menuItems: ListItemProps[] = [
    {
      icon: 'settings-outline',
      text: 'Account Settings',
      onPress: () => router.push('/(screens)/accountSettings'), // TODO: Create this screen
    },
    {
      icon: 'book-outline',
      text: 'Story Settings', // Updated Text
      onPress: () => router.push('/(screens)/storySettings'), // TODO: Create this screen
    },
    {
      icon: 'calendar-outline',
      text: 'Events Settings', // Updated Text
      onPress: () => router.push('/(screens)/eventSettings'), // TODO: Create this screen
    },
    {
      icon: 'people-outline',
      text: 'Family Management',
      onPress: () => router.push('/(screens)/familyManagement'), // TODO: Create this screen
    },
    {
      icon: 'help-circle-outline',
      text: 'Help & Support',
      onPress: () => router.push('/(screens)/helpAndSupport'), // TODO: Create this screen
    },
  ];

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0A5C36" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!userProfileData && !isLoading) { // Check userProfileData derived from context
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#888" />
          <Text style={styles.loadingText}>Could not load profile.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Display actual user data
  const displayName = userProfileData?.name || 'User';
  const displayEmailOrPhone = userProfileData?.email || userProfileData?.phoneNumber || 'No contact info';
  
  // Ensure joinDate is formatted correctly if it comes from a different source
  let displayJoinDate = 'Not available';
  if (userProfileData?.joinDate) {
    displayJoinDate = userProfileData.joinDate;
  } else if (userProfileData?.createdAt) { // Fallback to createdAt if joinDate is not present
    try {
        const date = userProfileData.createdAt.toDate ? userProfileData.createdAt.toDate() : new Date(userProfileData.createdAt);
        displayJoinDate = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    } catch (e) {
        console.warn("Could not parse createdAt for join date:", userProfileData.createdAt);
    }
  }

  const displayProfilePic = userProfileData?.profilePicture;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={handleEditProfile} style={styles.profilePicContainer}>
            <Image 
              source={displayProfilePic ? { uri: displayProfilePic } : require('../../assets/images/avatar-placeholder.png')} 
              style={styles.profilePic} 
            />
            <View style={styles.editIconOverlay}>
              <Ionicons name="pencil-outline" size={18} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{displayEmailOrPhone}</Text>
          <Text style={styles.profileJoinDate}>Joined {displayJoinDate}</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{userProfileData?.connections || 0}</Text>
              <Text style={styles.statLabel}>Family Members</Text>
            </View>
            <View style={styles.statSeparator} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{userProfileData?.stories || 0}</Text>
              <Text style={styles.statLabel}>Stories</Text>
            </View>
          </View>
        </View>

        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <React.Fragment key={item.text}>
              <ListItem icon={item.icon} text={item.text} onPress={item.onPress} />
              {index < menuItems.length - 1 && <View style={styles.separator} />}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
  container: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF', // White background for profile header section
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  profilePicContainer: {
    position: 'relative', // Needed for icon overlay
    marginBottom: 15,
  },
  profilePic: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#E0E0E0',
  },
  editIconOverlay: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 8,
    borderRadius: 15,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 16,
    color: '#777',
    marginBottom: 15,
  },
  profileJoinDate: {
      fontSize: 14,
      color: '#999',
      marginBottom: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '80%',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 14,
    color: '#777',
    marginTop: 4,
  },
  statSeparator: {
      width: 1,
      height: '70%',
      backgroundColor: '#EFEFEF',
      alignSelf: 'center',
  },
  menuContainer: {
    marginTop: 20,
    marginHorizontal: 10, // Add some horizontal margin
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    overflow: 'hidden', // Clip separator lines
    borderWidth: 1, // Optional: Add border around the menu block
    borderColor: '#E0E0E0',
  },
  separator: {
    height: 1,
    backgroundColor: '#EFEFEF',
    marginLeft: 15 + 24 + 15, // padding + icon width + margin
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
});

export default ProfileScreen; 