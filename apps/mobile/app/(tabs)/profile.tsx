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

interface UserProfile {
  name: string;
  email: string;
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
  // const [userProfile, setUserProfile] = useState<UserProfile | null>(null); // Commented out
  // const [isLoading, setIsLoading] = useState<boolean>(true); // Commented out

  // Initialize with mock data
  const [userProfile, setUserProfile] = useState<UserProfile | null>({
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    bio: 'Loves coding and hiking.',
    joinDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
    connections: 150,
    stories: 25,
    profilePicture: null, // Or a placeholder image URI
    firstName: 'Jane',
    lastName: 'Doe',
    createdAt: new Date(),
  });
  const [isLoading, setIsLoading] = useState<boolean>(false); // Set to false as we are using mock data

  // Fetch user profile data and listen for real-time updates
  useFocusEffect(
    React.useCallback(() => {
      // Firebase data fetching logic commented out
      /*
      if (!auth.currentUser) {
        setIsLoading(false);
        setUserProfile(null); // Explicitly set to null
        return;
      }

      setIsLoading(true);
      const userId = auth.currentUser.uid;
      const userDocRef = db.collection('users').doc(userId); // CHANGED: RNFB style

      const unsubscribe = userDocRef.onSnapshot((docSnap) => { // CHANGED: RNFB style
        if (docSnap.exists) { // RNFB uses .exists as a boolean property
          const data = docSnap.data() as UserProfile;
          let joinDateString = 'N/A';
          // RNFB Timestamps are objects with toDate() method, no need to check for its existence if data.createdAt is a Firestore Timestamp
          if (data.createdAt && data.createdAt.toDate) {
            joinDateString = data.createdAt.toDate().toLocaleDateString('en-US', {
              year: 'numeric', month: 'long'
            });
          }
          setUserProfile({ ...data, joinDate: joinDateString, email: auth.currentUser?.email || data.email });
        } else {
          console.log("No such user document!");
          setUserProfile(null);
        }
        setIsLoading(false);
      }, (error) => {
        console.error("Error fetching user profile:", error);
        setIsLoading(false);
        Alert.alert("Error", "Could not fetch profile data.");
      });

      return () => unsubscribe();
      */
      // Simulate loading finished for mock data
      setIsLoading(false);
      // If you want to simulate a user not being "logged in" for UI testing:
      // setUserProfile(null); 
    }, [])
  );

  // Update header dynamically - Assuming Profile is a main tab, might not need back button
  // Or if it's presented modally sometimes?
  useEffect(() => {
    navigation.setOptions({
      title: 'Profile', // Set title for the tab screen header
      headerStyle: {
        backgroundColor: '#F8F8F8',
      },
      headerTintColor: '#333333',
      headerLargeTitle: true, // Use large title style like iOS settings
      headerLargeTitleStyle: {
          fontWeight: 'bold',
      },
      headerShadowVisible: false, // Remove shadow for cleaner look
    });
  }, [navigation]);

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

  if (!userProfile && !isLoading) {
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
  const displayName = userProfile?.name || `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || 'User';
  const displayEmail = userProfile?.email || 'No email';
  const displayBio = userProfile?.bio || 'No bio yet.';
  const displayJoinDate = userProfile?.joinDate || 'Not available';
  const displayProfilePic = userProfile?.profilePicture;

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
          <Text style={styles.profileEmail}>{displayEmail}</Text>
          <Text style={styles.profileBio}>{displayBio}</Text>
          <Text style={styles.profileJoinDate}>Joined {displayJoinDate}</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{userProfile?.connections || 0}</Text>
              <Text style={styles.statLabel}>Connections</Text>
            </View>
            <View style={styles.statSeparator} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{userProfile?.stories || 0}</Text>
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
    backgroundColor: '#F0F0F0',
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
  profileBio: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 21,
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