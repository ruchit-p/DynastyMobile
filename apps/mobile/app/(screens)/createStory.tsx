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
  Alert,
  Modal,
  Button,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useRouter, useNavigation, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import AnimatedActionSheet, { ActionSheetAction } from '../../components/ui/AnimatedActionSheet';
import PrivacySegmentedControl from '../../components/ui/PrivacySegmentedControl';
import SelectViewers from '../../components/ui/SelectViewers';
import TagPeopleButton from '../../components/ui/TagPeopleButton';
import AddDetailsButton from '../../components/ui/AddDetailsButton';
import AddContentButton from '../../components/ui/AddContentButton';
import MediaGallery, { MediaItem } from '../../components/ui/MediaGallery';
import { useAuth } from '../../src/contexts/AuthContext';
import { createStoryMobile, updateStoryMobile, fetchAccessibleStoriesMobile, StoryBlock as FetchedStoryBlock } from '../../src/lib/storyUtils';
import Fonts from '../../constants/Fonts';
import { useImageUpload } from '../../hooks/useImageUpload';
import { useScreenResult } from '../../src/contexts/ScreenResultContext';
import { showErrorAlert } from '../../src/lib/errorUtils';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { useSmartMediaUpload } from '../../hooks/useSmartMediaUpload';
import { useEncryption } from '../../src/contexts/EncryptionContext';
import { useOffline } from '../../src/contexts/OfflineContext';
import { syncService } from '../../src/lib/syncService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../src/services/LoggingService';
import { sanitizeUserInput } from '../../src/lib/xssSanitization';

// MARK: - Types
type BlockType = "text" | "image" | "video" | "audio";

