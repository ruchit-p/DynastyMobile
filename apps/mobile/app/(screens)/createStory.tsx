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
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams(); // Get potential returned params

  // MARK: - State Variables
  const [storyTitle, setStoryTitle] = useState('');
  
  const [showDate, setShowDate] = useState(false); // Date hidden by default, added via Additional Details
  const [storyDate, setStoryDate] = useState<Date | null>(new Date());
  
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [subtitle, setSubtitle] = useState('');

  const [coverPhoto, setCoverPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);

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

  // Placeholder for user avatar/name - can be removed if not used
  // const userAvatar = 'https://via.placeholder.com/40';
  // const userName = 'Current User';

  // ADDED: useEffect to log isAudioActionSheetVisible changes
  useEffect(() => {
    console.log(`isAudioActionSheetVisible changed to: ${isAudioActionSheetVisible}`);
  }, [isAudioActionSheetVisible]);

  // MARK: - Navigation Setup & Data Return Handling
  useEffect(() => {
    navigation.setOptions({
      title: 'Create Story', // Image shows "Edit Story", can be adapted
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10 }}>
          <Ionicons name="arrow-back" size={26} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={handleSaveStory} style={{ marginRight: 15 }}>
          <Text style={styles.saveButtonTextNavigator}>Save</Text>
        </TouchableOpacity>
      ),
      headerTitleAlign: 'center',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation, router, storyTitle, blocks, storyDate, subtitle, location, privacy, customSelectedViewers, taggedMembers]); // Add dependencies

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
    console.log('Record audio useEffect params:', JSON.stringify(params, null, 2)); // ADDED LOG
    console.log('Record audio useEffect values:', { recordedAudioUri, recordedAudioDuration }); // ADDED LOG
    
    if (recordedAudioUri) {
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
      console.log('Recorded newAudioBlock to add:', JSON.stringify(newBlock, null, 2)); // ADDED LOG
      setBlocks(prevBlocks => [...prevBlocks, newBlock]);
      
      // Clear params to avoid re-processing
      router.setParams({ recordedAudioUri: undefined, recordedAudioDuration: undefined });
    }
  }, [router, params]);

  // Log blocks state whenever it changes
  useEffect(() => {
    console.log('Current story blocks state:', JSON.stringify(blocks, null, 2));
  }, [blocks]);

  // MARK: - Handlers
  const handleSaveStory = () => {
    if (!storyTitle.trim()) {
      Alert.alert('Missing Title', 'Please provide a title for your story.');
      return;
    }
    if (blocks.length === 0) {
      Alert.alert('Missing Content', 'Please add some content to your story.');
      return;
    }
    
    // Transform blocks to match Firebase structure
    const transformedBlocks = blocks.map(block => {
      if (block.type === 'text') {
        return {
          type: 'text',
          data: block.content,
          localId: block.id
        };
      } else if (block.type === 'image') {
        // For image blocks, we would typically upload the images to Firebase Storage
        // and then store the URLs in Firestore
        // For now, we'll just store the local URIs as placeholders
        return {
          type: 'image',
          data: Array.isArray(block.content) ? block.content.map(asset => asset.uri) : [],
          localId: block.id
        };
      } else if (block.type === 'audio') {
        // Similarly for audio, we would upload the file and store the URL
        return {
          type: 'audio',
          data: typeof block.content === 'object' ? block.content.uri : block.content,
          duration: typeof block.content === 'object' ? block.content.duration : 0,
          isRecording: typeof block.content === 'object' ? !!block.content.isRecording : false,
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
    
    // This is the data structure we would send to Firebase
    const storyData = {
      title: storyTitle,
      subtitle: showSubtitle ? subtitle : undefined,
      eventDate: showDate ? storyDate?.toISOString() : undefined,
      location: showLocation ? location : undefined,
      coverPhotoUrl: coverPhoto ? coverPhoto.uri : undefined, // In a real app, this would be uploaded to Firebase Storage
      privacy,
      peopleInvolved: taggedMembers,
      customViewers: privacy === 'custom' ? customSelectedViewers : undefined,
      blocks: transformedBlocks,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // TODO: In a production app, implement actual API call to Firebase
    // This would typically be a Cloud Function call similar to:
    // const functions = getFunctions();
    // const createStoryFunction = httpsCallable(functions, 'createStory');
    // try {
    //   const result = await createStoryFunction(storyData);
    //   console.log('Story created:', result.data);
    //   Alert.alert('Success', 'Your story has been saved.');
    //   router.back();
    // } catch (error) {
    //   console.error('Error creating story:', error);
    //   Alert.alert('Error', 'Failed to save your story. Please try again.');
    // }
    
    console.log('Story data:', storyData);
    Alert.alert('Story Saved (Simulated)', 'Your story has been successfully saved.');
    router.back(); 
  };

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
          mediaTypes: ImagePicker.MediaTypeOptions.All, // Use 'All' since 'Audio' is not available, but 'All' includes video which might have audio.
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
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Allow access to photos to add media.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, // For now, only images. Can be expanded.
        allowsEditing: false, // To allow multiple selection easily. Editing can be per image.
        quality: 0.7,
        allowsMultipleSelection: true, 
      });
  
      if (!result.canceled && result.assets) {
        updateBlockContent(blockId, result.assets);
      }
    } catch (error) {
      console.error("Error picking images for block: ", error);
      Alert.alert("Image Picker Error", "Could not select images.");
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

  // MARK: - Cover Photo Handler
  const handleSelectCoverPhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Allow access to photos to add a cover image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        aspect: [16, 9], // Optional: set aspect ratio for cover photos
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setCoverPhoto(result.assets[0]);
      }
    } catch (error) {
      console.error("Error picking cover image: ", error);
      Alert.alert("Image Picker Error", "Could not select a cover image.");
    }
    setDetailsActionSheetVisible(false);
  };

  // MARK: - Additional Details Action Sheet Actions
  const detailsActions: ActionSheetAction[] = [
    { title: showSubtitle ? 'Remove Subtitle' : 'Add Subtitle', onPress: () => { setShowSubtitle(!showSubtitle); setDetailsActionSheetVisible(false); } },
    { title: showDate ? 'Remove Date' : 'Add Date', onPress: () => { setShowDate(!showDate); setDetailsActionSheetVisible(false); } },
    { title: coverPhoto ? 'Remove Cover Photo' : 'Add Cover Photo', onPress: () => {
        if (coverPhoto) { setCoverPhoto(null); } else { handleSelectCoverPhoto(); }
        setDetailsActionSheetVisible(false);
      }
    },
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
    { title: 'Add Audio', onPress: () => {
        console.log('Add Content ActionSheet: "Add Audio" pressed'); // ADDED LOG
        setAudioActionSheetVisible(true);
      } 
    },
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
            <TouchableOpacity onPress={handleSaveStory} style={{ marginRight: 15 }}>
              <Text style={styles.saveButtonTextNavigator}>Save</Text>
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
          {coverPhoto && (
            <View style={styles.coverPhotoContainer}>
              <Image source={{ uri: coverPhoto.uri }} style={styles.coverPhoto} />
              <TouchableOpacity 
                style={styles.removeCoverPhotoButton}
                onPress={() => setCoverPhoto(null)}
              >
                <Ionicons name="close-circle" size={30} color="white" />
              </TouchableOpacity>
            </View>
          )}

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
              <TextInput
                style={styles.inputField}
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
  },
  inputField: { // Generic input field style
    fontSize: 16,
    paddingVertical: 12,
    color: '#333333',
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
  coverPhotoContainer: {
    height: 150,
    width: '100%',
    borderRadius: 8,
    marginBottom: 15,
    position: 'relative',
    overflow: 'hidden',
  },
  coverPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeCoverPhotoButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 15,
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
});

export default CreateStoryScreen;
