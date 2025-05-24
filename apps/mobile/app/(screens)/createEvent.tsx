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
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useNavigation, useLocalSearchParams, usePathname, router as expoRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { getFirebaseAuth } from '../../src/lib/firebase';
import { createEventMobile } from '../../src/lib/eventUtils';
import { useImageUpload } from '../../hooks/useImageUpload';
import { callFirebaseFunction, showErrorAlert } from '../../src/lib/errorUtils'; // Corrected import for callFirebaseFunction
import { showErrorAlert as oldShowErrorAlert } from '../../src/lib/errorUtils'; // Added for consistent error display
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { useSmartMediaUpload } from '../../hooks/useSmartMediaUpload';
import { useEncryption } from '../../src/contexts/EncryptionContext';

// Custom components
import FullScreenDatePicker from '../../components/ui/FullScreenDatePicker';
import TimePickerModal from '../../components/ui/TimePickerModal';
import MediaGallery, { MediaItem } from '../../components/ui/MediaGallery';
import { Colors } from '../../constants/Colors'; // Import Colors for dynastyGreen

// Define the primary green color from the app's theme
const dynastyGreen = Colors.dynastyGreen; // Use from Colors.ts

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
  privacy: 'public' | 'family_tree' | 'invite_only'; // Updated to match API
  allowGuestPlusOne: boolean;
  showGuestList: boolean;
  
  // RSVP settings
  requireRsvp: boolean;
  rsvpDeadline: Date | null;
  
  // MODIFIED: Cover photos now explicitly MediaItem[]
  photos: MediaItem[]; 
  
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
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Event Creation Error',
    trackCurrentScreen: true
  });
  const params = useLocalSearchParams<{
    selectedVisibility?: 'public' | 'family_tree' | 'invite_only',
    selectedLocation?: string, 
    selectedLocationLat?: string,
    selectedLocationLng?: string,
    selectedInviteType?: 'all' | 'select',
    newSelectedMembers?: string, 
    fromScreen?: string,
    prefillDate?: string, 
    prefillStartTime?: string, 
    prefillEndTime?: string,
  }>();
  const currentPath = usePathname();

  useEffect(() => {
    if (!isError) {
      // Clear any local error states when global error is cleared
    }
  }, [isError]);

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
    privacy: 'invite_only',
    allowGuestPlusOne: false,
    showGuestList: true,
    requireRsvp: true,
    rsvpDeadline: new Date(new Date().setDate(new Date().getDate() + 7)), // Default 1 week from now
    photos: [], // Initialize as empty MediaItem array
    inviteType: 'all',
    selectedMembers: [],
  });

  const [isCreatingEvent, setIsCreatingEvent] = useState<boolean>(false);

  // Family members state
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize Firebase Auth
  const auth = getFirebaseAuth();

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
  
  const smartUpload = useSmartMediaUpload();
  const { isEncryptionReady } = useEncryption();

  // State for DateTimePickerModal (NEW)
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [isTimePickerVisible, setTimePickerVisibility] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date'); // This is for the NEW modal picker
  const [currentPickerTarget, setCurrentPickerTarget] = useState<'eventDate' | 'endDate' | 'rsvpDeadline' | null>(null); // This is for the NEW date modal picker
  const [timePickerTarget, setTimePickerTarget] = useState<'startTime' | 'endTime' | null>(null); // This is for the NEW time modal picker

  // This effect handles parameters passed from other screens (like location or visibility selection)
  useEffect(() => {
    console.log('[CreateEventScreen] Params received:', JSON.stringify(params, null, 2));
    // Handle prefilled date and time from calendar view
    if (params.prefillDate) {
      try {
        const eventDate = new Date(params.prefillDate);
        if (!isNaN(eventDate.getTime())) {
          setNewEvent(prev => ({
            ...prev,
            eventDate,
            endDate: prev.isMultiDay ? prev.endDate : eventDate,
            startTime: params.prefillStartTime ?? prev.startTime,
            endTime: params.prefillEndTime ?? prev.endTime,
          }));
        }
        // Clear prefill params after use
        if (Platform.OS !== 'web') { // setParams is not available on web with expo-router
          expoRouter.setParams({ prefillDate: undefined, prefillStartTime: undefined, prefillEndTime: undefined });
        }
      } catch (e) {
        console.error("Failed to parse prefilled date", e);
      }
    }

    // Handle selection screen params
    let paramsUsed = false;
    if (params.fromScreen === 'selectVisibility' && params.selectedVisibility) {
      console.log('[CreateEventScreen] Applying visibility params:', params.selectedVisibility);
      setNewEvent(prev => ({ ...prev, privacy: params.selectedVisibility! }));
      paramsUsed = true;
    } else if (params.fromScreen === 'selectLocation' && params.selectedLocation) {
      console.log('[CreateEventScreen] Applying location params:', params.selectedLocation);
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
      paramsUsed = true;
    } else if (params.fromScreen === 'selectInviteType' && params.selectedInviteType) {
      console.log('[CreateEventScreen] Applying invite type params:', params.selectedInviteType);
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
      paramsUsed = true;
    }

    if (paramsUsed && Platform.OS !== 'web') {
      console.log('[CreateEventScreen] Clearing fromScreen params');
      expoRouter.setParams({
        fromScreen: undefined,
        selectedVisibility: undefined,
        selectedLocation: undefined,
        selectedLocationLat: undefined,
        selectedLocationLng: undefined,
        selectedInviteType: undefined,
        newSelectedMembers: undefined,
      });
    }
  }, [params]);

  // Permissions state (added for clarity, can be part of useEffect)
  const [mediaLibraryPermission, setMediaLibraryPermission] = useState<ImagePicker.PermissionStatus | null>(null);

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setMediaLibraryPermission(status);
        if (status !== ImagePicker.PermissionStatus.GRANTED) {
          // Alert.alert('Permission Required', 'We need access to your photos to select cover images.');
          // You might want to inform the user here or disable photo functionality if not granted.
        }
      }
    })();
  }, []);

  // MARK: - Photo Handling Logic (Adapted for MediaGallery)

  const maxPhotos = 5; 

  // New handler for adding media via MediaGallery's request
  const handlePickMediaForEvent = async () => {
    if (Platform.OS !== 'web' && mediaLibraryPermission !== ImagePicker.PermissionStatus.GRANTED) {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setMediaLibraryPermission(status);
      if (status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert("Permission Required", "Access to your photos and videos is needed.");
        return;
      }
    }

    if (newEvent.photos.length >= maxPhotos) {
      Alert.alert("Maximum Media Reached", `You can only add up to ${maxPhotos} photos/videos.`);
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All, // Allow images and videos
        allowsMultipleSelection: true,
        selectionLimit: maxPhotos - newEvent.photos.length,
        quality: 0.8,
        // videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720, // Example for video quality control
      });

      if (!result.canceled && result.assets) {
        const newMediaItems: MediaItem[] = result.assets.map(asset => {
          const mediaType: 'image' | 'video' = (asset.duration && asset.duration > 0) ? 'video' : 'image';
          return {
            uri: asset.uri,
            type: mediaType,
            asset: asset, // Store the original asset for potential use by useImageUpload
            width: asset.width,
            height: asset.height,
            duration: mediaType === 'video' ? (asset.duration === null ? undefined : asset.duration) : undefined,
          };
        });
        
        setNewEvent(prev => ({
          ...prev,
          photos: [...prev.photos, ...newMediaItems].slice(0, maxPhotos)
        }));
      }
    } catch (error) {
      console.error("Error picking media: ", error);
      Alert.alert("Media Picker Error", "Could not load items from library.");
    }
  };

  // New handler for removing media, called by MediaGallery
  const handleRemoveMediaFromEvent = (index: number) => {
    setNewEvent(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };
  
  // New handler for replacing media, called by MediaGallery
  const handleReplaceMediaInEvent = async (index: number) => {
    if (Platform.OS !== 'web' && mediaLibraryPermission !== ImagePicker.PermissionStatus.GRANTED) {
      // ... (permission check as in handlePickMediaForEvent)
      Alert.alert("Permission Required", "Access to your photos and videos is needed.");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false, // Typically false for replacement to keep it simple
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const replacedAsset = result.assets[0];
        const mediaType: 'image' | 'video' = (replacedAsset.duration && replacedAsset.duration > 0) ? 'video' : 'image';
        
        const newMediaItem: MediaItem = {
          uri: replacedAsset.uri,
          type: mediaType,
          asset: replacedAsset,
          width: replacedAsset.width,
          height: replacedAsset.height,
          duration: mediaType === 'video' ? (replacedAsset.duration === null ? undefined : replacedAsset.duration) : undefined,
        };

        setNewEvent(prev => ({
          ...prev,
          photos: prev.photos.map((item, i) => i === index ? newMediaItem : item)
        }));
      }
    } catch (error) {
      console.error("Error replacing media: ", error);
      Alert.alert("Media Picker Error", "Could not replace the item.");
    }
  };

  // ADAPTED from createStory.tsx: Function to upload all media items (images/videos)
  const uploadAllEventMedia = async (mediaItems: MediaItem[]) => {
    const localMediaToUpload = mediaItems.filter(
      item => typeof item.uri === 'string' && (item.uri.startsWith('file://') || item.uri.startsWith('content://'))
    );

    if (localMediaToUpload.length === 0) {
      // Return URLs of already uploaded media (if any) mixed with local non-uploadable URIs (e.g. http)
      return mediaItems.map(item => item.uri);
    }

    setIsUploading(true);
    setTotalUploads(localMediaToUpload.length);
    setCompletedUploads(0);
    setOverallProgress(0);

    const uploadedUrls: string[] = [];
    // Keep track of all items, replacing local URIs with remote ones upon successful upload
    const finalMediaUris = [...mediaItems.map(item => item.uri)]; 

    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      if (typeof item.uri === 'string' && (item.uri.startsWith('file://') || item.uri.startsWith('content://'))) {
        try {
          const uniqueFileName = `${auth.currentUser!.uid}-${Date.now()}-${i}-${item.uri.split('/').pop()}`;
          const storagePath = `eventImages/${auth.currentUser!.uid}/${newEvent.title.replace(/\s+/g, '_')}_${Date.now()}_${i}/${uniqueFileName}`;
          
          console.log(`[uploadAllEventMedia] Uploading: ${item.uri} to ${storagePath}`);
          
          // Use smart upload which handles encryption based on settings
          const uploadResult = await smartUpload.uploadMedia(
            item.uri,
            'event',
            {
              fileName: uniqueFileName,
              mimeType: item.type === 'video' ? 'video/mp4' : 'image/jpeg',
              pathPrefix: storagePath.split('/').slice(0, -1).join('/'), // Extract directory from path
            },
            (progress) => {
              // Progress for this single item
              // Overall progress needs to sum up fractions from each item
              // This simplified approach updates overall based on completed items + current item's progress
              const currentItemProgressFraction = progress / 100 / totalUploads;
              const completedItemsFraction = completedUploads / totalUploads;
              setOverallProgress((completedItemsFraction + currentItemProgressFraction) * 100);
            }
          );

          if (uploadResult) {
            const imageUrl = uploadResult.url;
            console.log(`[uploadAllEventMedia] Uploaded ${item.uri} to ${imageUrl}${uploadResult.key ? ' (encrypted)' : ''}`);
            finalMediaUris[i] = imageUrl; // Update the URI in the final list
            uploadedUrls.push(imageUrl); // Collect successfully uploaded URLs for the payload
            setCompletedUploads(prev => prev + 1);
            // Ensure progress reflects full completion for this item
             setOverallProgress( (completedUploads + 1) / totalUploads * 100);

          } else {
            console.warn(`[uploadAllEventMedia] Upload failed for ${item.uri}, URL was null.`);
            // finalMediaUris[i] remains the local URI, it won't be in uploadedUrls
          }
        } catch (error) {
          console.error(`[uploadAllEventMedia] Error uploading media ${item.uri}:`, error);
          // finalMediaUris[i] remains local URI
        }
      } else {
        // This URI is not local (e.g. already an http URL), so it's considered "uploaded" or pre-existing.
        // It's already in finalMediaUris. If it's a non-local URI that should be part of coverPhotos,
        // ensure it's also included in a way that your backend/display logic can handle it.
        // For simplicity, we only add to uploadedUrls if it was processed by this function.
        // If you need to pass ALL uris (local (failed) + remote (successful) + pre-existing http) to backend, adjust below.
      }
    }
    
    // After loop, ensure progress is 100% if all attempted uploads are done (success or fail)
    setOverallProgress(100); 
    setIsUploading(false);
    
    // IMPORTANT: The backend `createEvent` function expects `coverPhotos` to be an array of URLs.
    // We should return the URLs of *successfully uploaded* media.
    // If an existing photo was already a URL, it should also be included if it's still in newEvent.photos.
    // `finalMediaUris` contains original URIs, with local ones replaced by remote ones if upload was successful.
    // We need to decide what goes to the backend: just newly uploaded, or all current URIs.
    // Assuming we want to save ALL current URIs that are in newEvent.photos, where local ones are replaced if uploaded.
    return finalMediaUris; 
  };

  const handleCreateEvent = withErrorHandling(async () => {
    reset();
    if (!auth.currentUser) { 
      // Use showErrorAlert for consistency
      showErrorAlert({ code: "unauthenticated", message: "You need to be logged in to create an event." }, "Authentication Error");
      return;
    }
    // Basic Validation
    if (!newEvent.title.trim()) {
        // Using showErrorAlert for validation errors
        showErrorAlert({ code: "invalid-argument", message: "Please provide an event title." }, 'Missing Title');
        return;
    }
    if (!newEvent.eventDate) {
        showErrorAlert({ code: "invalid-argument", message: "Please select a start date." }, 'Missing Start Date');
        return;
    }
    if (newEvent.isMultiDay && !newEvent.endDate) {
        showErrorAlert({ code: "invalid-argument", message: "Please select an end date for multi-day event." }, 'Missing End Date');
        return;
    }
    if (newEvent.isMultiDay && newEvent.endDate && newEvent.eventDate && newEvent.endDate <= newEvent.eventDate) {
        showErrorAlert({ code: "invalid-argument", message: "End date must be after start date." }, 'Invalid Dates');
        return;
    }
    if (!newEvent.isVirtual && !newEvent.location.trim() && !newEvent.selectedLocation) {
        showErrorAlert({ code: "invalid-argument", message: "Please provide an event location or mark as virtual." }, 'Missing Location');
        return;
    }
    if (newEvent.isVirtual && !newEvent.virtualLink.trim()) {
        showErrorAlert({ code: "invalid-argument", message: "Please provide a link for the virtual event." }, 'Missing Virtual Link');
        return;
    }
    if (newEvent.requireRsvp && !newEvent.rsvpDeadline) {
      showErrorAlert({ code: "invalid-argument", message: "Please set an RSVP deadline." }, 'Missing RSVP Deadline');
      return;
    }
    if (newEvent.requireRsvp && newEvent.rsvpDeadline && newEvent.eventDate && newEvent.rsvpDeadline >= newEvent.eventDate) {
      showErrorAlert({ code: "invalid-argument", message: "RSVP deadline must be before the event date." }, 'Invalid RSVP Deadline');
      return;
    }
    if (newEvent.inviteType === 'select' && newEvent.selectedMembers.length === 0) {
      showErrorAlert({ code: "invalid-argument", message: "Please select at least one family member to invite." }, 'No Invitees');
      return;
    }

    if (isUploadingImage) { // Changed from isUploadingImage to the general isUploading state
        showErrorAlert({ code: "aborted", message: "Media is currently uploading. Please wait." }, "Please Wait");
        return;
    }

    setIsCreatingEvent(true);

    try {
      const allCoverMediaUrls = await uploadAllEventMedia(newEvent.photos);
      
      const localPhotosAttempted = newEvent.photos.some(p => p.uri.startsWith('file://') || p.uri.startsWith('content://'));
      const successfulHttpUploads = allCoverMediaUrls.some(url => typeof url === 'string' && url.startsWith('http'));

      if (localPhotosAttempted && !successfulHttpUploads && newEvent.photos.length > 0) {
        showErrorAlert({ code: "internal", message: "Some media items failed to upload. Please check and try again." }, "Upload Failed");
        setIsCreatingEvent(false);
        return;
      }

      const formatDateToYYYYMMDD = (date: Date | null): string | null => {
        if (!date) return null;
        return date.toISOString().split('T')[0];
      };

      // Use the eventUtils function to create the event
      const eventId = await createEventMobile({
        title: newEvent.title.trim(),
        description: newEvent.description.trim(),
        eventDate: formatDateToYYYYMMDD(newEvent.eventDate) || '',
        endDate: newEvent.isMultiDay ? formatDateToYYYYMMDD(newEvent.endDate) : undefined,
        startTime: newEvent.startTime,
        endTime: newEvent.endTime,
        timezone: newEvent.timezone,
        location: newEvent.isVirtual ? undefined : newEvent.selectedLocation,
        isVirtual: newEvent.isVirtual,
        virtualLink: newEvent.isVirtual ? newEvent.virtualLink.trim() : undefined,
        privacy: newEvent.privacy,
        allowGuestPlusOne: newEvent.allowGuestPlusOne,
        showGuestList: newEvent.showGuestList,
        requireRsvp: newEvent.requireRsvp,
        rsvpDeadline: newEvent.requireRsvp ? formatDateToYYYYMMDD(newEvent.rsvpDeadline) : undefined,
        dresscode: newEvent.dressCode?.trim(),
        whatToBring: newEvent.whatToBring?.trim(),
        additionalInfo: undefined,
        invitedMemberIds: newEvent.inviteType === "all" 
            ? familyMembers.map(member => member.id)
            : newEvent.selectedMembers,
        coverPhotoStoragePaths: allCoverMediaUrls.filter(url => typeof url === 'string'),
      });

      if (eventId) {
        Alert.alert('Event Created', 'Your event has been successfully created!');
        router.back();
      } else {
        console.error("[CreateEvent] Failed to create event, no event ID returned");
        showErrorAlert({ code: "unknown", message: "Event creation failed. Please try again." }, "Creation Failed");
      }

    } catch (error: any) {
      handleError(error, { 
        action: 'createEvent',
        metadata: { 
          eventTitle: newEvent.title,
          isVirtual: newEvent.isVirtual,
          privacy: newEvent.privacy,
          photoCount: newEvent.photos.length
        }
      });
      showErrorAlert(error, "Creation Failed");
    } finally {
      setIsCreatingEvent(false);
    }
  });

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
      // If selecting RSVP deadline, ensure it's before event date
      if (currentPickerTarget === 'rsvpDeadline' && newEvent.eventDate && date >= newEvent.eventDate) {
        Alert.alert("Invalid RSVP Deadline", "RSVP deadline must be before the event date.");
        setNewEvent(prev => ({ ...prev, rsvpDeadline: new Date(prev.eventDate!.getTime() - 24 * 60 * 60 * 1000) })); // Set to day before event
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
      const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      setNewEvent(prev => ({ ...prev, [timePickerTarget]: formattedTime }));
    }
    hideTimePicker();
  };

  // Helper to get a Date object from HH:MM string for TimePickerModal
  const getTimeAsDate = (timeString: string): Date => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes);
    return date;
  };

  const [isUploading, setIsUploading] = useState(false); // General uploading state for all media
  const [overallProgress, setOverallProgress] = useState(0); // Overall progress for all media
  const [totalUploads, setTotalUploads] = useState(0); // Total number of media items to upload
  const [completedUploads, setCompletedUploads] = useState(0); // Number of successfully uploaded media items

  // Re-add formatDate and formatTime as they are used for event date/time display
  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
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
      hour12: true
    });
  };

  return (
    <ErrorBoundary screenName="CreateEventScreen">
      <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.scrollContentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <MediaGallery
          media={newEvent.photos}
          onAddMedia={handlePickMediaForEvent}
          onRemoveMedia={handleRemoveMediaFromEvent}
          onReplaceMedia={handleReplaceMediaInEvent}
          maxMedia={maxPhotos}
          style={styles.mediaGallerySection}
        />

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

          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="calendar-clock" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputLabel}>Start Date</Text>
            <TouchableOpacity
              style={styles.valueContainer}
              onPress={() => showDatePickerModalFor('eventDate')}
            >
              <Text style={newEvent.eventDate ? styles.inputTextValue : styles.placeholderTextValue}>
                {newEvent.eventDate ? formatDate(newEvent.eventDate) : 'Select...'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputRow}>
            <Ionicons name="time-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputLabel}>Start Time</Text>
            <TouchableOpacity
              style={styles.valueContainer}
              onPress={() => showTimePickerModalFor('startTime')}
            >
              <Text style={styles.inputTextValue}>
                {formatTime(newEvent.startTime)}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          </View>
          
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
              <View style={styles.inputRow}>
                <View style={{width: 22, marginRight: 15}} />
                <Text style={styles.inputLabel}>End Date</Text>
                <TouchableOpacity
                  style={styles.valueContainer}
                  onPress={() => showDatePickerModalFor('endDate')}
                >
                  <Text style={newEvent.endDate ? styles.inputTextValue : styles.placeholderTextValue}>
                    {newEvent.endDate ? formatDate(newEvent.endDate) : 'Select...'}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
                </TouchableOpacity>
              </View>

              <View style={styles.inputRow}>
                <View style={{width: 22, marginRight: 15}} />
                <Text style={styles.inputLabel}>End Time</Text>
                <TouchableOpacity
                  style={styles.valueContainer}
                  onPress={() => showTimePickerModalFor('endTime')}
                >
                  <Text style={styles.inputTextValue}>
                    {formatTime(newEvent.endTime)}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
                </TouchableOpacity>
              </View>
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
            <Text style={[styles.inputText, {color: styles.placeholderText.color, textAlign: 'right'}]}>
              {newEvent.privacy === 'public' ? 'Public' : 
               newEvent.privacy === 'family_tree' ? 'Family Tree' : 'Invitees Only'}
            </Text>
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

          <View style={styles.inputRow}>
            <Ionicons name="people-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputLabel}>Allow guests to bring +1</Text>
            <Switch
              value={newEvent.allowGuestPlusOne}
              onValueChange={(value) => setNewEvent({ ...newEvent, allowGuestPlusOne: value })}
              trackColor={{ false: "#E9E9EA", true: dynastyGreen }}
              thumbColor={newEvent.allowGuestPlusOne ? "#f4f3f4" : "#f4f3f4"}
            />
          </View>
          <View style={styles.separatorThin} />

          <View style={styles.inputRow}>
            <Ionicons name="list-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputLabel}>Show guest list</Text>
            <Switch
              value={newEvent.showGuestList}
              onValueChange={(value) => setNewEvent({ ...newEvent, showGuestList: value })}
              trackColor={{ false: "#E9E9EA", true: dynastyGreen }}
              thumbColor={newEvent.showGuestList ? "#f4f3f4" : "#f4f3f4"}
            />
          </View>
          <View style={styles.separatorThin} />

          <TouchableOpacity 
            style={styles.inputRow} 
            onPress={() => router.push({
              pathname: '/(screens)/selectMembersScreen',
              params: { 
                inviteType: newEvent.inviteType,
                selectedMembers: JSON.stringify(newEvent.selectedMembers),
                previousPath: currentPath 
              },
            })}
          >
            <Ionicons name="mail-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputLabel}>Invite</Text>
            <Text style={[styles.inputText, {color: styles.placeholderText.color, textAlign: 'right'}]}>
              {newEvent.inviteType === 'all' ? 'All Family' : `${newEvent.selectedMembers.length} Selected`}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
          <View style={styles.separatorThin} />

          <View style={styles.inputRow}>
            <Ionicons name="checkmark-circle-outline" size={22} color={styles.inputIcon.color} style={styles.inputIcon} />
            <Text style={styles.inputLabel}>RSVP required</Text>
            <Switch
              value={newEvent.requireRsvp}
              onValueChange={(value) => setNewEvent({ ...newEvent, requireRsvp: value })}
              trackColor={{ false: "#E9E9EA", true: dynastyGreen }}
              thumbColor={newEvent.requireRsvp ? "#f4f3f4" : "#f4f3f4"}
            />
          </View>
          {newEvent.requireRsvp && (
            <View style={styles.inputRow}>
              <View style={{width: 22, marginRight: 15}} />
              <Text style={styles.inputLabel}>RSVP deadline</Text>
              <TouchableOpacity
                style={styles.valueContainer}
                onPress={() => showDatePickerModalFor('rsvpDeadline')}
              >
                <Text style={newEvent.rsvpDeadline ? styles.inputTextValue : styles.placeholderTextValue}>
                  {newEvent.rsvpDeadline ? formatDate(newEvent.rsvpDeadline) : 'Select...'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.separatorThin} />

          <View style={styles.descriptionInputContainer}>
            <MaterialCommunityIcons name="tshirt-crew-outline" size={22} color={styles.inputIcon.color} style={[styles.inputIcon, {marginTop: Platform.OS === 'ios' ? 0 : 3 }]} />
             <TextInput
                placeholder="Dress Code (optional)"
                placeholderTextColor={styles.placeholderText.color}
                style={styles.descriptionTextInput}
                value={newEvent.dressCode}
                onChangeText={(text) => setNewEvent({ ...newEvent, dressCode: text })}
                inputAccessoryViewID={inputAccessoryViewID}
            />
          </View>
          <View style={styles.separatorThin} />

          <View style={styles.descriptionInputContainer}>
            <MaterialCommunityIcons name="bag-personal-outline" size={22} color={styles.inputIcon.color} style={[styles.inputIcon, {marginTop: Platform.OS === 'ios' ? 0 : 3 }]} />
             <TextInput
                placeholder="What to bring (optional)"
                placeholderTextColor={styles.placeholderText.color}
                style={styles.descriptionTextInput}
                value={newEvent.whatToBring}
                onChangeText={(text) => setNewEvent({ ...newEvent, whatToBring: text })}
                inputAccessoryViewID={inputAccessoryViewID}
            />
          </View>

        </View>

      </ScrollView>
      
      {/* DatePicker Instance */}
      <FullScreenDatePicker
        isVisible={isDatePickerVisible}
        mode="date"
        onDateChange={handleDateConfirm}
        onDismiss={hideDatePicker}
        value={
          (currentPickerTarget === 'eventDate' && newEvent.eventDate) ||
          (currentPickerTarget === 'endDate' && newEvent.endDate) ||
          (currentPickerTarget === 'rsvpDeadline' && newEvent.rsvpDeadline) ||
          new Date()
        }
        minimumDate={currentPickerTarget === 'endDate' && newEvent.eventDate ? newEvent.eventDate : undefined}
        maximumDate={undefined}
        timeZoneName={newEvent.timezone}
        doneButtonLabel="Done"
        display="spinner"
      />

      {/* TimePicker Instance */}
      <TimePickerModal
        isVisible={isTimePickerVisible}
        onConfirm={handleTimeConfirm}
        onCancel={hideTimePicker}
        value={
          (timePickerTarget === 'startTime' && getTimeAsDate(newEvent.startTime)) ||
          (timePickerTarget === 'endTime' && getTimeAsDate(newEvent.endTime)) ||
          new Date()
        }
        timeZoneName={newEvent.timezone}
        confirmText="Confirm"
        cancelText="Cancel"
        is24Hour={false}
      />

      <View style={styles.createButtonContainerOuter}>
        <TouchableOpacity style={styles.createButton} onPress={handleCreateEvent}>
            <Text style={styles.createButtonText}>Create Event</Text>
        </TouchableOpacity>
      </View>
      
      </SafeAreaView>
    </ErrorBoundary>
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
    top: 8,
    right: 8,
    backgroundColor: '#FFFFFF',
    width: 30,
    height: 30,
    borderRadius: 15, // Makes it a circle
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
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
  imageWrapper: {
    width: Dimensions.get('window').width, // full screen width
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  replacePhotoButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    zIndex: 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 6,
    borderRadius: 20,
  },
  valueContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  mediaGallerySection: {
    marginTop: 20,
    marginHorizontal: 15,
    backgroundColor: '#FFFFFF', 
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, 
    shadowRadius: 3,
    elevation: 2,
  },
});

export default CreateEventScreen; 