interface StoryBlock {
  id: string;
  type: BlockType;
  content: any; // string for text, MediaItem[] for image type blocks, object for audio, etc.
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
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Story Creation Error',
    trackCurrentScreen: true
  });
  const params = useLocalSearchParams<{ 
    storyId?: string; 
    editMode?: string; 
    returnedPurpose?: string; 
    selectedIds?: string; 
    recordedAudioUri?: string; 
    recordedAudioDuration?: string;
    // Added params from selectLocation
    selectedLocation?: string;
    selectedLocationLat?: string;
    selectedLocationLng?: string;
    fromScreen?: string;
    initialSelectedLocation?: string;
  }>(); 
  const { uploadImage } = useImageUpload();
  const { result: screenResult, setResult: setScreenResult } = useScreenResult();
  const smartUpload = useSmartMediaUpload();
  useEncryption();
  const { isOnline } = useOffline();

  useEffect(() => {
    if (!isError) {
      // Clear any local error states when global error is cleared
    }
  }, [isError]);

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
    logger.debug(`isAudioActionSheetVisible changed to: ${isAudioActionSheetVisible}`);
  }, [isAudioActionSheetVisible]);

  // Effect to handle results from other screens (SelectMembersScreen, SelectLocationScreen)
  useFocusEffect(
    useCallback(() => {
      if (screenResult) {
        logger.debug("CreateStoryScreen received screen result:", screenResult);
        const { purpose, selectedIds, location: resultLocation } = screenResult;

        if (purpose === 'tagging' && selectedIds) {
          setTaggedMembers(prev => {
            const newIds = selectedIds.filter(id => !prev.includes(id));
            return [...prev, ...newIds];
          });
        } else if (purpose === 'viewers' && selectedIds) {
          setCustomSelectedViewers(selectedIds);
          setPrivacy('custom'); // Update privacy setting
        } else if (purpose === 'location' && resultLocation) {
          setLocation(resultLocation as Location); // Cast if necessary, ensure types match
          setShowLocation(true);
        }
        
        setScreenResult(null); // Clear the result from context
      }
    }, [screenResult, setScreenResult]) // Dependencies: screenResult and its setter
  );

  // Original useEffect for useLocalSearchParams (for deep links or initial params)
  useEffect(() => {
    if (params.initialSelectedLocation) {
      try {
        const loc = JSON.parse(params.initialSelectedLocation as string);
        setLocation(loc as Location);
        setShowLocation(true);
        // Consider clearing this param from router if it should only be processed once
        // router.setParams({ initialSelectedLocation: undefined }); 
      } catch (e) {
        logger.error("Error parsing initial selected location from params:", e);
      }
    }
    // Other initial param handling can go here
  }, [params.initialSelectedLocation]); // Depend only on specific params for this effect

  // MARK: - Handlers (Moved Up and Wrapped in useCallback)

  // Function to upload all images in image blocks and return updated blocks with Firebase Storage URLs
  const uploadAllMedia = async (storyBlocks: {
    type: string;
    data: any; // For 'image' blocks, this will be {uri: string, type: 'image'|'video', ...}[]
               // For 'audio'/'video' (dedicated), this will be a string URI
    localId: string;
  }[]) => {
    // If offline, skip upload and return original blocks
    if (!isOnline) {
      logger.debug('Offline mode: Skipping media upload');
      return storyBlocks;
    }
    // Count total media items that need to be uploaded
    let mediaToUploadCount = 0;
    storyBlocks.forEach(block => {
      if (block.type === 'image' && Array.isArray(block.data)) {
        // block.data is an array of MediaItem-like objects
        (block.data as { uri: string }[]).forEach(item => { // Cast to check URI
          if (typeof item.uri === 'string' && (item.uri.startsWith('file://') || item.uri.startsWith('content://'))) {
            mediaToUploadCount++;
          }
        });
      } else if ((block.type === 'video' || block.type === 'audio') && typeof block.data === 'string' && (block.data.startsWith('file://') || block.data.startsWith('content://'))) {
        mediaToUploadCount++;
      }
    });
    
    if (mediaToUploadCount === 0) {
      return storyBlocks;
    }
    
    setIsUploading(true);
    setTotalUploads(mediaToUploadCount);
    setCompletedUploads(0);
    setOverallProgress(0);
    
    const updatedBlocks = JSON.parse(JSON.stringify(storyBlocks));
    
    for (let i = 0; i < updatedBlocks.length; i++) {
      const block = updatedBlocks[i];
      
      if (block.type === 'image' && Array.isArray(block.data)) {
        const processedMediaItems = []; // Will store media items with updated URIs
        for (let j = 0; j < block.data.length; j++) {
          const mediaItem = block.data[j] as MediaItem; // Expect MediaItem like structure
          if (typeof mediaItem.uri === 'string' && (mediaItem.uri.startsWith('file://') || mediaItem.uri.startsWith('content://'))) {
            try {
              let uploadedUrl: string | null = null;
              let encryptionKey: string | null = null;
              
              // Use smart upload which handles encryption based on settings
              const uploadResult = await smartUpload.uploadMedia(
                mediaItem.uri,
                'story',
                {
                  fileName: `story_${Date.now()}_${j}`,
                  mimeType: mediaItem.type === 'video' ? 'video/mp4' : 'image/jpeg',
                },
                (progress) => {
                  // Progress reporting needs to be accurate based on items, not just overall percentage
                  const currentTotalProgress = totalUploads > 0 ? (completedUploads + progress / 100) / totalUploads * 100 : 0;
                  setOverallProgress(currentTotalProgress);
                }
              );
              
              if (uploadResult) {
                uploadedUrl = uploadResult.url;
                encryptionKey = uploadResult.key || null;
                processedMediaItems.push({ 
                  ...mediaItem, 
                  uri: uploadedUrl,
                  isEncrypted: !!encryptionKey,
                  encryptionKey 
                }); // Update URI and add encryption info
                setCompletedUploads(prev => prev + 1);
              } else {
                processedMediaItems.push(mediaItem); // Fallback, keep original item with local URI
              }
            } catch (error) {
              logger.error(`Error uploading media ${mediaItem.uri} in block ${block.localId}, item index ${j}:`, error);
              processedMediaItems.push(mediaItem); // Fallback
            }
          } else {
            processedMediaItems.push(mediaItem); // Already an uploaded URL or not a local file string
          }
        }
        block.data = processedMediaItems; // block.data is now an array of MediaItem-like objects with updated URIs
      } else if ((block.type === 'video' || block.type === 'audio') && typeof block.data === 'string' && (block.data.startsWith('file://') || block.data.startsWith('content://'))) {
        // Handle single media URI upload for dedicated 'video' or 'audio' blocks
        try {
          const uploadResult = await smartUpload.uploadMedia(
            block.data,
            'story',
            {
              fileName: `story_${block.type}_${Date.now()}`,
              mimeType: block.type === 'audio' ? 'audio/mpeg' : 'video/mp4',
            },
            (progress) => {
              // Simplified progress for single file upload in a block
              const baseProgress = totalUploads > 0 ? completedUploads / totalUploads * 100 : 0;
              const itemProgress = totalUploads > 0 ? progress / totalUploads : 0;
              setOverallProgress(baseProgress + itemProgress);
            }
          );
          
          if (uploadResult) {
            block.data = uploadResult.url;
            // Store encryption metadata if needed
            if (uploadResult.key) {
              block.isEncrypted = true;
              block.encryptionKey = uploadResult.key;
            }
            setCompletedUploads(prev => prev + 1);
          }
          // Fallback: original URI remains if upload fails
        } catch (error) {
          logger.error(`Error uploading media ${block.data} in block ${i}:`, error);
          // Fallback: original URI remains
        }
      }
    }
    
    setIsUploading(false);
    return updatedBlocks;
  };

  const handleSaveStory = useCallback(async () => {
    return withErrorHandling(async () => {
    reset();
    if (!storyTitle.trim()) {
      showErrorAlert({ message: 'Please provide a title for your story.', code: 'missing-title' }, 'Missing Title');
      return;
    }
    if (!firestoreUser?.familyTreeId) {
        showErrorAlert({ message: 'You must be part of a family tree to create stories.', code: 'family-tree-error' }, 'Family Tree Error');
        return;
    }

    setIsLoading(true); 

    const transformedBlocks = blocks.map(block => {
      if (block.type === 'text') {
        return {
          type: 'text',
          data: sanitizeUserInput(block.content as string, { maxLength: 5000, trim: true }),
          localId: block.id
        };
      } else if (block.type === 'image') {
        // block.content is MediaItem[]
        // Preserve essential details of each media item for storage
        const mediaItemsToSave = (block.content as MediaItem[] || []).map(item => ({
          uri: item.uri,
          type: item.type,
          width: item.width,
          height: item.height,
          duration: item.duration,
          // Do not save the full 'asset' object to Firestore, only essential serializable data
        }));
        return {
          type: 'image', // This block type signifies a gallery
          data: mediaItemsToSave, // Array of media item objects
          localId: block.id
        };
      } else if (block.type === 'audio') {
        const audioContent = block.content as { uri: string; duration?: number; name?: string; isRecording?: boolean };
        return {
          type: 'audio',
          data: {
            ...audioContent,
            name: audioContent.name ? sanitizeUserInput(audioContent.name, { maxLength: 255, trim: true }) : audioContent.name
          }, 
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
      // If offline, create story with local data first (optimistic UI)
      if (!isOnline) {
        const tempStoryId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const storyPayload = {
          authorID: user?.uid || '',
          title: sanitizeUserInput(storyTitle, { maxLength: 200, trim: true }),
          subtitle: showSubtitle ? sanitizeUserInput(subtitle, { maxLength: 300, trim: true }) : undefined,
          eventDate: showDate && storyDate ? storyDate.toISOString() : undefined,
          location: showLocation && location ? { 
            lat: location.latitude, 
            lng: location.longitude, 
            address: sanitizeUserInput(location.address || '', { maxLength: 500, trim: true }) 
          } : undefined,
          privacy: (privacy === 'personal' ? 'privateAccess' : privacy) as 'family' | 'privateAccess' | 'custom',
          customAccessMembers: privacy === 'custom' ? customSelectedViewers : undefined,
          blocks: transformedBlocks, // Use local URIs when offline
          familyTreeId: firestoreUser.familyTreeId, 
          peopleInvolved: taggedMembers,
          _isOffline: true,
          _tempId: tempStoryId,
          createdAt: new Date().toISOString(),
          authorName: sanitizeUserInput(firestoreUser?.displayName || 'Unknown', { maxLength: 100, trim: true }),
        };
        
        // Queue for sync when online
        await syncService.queueOperation({
          type: 'create',
          collection: 'stories',
          data: storyPayload,
          timestamp: Date.now(),
        });
        
        // Cache the story locally for immediate display
        const cachedStories = await AsyncStorage.getItem('cachedStories');
        const stories = cachedStories ? JSON.parse(cachedStories) : [];
        stories.unshift({ ...storyPayload, id: tempStoryId });
        await AsyncStorage.setItem('cachedStories', JSON.stringify(stories));
        
        Alert.alert(
          'Story Saved Offline', 
          'Your story has been saved locally and will sync when you\'re back online.',
          [{ text: 'OK', onPress: () => router.navigate('/(tabs)/feed') }]
        );
      } else {
        // Online: upload media and create story normally
        const updatedBlocks = await uploadAllMedia(transformedBlocks);
        
        const storyPayload = {
          authorID: user?.uid || '',
          title: sanitizeUserInput(storyTitle, { maxLength: 200, trim: true }),
          subtitle: showSubtitle ? sanitizeUserInput(subtitle, { maxLength: 300, trim: true }) : undefined,
          eventDate: showDate && storyDate ? storyDate.toISOString() : undefined,
          location: showLocation && location ? { 
            lat: location.latitude, 
            lng: location.longitude, 
            address: sanitizeUserInput(location.address || '', { maxLength: 500, trim: true }) 
          } : undefined,
          privacy: (privacy === 'personal' ? 'privateAccess' : privacy) as 'family' | 'privateAccess' | 'custom',
          customAccessMembers: privacy === 'custom' ? customSelectedViewers : undefined,
          blocks: updatedBlocks,
          familyTreeId: firestoreUser.familyTreeId, 
          peopleInvolved: taggedMembers,
        };
        
        logger.debug('Full story payload:', JSON.stringify(storyPayload, null, 2));

        const newStoryId = await createStoryMobile(storyPayload);
        logger.debug('Story created with ID:', newStoryId);
        Alert.alert('Success', 'Your story has been saved.');
        router.navigate('/(tabs)/feed');
      }
    } catch (error) {
      handleError(error, { 
        action: 'createStory',
        metadata: { 
          storyTitle,
          privacy,
          blockCount: blocks.length,
          hasLocation: showLocation,
          isOffline: !isOnline
        }
      });
      showErrorAlert(error, 'Error');
    } finally {
      setIsLoading(false);
    }
    })();
  }, [storyTitle, firestoreUser, user, blocks, subtitle, showSubtitle, storyDate, showDate, location, showLocation, privacy, customSelectedViewers, taggedMembers, router, uploadImage, handleError, reset, isOnline, uploadAllMedia, withErrorHandling]);

  const handleUpdateStory = useCallback(async () => {
    return withErrorHandling(async () => {
    reset();
    if (!storyTitle.trim()) {
      showErrorAlert({ message: 'Please provide a title for your story.', code: 'missing-title' }, 'Missing Title');
      return;
    }
    if (!storyIdForEdit || !user?.uid) {
      showErrorAlert({ message: 'Cannot update story. Missing ID or user information.', code: 'update-error' }, 'Error');
      return;
    }

    setIsLoading(true);
    
    const transformedBlocksForUpdate = blocks.map(block => {
      if (block.type === 'text') {
        return { type: 'text', data: sanitizeUserInput(block.content as string, { maxLength: 5000, trim: true }), localId: block.id };
      } else if (block.type === 'image') {
        // block.content is MediaItem[]
        // Preserve essential details of each media item for storage
        const mediaItemsToSave = (block.content as MediaItem[] || []).map(item => ({
          uri: item.uri,
          type: item.type,
          width: item.width,
          height: item.height,
          duration: item.duration,
        }));
        return {
          type: 'image', // This block type signifies a gallery
          data: mediaItemsToSave, // Array of media item objects
          localId: block.id
        };
      } else if (block.type === 'audio') {
        const audioContent = block.content as { uri: string; duration?: number; name?: string; isRecording?: boolean };
        return { 
          type: 'audio', 
          data: {
            ...audioContent,
            name: audioContent.name ? sanitizeUserInput(audioContent.name, { maxLength: 255, trim: true }) : audioContent.name
          }, 
          localId: block.id 
        };
      }
      return { type: block.type, data: block.content, localId: block.id };
    });

    try {
      // Upload all images to Firebase Storage and get updated blocks with Firebase URLs
      const updatedBlocks = await uploadAllMedia(transformedBlocksForUpdate);
      
      const storyUpdatePayload: Parameters<typeof updateStoryMobile>[2] = {
        title: sanitizeUserInput(storyTitle, { maxLength: 200, trim: true }),
        subtitle: showSubtitle ? sanitizeUserInput(subtitle, { maxLength: 300, trim: true }) : undefined,
        eventDate: showDate && storyDate ? new Date(storyDate).toISOString() : undefined,
        location: showLocation && location ? { 
          lat: location.latitude, 
          lng: location.longitude, 
          address: sanitizeUserInput(location.address || '', { maxLength: 500, trim: true }) 
        } : undefined,
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
      
      logger.debug('Updating story with payload:', JSON.stringify(storyUpdatePayload, null, 2));

      await updateStoryMobile(storyIdForEdit!, user.uid, storyUpdatePayload);
      Alert.alert('Success', 'Your story has been updated.');
      router.navigate('/(tabs)/feed');
    } catch (error) {
      handleError(error, { 
        action: 'updateStory',
        metadata: { 
          storyId: storyIdForEdit,
          storyTitle,
          blockCount: blocks.length
        }
      });
      showErrorAlert(error, 'Error');
    } finally {
      setIsLoading(false);
    }
    })();
  }, [storyTitle, storyIdForEdit, user, blocks, subtitle, showSubtitle, storyDate, showDate, location, showLocation, privacy, customSelectedViewers, taggedMembers, router, uploadImage, handleError, reset, uploadAllMedia, withErrorHandling]);

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
            const mappedBlocks: StoryBlock[] = fetchedBlocks.map((fb: FetchedStoryBlock) => {
              let contentValue: any;
              if (fb.type === 'text') {
                contentValue = fb.data as string;
              } else if (fb.type === 'image') {
                // fb.data could be string[] (old) or Array of MediaItem-like objects (new)
                if (Array.isArray(fb.data)) {
                  if (fb.data.length > 0 && typeof fb.data[0] === 'string') {
                    // Old format: array of URIs
                    contentValue = (fb.data as string[]).map(url => {
                      const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(url.toLowerCase());
                      const mediaTypeExt = isVideo ? 'video' : 'image';
                      return {
                        uri: url,
                        type: mediaTypeExt,
                        asset: undefined, // Asset is not stored in Firestore
                        width: undefined, // Attempt to get from asset if available, or default
                        height: undefined,
                        duration: isVideo ? 0 : undefined // Placeholder
                      } as MediaItem;
                    });
                  } else if (fb.data.length > 0 && typeof fb.data[0] === 'object' && fb.data[0] !== null && 'uri' in fb.data[0]) {
                    // New format: array of MediaItem-like objects
                    contentValue = (fb.data as any[]).map(itemData => ({
                      uri: itemData.uri,
                      type: itemData.type || (/\.(mp4|mov|avi|mkv|webm)$/i.test(itemData.uri?.toLowerCase() || '') ? 'video' : 'image'), // Infer if type missing
                      asset: undefined,
                      width: itemData.width,
                      height: itemData.height,
                      duration: itemData.duration,
                    } as MediaItem));
                  } else {
                    // Empty array or unrecognized format within array
                    contentValue = [];
                  }
                } else {
                  // fb.data is not an array (should not happen for image blocks)
                  logger.warn(`Story ${storyToEdit.id}, block ${fb.localId || 'unknown'}: image block data is not an array.`, fb.data);
                  contentValue = [];
                }
              } else if (fb.type === 'audio') {
                const audioData = fb.data as any; // Could be string URI or an object
                contentValue = {
                  uri: audioData.uri,
                  duration: audioData.duration,
                  name: audioData.name,
                  isRecording: audioData.isRecording,
                };
              } else {
                contentValue = fb.data; // Fallback for other types
              }
              return {
                id: fb.localId || Math.random().toString(36).substr(2, 9), // Use localId or generate new
                type: fb.type as BlockType,
                content: contentValue,
              };
            });
            setBlocks(mappedBlocks);

          } else {
            showErrorAlert({ message: "Could not find the story to edit.", code: "story-not-found" }, "Error", () => router.back());
          }
        } catch (error) {
          handleError(error, { 
            action: 'loadStoryForEdit',
            metadata: { storyId: storyIdForEdit }
          });
          showErrorAlert(error, "Error", () => router.back());
        } finally {
          setIsLoading(false);
        }
      };
      loadStoryForEdit();
    }
  }, [isActuallyEditingNow, storyIdForEdit, user, firestoreUser, navigation, router, handleError]);

  // MARK: - Navigation Setup & Data Return Handling
  useEffect(() => {
    const screenTitle = displayAsEditMode ? 'Edit Story' : 'Create Story';
    const saveAction = isActuallyEditingNow ? handleUpdateStory : handleSaveStory;

    navigation.setOptions({
      title: isLoading ? 'Loading...' : screenTitle,
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10 }}>
          <Ionicons name="arrow-back" size={26} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity 
          onPress={saveAction} 
          style={{ 
            marginRight: 10,
            paddingHorizontal: 5,
            paddingVertical: 2,
          }} 
          disabled={isLoading || isUploading}
        >
          {displayAsEditMode ? (
            <Ionicons 
              name="checkmark-circle-outline" 
              size={28} 
              color={(isLoading || isUploading) ? '#A0A0A0' : '#1A4B44'} 
            />
          ) : (
            <Text style={[
              styles.saveButtonTextNavigator, 
              (isLoading || isUploading) && { color: '#A0A0A0' }
            ]}>
              {isLoading ? '...' : 'Save'} 
            </Text>
          )}
        </TouchableOpacity>
      ),
      headerTitleAlign: 'center',
      headerStyle: { backgroundColor: '#F8F8F8' }, 
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' }, 
      headerBackTitleVisible: false,
    });
  }, [navigation, router, isLoading, displayAsEditMode, handleSaveStory, handleUpdateStory, isUploading, isActuallyEditingNow]);

  useEffect(() => {
    // Listener for when the screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      // Check for returned parameters from selectMembersScreen
      const returnedPurpose = params?.returnedPurpose as string | undefined;
      const returnedSelectedIds = params?.selectedIds as string | undefined;
      
      // Check for returned parameters from selectLocationScreen
      const returnedLocationAddress = params?.selectedLocation as string | undefined;
      const returnedLocationLat = params?.selectedLocationLat as string | undefined;
      const returnedLocationLng = params?.selectedLocationLng as string | undefined;
      const fromScreen = params?.fromScreen as string | undefined;

      if (returnedSelectedIds) {
        try {
          const idsArray = JSON.parse(returnedSelectedIds);
          if (Array.isArray(idsArray)) {
            if (returnedPurpose === 'viewers') {
              setCustomSelectedViewers(idsArray);
            } else if (returnedPurpose === 'tagging') {
              setTaggedMembers(idsArray);
            }
            // Clear params after use to avoid re-processing
            router.setParams({ returnedPurpose: undefined, selectedIds: undefined, timestamp: undefined }); 
          }
        } catch (e) {
          logger.error("Error processing returned member IDs:", e);
        }
      }

      if (fromScreen === 'selectLocation' && returnedLocationAddress && returnedLocationLat && returnedLocationLng) {
        const lat = parseFloat(returnedLocationLat);
        const lng = parseFloat(returnedLocationLng);
        if (!isNaN(lat) && !isNaN(lng)) {
          setLocation({
            latitude: lat,
            longitude: lng,
            address: returnedLocationAddress,
          });
          setShowLocation(true); // Ensure the location section is visible
          // Clear params to avoid re-processing
          router.setParams({ 
            selectedLocation: undefined, 
            selectedLocationLat: undefined, 
            selectedLocationLng: undefined,
            fromScreen: undefined,
            timestamp: undefined // Also clear timestamp if used from location screen
          });
        } else {
          logger.error("Error parsing returned location coordinates:", {returnedLocationLat, returnedLocationLng});
        }
      }
    });

    return unsubscribe; // Cleanup listener on unmount
  }, [navigation, params, router]);

  // Check for returned audio recording
  useEffect(() => {
    const recordedAudioUri = params?.recordedAudioUri as string | undefined;
    const recordedAudioDuration = params?.recordedAudioDuration as string | undefined;
    
    if (recordedAudioUri) {
      // Log only when we actually have data and are about to process it
      logger.debug('Processing returned audio:', { recordedAudioUri, recordedAudioDuration });
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
      logger.debug('Recorded newAudioBlock to add:', JSON.stringify(newBlock, null, 2)); // This log can stay
      setBlocks(prevBlocks => [...prevBlocks, newBlock]);
      
      // Clear params to avoid re-processing
      router.setParams({ recordedAudioUri: undefined, recordedAudioDuration: undefined, timestamp: undefined });
    }
  }, [params?.recordedAudioUri, params?.recordedAudioDuration, router]); // MODIFIED dependency array

  // Log blocks state whenever it changes
  useEffect(() => {
    logger.debug('Current story blocks state:', JSON.stringify(blocks, null, 2));
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
    logger.debug('handleUploadAudio: function entered'); // ADDED LOG
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showErrorAlert({ message: 'Allow access to media library to add audio.', code: 'permission-denied' }, 'Permission Required');
        return;
      }

      // On iOS we can use ImagePicker for audio files
      if (Platform.OS === 'ios') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 1.0,
        });
        logger.debug('iOS ImagePicker result:', JSON.stringify(result, null, 2)); // ADDED LOG
    
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          logger.debug('iOS selected asset:', JSON.stringify(asset, null, 2)); // ADDED LOG
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
          logger.debug('iOS newAudioBlock to add:', JSON.stringify(newBlock, null, 2)); // ADDED LOG
          setBlocks(prevBlocks => [...prevBlocks, newBlock]);
        }
      } else {
        // On Android, we use DocumentPicker
        const result = await DocumentPicker.getDocumentAsync({
          type: 'audio/*',
          copyToCacheDirectory: true, // Good practice for accessing the file
        });
        logger.debug('Android DocumentPicker result:', JSON.stringify(result, null, 2)); // ADDED LOG
        
        if (result.canceled === false && result.assets && result.assets.length > 0) { // Ensured assets exist and not empty
          const asset = result.assets[0];
          logger.debug('Android selected asset:', JSON.stringify(asset, null, 2)); // ADDED LOG
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
          logger.debug('Android newAudioBlock to add:', JSON.stringify(newBlock, null, 2)); // ADDED LOG
          setBlocks(prevBlocks => [...prevBlocks, newBlock]);
        }
      }
    } catch (error) {
      logger.error("Error picking audio file: ", error);
      showErrorAlert(error, "Upload Error");
    }
    setAudioActionSheetVisible(false);
  };

  // Handle recording audio
  const handleRecordAudio = () => {
    logger.debug('handleRecordAudio: function entered'); // ADDED LOG
    router.push('/recordAudio' as any);
    setAudioActionSheetVisible(false);
  };
  
  
  // Handle selecting media for a specific block (now used by MediaGallery)
  const handleSelectMediaForImageBlock = async (blockId: string, replaceIndex?: number) => {
    let permissionResult = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (permissionResult.status === ImagePicker.PermissionStatus.UNDETERMINED) {
      permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }

    if (permissionResult.status === ImagePicker.PermissionStatus.DENIED) {
      Alert.alert(
        "Permission Denied", 
        "Access to photos and videos is needed. Please enable it in Settings.",
        [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]
      );
      return;
    }
    
    if (permissionResult.status !== ImagePicker.PermissionStatus.GRANTED) {
        showErrorAlert("Permission Required", "Photo and video library access is required.");
        return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: typeof replaceIndex === 'undefined', 
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newMediaItems: MediaItem[] = result.assets.map(asset => {
          // Heuristic to determine media type based on duration
          // asset.duration is in milliseconds for video, null or 0 for images
          const resolvedMediaType: 'image' | 'video' = (asset.duration && asset.duration > 0) ? 'video' : 'image';
          
          return {
            uri: asset.uri,
            type: resolvedMediaType,
            asset: asset, 
            duration: asset.duration === null ? undefined : asset.duration,
            width: asset.width,
            height: asset.height,
          };
        });

        setBlocks(prevBlocks =>
          prevBlocks.map(b => {
            if (b.id === blockId && b.type === 'image') { // Ensure we only modify image blocks here
              let currentContent = (b.content as MediaItem[] || []);
              if (typeof replaceIndex !== 'undefined') {
                if (newMediaItems.length > 0) { 
                  currentContent.splice(replaceIndex, 1, newMediaItems[0]);
                }
              } else {
                currentContent = [...currentContent, ...newMediaItems];
              }
              return { ...b, content: currentContent };
            }
            return b;
          })
        );
      }
    } catch (error) {
      logger.error("Error launching media library:", error);
      showErrorAlert("Media Picker Error", "Could not open the media library.");
    }
  };

  // Specific handlers for MediaGallery within an image block
  const addMediaToImageBlock = (blockId: string) => {
    handleSelectMediaForImageBlock(blockId);
  };

  const removeMediaFromImageBlock = (blockId: string, mediaIndex: number) => {
    setBlocks(prevBlocks =>
      prevBlocks.map(b => {
        if (b.id === blockId && b.type === 'image') {
          const currentContent = (b.content as MediaItem[] || []);
          const updatedContent = currentContent.filter((_, index) => index !== mediaIndex);
          return { ...b, content: updatedContent };
        }
        return b;
      })
    );
  };

  const replaceMediaInImageBlock = (blockId: string, mediaIndex: number) => {
    handleSelectMediaForImageBlock(blockId, mediaIndex);
  };

  const handleTagPeople = () => {
    router.push({
      pathname: '/(screens)/selectMembersScreen',
      params: { purpose: 'tagging', preSelected: JSON.stringify(taggedMembers) },
    });
  };

  const handlePrivacyOptionPress = (newPrivacyValue: 'family' | 'personal' | 'custom') => {
    setPrivacy(newPrivacyValue); // Always update the current privacy mode

    // Only navigate to select members if 'custom' is chosen AND the button is pressed.
    // The navigation is now handled by the SelectViewers component's onPress prop.
    // if (newPrivacyValue === 'custom') {
    //   router.push({
    //     pathname: '/(screens)/selectMembersScreen',
    //     params: { purpose: 'viewers', preSelected: JSON.stringify(customSelectedViewers) },
    //   });
    // }
    // NOTE: We no longer clear customSelectedViewers here when switching to family/personal
  };

  const handleAddLocation = () => {
    router.push({
      pathname: '/(screens)/selectLocation',
      params: { 
        currentLat: location?.latitude?.toString(), 
        currentLng: location?.longitude?.toString(),
        currentAddress: location?.address,
        previousPath: '/(screens)/createStory'
      }
    });
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
    { title: showLocation ? 'Edit Location' : 'Add Location', onPress: () => {
        handleAddLocation(); 
        setDetailsActionSheetVisible(false);
      }
    },
    // Conditionally add "Remove Location" action
    ...(showLocation ? 
      [{
        title: 'Remove Location', 
        onPress: () => { 
          setShowLocation(false); 
          setLocation(null); 
          setDetailsActionSheetVisible(false); 
        }, 
        style: 'destructive' as const 
      } as ActionSheetAction] 
      : []
    ),
    { title: 'Cancel', onPress: () => setDetailsActionSheetVisible(false), style: 'cancel' as const },
  ];

  // MARK: - Add Content Action Sheet Actions
  const addContentActions: ActionSheetAction[] = [
    { title: 'Add Text', onPress: () => addBlock('text') },
    { title: 'Add Media', onPress: () => addBlock('image') },
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
    logger.debug('renderAudioBlock called for block:', JSON.stringify(block, null, 2)); // ADDED LOG
    const content = block.content;
    const isRecording = typeof content === 'object' && content.isRecording;
    const audioName = typeof content === 'object' && content.name ? content.name : 'Audio Clip';
    const hasAudioContent = content && (typeof content === 'string' || (typeof content === 'object' && content.uri));
    logger.debug('renderAudioBlock details:', { isRecording, audioName, hasAudioContent, contentUri: typeof content === 'object' ? content.uri : 'N/A' }); // ADDED LOG
    
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
  const _renderAddDetailsModal = () => (
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
    return (
      <View style={styles.loadingOverlay}>
        <ActivityIndicator size="large" color="#1A4B44" />
        <Text style={styles.loadingText}>
          {isUploading ? `Uploading Media (${Math.round(overallProgress || 0)}%)` : 'Saving Story...'}
        </Text>
        {isUploading && (
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${Math.max(0, Math.min(100, overallProgress || 0))}%` }]} />
          </View>
        )}
      </View>
    );
  };

  // MARK: - Main Render
  return (
    <ErrorBoundary screenName="CreateStoryScreen">
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
              style={{ 
                marginRight: 10,
                paddingHorizontal: 5,
                paddingVertical: 2,
              }} 
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
              <View style={[styles.inputRow, styles.subtitleInputRow]}> 
                <TextInput
                  style={[styles.inputField, { flex: 1 }]}
                  placeholder="Subtitle"
                  placeholderTextColor="#B0B0B0"
                  value={subtitle}
                  onChangeText={setSubtitle}
                />
                <TouchableOpacity onPress={() => setShowSubtitle(false)} style={styles.removeButtonOnlyContainer}>
                  <Ionicons name="remove-circle-outline" size={22} color="red" />
                </TouchableOpacity>
              </View>
              <View style={styles.separatorThinNoMargin} />
            </>
          )}

          {showDate && (
            <>
              <TouchableOpacity
                style={styles.inputRow} // Keep alignItems: 'flex-start' for this row if text can wrap
                onPress={showDatePicker}
              >
                <MaterialCommunityIcons name="calendar-month-outline" size={24} color={styles.inputIcon.color} style={styles.inputIcon} />
                <View style={[styles.inputRowValueContainer, styles.valueContainerWithRightButton]}>
                  <Text style={styles.inputRowValueText}>{formatDate(storyDate)}</Text>
                  <TouchableOpacity onPress={() => setShowDate(false)} style={styles.removeButtonAlignedRight}>
                    <Ionicons name="remove-circle-outline" size={22} color="red" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
              <View style={styles.separatorThinNoMargin} />
            </>
          )}
          
          {showLocation && (
            <>
              <View style={styles.inputRow}> {/* Keep alignItems: 'flex-start' for this row if text can wrap */}
                <MaterialIcons name="location-pin" size={24} color={styles.inputIcon.color} style={styles.inputIcon} />
                <View style={[styles.inputRowValueContainer, styles.valueContainerWithRightButton]}>
                  <Text style={styles.inputRowValueText} numberOfLines={3} ellipsizeMode="tail">
                    {location?.address || 'No location set'}
                  </Text>
                  <TouchableOpacity onPress={() => { setShowLocation(false); setLocation(null); }} style={styles.removeButtonAlignedRight}>
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
            onValueChange={handlePrivacyOptionPress}
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
            onPress={handleTagPeople}
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
                  <MediaGallery
                    media={(block.content as MediaItem[] || [])}
                    onAddMedia={() => addMediaToImageBlock(block.id)}
                    onRemoveMedia={(index) => removeMediaFromImageBlock(block.id, index)}
                    onReplaceMedia={(index) => replaceMediaInImageBlock(block.id, index)}
                    maxMedia={10} // Example: max 10 media items per gallery block
                    // Add other props like style, iconColor if needed
                  />
                )}
                {block.type === 'audio' && (
                  renderAudioBlock(block)
                )}
                 {/* Video block can be similar to image or have specific handling */}
                 {block.type === 'video' && (
                    <TouchableOpacity onPress={() => handleSelectMediaForImageBlock(block.id)} style={styles.mediaUploadButton}>
                      <Ionicons name="film-outline" size={24} color="#1A4B44" />
                      <Text style={{color: "#1A4B44", marginLeft: 5}}>
                        {block.content && Array.isArray(block.content) && block.content.length > 0 ? `${block.content.length} video(s) selected` : "Add Videos"}
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
      {(isLoading || isUploading) && renderLoadingOverlay()}
      </SafeAreaView>
    </ErrorBoundary>
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
    alignItems: 'flex-start', 
    paddingVertical: 12,
  },
  subtitleInputRow: { // Added for subtitle specific alignment
    alignItems: 'center', // Vertically center items in subtitle row
  },
  inputIcon: {
    marginRight: 12,
    color: '#1A4B44', 
    marginTop: Platform.OS === 'ios' ? 0 : 2, // Slight adjustment for Android icon alignment with flex-start
  },
  inputRowText: { 
    fontSize: 16,
    color: '#222222', 
    marginRight: 8, // Added margin for spacing
  },
  inputRowValueContainer: { 
    flexDirection: 'row',
    alignItems: 'flex-start', // Changed to flex-start for better multiline text alignment with button
    flex: 1, // Added flex: 1 to allow this container to take available space
    // justifyContent: 'space-between', // Avoid using this here if text needs to be left-aligned primarily
  },
  valueContainerWithRightButton: { // New style for date and location value + button
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between', // Push button to the right
    alignItems: 'flex-start', // Align items at the start of the cross axis (top for row)
  },
  inputRowValueText: { 
    fontSize: 16,
    color: '#555555', 
    flexShrink: 1, // Added to allow text to wrap and not push the button
    marginRight: 8, // Add some space between text and button if they are close
  },
  removeButtonOnlyContainer: { // For subtitle's remove button
    marginLeft: 10, // Keep existing margin
    // Vertical centering is handled by subtitleInputRow's alignItems: 'center'
  },
  removeButtonAlignedRight: { // For date and location remove buttons
    // marginLeft: 10, // No longer needed as justifyContent: 'space-between' handles spacing
    // alignItems: 'center' is not needed as the parent valueContainerWithRightButton handles vertical alignment of its children
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
    position: 'relative',
    marginTop: 10,
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
    position: 'absolute',
    top: -12,
    right: -12,
    zIndex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.0)',
    padding: 2,
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
