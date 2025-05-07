import React, { useEffect, useState } from 'react';
import {
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
// import { auth, db } from '../../src/lib/firebase'; // Commented out Firebase
// import { doc, setDoc } from "firebase/firestore"; // Commented out Firebase
// import { useImageUpload } from '../../hooks/useImageUpload'; // Commented out Firebase image upload

// Placeholder for current user data - in a real app, fetch this or get from context
const initialUserData = {
  name: 'Ruchit Patel',
  email: 'user@example.com', // Typically non-editable or handled differently
  bio: 'Passionate about connecting family and preserving our shared history. Exploring our roots, one story at a time.',
  profilePicUrl: null,
};

const EditProfileScreen = () => {
  const navigation = useNavigation();
  const [name, setName] = useState(initialUserData.name);
  const [bio, setBio] = useState(initialUserData.bio);
  const [avatarUri, setAvatarUri] = useState<string | null>(initialUserData.profilePicUrl);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  
  // const { 
  //   isUploading: isUploadingImage, 
  //   uploadProgress, 
  //   uploadedUrl: profileImageFirebaseUrl,
  //   error: uploadError,
  //   uploadImage 
  // } = useImageUpload(); // Commented out Firebase image upload

  // Mock state for image uploading, since the hook is removed
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0); // For UI display if needed
  // const [profileImageFirebaseUrl, setProfileImageFirebaseUrl] = useState<string | null>(null); // This would be set by a mock upload function if needed

  const handleSaveChanges = async () => {
    // if (!auth.currentUser) { // Commented out Auth Check
    //   Alert.alert("Error", "You must be logged in to save your profile.");
    //   return;
    // }
    if (isUploadingImage) {
      Alert.alert("Please Wait", "Image is still uploading. Please wait a moment and try again.");
      return;
    }

    setIsSavingProfile(true);
    // try { // Firebase saving logic commented out
      // const userId = auth.currentUser.uid;
      // const userDocRef = doc(db, "users", userId);

      // const profileDataToSave: { name: string; bio: string; profilePicture?: string, updatedAt: Date } = {
      //   name: name,
      //   bio: bio,
      //   updatedAt: new Date(),
      // };

      // if (profileImageFirebaseUrl) { // This would be the uploaded image URL
      //   profileDataToSave.profilePicture = profileImageFirebaseUrl;
      // } else if (avatarUri && !avatarUri.startsWith('http')) {
         // If avatarUri is a local URI and no new Firebase URL, it means no new image was uploaded to Firebase
         // Depending on logic, you might want to keep the old Firebase URL or handle local URIs differently.
         // For now, if it's a local URI, we assume it's for display and won't be part of the "saved" data without an upload step.
      // }
      // await setDoc(userDocRef, profileDataToSave, { merge: true });

      // Simulate save
      console.log('Simulating save:', { name, bio, avatarUri });
      Alert.alert('Profile Saved (Simulated)', 'Your changes have been successfully saved.');
      navigation.goBack();
    // } catch (error) { // Firebase saving logic commented out
    //   console.error("Error saving profile:", error);
    //   Alert.alert("Save Failed", "Could not save your profile. Please try again.");
    // } finally { // Firebase saving logic commented out
    //   setIsSavingProfile(false);
    // }
    // Simulate save completion
    setTimeout(() => {
        setIsSavingProfile(false);
    }, 1000); 
  };

  useEffect(() => {
    navigation.setOptions({
      title: 'Edit Profile',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
      headerRight: () => (
        <TouchableOpacity onPress={handleSaveChanges} disabled={isSavingProfile || isUploadingImage} style={{ marginRight: 15 }}>
          <Text style={{ color: (isSavingProfile || isUploadingImage) ? '#B0B0B0' : '#007AFF', fontSize: 17, fontWeight: '600' }}>
            {isSavingProfile ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, name, bio, avatarUri, /*profileImageFirebaseUrl,*/ isSavingProfile, isUploadingImage]); // Removed profileImageFirebaseUrl from deps

  const handlePickProfileImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Allow access to photos to update profile picture.');
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
      const localUri = pickerResult.assets[0].uri;
      setAvatarUri(localUri);
      
      // try { // Firebase image upload logic commented out
        // setIsUploadingImage(true); // Manually set for UI
        // setUploadProgress(0); // Reset progress
        // const firebaseUrl = await uploadImage(localUri, 'profileImages'); // This was the call to the hook
        // if (firebaseUrl) {
        //   console.log("Uploaded to Firebase:", firebaseUrl);
        //   // setProfileImageFirebaseUrl(firebaseUrl); // Set the uploaded URL if needed for save
        // } else {
          // Upload failed (error handled within the hook / shown via Alert)
          // Revert local avatar display if needed, or allow user to retry saving.
          // Example: setAvatarUri(initialUserData.profilePicUrl); 
        // }
      // } catch (err) {
         // Error is already handled by the hook (sets error state, shows Alert)
         // console.error("Upload initiation failed (caught in component):", err)
      // } finally {
        // setIsUploadingImage(false); // Manually set for UI
      // }
      // Simulate image "upload" for UI purposes if you want a delay/progress
      console.log("Image picked (local):", localUri);
      // If you want to simulate an upload process for UI testing:
      /*
      setIsUploadingImage(true);
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setUploadProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setIsUploadingImage(false);
          // setProfileImageFirebaseUrl(localUri); // For testing, treat local as "uploaded"
          console.log("Simulated upload complete for ", localUri)
        }
      }, 100);
      */
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={handlePickProfileImage}>
            <Image 
              source={avatarUri ? { uri: avatarUri } : require('../../assets/images/avatar-placeholder.png')} 
              style={styles.avatarImage} 
            />
            <View style={styles.avatarEditIcon}>
                <Ionicons name="camera-outline" size={20} color="#FFF" />
            </View>
          </TouchableOpacity>
          {isUploadingImage && (
            <View style={styles.uploadProgressOverlay}>
              <Text style={styles.uploadProgressText}>{Math.round(uploadProgress)}%</Text>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your Name"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          {/* Email usually not editable directly */}
          <Text style={styles.staticText}>{initialUserData.email}</Text> 
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us about yourself"
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
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
  avatarContainer: {
    alignItems: 'center',
    marginVertical: 30,
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E0E0E0',
  },
  avatarEditIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFF',
  },
  inputGroup: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DCDCDC',
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 5,
  },
  input: {
    fontSize: 16,
    color: '#333',
    paddingVertical: Platform.OS === 'ios' ? 5 : 3, // Adjust padding for input height
  },
  staticText: {
      fontSize: 16,
      color: '#888', // Indicate non-editable text
      paddingVertical: Platform.OS === 'ios' ? 5 : 3,
  },
  textArea: {
    minHeight: 80,
  },
  uploadProgressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 60,
  },
  uploadProgressText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default EditProfileScreen; 