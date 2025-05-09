import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Image, useColorScheme } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors'; // Import Colors properly as a named export

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
  const colorScheme = useColorScheme() || 'light'; // Default to light if null
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string; name?: string }>(); // Get userId and name from params

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState<UserProfile | null>(null);

  // Set up header with dynamic title and action buttons
  useEffect(() => {
    const title = params.name ? `${params.name}'s Profile` : 'View Profile';
    router.setOptions({
      title,
      headerStyle: {
        backgroundColor: '#F8F8F8', // Light gray background per standard style
      },
      headerTintColor: '#333333', // Dark text/icon color
      headerTitleStyle: {
        fontWeight: '600',
        fontSize: 17, // Standard title size
      },
      headerBackTitleVisible: false,
      headerRight: () => (
        <View style={styles.headerIconsContainer}>
          <TouchableOpacity onPress={toggleEditMode} style={styles.iconButton}>
            <Ionicons 
              name={isEditing ? "close-circle-outline" : "pencil-outline"} 
              size={28} 
              color={Colors[colorScheme].tabIconDefault} 
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmRemoveUser} style={styles.iconButton}>
            <Ionicons name="trash-bin-outline" size={28} color="red" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [router, params.name, isEditing, colorScheme]);

  // In a real app, fetch user data based on params.userId
  useEffect(() => {
    // Simulate fetching user data
    // If a userId is passed, you would fetch data for that user
    // For now, we use mock data, but try to use the name from params if available
    const profileName = params.name || MOCK_USER_DATA.name;
    const initialData = { ...MOCK_USER_DATA, id: params.userId || MOCK_USER_DATA.id, name: profileName };
    setUser(initialData);
    setEditedUser(initialData);
  }, [params.userId, params.name]);

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
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', onPress: removeUser, style: 'destructive' },
      ],
      { cancelable: true }
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
    { key: 'bio', label: 'Bio', icon: 'information-circle-outline' },
    // Add more fields as needed
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.profileHeader}>
        <Image source={{ uri: editedUser.avatar }} style={styles.avatar} />
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
        if (key === 'name') return null;

        return (
          <View key={key} style={styles.fieldContainer}>
            {icon && <Ionicons name={icon} size={24} color={Colors[colorScheme].text} style={styles.fieldIcon} />}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background, // Using light as default
  },
  contentContainer: {
    paddingBottom: 30, // Ensure scroll content isn't hidden by save button or tab bar
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background, // Using light as default
  },
  headerIconsContainer: {
    flexDirection: 'row',
    marginRight: 0, // Adjusted spacing for header icons
  },
  iconButton: {
    paddingHorizontal: 10, // Added padding for easier touch
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: Colors.light.tint, // Use a theme color for header background
    borderBottomWidth: 1,
    borderBottomColor: '#E1E3E5', // Using a direct color for separator
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 15,
    borderWidth: 3,
    borderColor: Colors.light.background, // Contrast border for avatar
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
    color: Colors.light.text,
  },
  input: {
    fontSize: 16,
    color: Colors.light.text,
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