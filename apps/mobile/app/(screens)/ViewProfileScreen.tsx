import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Image, useColorScheme, Platform } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors'; // Import Colors properly as a named export
import AppHeader from '../../components/ui/AppHeader'; // Import AppHeader
import type { StackHeaderProps } from '@react-navigation/stack'; // For props in header function
import AnimatedActionSheet, { ActionSheetAction } from '../../components/ui/AnimatedActionSheet'; // Import AnimatedActionSheet

// Mock user data type
interface UserProfile {
  id: string;
  name: string;
  avatar?: string; // URL to avatar image
  // Add other fields as necessary, e.g., email, phone, bio, relationships
  [key: string]: any; // For dynamic fields
}

// Mock initial user data - in a real app, this would come from a context, API, or route params
const MOCK_USER_DATA: UserProfile = {
  id: '1',
  name: 'Jack Smith',
  avatar: 'https://via.placeholder.com/100', // Placeholder avatar
  email: 'jack.smith@example.com',
  phone: '555-123-4567',
  bio: 'Loves coding and family.',
};

export default function ViewProfileScreen() {
  const colorScheme = useColorScheme() || 'light';
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ userId?: string; name?: string; memberId?: string; memberName?: string }>();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState<UserProfile | null>(null);
  const [isActionSheetVisible, setIsActionSheetVisible] = useState(false); // State for Action Sheet

  // Set up header with dynamic title and action buttons using AppHeader
  useEffect(() => {
    const currentTitle = params.memberName || params.name ? `${params.memberName || params.name}'s Profile` : 'View Profile';

    navigation.setOptions({
      headerShown: true,
      header: (props: StackHeaderProps) => {
        const headerLeftComponent = () => (
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={26} color={Colors[colorScheme].icon.primary} />
          </TouchableOpacity>
        );
        const headerRightComponent = () => (
          <View style={styles.headerIconsContainer}>
            <TouchableOpacity onPress={() => setIsActionSheetVisible(true)} style={styles.iconButton}>
              <Ionicons 
                name="ellipsis-horizontal" 
                size={26} 
                color={Colors[colorScheme].icon.primary}
              />
            </TouchableOpacity>
          </View>
        );
        
        return (
          <AppHeader 
            title={currentTitle}
            headerLeft={headerLeftComponent}
            headerRight={headerRightComponent} 
          />
        );
      },
    });
  // Ensure all dependencies that might change the header are included.
  }, [navigation, params.name, params.memberName, isEditing, colorScheme, user]); // Removed isEditing and user from deps for headerRight unless they affect the ellipsis icon directly

  // In a real app, fetch user data based on params.userId or params.memberId
  useEffect(() => {
    // Simulate fetching user data
    // If a userId is passed, you would fetch data for that user
    const profileId = params.memberId || params.userId || MOCK_USER_DATA.id;
    const profileName = params.memberName || params.name || MOCK_USER_DATA.name;
    const initialData = { ...MOCK_USER_DATA, id: profileId, name: profileName };
    setUser(initialData);
    setEditedUser(initialData);
  }, [params.userId, params.name, params.memberId, params.memberName]); // Add memberId and memberName to dependencies

  const handleInputChange = (field: keyof UserProfile, value: string) => {
    if (editedUser) {
      setEditedUser({ ...editedUser, [field]: value });
    }
  };

  const toggleEditMode = () => {
    if (isEditing && editedUser) {
      // If was editing, prompt to save changes or discard
      Alert.alert(
        "Save Changes?",
        "Do you want to save your changes?",
        [
          { text: "Discard", onPress: () => {
            setEditedUser(user); // Revert changes
            setIsEditing(false);
          }, style: "cancel" },
          { text: "Save", onPress: saveChanges }
        ]
      );
    } else {
      setIsEditing(!isEditing);
      if (!isEditing && user) {
        setEditedUser(JSON.parse(JSON.stringify(user))); // Deep copy for editing
      }
    }
  };

  const saveChanges = () => {
    // In a real app, call an API to save the user data
    console.log('Saving changes:', editedUser);
    if (editedUser) {
      setUser(editedUser);
    }
    setIsEditing(false);
    Alert.alert('Profile Updated', 'Your changes have been saved.');
  };

  const confirmRemoveUser = () => {
    Alert.alert(
      'Remove User',
      `Are you sure you want to remove ${user?.name || 'this user'} from the family tree? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setIsActionSheetVisible(false) }, // Close sheet on cancel
        { text: 'Remove', onPress: removeUser, style: 'destructive' },
      ],
      { cancelable: true, onDismiss: () => setIsActionSheetVisible(false) } // Close sheet on dismiss
    );
  };

  const removeUser = () => {
    // In a real app, call an API to remove the user
    console.log('Removing user:', user?.id);
    Alert.alert('User Removed', `${user?.name || 'The user'} has been removed from the family tree.`);
    // Navigate back or to a relevant screen
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/familyTree'); // Fallback navigation
    }
  };

  const profileActions: ActionSheetAction[] = [
    {
      title: 'Edit Profile',
      onPress: () => {
        // setIsActionSheetVisible(false); // ActionSheet handles its own closing
        toggleEditMode();
      },
    },
    {
      title: 'Delete Profile',
      onPress: () => {
        // setIsActionSheetVisible(false); // ActionSheet handles its own closing
        confirmRemoveUser();
      },
      style: 'destructive',
    },
    {
      title: 'Cancel',
      onPress: () => { /* setIsActionSheetVisible(false) -- Handled by component */ }, // ActionSheet handles its own closing
      style: 'cancel',
    },
  ];

  if (!user || !editedUser) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading profile...</Text>
      </View>
    );
  }

  const profileFields: Array<{ key: keyof UserProfile; label: string; icon?: keyof typeof Ionicons.glyphMap }> = [
    { key: 'name', label: 'Name', icon: 'person-outline' },
    { key: 'email', label: 'Email', icon: 'mail-outline' },
    { key: 'phone', label: 'Phone', icon: 'call-outline' },
    // { key: 'bio', label: 'Bio', icon: 'information-circle-outline' }, // Bio field removed
    // Add more fields as needed
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.profileHeader}>
        <Image 
          source={editedUser.avatar ? { uri: editedUser.avatar } : require('../../assets/images/avatar-placeholder.png')} 
          style={styles.avatar} 
        />
        {isEditing ? (
          <TextInput
            style={[styles.nameInput, styles.textLarge, styles.nameText]}
            value={editedUser.name}
            onChangeText={(text) => handleInputChange('name', text)}
            placeholder="Full Name"
          />
        ) : (
          <Text style={[styles.nameText, styles.textLarge]}>{user.name}</Text>
        )}
      </View>

      {profileFields.map(({ key, label, icon }) => {
        // Do not render 'name' here again as it's in the header
        if (key === 'name' || key === 'bio') return null; // Also ensure bio isn't rendered

        return (
          <View key={key} style={styles.fieldContainer}>
            {icon && <Ionicons name={icon} size={24} color={Colors[colorScheme].text.primary} style={styles.fieldIcon} />}
            <View style={styles.fieldTextContainer}>
              <Text style={styles.fieldLabel}>{label}</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={editedUser[key] || ''}
                  onChangeText={(text) => handleInputChange(key, text)}
                  placeholder={label}
                  // Add keyboardType, autoCapitalize, etc. as needed
                  multiline={key === 'bio'}
                  numberOfLines={key === 'bio' ? 3 : 1}
                />
              ) : (
                <Text style={styles.fieldValue}>{user[key] || 'Not set'}</Text>
              )}
            </View>
          </View>
        );
      })}

      {isEditing && (
        <TouchableOpacity style={styles.saveButton} onPress={saveChanges}>
          <Ionicons name="save-outline" size={24} color="#FFFFFF" />
          <Text style={styles.saveButtonText}>Save Changes</Text>
        </TouchableOpacity>
      )}
      
      <AnimatedActionSheet
        isVisible={isActionSheetVisible}
        onClose={() => setIsActionSheetVisible(false)}
        actions={profileActions}
        title="Profile Actions" // Optional: Add a title to the action sheet
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background.primary, // Using light primary background
  },
  contentContainer: {
    paddingBottom: 30, // Ensure scroll content isn't hidden by save button or tab bar
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background.primary, // Using light primary background
  },
  headerIconsContainer: {
    flexDirection: 'row',
    marginRight: Platform.OS === 'ios' ? 0 : 10, // Adjusted for Android alignment if needed
  },
  iconButton: {
    paddingHorizontal: 10, // Added padding for easier touch
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: Colors.light.background.secondary, // Use light secondary background
    borderBottomWidth: 1,
    borderBottomColor: '#E1E3E5', // Using a direct color for separator
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 15,
    borderWidth: 3,
    borderColor: Colors.light.background.primary, // Contrast border for avatar
  },
  nameText: {
    fontWeight: 'bold',
    color: '#FFFFFF', // Using white for header text
  },
  nameInput: {
    borderBottomWidth: 1,
    borderColor: '#FFFFFF', // Using white for header text
    paddingVertical: 5,
    textAlign: 'center',
    minWidth: 200,
  },
  fieldContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start', // Align items to start for multiline bio
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E3E5', // Using a direct color for separator
    backgroundColor: '#FFFFFF', // Using white for card background
  },
  fieldIcon: {
    marginRight: 15,
    marginTop: 2, // Align icon slightly with first line of text
  },
  fieldTextContainer: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#687076', // Using a direct gray color
    marginBottom: 5,
  },
  fieldValue: {
    fontSize: 16,
    color: Colors.light.text.primary,
  },
  input: {
    fontSize: 16,
    color: Colors.light.text.primary,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E3E5', // Light separator color
  },
  saveButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a7ea4', // Primary action color
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 20,
    marginTop: 30,
    marginBottom: 20,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  textLarge: {
    fontSize: 24,
  },
  // Add other styles from Colors.ts as needed
}); 