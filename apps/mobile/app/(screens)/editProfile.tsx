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
import { getFirebaseAuth } from '../../src/lib/firebase';
import Fonts from '../../constants/Fonts';
import { showErrorAlert, callFirebaseFunction } from '../../src/lib/errorUtils';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { useImageUpload } from '../../hooks/useImageUpload';
import FullScreenDatePicker from '../../components/ui/FullScreenDatePicker';
import GenderPicker from '../../components/ui/GenderPicker';
import { logger } from '../../src/services/LoggingService';
import { sanitizeUserInput, sanitizeEmail, sanitizePhoneNumber } from '../../src/lib/xssSanitization';

const EditProfileScreen = () => {
  const navigation = useNavigation();
  const { user, firestoreUser, refreshUser } = useAuth();
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Profile Update Error',
    trackCurrentScreen: true
  });

  useEffect(() => {
    if (!isError) {
      // Clear any local error states when global error is cleared
    }
  }, [isError]);

  const [name, setName] = useState(firestoreUser?.displayName || user?.displayName || '');
  const [editableEmail, setEditableEmail] = useState(user?.email || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(firestoreUser?.profilePictureUrl || firestoreUser?.profilePicture?.url || user?.photoURL || null);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [profileImageFirebaseUrl, setProfileImageFirebaseUrl] = useState<string | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState(firestoreUser?.dateOfBirth || '');
  const [gender, setGender] = useState(firestoreUser?.gender || '');
  const [phoneNumber, setPhoneNumber] = useState(firestoreUser?.phoneNumber || '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    firestoreUser?.dateOfBirth ? new Date(firestoreUser.dateOfBirth) : null
  );
  
  // Use the image upload hook
  const { isUploading: isUploadingImage, uploadProgress, uploadImage } = useImageUpload();

  const handleSaveChanges = withErrorHandling(async () => {
    reset();
    const auth = getFirebaseAuth();

    if (!auth.currentUser) {
      showErrorAlert({ message: "You must be logged in to save your profile.", code: "unauthenticated" }, "Authentication Error");
      return;
    }
    if (isUploadingImage) {
      Alert.alert("Please Wait", "Image is still uploading. Please wait a moment and try again.");
      return;
    }

    setIsSavingProfile(true);
    try {
      // Handle email update separately if needed
      let emailChanged = false;
      if (editableEmail && editableEmail !== user?.email) {
        try {
          const sanitizedEmail = sanitizeEmail(editableEmail);
          if (!sanitizedEmail) {
            showErrorAlert({ message: "Invalid email format", code: "invalid-email" }, "Email Update Failed");
            setIsSavingProfile(false);
            return;
          }
          await auth.currentUser!.updateEmail(sanitizedEmail);
          emailChanged = true;
          Alert.alert("Email Updated", "Your email has been updated. You might need to re-verify it.");
        } catch (error: any) {
          handleError(error, { 
            action: 'updateEmail',
            metadata: { newEmail: editableEmail }
          });
          showErrorAlert(error, "Email Update Failed");
          setIsSavingProfile(false);
          return;
        }
      }

      // Prepare profile update data with sanitization
      const profileDataToUpdate: { 
        uid: string;
        displayName?: string;
        photoURL?: string;
        dateOfBirth?: string;
        gender?: string;
        phoneNumber?: string;
      } = {
        uid: auth.currentUser!.uid,
        displayName: sanitizeUserInput(name, { maxLength: 100, trim: true }),
        dateOfBirth: dateOfBirth,
        gender: sanitizeUserInput(gender, { maxLength: 50, trim: true }),
        phoneNumber: sanitizePhoneNumber(phoneNumber),
      };

      // Handle profile picture upload
      let profilePictureUrl: string | undefined;
      if (profileImageFirebaseUrl) {
        // If we have already uploaded the image, use the Firebase URL
        profilePictureUrl = profileImageFirebaseUrl;
      } else if (avatarUri && avatarUri !== (firestoreUser?.profilePicture || user?.photoURL)) {
        // If it's a new local URI that hasn't been uploaded yet
        if (avatarUri.startsWith('file://')) {
          // Upload the image first
          try {
            const uploadedUrl = await uploadImage(avatarUri, 'profileImages');
            if (uploadedUrl) {
              profilePictureUrl = uploadedUrl;
            } else {
              Alert.alert("Upload Failed", "Failed to upload profile picture. Please try again.");
              setIsSavingProfile(false);
              return;
            }
          } catch (error: any) {
            handleError(error, { 
              action: 'uploadProfileImage',
              metadata: { localUri: avatarUri }
            });
            Alert.alert("Upload Failed", "Failed to upload profile picture. Please try again.");
            setIsSavingProfile(false);
            return;
          }
        } else if (avatarUri.startsWith('http')) {
          // It's already a Firebase URL
          profilePictureUrl = avatarUri;
        }
      }

      // Add profile picture to update data if available
      if (profilePictureUrl) {
        profileDataToUpdate.photoURL = profilePictureUrl;
      }

      // Call the updateUserProfile cloud function
      const result = await callFirebaseFunction('updateUserProfile', profileDataToUpdate);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update profile');
      }

      if (refreshUser) {
        await refreshUser();
      }

      Alert.alert('Profile Saved', 'Your changes have been successfully saved.');
      navigation.goBack();
    } catch (error: any) {
      handleError(error, { 
        action: 'saveProfile',
        metadata: { 
          nameChanged: name !== (firestoreUser?.displayName || user?.displayName),
          emailChanged: editableEmail !== user?.email,
          avatarChanged: avatarUri !== (firestoreUser?.profilePictureUrl || firestoreUser?.profilePicture?.url || user?.photoURL)
        }
      });
      showErrorAlert(error, "Save Failed");
    } finally {
      setIsSavingProfile(false);
    }
  });

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
  }, [navigation, name, editableEmail, avatarUri, isSavingProfile, isUploadingImage, refreshUser, handleSaveChanges]);

  const handlePickProfileImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showErrorAlert({ message: 'Allow access to photos to update profile picture.', code: 'permission-denied' }, 'Permission Required');
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
      setProfileImageFirebaseUrl(null); // Reset any previous upload
      
      // Upload immediately after picking
      try {
        const firebaseUrl = await uploadImage(localUri, 'profileImages');
        if (firebaseUrl) {
          logger.debug("Uploaded to Firebase:", firebaseUrl);
          setProfileImageFirebaseUrl(firebaseUrl);
          // Update the avatar URI to the Firebase URL for immediate display
          setAvatarUri(firebaseUrl);
        } else {
          // Upload failed - revert to previous avatar
          setAvatarUri(firestoreUser?.profilePicture || user?.photoURL || null);
          Alert.alert("Upload Failed", "Failed to upload profile picture. Please try again.");
        }
      } catch (err: any) {
        logger.error("Upload failed:", err);
        // Revert to previous avatar
        setAvatarUri(firestoreUser?.profilePicture || user?.photoURL || null);
        Alert.alert("Upload Failed", "Failed to upload profile picture. Please try again.");
      }
    }
  };

  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
    setDateOfBirth(date.toISOString().split('T')[0]); // Format as YYYY-MM-DD
  };

  const formatDateDisplay = (date: Date | null) => {
    if (!date) return 'Select Date';
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  return (
    <ErrorBoundary screenName="EditProfileScreen">
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

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+1 (123) 456-7890"
            keyboardType="phone-pad"
            placeholderTextColor="#999"
          />
          {phoneNumber && phoneNumber !== firestoreUser?.phoneNumber && (
            <Text style={styles.helperText}>Phone number will require verification</Text>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Date of Birth</Text>
          <TouchableOpacity 
            onPress={() => setShowDatePicker(true)}
            style={styles.selectorButton}
          >
            <Text style={[styles.selectorText, !selectedDate && styles.placeholderText]}>
              {formatDateDisplay(selectedDate)}
            </Text>
            <Ionicons name="calendar-outline" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Gender</Text>
          <TouchableOpacity 
            onPress={() => setShowGenderPicker(true)}
            style={styles.selectorButton}
          >
            <Text style={[styles.selectorText, !gender && styles.placeholderText]}>
              {gender || 'Select Gender'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#666" />
          </TouchableOpacity>
        </View>

      </ScrollView>
      
      <FullScreenDatePicker
        isVisible={showDatePicker}
        onDismiss={() => setShowDatePicker(false)}
        onDateChange={handleDateChange}
        value={selectedDate}
        maximumDate={new Date()}
        mode="date"
        headerTitle="Select Date of Birth"
      />
      
      <GenderPicker
        isVisible={showGenderPicker}
        onDismiss={() => setShowGenderPicker(false)}
        onGenderChange={(g) => {
          setGender(g);
          setShowGenderPicker(false);
        }}
        value={gender}
      />
      </SafeAreaView>
    </ErrorBoundary>
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
    fontFamily: Fonts.type.base, // ADDED FONT FAMILY
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
  selectorButton: {
    backgroundColor: '#FFF',
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 15 : 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectorText: {
    fontSize: 16,
    color: '#333',
    fontFamily: Fonts.type.base,
  },
  placeholderText: {
    color: '#999',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
    fontStyle: 'italic',
  },
});

export default EditProfileScreen; 