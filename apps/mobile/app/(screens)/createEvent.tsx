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
  Switch,
  InputAccessoryView,
  Keyboard,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useNavigation, useLocalSearchParams, usePathname } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DateTimePickerModal from "react-native-modal-datetime-picker";
// import { auth, db } from '../../src/lib/firebase'; // Commented out Firebase
// import { collection, addDoc, serverTimestamp } from "firebase/firestore"; // Commented out Firebase
import { useImageUpload } from '../../hooks/useImageUpload';

// Define the primary green color from the app's theme
const dynastyGreen = '#1A4B44';

// Interface for event creation data
interface NewEventData {
  title: string; // Changed from eventName
  eventDate: Date | null; // Represents start date
  endDate: Date | null;
  isMultiDay: boolean;
  startTime: string; // Format "HH:MM"
  endTime: string; // Format "HH:MM"
  timezone: string;
  location: string;
  selectedLocation: {
    address: string;
    lat: number;
    lng: number;
  } | null;
  isVirtual: boolean;
  virtualLink: string;
  
  // Additional details (maps to web's structure)
  description: string; // General description
  dressCode?: string;
  whatToBring?: string;
  
  // Privacy settings
  privacy: 'family' | 'private'; // 'private' means invitees only
  allowGuestPlusOne: boolean;
  showGuestList: boolean;
  
  // RSVP settings
  requireRsvp: boolean;
  rsvpDeadline: Date | null;
  
  // Cover photos - now an array of Files/URIs
  photos: Array<{ uri: string; file?: File /* for web, RN uses URI */}>; 
  
  // Invite settings
  inviteType: 'all' | 'select';
  selectedMembers: string[]; // Array of user IDs
  
  // Old fields to be reviewed/removed if not mapped
  // visibility: 'Public' | 'Private' | 'Friends Only'; // Replaced by new 'privacy' and inviteType
  // capacity: string; // Not directly in web version, review if needed
  // imageUri?: string | null; // Replaced by 'photos' array
}

// Family member structure for selection
interface FamilyMember {
  id: string;
  displayName: string;
  profilePicture: string | null;
}

const CreateEventScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    // Params from sub-screens like selectLocation, selectVisibility etc.
    // These will need to be updated or re-thought based on new UI flows
    selectedVisibility?: 'family' | 'private', // Matched to new privacy type
    selectedLocation?: string, // Keep for now, but selectedLocation object is richer
    selectedLocationLat?: string,
    selectedLocationLng?: string,
    selectedInviteType?: 'all' | 'select',
    newSelectedMembers?: string, // Expecting a JSON string of array
    fromScreen?: string 
  }>();
  const currentPath = usePathname();

  const [newEvent, setNewEvent] = useState<NewEventData>({
    title: '',
    eventDate: new Date(), // Default to today
    endDate: new Date(new Date().setDate(new Date().getDate() + 1)), // Default to tomorrow for multi-day
    isMultiDay: false,
    startTime: '12:00',
    endTime: '14:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    location: '',
    selectedLocation: null,
    isVirtual: false,
    virtualLink: '',
    description: '',
    dressCode: '',
    whatToBring: '',
    privacy: 'private',
    allowGuestPlusOne: false,
    showGuestList: true,
    requireRsvp: true,
    rsvpDeadline: new Date(new Date().setDate(new Date().getDate() + 7)), // Default 1 week from now
    photos: [],
    inviteType: 'all',
    selectedMembers: [],
  });

  const [isCreatingEvent, setIsCreatingEvent] = useState<boolean>(false);

  // Cover photo specific states
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number[]>([]); // Progress per photo
  const [photoUploadErrors, setPhotoUploadErrors] = useState<(string | null)[]>([]); // Error per photo

  // Family members state
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // MARK: - Navigation Setup
  useEffect(() => {
    navigation.setOptions({
      title: 'Create Event', // Set the header title
      headerBackTitleVisible: false, // Should be redundant if headerLeft is used, but good practice
      headerStyle: { backgroundColor: '#FFFFFF' }, 
      headerTintColor: dynastyGreen, 
      headerTitleStyle: { fontWeight: '600', color: dynastyGreen }, 
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10, padding: 5 }}>
          <Ionicons name="arrow-back" size={28} color={dynastyGreen} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, router]);

  // Use the image upload hook - this might need to be replaced or heavily adapted
  // for multiple uploads and to align with web's `uploadMedia` utility.
  // For now, keeping it to see how it conflicts or can be used.
  const { 
    isUploading: isUploadingImage, 
    uploadProgress,
    error: uploadError,
    uploadImage 
  } = useImageUpload();

  // State for DateTimePickerModal (NEW)
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [isTimePickerVisible, setTimePickerVisibility] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date'); // This is for the NEW modal picker
  const [currentPickerTarget, setCurrentPickerTarget] = useState<'eventDate' | 'endDate' | 'rsvpDeadline' | null>(null); // This is for the NEW date modal picker
  const [timePickerTarget, setTimePickerTarget] = useState<'startTime' | 'endTime' | null>(null); // This is for the NEW time modal picker

  // This effect handles parameters passed from other screens (like location or visibility selection)
  // It seems okay for now.
  useEffect(() => {
    if (params.fromScreen === 'selectVisibility' && params.selectedVisibility) {
      // setNewEvent(prev => ({ ...prev, visibility: params.selectedVisibility! })); // Old
      setNewEvent(prev => ({ ...prev, privacy: params.selectedVisibility! }));
    } else if (params.fromScreen === 'selectLocation' && params.selectedLocation) {
      const lat = params.selectedLocationLat ? parseFloat(params.selectedLocationLat) : null;
      const lng = params.selectedLocationLng ? parseFloat(params.selectedLocationLng) : null;
      if (lat !== null && lng !== null) {
        setNewEvent(prev => ({ 
          ...prev, 
          location: params.selectedLocation!,
          selectedLocation: { address: params.selectedLocation!, lat, lng }
        }));
      } else {
        setNewEvent(prev => ({ ...prev, location: params.selectedLocation!, selectedLocation: null }));
      }
    } else if (params.fromScreen === 'selectInviteType' && params.selectedInviteType) {
      setNewEvent(prev => ({ ...prev, inviteType: params.selectedInviteType!}));
      if (params.selectedInviteType === 'select' && params.newSelectedMembers) {
        try {
          const members = JSON.parse(params.newSelectedMembers);
          if (Array.isArray(members)) {
            setNewEvent(prev => ({ ...prev, selectedMembers: members }));
          }
        } catch (e) {
          console.error("Failed to parse selected members from params", e);
        }
      }
    }
    // Clear params after processing to avoid re-triggering (basic approach)
    // A more robust solution might involve a navigation state or context
    // router.setParams({ fromScreen: undefined, selectedVisibility: undefined, selectedLocation: undefined, selectedLocationLat: undefined, selectedLocationLng: undefined, selectedInviteType: undefined, newSelectedMembers: undefined });
  }, [params, router]);

  const [mediaLibraryPermission, requestMediaLibraryPermission] = ImagePicker.useMediaLibraryPermissions();

  const handlePickImage = async () => {
    // Request permission if not granted or undetermined
    if (mediaLibraryPermission && mediaLibraryPermission.status !== ImagePicker.PermissionStatus.GRANTED && mediaLibraryPermission.canAskAgain) {
      const permissionResult = await requestMediaLibraryPermission();
      if (permissionResult.status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert("Permission Required", "We need access to your photos to select cover images.");
        return;
      }
    }

    if (newEvent.photos.length >= 5) {
      Alert.alert("Limit Reached", "You can upload a maximum of 5 photos.");
      return;
    }

    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // allowsEditing: false, // cannot be used with allowsMultipleSelection
        allowsMultipleSelection: true, 
        quality: 0.8, // Compress images slightly for faster uploads
        selectionLimit: 5 - newEvent.photos.length, // Allow selecting remaining number of photos
        // aspect: [16, 9], // consider if a fixed aspect ratio is desired for covers
      });

      if (!result.canceled && result.assets) {
        const newPhotos = result.assets.map(asset => ({ uri: asset.uri }));
        setNewEvent(prev => ({
          ...prev,
          photos: [...prev.photos, ...newPhotos].slice(0, 5) // Ensure we don't exceed 5 photos
        }));
      }
    } catch (error) {
      console.error("ImagePicker Error: ", error);
      Alert.alert("Image Picker Error", "Could not select images. Please try again.");
    }
  };

  const removePhoto = (index: number) => {
    setNewEvent(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    // Example format: Wed, May 7 at 5:00 AM (adjust options as needed for exact format)
    return date.toLocaleDateString('en-US', { // Using toLocaleDateString for just date part
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timeString: string): string => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10));
    date.setMinutes(parseInt(minutes, 10));
    return date.toLocaleTimeString('en-US', {
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
    if (!newEvent.title.trim()) {
        Alert.alert('Missing Title', 'Please provide an event title.');
        return;
    }
    if (!newEvent.eventDate) {
        Alert.alert('Missing Start Date', 'Please select a start date.');
        return;
    }
    if (newEvent.isMultiDay && !newEvent.endDate) {
        Alert.alert('Missing End Date', 'Please select an end date for multi-day event.');
        return;
    }
    if (newEvent.isMultiDay && newEvent.endDate && newEvent.eventDate && newEvent.endDate <= newEvent.eventDate) {
        Alert.alert('Invalid Dates', 'End date must be after start date.');
        return;
    }
    if (!newEvent.isVirtual && !newEvent.location.trim() && !newEvent.selectedLocation) {
        Alert.alert('Missing Location', 'Please provide an event location or mark as virtual.');
        return;
    }
    if (newEvent.isVirtual && !newEvent.virtualLink.trim()) {
        Alert.alert('Missing Virtual Link', 'Please provide a link for the virtual event.');
        return;
    }
    if (newEvent.requireRsvp && !newEvent.rsvpDeadline) {
      Alert.alert('Missing RSVP Deadline', 'Please set an RSVP deadline.');
      return;
    }
    if (newEvent.inviteType === 'select' && newEvent.selectedMembers.length === 0) {
      Alert.alert('No Invitees', 'Please select at least one family member to invite.');
      return;
    }


    if (isUploadingImage) { // Prevent concurrent actions
        Alert.alert("Please Wait", "Image is currently uploading.");
        return;
    }

    setIsCreatingEvent(true);
    let eventImageUrls: string[] = []; // For multiple photos

    try {
      // Upload images if any are selected
      if (newEvent.photos.length > 0) {
        // This part needs to be adapted to use `uploadMedia` from web or a similar robust uploader
        // The current `useImageUpload` hook is for single image and might not be suitable.
        // For now, simulating upload for all photos.
        console.log('[CreateEvent] Attempting to upload event photos:', newEvent.photos.length);
        
        const uploadPromises = newEvent.photos.map(async (photo, index) => {
          try {
            // Simulate upload or integrate with a proper upload utility
            // For now, let's assume uploadImage can handle one by one and we collect URLs
            // This is a placeholder for actual multi-image upload logic
            setPhotoUploadProgress(prev => { const p = [...prev]; p[index] = 50; return p; }); // Simulate progress
            const imageUrl = await uploadImage(photo.uri, `eventImages/${newEvent.title.replace(/\s+/g, '_')}_${index}`); 
            if (imageUrl) {
              setPhotoUploadProgress(prev => { const p = [...prev]; p[index] = 100; return p; });// Simulate completion
              return imageUrl;
            } else {
              setPhotoUploadErrors(prev => { const e = [...prev]; e[index] = "Upload failed"; return e; });
              throw new Error(`Upload failed for photo ${index}`);
            }
          } catch (error) {
            console.error(`Error uploading photo ${index}:`, error);
            setPhotoUploadErrors(prev => { const e = [...prev]; e[index] = (error as Error).message; return e; });
            throw error; // Re-throw to fail Promise.all
          }
        });

        try {
          eventImageUrls = await Promise.all(uploadPromises.map(p => p.catch(e => null))) as string[];
          eventImageUrls = eventImageUrls.filter(url => url !== null); // Filter out failed uploads
          console.log('[CreateEvent] Simulated Upload - Event Image URLs:', eventImageUrls);
        } catch (uploadError) {
          console.error("[CreateEvent] One or more image uploads failed:", uploadError);
          Alert.alert("Image Upload Failed", "Some images could not be uploaded. Please try again.");
          setIsCreatingEvent(false);
          return;
        }
      }


      const eventDataToSave = {
        title: newEvent.title.trim(),
        eventDate: newEvent.eventDate, // Already a Date object
        endDate: newEvent.isMultiDay ? newEvent.endDate : null,
        startTime: newEvent.startTime,
        endTime: newEvent.endTime,
        timezone: newEvent.timezone,
        location: newEvent.isVirtual ? null : newEvent.selectedLocation, // Use selectedLocation object
        virtualLink: newEvent.isVirtual ? newEvent.virtualLink.trim() : null,
        isVirtual: newEvent.isVirtual,
        description: newEvent.description.trim(),
        dressCode: newEvent.dressCode?.trim() || null,
        whatToBring: newEvent.whatToBring?.trim() || null,
        privacy: newEvent.privacy,
        allowGuestPlusOne: newEvent.allowGuestPlusOne,
        showGuestList: newEvent.showGuestList,
        requireRsvp: newEvent.requireRsvp,
        rsvpDeadline: newEvent.requireRsvp ? newEvent.rsvpDeadline : null,
        hostId: 'mockUserId123', // Replace with actual currentUser.uid,
        // invitedMembers: newEvent.inviteType === "all" ? familyMembers.map(member => member.id) : newEvent.selectedMembers,
        // ^ This needs familyMembers to be populated
        invitedMembers: newEvent.inviteType === "all" ? [] : newEvent.selectedMembers, // Placeholder if all family not yet fetched/implemented
        coverPhotos: eventImageUrls, // Use the array of URLs
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

  // NEW Date/Time Picker Logic with react-native-modal-datetime-picker

  const showDatePickerModalFor = (target: 'eventDate' | 'endDate' | 'rsvpDeadline') => {
    setCurrentPickerTarget(target);
    setDatePickerVisibility(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisibility(false);
    setCurrentPickerTarget(null);
  };

  const handleDateConfirm = (date: Date) => {
    if (currentPickerTarget) {
      setNewEvent(prev => ({ ...prev, [currentPickerTarget]: date }));
      // If selecting start date for a non-multi-day event, ensure end date is same or later
      if (currentPickerTarget === 'eventDate' && !newEvent.isMultiDay) {
        setNewEvent(prev => ({ ...prev, endDate: date }));
      }
      // If selecting end date, ensure it's not before start date
      if (currentPickerTarget === 'endDate' && newEvent.eventDate && date < newEvent.eventDate) {
        Alert.alert("Invalid End Date", "End date cannot be before the start date.");
        setNewEvent(prev => ({ ...prev, endDate: prev.eventDate })); // Reset to start date
      }
    }
    hideDatePicker();
  };

  const showTimePickerModalFor = (target: 'startTime' | 'endTime') => {
    setTimePickerTarget(target);
    setTimePickerVisibility(true);
  };

  const hideTimePicker = () => {
    setTimePickerVisibility(false);
    setTimePickerTarget(null);
  };

  const handleTimeConfirm = (date: Date) => {
    if (timePickerTarget) {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      setNewEvent(prev => ({ ...prev, [timePickerTarget]: timeString }));
    }
    hideTimePicker();
  };

  // Helper to get a Date object from HH:MM string for TimePickerModal
  const getTimeAsDate = (timeString: string): Date => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours);
    date.setMinutes(minutes);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.scrollContentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.imagePickerContainer} onPress={handlePickImage}>
          {newEvent.photos.length > 0 ? (
            <>
              <Image source={{ uri: newEvent.photos[0].uri }} style={styles.eventImagePreview} />
              {/* Display a count if more than one photo */}
              {newEvent.photos.length > 1 && (
                <View style={styles.photoCountBadge}>
                  <Text style={styles.photoCountText}>+{newEvent.photos.length - 1}</Text>
                </View>
              )}
              {/* General upload progress might be tricky for multiple files here,
                  Individual progress bars would be better near previews if shown */}
              {isUploadingImage && ( // This `isUploadingImage` from hook is for single; needs rework for multi
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
            value={newEvent.title}
            onChangeText={(text) => setNewEvent({ ...newEvent, title: text })}
            autoCorrect={false}
            inputAccessoryViewID={inputAccessoryViewID}
          />

          <TouchableOpacity style={styles.inputRow} onPress={() => showDatePickerModalFor('eventDate')}>
            <MaterialCommunityIcons name="calendar-clock" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputLabel}>Start Date</Text>
            <Text style={newEvent.eventDate ? styles.inputTextValue : styles.placeholderTextValue}>
              {newEvent.eventDate ? formatDate(newEvent.eventDate) : 'Select...'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.inputRow} onPress={() => showTimePickerModalFor('startTime')}>
            <Ionicons name="time-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputLabel}>Start Time</Text>
            <Text style={styles.inputTextValue}>
              {formatTime(newEvent.startTime)}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
          
          <View style={styles.separatorThin} />

          <View style={styles.inputRow}>
            <Ionicons name="repeat-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputLabel}>Multi-day event</Text>
            <Switch
              value={newEvent.isMultiDay}
              onValueChange={(value) => setNewEvent({ ...newEvent, isMultiDay: value, endDate: value && !newEvent.endDate ? new Date(newEvent.eventDate!.getTime() + 24 * 60 * 60 * 1000) : newEvent.endDate })} // Default end date to next day if not set
              trackColor={{ false: "#E9E9EA", true: dynastyGreen }}
              thumbColor={newEvent.isMultiDay ? "#f4f3f4" : "#f4f3f4"}
            />
          </View>

          {newEvent.isMultiDay && (
            <>
              <TouchableOpacity style={styles.inputRow} onPress={() => showDatePickerModalFor('endDate')}>
                <View style={{width: 22, marginRight: 15}} />
                <Text style={styles.inputLabel}>End Date</Text>
                <Text style={newEvent.endDate ? styles.inputTextValue : styles.placeholderTextValue}>
                  {newEvent.endDate ? formatDate(newEvent.endDate) : 'Select...'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.inputRow} onPress={() => showTimePickerModalFor('endTime')}>
                <View style={{width: 22, marginRight: 15}} />
                <Text style={styles.inputLabel}>End Time</Text>
                <Text style={styles.inputTextValue}>
                  {formatTime(newEvent.endTime)}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
              </TouchableOpacity>
            </>
          )}
          
          <View style={styles.separatorThin} />

          <View style={styles.inputRow}>
            <Ionicons name="globe-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            {/* For now, just display timezone, make it pressable later for selection */}
            <TextInput
              style={[styles.inputText, { flex: 1 }]}
              value={newEvent.timezone}
              // onChangeText={(text) => setNewEvent({ ...newEvent, timezone: text })} // Placeholder
              placeholder="Timezone"
              editable={false} // Make this a TouchableOpacity that opens a modal
            />
             {/* <Ionicons name="chevron-forward" size={20} color="#C7C7CC" /> // Add when pressable */}
          </View>
          
          <View style={styles.separatorThick} />

          <View style={styles.inputRow}>
            <Ionicons name="videocam-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputLabel}>Virtual Event</Text>
            <Switch
              value={newEvent.isVirtual}
              onValueChange={(value) => setNewEvent({ ...newEvent, isVirtual: value })}
              trackColor={{ false: "#E9E9EA", true: dynastyGreen }}
              thumbColor={newEvent.isVirtual ? "#f4f3f4" : "#f4f3f4"}
            />
          </View>

          {newEvent.isVirtual ? (
            <TextInput
              style={styles.inputField} 
              placeholder="Virtual Meeting Link (e.g., https://zoom.us/j/...)"
              value={newEvent.virtualLink}
              onChangeText={(text) => setNewEvent({ ...newEvent, virtualLink: text })}
              inputAccessoryViewID={inputAccessoryViewID}
              keyboardType="url"
              autoCapitalize="none"
            />
          ) : (
            <TouchableOpacity 
              style={styles.inputRow} 
              onPress={() => router.push({
                pathname: '/(screens)/selectLocation', // This screen might need updates too
                params: { currentLocation: newEvent.location, previousPath: currentPath }
              })}
            >
              <Ionicons name="location-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
              <TextInput
                  placeholder="Choose Location"
                  placeholderTextColor={styles.placeholderText.color}
                  style={styles.inputText}
                  value={newEvent.selectedLocation ? newEvent.selectedLocation.address : newEvent.location}
                  // onChangeText={(text) => setNewEvent({ ...newEvent, location: text })} // Location text can be derived
                  editable={false}
                  pointerEvents="none"
              />
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          )}
          

          <View style={styles.separatorThick} />

          <View style={styles.descriptionInputContainer}>
            <MaterialCommunityIcons name="text-long" size={22} color={styles.inputIcon.color} style={[styles.inputIcon, {marginTop: Platform.OS === 'ios' ? 0 : 3 }]} />
             <TextInput
                placeholder="Add Description"
                placeholderTextColor={styles.placeholderText.color}
                style={styles.descriptionTextInput}
                value={newEvent.description}
                onChangeText={(text) => setNewEvent({ ...newEvent, description: text })}
                multiline
                textAlignVertical="top"
                inputAccessoryViewID={inputAccessoryViewID}
                scrollEnabled={false}
            />
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.optionsTitle}>Options</Text>
          <TouchableOpacity 
            style={styles.inputRow} 
            onPress={() => router.push({
              pathname: '/(screens)/selectVisibility', // This screen needs to be updated for 'family' | 'private'
              params: { currentVisibility: newEvent.privacy, previousPath: currentPath },
            })}
          >
            <Ionicons name="eye-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputLabel}>Visibility</Text>
            <Text style={[styles.inputText, {color: styles.placeholderText.color, textAlign: 'right'}]}>{newEvent.privacy === 'family' ? 'All Family' : 'Invitees Only'}</Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
          <View style={styles.separatorThin} />
          {/* Remove Capacity or adapt if needed from web version */}
          {/* <TouchableOpacity 
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
          </TouchableOpacity> */}

          {/* TODO: Add UI for Allow Guest +1 */}
          {/* TODO: Add UI for Show Guest List */}
          {/* TODO: Add UI for Invite Type (All Family / Select) */}
          {/* TODO: Add UI for RSVP Required Toggle */}
          {/* TODO: Add UI for RSVP Deadline Picker */}
          {/* TODO: Add UI for Dress Code, What to Bring (as optional inputs) */}
          {/* TODO: Add UI for displaying multiple photo previews and remove buttons */}

        </View>

      </ScrollView>
      
      {/* DateTimePickerModal Instances */}
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={handleDateConfirm}
        onCancel={hideDatePicker}
        date={
          (currentPickerTarget === 'eventDate' && newEvent.eventDate) ||
          (currentPickerTarget === 'endDate' && newEvent.endDate) ||
          (currentPickerTarget === 'rsvpDeadline' && newEvent.rsvpDeadline) ||
          new Date()
        }
        minimumDate={currentPickerTarget === 'endDate' && newEvent.eventDate ? newEvent.eventDate : undefined}
        timeZoneName={newEvent.timezone} // Pass timezone
      />

      <DateTimePickerModal
        isVisible={isTimePickerVisible}
        mode="time"
        onConfirm={handleTimeConfirm}
        onCancel={hideTimePicker}
        date={
          (timePickerTarget === 'startTime' && getTimeAsDate(newEvent.startTime)) ||
          (timePickerTarget === 'endTime' && getTimeAsDate(newEvent.endTime)) ||
          new Date()
        }
        is24Hour={true} // Or based on locale/preference
        timeZoneName={newEvent.timezone} // Pass timezone
      />

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={inputAccessoryViewID}>
          <View style={{ alignItems: 'flex-end', backgroundColor: '#EFF0F1', paddingVertical: 5, paddingHorizontal: 10 }}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()}>
              <Text style={{ color: dynastyGreen, fontWeight: 'bold' }}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
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
  inputText: { // General style for text within input rows if it's not the value part
    flex: 1,
    fontSize: 16,
    color: '#333333', 
  },
  inputLabel: { // Style for labels like "Start Date", "Visibility"
    fontSize: 16,
    color: '#333333',
    marginRight: 10, // Add some space between label and value
  },
  inputTextValue: { // Style for the actual value part of the input row
    flex: 1,
    fontSize: 16,
    color: '#555555', // Slightly different color for value
    textAlign: 'right',
  },
  placeholderText: { // Old placeholder style - can be merged or kept if distinct use case
    flex: 1,
    fontSize: 16,
    color: '#999999', 
  },
  placeholderTextValue: { // Style for placeholder value part of the input row
    flex: 1,
    fontSize: 16,
    color: '#C7C7CC',
    textAlign: 'right',
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
    backgroundColor: dynastyGreen, // Use app's primary green
    paddingVertical: 16, 
    borderRadius: 10, 
    alignItems: 'center',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  photoCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  uploadProgressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  uploadProgressText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  photoPreviewList: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    alignItems: 'center',
  },
  photoPreviewContainer: {
    marginRight: 10,
    position: 'relative',
  },
  photoPreviewItem: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
  },
  removePhotoButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
  },
  addAnotherPhotoButton: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#E9E9EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 5, // If there are other photos, add some margin
  },
  addAnotherPhotoText: {
    marginTop: 5,
    fontSize: 12,
    color: dynastyGreen, // Use app's primary green
  },
  optionsTitleContainer: { // Added for consistency if optionsTitle is used for sections
    paddingHorizontal: 15,
    paddingTop: 20, 
    paddingBottom: 5, 
  },
  inputField: { // A more generic style for text inputs
    fontSize: 16,
    color: '#333333',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0E0E0',
  },
  descriptionInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  descriptionTextInput: {
    flex: 1,
    fontSize: 16,
    color: '#333333',
    minHeight: 40,
    maxHeight: 120,
    paddingTop: 0,
    paddingBottom: 0,
    lineHeight: 20,
  },
});

export default CreateEventScreen; 