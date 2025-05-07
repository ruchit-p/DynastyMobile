import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Platform,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useNavigation, useLocalSearchParams, usePathname } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
// import { auth, db } from '../../src/lib/firebase'; // Commented out Firebase
// import { collection, addDoc, serverTimestamp } from "firebase/firestore"; // Commented out Firebase
import { useImageUpload } from '../../hooks/useImageUpload';

// Interface for event creation data
interface NewEventData {
  imageUri?: string | null;
  eventName: string;
  startDate: Date | null;
  endDate: Date | null;
  location: string;
  description: string;
  visibility: 'Public' | 'Private' | 'Friends Only';
  capacity: string; // Using string for "Unlimited" or a number
}

const CreateEventScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    selectedVisibility?: 'Public' | 'Private' | 'Friends Only',
    selectedLocation?: string,
    selectedCapacity?: string,
    fromScreen?: string 
  }>();
  const currentPath = usePathname();

  const [newEvent, setNewEvent] = useState<NewEventData>({
    eventName: '',
    startDate: null,
    endDate: null,
    location: '',
    description: '',
    visibility: 'Public',
    capacity: 'Unlimited',
    imageUri: null, // Placeholder image or null
  });

  const [isCreatingEvent, setIsCreatingEvent] = useState<boolean>(false);

  // Use the image upload hook
  const { 
    isUploading: isUploadingImage, 
    uploadProgress,
    error: uploadError,
    uploadImage 
  } = useImageUpload();

  // State for DateTimePicker
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | 'datetime'>('datetime');
  const [currentPickerTarget, setCurrentPickerTarget] = useState<'startDate' | 'endDate' | null>(null);

  // Set header options using useEffect
  useEffect(() => {
    navigation.setOptions({
      title: 'Create Event',
      headerStyle: {
        backgroundColor: '#F8F8F8',
      },
      headerTintColor: '#333333',
      headerTitleStyle: {
        fontWeight: '600',
      },
      headerBackTitleVisible: false,
      headerRight: () => (
        <TouchableOpacity onPress={handleCreateEvent} disabled={isCreatingEvent || isUploadingImage} style={{ marginRight: 15 }}>
          <Text style={{ color: (isCreatingEvent || isUploadingImage) ? '#B0B0B0' : '#007AFF', fontSize: 17, fontWeight: '600' }}>
            {isUploadingImage ? "Uploading..." : (isCreatingEvent ? "Creating..." : "Create")}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, newEvent, isCreatingEvent, isUploadingImage]);

  // Effect to update state from navigation params
  useEffect(() => {
    if (params.fromScreen === 'selectVisibility' && params.selectedVisibility) {
      setNewEvent(prev => ({ ...prev, visibility: params.selectedVisibility! }));
    } else if (params.fromScreen === 'selectLocation' && params.selectedLocation !== undefined) {
      setNewEvent(prev => ({ ...prev, location: params.selectedLocation! }));
    } else if (params.fromScreen === 'selectCapacity' && params.selectedCapacity !== undefined) {
      setNewEvent(prev => ({ ...prev, capacity: params.selectedCapacity! }));
    }
  }, [params]);

  const handlePickImage = async () => {
    // Request permission to access media library
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'You need to allow access to your photos to add an event image.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9], // Aspect ratio for event images, adjust as needed
      quality: 0.8, // Reduce quality to save space and improve upload speed
    });

    if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
      setNewEvent({ ...newEvent, imageUri: pickerResult.assets[0].uri });
    } else {
      console.log('Image picking was canceled or no assets selected');
    }
  };

  const showDateTimePicker = (target: 'startDate' | 'endDate') => {
    setCurrentPickerTarget(target);
    setPickerMode('datetime'); // For combined date and time selection
    setShowPicker(true);
  };

  const onDateTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowPicker(Platform.OS === 'ios'); // On iOS, the picker is a modal, hide after selection/cancel
    if (event.type === 'dismissed') {
        setShowPicker(false); // Ensure picker is hidden on Android if dismissed
        return;
    }

    if (selectedDate && currentPickerTarget) {
      const newDate = new Date(selectedDate);
      setNewEvent({ ...newEvent, [currentPickerTarget]: newDate });
    }
    // On Android, the picker needs to be manually hidden after selection if not dismissed
    if (Platform.OS === 'android') {
        setShowPicker(false);
    }
  };

  // Helper to format Date objects for display
  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    // Example format: Wed, May 7 at 5:00 AM (adjust options as needed for exact format)
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleCreateEvent = async () => {
    // if (!auth.currentUser) { // Commented out auth check
    //   Alert.alert("Authentication Error", "You need to be logged in to create an event.");
    //   return;
    // }
    // Basic Validation
    if (!newEvent.eventName.trim()) {
        Alert.alert('Missing Name', 'Please provide an event name.');
        return;
    }
    if (!newEvent.startDate || !newEvent.endDate) {
        Alert.alert('Missing Dates', 'Please select start and end dates.');
        return;
    }
    if (newEvent.endDate <= newEvent.startDate) {
        Alert.alert('Invalid Dates', 'End date must be after start date.');
        return;
    }
    if (!newEvent.location.trim()) {
        Alert.alert('Missing Location', 'Please provide an event location.');
        return;
    }

    if (isUploadingImage) { // Prevent concurrent actions
        Alert.alert("Please Wait", "Image is currently uploading.");
        return;
    }

    setIsCreatingEvent(true);
    let eventImageUrl: string | null = null;

    try {
      // Upload image if one is selected
      if (newEvent.imageUri) {
        console.log('[CreateEvent] Attempting to upload event image:', newEvent.imageUri);
        // Use hook's upload function (now simulated)
        eventImageUrl = await uploadImage(newEvent.imageUri, 'eventImages');
        
        if (!eventImageUrl && newEvent.imageUri) { 
          // This case might still occur if the simulated upload in the hook explicitly returns null on some condition
          console.log('[CreateEvent] Image upload returned null, stopping event creation.');
          setIsCreatingEvent(false);
          return; 
        }
        console.log('[CreateEvent] Simulated Upload - Event Image URL:', eventImageUrl);
      }

      const eventDataToSave = {
        eventName: newEvent.eventName.trim(),
        startDate: newEvent.startDate,
        endDate: newEvent.endDate,
        location: newEvent.location.trim(),
        description: newEvent.description.trim(),
        visibility: newEvent.visibility,
        capacity: newEvent.capacity,
        imageUrl: eventImageUrl, // This will be the local URI or simulated URL
        // createdBy: auth.currentUser.uid, // Firebase Auth commented out
        createdBy: 'mockUserId123', // Mock user ID
        // createdAt: serverTimestamp(), // Firebase serverTimestamp commented out
        createdAt: new Date(), // Mock creation date
        // updatedAt: serverTimestamp(), // Firebase serverTimestamp commented out
        updatedAt: new Date(), // Mock update date
      };

      // const docRef = await addDoc(collection(db, "events"), eventDataToSave); // Firebase save commented out
      // console.log("Event created with ID: ", docRef.id);
      console.log("[CreateEvent] Simulating event creation with data:", eventDataToSave);
      Alert.alert('Event Created (Simulated)', 'Your event has been successfully created!');
      router.back();

    } catch (error) {
      console.error("[CreateEvent] Error during simulated event creation:", error);
      Alert.alert("Creation Failed (Simulated)", "Could not create your event. Please try again later.");
    } finally {
      setIsCreatingEvent(false);
    }
  };

  const inputAccessoryViewID = 'uniqueInputAccessoryViewID';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.scrollContentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.imagePickerContainer} onPress={handlePickImage}>
          {newEvent.imageUri ? (
            <>
              <Image source={{ uri: newEvent.imageUri }} style={styles.eventImagePreview} />
              {isUploadingImage && (
                <View style={styles.uploadProgressOverlay}>
                  <Text style={styles.uploadProgressText}>{Math.round(uploadProgress)}%</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.imagePickerPlaceholder}>
              <MaterialCommunityIcons name="camera-plus-outline" size={48} color="#A0A0A0" />
              <Text style={styles.imagePickerText}>Add Event Photo</Text>
            </View>
          )}
          <View style={styles.imageEditIconContainer}>
            <MaterialCommunityIcons name="camera-flip-outline" size={20} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        <View style={styles.formSection}>
          <TextInput
            style={styles.inputEventName}
            placeholder="Event Name"
            placeholderTextColor="#A0A0A0"
            value={newEvent.eventName}
            onChangeText={(text) => setNewEvent({ ...newEvent, eventName: text })}
            autoCorrect={false}
            inputAccessoryViewID={inputAccessoryViewID}
          />

          <TouchableOpacity style={styles.inputRow} onPress={() => showDateTimePicker('startDate')}>
            <MaterialCommunityIcons name="calendar-clock" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={newEvent.startDate ? styles.inputText : styles.placeholderText}>
              {newEvent.startDate ? formatDate(newEvent.startDate) : 'Start'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
          <View style={styles.separatorThin} />
          <TouchableOpacity style={styles.inputRow} onPress={() => showDateTimePicker('endDate')}>
            <View style={{width: 22, marginRight: 15}} />
            <Text style={newEvent.endDate ? styles.inputText : styles.placeholderText}>
              {newEvent.endDate ? formatDate(newEvent.endDate) : 'End'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
          
          <View style={styles.separatorThick} />

          <TouchableOpacity 
            style={styles.inputRow} 
            onPress={() => router.push({
              pathname: '/(screens)/selectLocation',
              params: { currentLocation: newEvent.location, previousPath: currentPath }
            })}
          >
            <Ionicons name="location-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <TextInput
                placeholder="Choose Location"
                placeholderTextColor={styles.placeholderText.color}
                style={styles.inputText}
                value={newEvent.location}
                onChangeText={(text) => setNewEvent({ ...newEvent, location: text })}
                editable={false}
                pointerEvents="none"
            />
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <View style={styles.separatorThick} />

          <TouchableOpacity style={styles.inputRow} onPress={() => console.log('Add Description - Consider full screen editor for long text')}>
            <MaterialCommunityIcons name="text-long" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
             <TextInput
                placeholder="Add Description"
                placeholderTextColor={styles.placeholderText.color}
                style={[styles.inputText, {height: 80}]}
                value={newEvent.description}
                onChangeText={(text) => setNewEvent({ ...newEvent, description: text })}
                multiline
                textAlignVertical="top"
                inputAccessoryViewID={inputAccessoryViewID}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.optionsTitle}>Options</Text>
          <TouchableOpacity 
            style={styles.inputRow} 
            onPress={() => router.push({
              pathname: '/(screens)/selectVisibility',
              params: { currentVisibility: newEvent.visibility, previousPath: currentPath },
            })}
          >
            <Ionicons name="eye-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputText}>Visibility</Text>
            <Text style={[styles.inputText, {color: styles.placeholderText.color, textAlign: 'right'}]}>{newEvent.visibility}</Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
          <View style={styles.separatorThin} />
          <TouchableOpacity 
            style={styles.inputRow} 
            onPress={() => router.push({
              pathname: '/(screens)/selectCapacity',
              params: { currentCapacity: newEvent.capacity, previousPath: currentPath }
            })}
          >
            <Ionicons name="people-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputText}>Capacity</Text>
            <Text style={[styles.inputText, {color: styles.placeholderText.color, textAlign: 'right'}]}>{newEvent.capacity}</Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

      </ScrollView>
      
      {showPicker && (
        <DateTimePicker
          testID="dateTimePicker"
          value={ (currentPickerTarget === 'startDate' && newEvent.startDate) || 
                  (currentPickerTarget === 'endDate' && newEvent.endDate) || 
                  new Date() }
          mode={pickerMode}
          is24Hour={false} // Set to true if 24hr format is preferred
          display={Platform.OS === 'ios' ? 'spinner' : 'default'} // 'spinner' for iOS, 'default' (calendar/clock) for Android
          onChange={onDateTimeChange}
          // minimumDate={new Date()} // Optional: prevent picking past dates for start
          // textColor for iOS spinner (if needed for theme)
          // themeVariant for iOS 14+ (if needed for dark/light theme)
        />
      )}

      <View style={styles.createButtonContainerOuter}>
        <TouchableOpacity style={styles.createButton} onPress={handleCreateEvent}>
            <Text style={styles.createButtonText}>Create Event</Text>
        </TouchableOpacity>
      </View>
      
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0', // Light gray background for the screen
  },
  container: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: 120, // Increased padding for create button area
  },
  imagePickerContainer: {
    height: 220,
    backgroundColor: '#E0E0E0', // Lighter placeholder background for light theme
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  eventImagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePickerPlaceholder: {
      justifyContent: 'center',
      alignItems: 'center',
  },
  imagePickerText: {
      color: '#666666', // Darker text for light theme
      marginTop: 10,
      fontSize: 16,
  },
  imageEditIconContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.4)', // Kept dark for contrast on image
    padding: 8,
    borderRadius: 20,
  },
  formSection: {
    marginTop: 20,
    marginHorizontal: 15,
    backgroundColor: '#FFFFFF', // White background for form sections on light theme
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, // Subtle shadow for light theme
    shadowRadius: 3,
    elevation: 2,
  },
  inputEventName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333333', // Dark text for light theme
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0E0E0', // Lighter separator for light theme
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  inputIcon: {
    marginRight: 15,
    color: '#888888', // Defined color here
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    color: '#333333', 
  },
  placeholderText: {
    flex: 1,
    fontSize: 16,
    color: '#999999', // Defined color here
  },
  separatorThin: {
    height: 0.5,
    backgroundColor: '#E0E0E0',
    marginLeft: 20 + 22 + 15, 
  },
  separatorThick: {
    height: 15, // Increased spacing between major form blocks
    backgroundColor: 'transparent', 
  },
  optionsTitle: {
    fontSize: 13, // Slightly smaller
    color: '#777777', // Medium gray for section title
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  createButtonContainerOuter: {
      padding: 15, 
      paddingBottom: Platform.OS === 'ios' ? 30 : 20, 
      backgroundColor: '#F0F0F0', // Match screen background or make it distinct
  },
  createButton: {
    backgroundColor: '#007AFF', // Standard iOS blue, adjust to Dynasty theme accent
    paddingVertical: 16, // Slightly less padding
    borderRadius: 10, // Standard rounding
    alignItems: 'center',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});

export default CreateEventScreen; 