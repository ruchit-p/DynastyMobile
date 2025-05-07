import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
// import * as ImagePicker from 'expo-image-picker'; // For avatar picking

// Placeholder for current user data - in a real app, fetch this or get from context
const initialUserData = {
  name: 'Ruchit Patel',
  username: 'ruchitp',
  bio: 'Lover of family history and connecting with relatives. Exploring our roots, one story at a time.',
  email: 'user@example.com', // May not be editable or shown here
  avatarUrl: 'https://via.placeholder.com/100',
};

const EditProfileScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();

  const [name, setName] = useState(initialUserData.name);
  const [username, setUsername] = useState(initialUserData.username);
  const [bio, setBio] = useState(initialUserData.bio);
  const [avatarUri, setAvatarUri] = useState(initialUserData.avatarUrl);
  // const [email, setEmail] = useState(initialUserData.email); // If email is editable

  useEffect(() => {
    navigation.setOptions({
      title: 'Edit Profile',
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10 }}>
          <Ionicons name="arrow-back" size={26} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={handleSaveChanges} style={{ marginRight: 15 }}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      ),
      headerTitleAlign: 'center',
    });
  }, [navigation, router, name, username, bio, avatarUri]); // Include states in dependencies

  const handleChooseAvatar = async () => {
    // TODO: Implement ImagePicker logic
    // const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    // if (permissionResult.granted === false) {
    //   Alert.alert("Permission Denied", "You've refused to allow this app to access your photos!");
    //   return;
    // }
    // const pickerResult = await ImagePicker.launchImageLibraryAsync({
    //   mediaTypes: ImagePicker.MediaTypeOptions.Images,
    //   allowsEditing: true,
    //   aspect: [1, 1],
    //   quality: 0.5,
    // });
    // if (!pickerResult.canceled) {
    //   setAvatarUri(pickerResult.assets[0].uri);
    // }
    Alert.alert("Choose Avatar", "Image picker functionality to be implemented.");
  };

  const handleSaveChanges = () => {
    if (!name.trim() || !username.trim()) {
      Alert.alert("Missing Fields", "Name and username cannot be empty.");
      return;
    }
    // TODO: API call to save profile changes
    console.log("Saving profile:", { name, username, bio, avatarUri });
    Alert.alert("Profile Updated", "Your changes have been saved.");
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleChooseAvatar}>
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
            <View style={styles.avatarEditIconContainer}>
                <Ionicons name="camera-reverse-outline" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
            placeholderTextColor="#A0A0A0"
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Enter a unique username"
            autoCapitalize="none"
            placeholderTextColor="#A0A0A0"
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us a little about yourself"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor="#A0A0A0"
          />
        </View>
        
        {/* Add other fields like email (if editable), location, website etc. */}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F4F4' }, // Background for the whole screen
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  saveButtonText: {
    color: '#1A4B44',
    fontSize: 17,
    fontWeight: '600',
  },
  avatarSection: {
    alignItems: 'center',
    marginVertical: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E0E0E0',
  },
  avatarEditIconContainer: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
    borderRadius: 15,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 15 : 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#D0D0D0',
  },
  bioInput: {
    minHeight: 100,
  },
});

export default EditProfileScreen; 