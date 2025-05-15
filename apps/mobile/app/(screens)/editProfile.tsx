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
import { commonHeaderOptions } from '../../constants/headerConfig';
import { useAuth } from '../../src/contexts/AuthContext';
import { getFirebaseAuth, getFirebaseDb } from '../../src/lib/firebase'; // Import Firebase services

const EditProfileScreen = () => {
  const navigation = useNavigation();
  const { user, firestoreUser, refreshUser } = useAuth();

  const [name, setName] = useState(firestoreUser?.displayName || user?.displayName || '');
  const [editableEmail, setEditableEmail] = useState(user?.email || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(firestoreUser?.profilePicture || user?.photoURL || null);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  
  // Mock state for image uploading, since the hook is removed or not used in this step
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  // const [profileImageFirebaseUrl, setProfileImageFirebaseUrl] = useState<string | null>(null); // This would be set by an upload function

  const handleSaveChanges = async () => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();

    if (!auth.currentUser) {
      Alert.alert("Error", "You must be logged in to save your profile.");
      return;
    }
    if (isUploadingImage) {
      Alert.alert("Please Wait", "Image is still uploading. Please wait a moment and try again.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const userId = auth.currentUser!.uid;
      const userDocRef = db.collection("users").doc(userId);
      let emailChanged = false;

      if (editableEmail && editableEmail !== user?.email) {
        try {
          await auth.currentUser!.updateEmail(editableEmail);
          emailChanged = true;
          Alert.alert("Email Updated", "Your email has been updated. You might need to re-verify it.");
        } catch (error: any) {
          console.error("Error updating email in Auth:", error);
          Alert.alert("Email Update Failed", error.message || "Could not update your email. It might be already in use or invalid.");
          setIsSavingProfile(false);
          return;
        }
      }

      const profileDataToUpdate: { name: string; email?: string; profilePicture?: string, updatedAt: Date, displayName?: string } = {
        name: name,
        displayName: name,
        updatedAt: new Date(),
      };

      if (emailChanged) {
        profileDataToUpdate.email = editableEmail;
      }

      // if (profileImageFirebaseUrl) { // If using a separate upload hook for avatar
      //   profileDataToUpdate.profilePicture = profileImageFirebaseUrl;
      // } else 
      if (avatarUri && avatarUri !== (firestoreUser?.profilePicture || user?.photoURL)) {
        // This implies a new local URI was picked but not yet uploaded via a hook.
        // For now, we're not handling direct upload in this function to keep it focused on text fields.
        // If you have an `uploadImage` function (like from `useImageUpload`), call it here for `avatarUri`
        // and then set `profileDataToUpdate.profilePicture` with the returned Firebase URL.
        // For this example, we assume `avatarUri` might be a Firebase URL if already set, or needs separate upload.
        // If it's a new local URI, it won't be saved unless you implement the upload and URL retrieval here.
        console.log("New avatar URI picked, but upload logic needs to be integrated here if it's a local file.");
        // Example: if (avatarUri.startsWith('file://')) { /* call uploadImage -> get URL -> update profileData... */ }
        // For now, let's assume if avatarUri exists and is different, it's a new Firebase URL (e.g. from a hypothetical direct upload)
        // This part needs to be robust based on how you handle image uploads.
        if (avatarUri.startsWith('http')) { // Simplistic check if it might be a Firebase URL
            profileDataToUpdate.profilePicture = avatarUri;
        }
      }

      await userDocRef.set(profileDataToUpdate, { merge: true });

      if (refreshUser) {
        await refreshUser();
      }

      Alert.alert('Profile Saved', 'Your changes have been successfully saved.');
      navigation.goBack();
    } catch (error: any) {
      console.error("Error saving profile:", error);
      Alert.alert("Save Failed", error.message || "Could not save your profile. Please try again.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    navigation.setOptions({
      ...commonHeaderOptions, // Spread common options
      title: 'Edit Profile',
      // headerStyle: { backgroundColor: '#F8F8F8' }, // Replaced by commonHeaderOptions
      // headerTintColor: '#333333', // Replaced by commonHeaderOptions
      // headerTitleStyle: { fontWeight: '600' }, // Replaced by commonHeaderOptions
      // headerBackTitleVisible: false, // Replaced by commonHeaderOptions (if different)
      headerRight: () => (
        <TouchableOpacity onPress={handleSaveChanges} disabled={isSavingProfile || isUploadingImage} style={{ marginRight: 15 }}>
          <Text style={{ color: (isSavingProfile || isUploadingImage) ? '#B0B0B0' : '#007AFF', fontSize: 17, fontWeight: '600' }}>
            {isSavingProfile ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, name, editableEmail, avatarUri, isSavingProfile, isUploadingImage, refreshUser]);

  const handlePickProfileImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Allow access to photos to update profile picture.');
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], // Updated from ImagePicker.MediaTypeOptions.Images
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
          <TextInput
            style={styles.input}
            value={editableEmail}
            onChangeText={setEditableEmail}
            placeholder="your@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#999"
          />
        </View>

        {firestoreUser?.phoneNumber && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={[styles.input, styles.readOnlyInput]} // Added readOnlyInput style
              value={firestoreUser.phoneNumber}
              editable={false} // Make it non-editable for now
              placeholderTextColor="#999"
            />
          </View>
        )}

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
    backgroundColor: '#FFF',
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 15 : 10, // Adjusted padding for Android
    borderRadius: 8,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  readOnlyInput: {
    backgroundColor: '#F0F0F0', // Different background for read-only
    color: '#555', // Different text color for read-only
  },
  staticText: {
      fontSize: 16,
      color: '#888', // Indicate non-editable text
      paddingVertical: Platform.OS === 'ios' ? 5 : 3,
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