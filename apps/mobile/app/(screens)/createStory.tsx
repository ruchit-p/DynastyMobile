import React, { useState, useCallback, useEffect } from 'react';
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
  Modal,
  Button,
  Linking,
  ActivityIndicator
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useRouter, useNavigation, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import AnimatedActionSheet, { ActionSheetAction } from '../../components/ui/AnimatedActionSheet';
import PrivacySegmentedControl from '../../components/ui/PrivacySegmentedControl';
import SelectViewers from '../../components/ui/SelectViewers';
import TagPeopleButton from '../../components/ui/TagPeopleButton';
import AddDetailsButton from '../../components/ui/AddDetailsButton';
import AddContentButton from '../../components/ui/AddContentButton';
import { useAuth } from '../../src/contexts/AuthContext';
import { createStoryMobile, updateStoryMobile, fetchAccessibleStoriesMobile, Story as FetchedStory, StoryBlock as FetchedStoryBlock } from '../../src/lib/storyUtils';
import Fonts from '../../constants/Fonts';
import { useImageUpload } from '../../hooks/useImageUpload';

// MARK: - Types
type BlockType = "text" | "image" | "video" | "audio";

interface StoryBlock {
  id: string;
  type: BlockType;
  content: any; // string for text, ImagePicker.ImagePickerAsset[] for media, etc.
}

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

