import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Image, useColorScheme, Platform } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import AppHeader from '../../components/ui/AppHeader';
import type { StackHeaderProps } from '@react-navigation/stack';
import AnimatedActionSheet, { ActionSheetAction } from '../../components/ui/AnimatedActionSheet';
import { getMemberProfileDataMobile, type MemberProfile, updateMemberProfileDataMobile } from '../../src/lib/firebaseUtils';
import { useAuth } from '../../src/contexts/AuthContext';

export default function ViewProfileScreen() {
  const colorScheme = useColorScheme() || 'light';
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ userId?: string; name?: string; memberId?: string; memberName?: string }>();
  const { user: authUser } = useAuth();

  const [userData, setUserData] = useState<MemberProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState<MemberProfile | null>(null);
  const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);

  const fetchMemberData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const profileId = params.memberId || params.userId || (authUser?.uid ?? '');
      if (!profileId) {
        setError('No member ID provided');
        return;
      }
      const memberData = await getMemberProfileDataMobile(profileId);
      setUserData(memberData);
      const initialAvatar = memberData.avatar || authUser?.photoURL || undefined;
      setEditedUser({ ...memberData, avatar: initialAvatar });
    } catch (fetchError) {
      console.error('Error fetching member data:', fetchError);
      setError('Failed to load profile data');
    } finally {
      setIsLoading(false);
    }
  }, [params.userId, params.memberId, authUser?.uid]);

  // Set up header with dynamic title and action buttons using AppHeader
  useEffect(() => {
    const currentTitle = params.memberName || params.name 
      ? `${params.memberName || params.name}'s Profile` 
      : userData?.name ? `${userData.name}'s Profile` : 'View Profile';

    // Define headerLeftComponent and headerRightComponent inside this useEffect scope
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

    navigation.setOptions({
      headerShown: true,
      header: (props: StackHeaderProps) => (
        <AppHeader 
          title={currentTitle}
          headerLeft={headerLeftComponent}
          headerRight={headerRightComponent} 
        />
      ),
    });
  }, [navigation, params.name, params.memberName, userData?.name, colorScheme]);

  // Use useFocusEffect to fetch data when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchMemberData();
      return () => {
        // Optional: Cleanup if needed when screen loses focus
      };
    }, [fetchMemberData])
  );

  const handleInputChange = (field: keyof MemberProfile, value: string) => {
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
            setEditedUser(userData); // Revert changes
            setIsEditing(false);
          }, style: "cancel" },
          { text: "Save", onPress: saveChanges }
        ]
      );
    } else {
      setIsEditing(!isEditing);
      if (!isEditing && userData) {
        setEditedUser(JSON.parse(JSON.stringify(userData))); // Deep copy for editing
      }
    }
  };

  const saveChanges = async () => {
    if (!editedUser || !userData?.id) {
      Alert.alert('Error', 'No data to save.');
      return;
    }

    setIsLoading(true);
    try {
      // Call the new Firebase utility function to update data
      await updateMemberProfileDataMobile(userData.id, editedUser);
      setUserData(editedUser); // Update local state with saved data
      setIsEditing(false);
      Alert.alert('Profile Updated', 'Your changes have been saved successfully.');
    } catch (error: any) {
      console.error('Failed to save profile changes:', error);
      Alert.alert('Save Error', `Could not save changes: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmRemoveUser = () => {
    Alert.alert(
      'Remove User',
      `Are you sure you want to remove ${userData?.name || 'this user'} from the family tree? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setIsActionSheetVisible(false) },
        { text: 'Remove', onPress: removeUser, style: 'destructive' },
      ],
      { cancelable: true, onDismiss: () => setIsActionSheetVisible(false) }
    );
  };

  const removeUser = () => {
    // In a real app, call an API to remove the user
    console.log('Removing user:', userData?.id);
    Alert.alert('User Removed', `${userData?.name || 'The user'} has been removed from the family tree.`);
    // Navigate back or to a relevant screen
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/familyTree');
    }
  };

  const profileActions: ActionSheetAction[] = [
    {
      title: 'Edit Profile',
      onPress: () => {
        toggleEditMode();
      },
    },
    {
      title: 'Delete Profile',
      onPress: () => {
        confirmRemoveUser();
      },
      style: 'destructive',
    },
    {
      title: 'Cancel',
      onPress: () => { /* Handled by component */ },
      style: 'cancel',
    },
  ];

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading profile...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!userData || !editedUser) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Profile not found</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const profileFields: Array<{ key: keyof MemberProfile; label: string; icon?: keyof typeof Ionicons.glyphMap }> = [
    { key: 'name', label: 'Name', icon: 'person-outline' },
    { key: 'email', label: 'Email', icon: 'mail-outline' },
    { key: 'phone', label: 'Phone', icon: 'call-outline' },
    // Add more fields as needed
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.profileHeader}>
        <Image 
          source={editedUser.avatar ? { uri: editedUser.avatar } : (authUser?.photoURL && userData?.id === authUser.uid && authUser.photoURL ? {uri: authUser.photoURL} : require('../../assets/images/avatar-placeholder.png'))} 
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
          <Text style={[styles.nameText, styles.textLarge]}>{userData.name}</Text>
        )}
      </View>

      {profileFields.map(({ key, label, icon }) => {
        // Do not render 'name' here again as it's in the header
        if (key === 'name' || key === 'bio') return null;

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
                  multiline={key === 'bio'}
                  numberOfLines={key === 'bio' ? 3 : 1}
                />
              ) : (
                <Text style={styles.fieldValue}>{userData[key] || 'Not set'}</Text>
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
        title="Profile Actions"
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
    borderColor: '#000000', // Contrast border for avatar
  },
  nameText: {
    fontWeight: 'bold',
    color: '#000000', // Using white for header text
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
    backgroundColor: '#1A4B44', // Primary action color
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
  errorText: {
    color: Colors.light.text.error,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#0a7ea4',
    padding: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Add other styles from Colors.ts as needed
}); 