const CreateStoryScreen = () => {
  const { user, firestoreUser } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ storyId?: string; editMode?: string; returnedPurpose?: string; selectedIds?: string; recordedAudioUri?: string; recordedAudioDuration?: string }>(); // Typed params
  const { uploadImage, isUploading: isImageUploading, uploadProgress } = useImageUpload();

  const storyIdForEdit = params.storyId;
  // const isEditing = params.editMode === 'true'; // Will be replaced by isActuallyEditingNow and displayAsEditMode

  // Latch the initial edit mode for header display consistency
  const [displayAsEditMode] = useState(() => params.editMode === 'true' && !!params.storyId);
  const isActuallyEditingNow = params.editMode === 'true' && !!params.storyId; // For action logic

  // MARK: - State Variables
  const [isLoading, setIsLoading] = useState(false); // For loading state during fetch
  const [storyTitle, setStoryTitle] = useState('');
  
  const [showDate, setShowDate] = useState(false); // Date hidden by default, added via Additional Details
  const [storyDate, setStoryDate] = useState<Date | null>(new Date());
  
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [subtitle, setSubtitle] = useState('');

  const [showLocation, setShowLocation] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);

  const [privacy, setPrivacy] = useState<'family' | 'personal' | 'custom'>('family');
  // const [customAccessMembers, setCustomAccessMembers] = useState<string[]>([]); // For custom privacy
  const [taggedMembers, setTaggedMembers] = useState<string[]>([]); // Placeholder
  const [customSelectedViewers, setCustomSelectedViewers] = useState<string[]>([]); // For custom privacy viewers

  const [blocks, setBlocks] = useState<StoryBlock[]>([]);
  
  const [isAddDetailsModalVisible, setAddDetailsModalVisible] = useState(false);
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [isDetailsActionSheetVisible, setDetailsActionSheetVisible] = useState(false);
  const [isAddContentActionSheetVisible, setAddContentActionSheetVisible] = useState(false);
  const [isAudioActionSheetVisible, setAudioActionSheetVisible] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [totalUploads, setTotalUploads] = useState(0);
  const [completedUploads, setCompletedUploads] = useState(0);

  // Placeholder for user avatar/name - can be removed if not used
  // const userAvatar = 'https://via.placeholder.com/40';
  // const userName = 'Current User';

  // ADDED: useEffect to log isAudioActionSheetVisible changes
  useEffect(() => {
    console.log(`isAudioActionSheetVisible changed to: ${isAudioActionSheetVisible}`);
  }, [isAudioActionSheetVisible]);

  // MARK: - Handlers (Moved Up and Wrapped in useCallback)

  // Function to upload all images in image blocks and return updated blocks with Firebase Storage URLs
  const uploadAllImages = async (storyBlocks: Array<{
    type: string;
    data: any;
    localId: string;
  }>) => {
    // Count total images that need to be uploaded
    let imagesToUpload = 0;
    storyBlocks.forEach(block => {
      if (block.type === 'image' && Array.isArray(block.data)) {
        block.data.forEach(uri => {
          // Only count local file URIs
          if (typeof uri === 'string' && uri.startsWith('file://')) {
            imagesToUpload++;
          }
        });
      }
    });
    
    if (imagesToUpload === 0) {
      // No images to upload, return blocks as is
      return storyBlocks;
    }
    
    setIsUploading(true);
    setTotalUploads(imagesToUpload);
    setCompletedUploads(0);
    setOverallProgress(0);
    
    // Deep copy of blocks to avoid mutating the original
    const updatedBlocks = JSON.parse(JSON.stringify(storyBlocks));
    
    // Process each block
    for (let i = 0; i < updatedBlocks.length; i++) {
      const block = updatedBlocks[i];
      
      if (block.type === 'image' && Array.isArray(block.data)) {
        // Create new array for updated image URLs
        const updatedImageUrls = [];
        
        // Process each image in the block
        for (let j = 0; j < block.data.length; j++) {
          const uri = block.data[j];
          
          if (typeof uri === 'string' && uri.startsWith('file://')) {
            try {
              // Upload image to Firebase Storage
              const uploadedUrl = await uploadImage(
                uri, 
                'stories', 
                (progress) => {
                  // Update overall progress
                  const currentTotalProgress = (completedUploads + progress / 100) / totalUploads * 100;
                  setOverallProgress(currentTotalProgress);
                }
              );
              
              if (uploadedUrl) {
                updatedImageUrls.push(uploadedUrl);
                setCompletedUploads(prev => prev + 1);
              } else {
                // If upload failed but we have a URI, use original URI as fallback
                console.warn(`Failed to upload image ${j} in block ${i}, using original URI as fallback`);
                updatedImageUrls.push(uri);
              }
            } catch (error) {
              console.error(`Error uploading image ${j} in block ${i}:`, error);
              // Use original URI as fallback
              updatedImageUrls.push(uri);
            }
          } else {
            // Not a local file URI, probably already a Firebase URL, keep as is
            updatedImageUrls.push(uri);
          }
        }
        
        // Update block with new image URLs
        block.data = updatedImageUrls;
      }
    }
    
    setIsUploading(false);
    return updatedBlocks;
  };

  const handleSaveStory = useCallback(async () => {
    if (!storyTitle.trim()) {
      Alert.alert('Missing Title', 'Please provide a title for your story.');
      return;
    }
    if (!firestoreUser?.familyTreeId) {
        Alert.alert('Family Tree Error', 'You must be part of a family tree to create stories.');
        return;
    }

    setIsLoading(true); 

    const transformedBlocks = blocks.map(block => {
      if (block.type === 'text') {
        return {
          type: 'text',
          data: block.content,
          localId: block.id
        };
      } else if (block.type === 'image') {
        return {
          type: 'image',
          data: Array.isArray(block.content) ? block.content.map((asset: ImagePicker.ImagePickerAsset) => asset.uri) : [],
          localId: block.id
        };
      } else if (block.type === 'audio') {
        const audioUri = (typeof block.content === 'object' && block.content.uri) ? block.content.uri : '';
        return {
          type: 'audio',
          data: audioUri, 
          localId: block.id
        };
      } else {
        return {
          type: block.type,
          data: block.content, 
          localId: block.id
        };
      }
    });
    
    try {
      // Upload all images to Firebase Storage and get updated blocks with Firebase URLs
      const updatedBlocks = await uploadAllImages(transformedBlocks);
      
      const storyPayload = {
        authorID: user?.uid || '',
        title: storyTitle,
        subtitle: showSubtitle ? subtitle : undefined,
        eventDate: showDate && storyDate ? storyDate : undefined,
        location: showLocation && location ? { lat: location.latitude, lng: location.longitude, address: location.address || '' } : undefined,
        privacy: (privacy === 'personal' ? 'privateAccess' : privacy) as 'family' | 'privateAccess' | 'custom',
        customAccessMembers: privacy === 'custom' ? customSelectedViewers : undefined,
        blocks: updatedBlocks,
        familyTreeId: firestoreUser.familyTreeId, 
        peopleInvolved: taggedMembers,
      };
      
      console.log('Full story payload:', JSON.stringify(storyPayload, null, 2));

      const newStoryId = await createStoryMobile(storyPayload);
      console.log('Story created with ID:', newStoryId);
      Alert.alert('Success', 'Your story has been saved.');
      router.back();
    } catch (error) {
      console.error('Error creating story:', error);
      Alert.alert('Error', `Failed to save your story: ${ (error as Error).message }`);
    } finally {
      setIsLoading(false);
    }
  }, [storyTitle, firestoreUser, user, blocks, subtitle, showSubtitle, storyDate, showDate, location, showLocation, privacy, customSelectedViewers, taggedMembers, router, uploadImage]);

  const handleUpdateStory = useCallback(async () => {
    if (!storyTitle.trim()) {
      Alert.alert('Missing Title', 'Please provide a title for your story.');
      return;
    }
    if (!storyIdForEdit || !user?.uid) {
      Alert.alert('Error', 'Cannot update story. Missing ID or user information.');
      return;
    }

    setIsLoading(true);
    
    const transformedBlocksForUpdate = blocks.map(block => {
      if (block.type === 'text') {
        return { type: 'text', data: block.content, localId: block.id };
      } else if (block.type === 'image') {
        const imageUris = (block.content as ImagePicker.ImagePickerAsset[])?.map(asset => asset.uri) || [];
        return { type: 'image', data: imageUris, localId: block.id };
      } else if (block.type === 'audio') {
        const audioUri = (typeof block.content === 'object' && block.content.uri) ? block.content.uri : '';
        return { type: 'audio', data: audioUri, localId: block.id };
      }
      return { type: block.type, data: block.content, localId: block.id };
    });

    try {
      // Upload all images to Firebase Storage and get updated blocks with Firebase URLs
      const updatedBlocks = await uploadAllImages(transformedBlocksForUpdate);
      
      const storyUpdatePayload: Parameters<typeof updateStoryMobile>[2] = {
        title: storyTitle,
        subtitle: showSubtitle ? subtitle : undefined,
        eventDate: showDate && storyDate ? new Date(storyDate) : undefined,
        location: showLocation && location ? { lat: location.latitude, lng: location.longitude, address: location.address || '' } : undefined,
        privacy: (privacy === 'personal' ? 'privateAccess' : privacy) as 'family' | 'privateAccess' | 'custom',
        customAccessMembers: privacy === 'custom' ? customSelectedViewers : undefined,
        blocks: updatedBlocks,
        peopleInvolved: taggedMembers,
      };

      Object.keys(storyUpdatePayload).forEach(key => {
        if ((storyUpdatePayload as any)[key] === undefined) {
          delete (storyUpdatePayload as any)[key];
        }
      });
      
      console.log('Updating story with payload:', JSON.stringify(storyUpdatePayload, null, 2));

      await updateStoryMobile(storyIdForEdit!, user.uid, storyUpdatePayload);
      Alert.alert('Success', 'Your story has been updated.');
      router.back();
    } catch (error) {
      console.error('Error updating story:', error);
      Alert.alert('Error', `Failed to update your story: ${ (error as Error).message }`);
    } finally {
      setIsLoading(false);
    }
  }, [storyTitle, storyIdForEdit, user, blocks, subtitle, showSubtitle, storyDate, showDate, location, showLocation, privacy, customSelectedViewers, taggedMembers, router, uploadImage]);

  // MARK: - Load Story Data for Editing
  useEffect(() => {
    if (isActuallyEditingNow && storyIdForEdit && user?.uid && firestoreUser?.familyTreeId) {
      const loadStoryForEdit = async () => {
        setIsLoading(true);
        navigation.setOptions({ title: 'Loading Story...' });
        try {
          // Assuming fetchAccessibleStoriesMobile can fetch a single story by ID if it's accessible
          // Or, ideally, have a dedicated getStoryById function.
          // For now, we'll filter from accessible stories.
          const stories = await fetchAccessibleStoriesMobile(user.uid, firestoreUser.familyTreeId);
          const storyToEdit = stories.find(s => s.id === storyIdForEdit);

          if (storyToEdit) {
            // Populate state with storyToEdit data
            setStoryTitle(storyToEdit.title || '');
            
            if (storyToEdit.subtitle) {
              setSubtitle(storyToEdit.subtitle);
              setShowSubtitle(true);
            }
            
            if (storyToEdit.eventDate) {
              setStoryDate(new Date(storyToEdit.eventDate.seconds * 1000));
              setShowDate(true);
            } else {
              setStoryDate(null);
              setShowDate(false);
            }
            
            if (storyToEdit.location) {
              setLocation({
                latitude: storyToEdit.location.lat,
                longitude: storyToEdit.location.lng,
                address: storyToEdit.location.address,
              });
              setShowLocation(true);
            } else {
              setLocation(null);
              setShowLocation(false);
            }

            // Map privacy from 'privateAccess' back to 'personal' for the UI component
            const uiPrivacy = storyToEdit.privacy === 'privateAccess' ? 'personal' : storyToEdit.privacy;
            setPrivacy(uiPrivacy as 'family' | 'personal' | 'custom');
            
            if (storyToEdit.privacy === 'custom' && storyToEdit.customAccessMembers) {
              setCustomSelectedViewers(storyToEdit.customAccessMembers);
            } else {
              setCustomSelectedViewers([]);
            }
            
            if (storyToEdit.peopleInvolved) {
              setTaggedMembers(storyToEdit.peopleInvolved);
            } else {
              setTaggedMembers([]);
            }

            // Map FetchedStoryBlock to local StoryBlock
            const fetchedBlocks = storyToEdit.blocks || [];
            const mappedBlocks: StoryBlock[] = fetchedBlocks.map((block: FetchedStoryBlock) => {
              let content: any;
              if (block.type === 'text') {
                content = block.data as string;
              } else if (block.type === 'image') {
                content = (block.data as string[]).map(uri => ({ uri, type: 'image', width:0, height:0 }) as ImagePicker.ImagePickerAsset);
              } else if (block.type === 'audio') {
                // block.data is URI string from backend for audio
                content = {
                  uri: block.data as string, 
                  duration: 0, // Placeholder - duration isn't stored with this model
                  name: 'Audio Clip', // Placeholder
                  isRecording: false, // Default
                };
              } else {
                content = block.data; // Fallback for other types
              }
              return {
                id: block.localId || Math.random().toString(36).substr(2, 9), // Use localId or generate new
                type: block.type as BlockType,
                content: content,
              };
            });
            setBlocks(mappedBlocks);

          } else {
            Alert.alert("Error", "Could not find the story to edit.", [{ text: "OK", onPress: () => router.back() }]);
          }
        } catch (error) {
          console.error("Error loading story for editing:", error);
          Alert.alert("Error", "Failed to load story details for editing.", [{ text: "OK", onPress: () => router.back() }]);
        } finally {
          setIsLoading(false);
        }
      };
      loadStoryForEdit();
    }
  }, [isActuallyEditingNow, storyIdForEdit, user, firestoreUser, navigation, router]);

  // MARK: - Navigation Setup & Data Return Handling
  useEffect(() => {
    const screenTitle = displayAsEditMode ? 'Edit Story' : 'Create Story';
    const saveButtonText = displayAsEditMode ? 'Update' : 'Save';
    const saveAction = isActuallyEditingNow ? handleUpdateStory : handleSaveStory;

    navigation.setOptions({
      title: isLoading ? 'Loading...' : screenTitle,
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10 }}>
          <Ionicons name="arrow-back" size={26} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={saveAction} style={{ marginRight: 15 }} disabled={isLoading || isUploading}>
          <Text style={[
            styles.saveButtonTextNavigator, 
            (isLoading || isUploading) && { color: '#A0A0A0' }
          ]}>
            {isLoading ? '...' : saveButtonText}
          </Text>
        </TouchableOpacity>
      ),
      headerTitleAlign: 'center',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation, router, isLoading, displayAsEditMode, handleSaveStory, handleUpdateStory, isUploading]);

  useEffect(() => {
    // Listener for when the screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      // Check for returned parameters from selectMembersScreen
      const returnedPurpose = params?.returnedPurpose as string | undefined;
      const returnedSelectedIds = params?.selectedIds as string | undefined;

      if (returnedSelectedIds) {
        try {
          const idsArray = JSON.parse(returnedSelectedIds);
          if (Array.isArray(idsArray)) {
            if (returnedPurpose === 'viewers') {
              setCustomSelectedViewers(idsArray);
            } else if (returnedPurpose === 'tagging') {
              setTaggedMembers(idsArray);
            }
            // Clear params after use to avoid re-processing, though Expo Router might handle this
            // For robustness, you might manage this more explicitly if issues arise.
            // router.setParams({ returnedPurpose: undefined, selectedIds: undefined }); 
          }
        } catch (e) {
          console.error("Error processing returned member IDs:", e);
        }
      }
    });

    return unsubscribe; // Cleanup listener on unmount
  }, [navigation, params]);

  // Check for returned audio recording
  useEffect(() => {
    const recordedAudioUri = params?.recordedAudioUri as string | undefined;
    const recordedAudioDuration = params?.recordedAudioDuration as string | undefined;
    
    if (recordedAudioUri) {
      // Log only when we actually have data and are about to process it
      console.log('Processing returned audio:', { recordedAudioUri, recordedAudioDuration });
      // Create a new audio block with the recorded audio
      const newBlock: StoryBlock = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'audio',
        content: {
          uri: recordedAudioUri,
          duration: recordedAudioDuration ? parseInt(recordedAudioDuration) : 0,
          isRecording: true,
        },
      };
      console.log('Recorded newAudioBlock to add:', JSON.stringify(newBlock, null, 2)); // This log can stay
      setBlocks(prevBlocks => [...prevBlocks, newBlock]);
      
      // Clear params to avoid re-processing
      router.setParams({ recordedAudioUri: undefined, recordedAudioDuration: undefined });
    }
  }, [params?.recordedAudioUri, params?.recordedAudioDuration, router]); // MODIFIED dependency array

  // Log blocks state whenever it changes
  useEffect(() => {
    console.log('Current story blocks state:', JSON.stringify(blocks, null, 2));
  }, [blocks]);

  const addBlock = (type: BlockType) => {
    const newBlock: StoryBlock = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: type === 'text' ? '' : [],
    };
    setBlocks(prevBlocks => [...prevBlocks, newBlock]);
    setAddContentActionSheetVisible(false);
  };

  const removeBlock = (id: string) => {
    setBlocks(prevBlocks => prevBlocks.filter(block => block.id !== id));
    setDetailsActionSheetVisible(false);
  };

  const updateBlockContent = (id: string, newContent: any) => {
    setBlocks(prevBlocks => 
      prevBlocks.map(block => 
        block.id === id ? { ...block, content: newContent } : block
      )
    );
    setDetailsActionSheetVisible(false);
  };
  
  // Handle uploading audio files
  const handleUploadAudio = async () => {
    console.log('handleUploadAudio: function entered'); // ADDED LOG
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Allow access to media library to add audio.');
        return;
      }

      // On iOS we can use ImagePicker for audio files
      if (Platform.OS === 'ios') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'], // Use 'All' since 'Audio' is not available, but 'All' includes video which might have audio.
          quality: 1.0,
        });
        console.log('iOS ImagePicker result:', JSON.stringify(result, null, 2)); // ADDED LOG
    
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          console.log('iOS selected asset:', JSON.stringify(asset, null, 2)); // ADDED LOG
          // Ensure the selected asset might be an audio file (e.g., check extension or type if available, though ImagePicker is limited here)
          // For now, we assume if the user picked it in an "audio" context, it's intended as audio.
          const newBlock: StoryBlock = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'audio',
            content: {
              uri: asset.uri,
              name: asset.fileName || `audio_${Date.now()}.${asset.uri.split('.').pop() || 'm4a'}`, // Provide a default name and attempt to get extension
              duration: asset.duration ? Math.floor(asset.duration / 1000) : 0, // duration is in ms, convert to seconds
              isRecording: false,
            },
          };
          console.log('iOS newAudioBlock to add:', JSON.stringify(newBlock, null, 2)); // ADDED LOG
          setBlocks(prevBlocks => [...prevBlocks, newBlock]);
        }
      } else {
        // On Android, we use DocumentPicker
        const result = await DocumentPicker.getDocumentAsync({
          type: 'audio/*',
          copyToCacheDirectory: true, // Good practice for accessing the file
        });
        console.log('Android DocumentPicker result:', JSON.stringify(result, null, 2)); // ADDED LOG
        
        if (result.canceled === false && result.assets && result.assets.length > 0) { // Ensured assets exist and not empty
          const asset = result.assets[0];
          console.log('Android selected asset:', JSON.stringify(asset, null, 2)); // ADDED LOG
          const newBlock: StoryBlock = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'audio',
            content: {
              uri: asset.uri,
              name: asset.name || `audio_${Date.now()}.${asset.uri.split('.').pop() || 'mp3'}`, // asset.name is available in DocumentPicker
              duration: 0, // DocumentPicker asset doesn't directly provide duration. Needs post-processing.
              isRecording: false,
            },
          };
          console.log('Android newAudioBlock to add:', JSON.stringify(newBlock, null, 2)); // ADDED LOG
          setBlocks(prevBlocks => [...prevBlocks, newBlock]);
        }
      }
    } catch (error) {
      console.error("Error picking audio file: ", error);
      Alert.alert("Upload Error", "Could not select audio file.");
    }
    setAudioActionSheetVisible(false);
  };

  // Handle recording audio
  const handleRecordAudio = () => {
    console.log('handleRecordAudio: function entered'); // ADDED LOG
    router.push('/recordAudio' as any);
    setAudioActionSheetVisible(false);
  };
  
  const handleSelectMediaForBlock = async (blockId: string) => {
    // 1. Check current permission status
    let permissionResult = await ImagePicker.getMediaLibraryPermissionsAsync();

    if (permissionResult.status === ImagePicker.PermissionStatus.UNDETERMINED) {
      // 2. If undetermined, request permission
      permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }

    // 3. Handle based on the final permission status
    if (permissionResult.status === ImagePicker.PermissionStatus.DENIED) {
      Alert.alert(
        "Permission Denied", 
        "You've denied access to your photos and videos. Please enable access in Settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() }
        ]
      );
      setAddContentActionSheetVisible(false); // Close sheet if open
      return;
    }
    
    if (permissionResult.status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert("Permission Required", "Photo and video library access is required.");
        setAddContentActionSheetVisible(false); // Close sheet if open
        return;
    }

    // 4. Launch picker if permission is granted
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        updateBlockContent(blockId, result.assets);
      }
    } catch (error) {
      console.error("Error launching image library for block media:", error);
      Alert.alert("Image Picker Error", "Could not open the image library. Please try again.");
    } finally {
      setAddContentActionSheetVisible(false); // Close sheet after action
    }
  };

  const handleTagPeople = () => {
    Alert.alert("Tag People", "People tagging functionality will be implemented here.");
  };

  const handleAddLocation = () => {
    // Placeholder for map integration
    Alert.alert("Add Location", "Apple Maps integration for location selection will be implemented here.");
    // For now, let's simulate selecting a location
    // setLocation({ latitude: 37.78825, longitude: -122.4324, address: "San Francisco, CA" });
    // setShowLocation(true); // Or toggle it from the details modal
  };

  // MARK: - Date Formatting
  const formatDate = (date: Date | null): string => {
    if (!date) return 'Select Date';
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  // MARK: - Date Picker Handlers
  const showDatePicker = () => setDatePickerVisibility(true);
  const hideDatePicker = () => setDatePickerVisibility(false);
  const handleDateConfirm = (date: Date) => { setStoryDate(date); hideDatePicker(); };

  // MARK: - Additional Details Action Sheet Actions
  const detailsActions: ActionSheetAction[] = [
    { title: showSubtitle ? 'Remove Subtitle' : 'Add Subtitle', onPress: () => { setShowSubtitle(!showSubtitle); setDetailsActionSheetVisible(false); } },
    { title: showDate ? 'Remove Date' : 'Add Date', onPress: () => { setShowDate(!showDate); setDetailsActionSheetVisible(false); } },
    { title: showLocation ? 'Remove Location' : 'Add Location', onPress: () => {
        if (showLocation) { setShowLocation(false); setLocation(null); } else { setShowLocation(true); handleAddLocation(); }
        setDetailsActionSheetVisible(false);
      }
    },
    { title: 'Cancel', onPress: () => setDetailsActionSheetVisible(false), style: 'cancel' },
  ];

  // MARK: - Add Content Action Sheet Actions
  const addContentActions: ActionSheetAction[] = [
    { title: 'Add Text', onPress: () => addBlock('text') },
    { title: 'Add Images', onPress: () => addBlock('image') },
    { title: 'Cancel', onPress: () => setAddContentActionSheetVisible(false), style: 'cancel' },
  ];

  // MARK: - Audio Options Action Sheet Actions
  const audioActions: ActionSheetAction[] = [
    { title: 'Upload Audio File', onPress: handleUploadAudio },
    { title: 'Record Audio Clip', onPress: handleRecordAudio },
    { title: 'Cancel', onPress: () => setAudioActionSheetVisible(false), style: 'cancel' },
  ];

  // MARK: - Render audio block
  const renderAudioBlock = (block: StoryBlock) => {
    console.log('renderAudioBlock called for block:', JSON.stringify(block, null, 2)); // ADDED LOG
    const content = block.content;
    const isRecording = typeof content === 'object' && content.isRecording;
    const audioName = typeof content === 'object' && content.name ? content.name : 'Audio Clip';
    const hasAudioContent = content && (typeof content === 'string' || (typeof content === 'object' && content.uri));
    console.log('renderAudioBlock details:', { isRecording, audioName, hasAudioContent, contentUri: typeof content === 'object' ? content.uri : 'N/A' }); // ADDED LOG
    
    if (!hasAudioContent) {
      // If no audio content yet, show the audio upload button
      return (
        <View style={styles.audioBlockContainer}>
          <TouchableOpacity 
            style={styles.uploadAudioButton}
            onPress={() => setAudioActionSheetVisible(true)}
          >
            <MaterialIcons name="audiotrack" size={24} color="#1A4B44" />
            <Text style={styles.uploadAudioButtonText}>Add Audio</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    // Render the audio player if there's content
    return (
      <View style={styles.audioBlockContainer}>
        <MaterialIcons name="audiotrack" size={24} color="#1A4B44" />
        <View style={styles.audioBlockInfo}>
          <Text style={styles.audioBlockTitle}>
            {isRecording ? 'Recorded Audio' : audioName}
          </Text>
          {typeof content === 'object' && content.duration && (
            <Text style={styles.audioBlockDuration}>
              {Math.floor(content.duration / 60)}:{(content.duration % 60).toString().padStart(2, '0')}
            </Text>
          )}
        </View>
        <TouchableOpacity 
          style={styles.audioPlayButton}
          onPress={() => Alert.alert("Play Audio", "Audio playback will be implemented here.")}
        >
          <Ionicons name="play" size={20} color="#1A4B44" />
        </TouchableOpacity>
      </View>
    );
  };

  // MARK: - Render Methods for Modals
  const renderAddDetailsModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isAddDetailsModalVisible}
      onRequestClose={() => setAddDetailsModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Add Story Details</Text>
          <TouchableOpacity style={styles.modalOption} onPress={() => { setShowSubtitle(!showSubtitle); setAddDetailsModalVisible(false); }}>
            <Text>{showSubtitle ? "Remove Subtitle" : "Add Subtitle"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalOption} onPress={() => { setShowDate(!showDate); setAddDetailsModalVisible(false); }}>
            <Text>{showDate ? "Remove Date" : "Add Date"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalOption} onPress={() => { 
            if (showLocation) {
              setShowLocation(false);
              setLocation(null);
            } else {
              setShowLocation(true);
              // Trigger actual location picking flow here eventually
              handleAddLocation(); 
            }
            setAddDetailsModalVisible(false); 
          }}>
            <Text>{showLocation ? "Remove Location" : "Add Location"}</Text>
          </TouchableOpacity>
          <Button title="Close" onPress={() => setAddDetailsModalVisible(false)} />
        </View>
      </View>
    </Modal>
  );

  // Show a loading overlay during image uploads or story creation/update
  const renderLoadingOverlay = () => {
    if (isLoading || isUploading) {
      return (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1A4B44" />
          <Text style={styles.loadingText}>
            {isUploading ? `Uploading images (${Math.round(overallProgress)}%)` : 'Saving story...'}
          </Text>
          {isUploading && (
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${overallProgress}%` }]} />
            </View>
          )}
        </View>
      );
    }
    return null;
  };

  // MARK: - Main Render
  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: 'Create Story',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 10 : 0, padding: 5 }}>
              <Ionicons name="arrow-back" size={28} color="#1A4B44" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity 
              onPress={isActuallyEditingNow ? handleUpdateStory : handleSaveStory} 
              style={{ marginRight: 15 }}
              disabled={isLoading || isUploading}
            >
              <Text style={[
                styles.saveButtonTextNavigator, 
                (isLoading || isUploading) && { color: '#A0A0A0' }
              ]}>
                {isActuallyEditingNow ? 'Update' : 'Save'}
              </Text>
            </TouchableOpacity>
          ),
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#1A4B44',
          headerTitleStyle: { fontWeight: '600', fontSize: 18, color: '#1A4B44' },
        }}
      />
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.scrollContentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Story Details Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Story Details</Text>
          
          {/* Cover Photo */}
          {/* {coverPhoto && (
            <View style={styles.coverPhotoContainer}>
              <Image source={{ uri: coverPhoto.uri }} style={styles.coverPhoto} />
              <TouchableOpacity 
                style={styles.removeCoverPhotoButton}
                onPress={() => setCoverPhoto(null)}
              >
                <Ionicons name="close-circle" size={30} color="white" />
              </TouchableOpacity>
            </View>
          )} */}

          <TextInput
            style={styles.inputStoryTitle}
            placeholder="Story Title *"
            placeholderTextColor="#B0B0B0"
            value={storyTitle}
            onChangeText={setStoryTitle}
          />
          <View style={styles.separatorThinNoMargin} />

          {showSubtitle && (
            <>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.inputField, { flex: 1 }]}
                  placeholder="Subtitle"
                  placeholderTextColor="#B0B0B0"
                  value={subtitle}
                  onChangeText={setSubtitle}
                />
                <View style={styles.inputRowValueContainer}>
                  <TouchableOpacity onPress={() => setShowSubtitle(false)} style={{ marginLeft: 10 }}>
                    <Ionicons name="remove-circle-outline" size={22} color="red" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.separatorThinNoMargin} />
            </>
          )}

          {showDate && (
            <>
              <TouchableOpacity
                style={styles.inputRow}
                onPress={showDatePicker}
              >
                <MaterialCommunityIcons name="calendar-month-outline" size={24} color={styles.inputIcon.color} style={styles.inputIcon} />
                <Text style={styles.inputRowText}>Story Date</Text>
                <View style={styles.inputRowValueContainer}>
                  <Text style={styles.inputRowValueText}>{formatDate(storyDate)}</Text>
                  <TouchableOpacity onPress={() => setShowDate(false)} style={{ marginLeft: 10 }}>
                    <Ionicons name="remove-circle-outline" size={22} color="red" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
              <View style={styles.separatorThinNoMargin} />
            </>
          )}
          
          {showLocation && (
            <>
              <View style={styles.inputRow}>
                <MaterialIcons name="location-pin" size={24} color={styles.inputIcon.color} style={styles.inputIcon} />
                <Text style={styles.inputRowText}>Location</Text>
                <View style={styles.inputRowValueContainer}>
                  <Text style={styles.inputRowValueText} numberOfLines={1}>{location?.address || 'No location set'}</Text>
                  <TouchableOpacity onPress={() => { setShowLocation(false); setLocation(null); }} style={{ marginLeft: 10 }}>
                    <Ionicons name="remove-circle-outline" size={22} color="red" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.separatorThinNoMargin} />
            </>
          )}

          <AddDetailsButton onPress={() => setDetailsActionSheetVisible(true)} />
        </View>

        {/* Privacy Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <PrivacySegmentedControl 
            options={[
              { label: 'Family', value: 'family' },
              { label: 'Personal', value: 'personal' },
              { label: 'Custom', value: 'custom' },
            ]}
            selectedValue={privacy}
            onValueChange={setPrivacy}
          />
          {privacy === 'custom' && (
            <SelectViewers
              selectedCount={customSelectedViewers.length}
              onPress={() => router.push({
                pathname: '/selectMembersScreen',
                params: { purpose: 'viewers', preSelected: JSON.stringify(customSelectedViewers) }
              } as any)}
            />
          )}
        </View>

        {/* Tag People Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Tag People Involved</Text>
          <TagPeopleButton
            selectedCount={taggedMembers.length}
            onPress={() => router.push({
              pathname: '/selectMembersScreen',
              params: { purpose: 'tagging', preSelected: JSON.stringify(taggedMembers) }
            } as any)}
          />
        </View>
        
        {/* Story Content Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Story Content</Text>
          {blocks.map((block) => (
            <View key={block.id} style={styles.blockContainer}>
              <View style={{flex: 1}}>
                {block.type === 'text' && (
                  <TextInput
                    style={styles.textBlockInput}
                    placeholder="Start writing your story block..."
                    multiline
                    value={block.content}
                    onChangeText={(text) => updateBlockContent(block.id, text)}
                  />
                )}
                {block.type === 'image' && (
                  <View>
                    <TouchableOpacity onPress={() => handleSelectMediaForBlock(block.id)} style={styles.mediaUploadButton}>
                      <Ionicons name="images-outline" size={24} color="#1A4B44" />
                      <Text style={{color: "#1A4B44", marginLeft: 5}}>
                        {block.content && block.content.length > 0 ? `${block.content.length} media selected` : "Add Images/Videos"}
                      </Text>
                    </TouchableOpacity>
                    {block.content && block.content.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaPreviewContainer}>
                        {block.content.map((asset: ImagePicker.ImagePickerAsset, index: number) => (
                          <Image key={index} source={{ uri: asset.uri }} style={styles.previewImage} />
                        ))}
                      </ScrollView>
                    )}
                  </View>
                )}
                {block.type === 'audio' && (
                  renderAudioBlock(block)
                )}
                 {/* Video block can be similar to image or have specific handling */}
                 {block.type === 'video' && (
                    <TouchableOpacity onPress={() => handleSelectMediaForBlock(block.id)} style={styles.mediaUploadButton}>
                      <Ionicons name="film-outline" size={24} color="#1A4B44" />
                      <Text style={{color: "#1A4B44", marginLeft: 5}}>
                        {block.content && block.content.length > 0 ? `${block.content.length} video(s) selected` : "Add Videos"}
                      </Text>
                    </TouchableOpacity>
                 )}
              </View>
              <TouchableOpacity onPress={() => removeBlock(block.id)} style={styles.removeBlockButton}>
                <Ionicons name="remove-circle" size={24} color="red" />
              </TouchableOpacity>
            </View>
          ))}
          <AddContentButton onPress={() => setAddContentActionSheetVisible(true)} />
        </View>

        {/* Details action sheet */}
        <AnimatedActionSheet
          isVisible={isDetailsActionSheetVisible}
          onClose={() => setDetailsActionSheetVisible(false)}
          actions={detailsActions}
          title="Additional Details"
        />
        
        {/* Add Content action sheet */}
        <AnimatedActionSheet
          isVisible={isAddContentActionSheetVisible}
          onClose={() => setAddContentActionSheetVisible(false)}
          actions={addContentActions}
          title="Add Content Block"
        />
        
        {/* Audio options action sheet */}
        <AnimatedActionSheet
          isVisible={isAudioActionSheetVisible}
          onClose={() => setAudioActionSheetVisible(false)}
          actions={audioActions}
          title="Add Audio"
        />
      
      </ScrollView>
      {/* Date picker modal for story date */}
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={handleDateConfirm}
        onCancel={hideDatePicker}
        date={storyDate || new Date()}
      />
      
      {/* Loading overlay */}
      {renderLoadingOverlay()}
    </SafeAreaView>
  );
};

// MARK: - Styles
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0', // Light gray background for the whole screen
  },
  container: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: 30, 
  },
  saveButtonTextNavigator: {
    color: '#1A4B44', // Dynasty Green
    fontSize: 17,
    fontWeight: '600',
  },
  sectionContainer: {
    marginTop: 10,
    marginHorizontal: 10,
    backgroundColor: '#FFFFFF', 
    borderRadius: 8,
    padding: 15,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, 
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 15,
  },
  inputStoryTitle: {
    fontSize: 20, 
    paddingVertical: 12,
    color: '#222222',
    fontWeight: '500',
    fontFamily: Fonts.type.base,
  },
  inputField: { // Generic input field style
    fontSize: 16,
    paddingVertical: 12,
    color: '#333333',
    fontFamily: Fonts.type.base,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  inputIcon: {
    marginRight: 12,
    color: '#1A4B44', 
  },
  inputRowText: { 
    fontSize: 16,
    color: '#222222', 
    flex: 1, 
  },
  inputRowValueContainer: { 
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputRowValueText: { 
    fontSize: 16,
    color: '#555555', 
  },
  inputRowChevron: { // Kept for potential future use
    marginLeft: 8,
    color: '#C7C7CC', 
  },
  separatorThinNoMargin: { 
    height: 1,
    backgroundColor: '#EFEFF4', 
    marginVertical: 5,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 10,
    backgroundColor: '#E8F5E9', // Light green tint
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 16,
    color: '#1A4B44',
    fontWeight: '500',
  },
  selectViewersButton: {
    marginTop: 15,
    backgroundColor: '#E0F2F1', // A slightly different shade for distinction or same as addButton
  },
  // Privacy Styles
  privacyOptionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  privacyOptionButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1A4B44',
  },
  privacyOptionSelected: {
    backgroundColor: '#1A4B44',
  },
  privacyOptionText: {
    color: '#1A4B44',
    fontWeight: '500',
  },
  privacyOptionTextSelected: {
    color: '#FFFFFF',
  },
  comingSoonText: {
    textAlign: 'center',
    color: '#777',
    fontStyle: 'italic',
    marginTop: 5,
  },
  // Block Styles
  blockContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  textBlockInput: {
    fontSize: 16,
    color: '#333333',
    minHeight: 80,
    textAlignVertical: 'top',
    fontFamily: Fonts.type.base,
  },
  mediaUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#E0E0E0',
    borderRadius: 5,
    justifyContent: 'center',
  },
  mediaPreviewContainer: {
    marginTop: 10,
  },
  previewImage: {
    width: 80, 
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    marginRight: 10,
  },
  removeBlockButton: {
    paddingLeft: 10, // Space from content to button
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  audioBlockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  uploadAudioButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  uploadAudioButtonText: {
    color: '#1A4B44',
    marginLeft: 8,
    fontWeight: '500',
  },
  audioBlockInfo: {
    flex: 1,
    marginLeft: 10,
  },
  audioBlockTitle: {
    fontSize: 16,
    color: '#1A4B44',
    fontWeight: '500',
  },
  audioBlockDuration: {
    fontSize: 14,
    color: '#555555',
    marginTop: 4,
  },
  audioPlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: '#DDDDDD',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#1A4B44',
    fontWeight: '500',
  },
  progressBarContainer: {
    width: '80%',
    height: 10,
    backgroundColor: '#E0E0E0',
    borderRadius: 5,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#1A4B44',
  },
});

export default CreateStoryScreen;
