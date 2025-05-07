import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';

const CreateStoryScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();

  const [storyTitle, setStoryTitle] = useState('');
  const [storyContent, setStoryContent] = useState('');
  const [storyDate, setStoryDate] = useState(new Date()); // Default to today
  const [location, setLocation] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]); // For multiple images

  // Placeholder for user avatar - in a real app, this would come from auth context or props
  const userAvatar = 'https://via.placeholder.com/40';
  const userName = 'Current User'; // Placeholder

  React.useEffect(() => {
    navigation.setOptions({
      title: 'Create Story',
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10 }}>
          <Ionicons name="arrow-back" size={26} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={handlePostStory} style={{ marginRight: 15 }}>
          <Text style={styles.postButtonTextNavigator}>Post</Text>
        </TouchableOpacity>
      ),
      headerTitleAlign: 'center',
    });
  }, [navigation, router, storyTitle, storyContent]);

  const handlePostStory = () => {
    if (!storyTitle.trim() || !storyContent.trim()) {
      Alert.alert('Missing Information', 'Please provide a title and content for your story.');
      return;
    }
    // TODO: Implement actual story posting logic (e.g., API call, save to state/DB)
    console.log({
      title: storyTitle,
      content: storyContent,
      date: storyDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
      location,
      images: selectedImages,
    });
    Alert.alert('Story Posted!', 'Your story has been successfully created.');
    router.back(); // Go back after posting
  };

  const handleAddMedia = async () => {
    // TODO: Implement image/video picking
    // For now, let's simulate adding an image
    // const result = await ImagePicker.launchImageLibraryAsync({
    //   mediaTypes: ImagePicker.MediaTypeOptions.Images,
    //   allowsEditing: true,
    //   aspect: [4, 3],
    //   quality: 1,
    //   allowsMultipleSelection: true, // If you want to allow multiple images
    // });

    // if (!result.canceled) {
    //   setSelectedImages(prevImages => [...prevImages, ...result.assets.map(asset => asset.uri)]);
    // }
    Alert.alert("Add Media", "Media selection will be implemented here.");
  };

  const handleTagPeople = () => {
    // TODO: Implement people tagging functionality
    Alert.alert("Tag People", "People tagging will be implemented here.");
  };

  const handleAddLocation = () => {
    // TODO: Implement location picking or use device's current location
    // For now, we can toggle a manual input or a map view
    Alert.alert("Add Location", "Location functionality will be implemented here.");
  };

  // Basic DatePicker (can be replaced with a more sophisticated one)
  // For simplicity, we'll use a text input for date for now, or a button to show a modal picker.
  // A proper date picker like @react-native-community/datetimepicker is recommended for better UX.

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.userInfoSection}>
          <Image source={{ uri: userAvatar }} style={styles.avatar} />
          <Text style={styles.userNameText}>{userName}</Text>
        </View>

        <TextInput
          style={styles.titleInput}
          placeholder="Story Title (e.g., Our Summer Vacation)"
          value={storyTitle}
          onChangeText={setStoryTitle}
          placeholderTextColor="#888"
        />

        <TextInput
          style={styles.contentInput}
          placeholder="What's your story? Share the details..."
          value={storyContent}
          onChangeText={setStoryContent}
          multiline
          textAlignVertical="top"
          placeholderTextColor="#888"
        />

        {/* Date Input - Placeholder, consider using a proper date picker */}
        <TouchableOpacity style={styles.optionButton} onPress={() => Alert.alert("Date Picker", "Date picker will be implemented here.")}>
          <Ionicons name="calendar-outline" size={20} color="#555" style={styles.optionIcon} />
          <Text style={styles.optionText}>Date: {storyDate.toLocaleDateString()}</Text>
        </TouchableOpacity>

        {/* Selected Media Preview */}
        {selectedImages.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaPreviewContainer}>
            {selectedImages.map((uri, index) => (
              <View key={index} style={styles.mediaPreviewItem}>
                <Image source={{ uri }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.removeMediaButton}
                  onPress={() => setSelectedImages(prev => prev.filter((_, i) => i !== index))}
                >
                  <Ionicons name="close-circle" size={20} color="rgba(0,0,0,0.6)" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </ScrollView>

      <View style={styles.bottomToolbar}>
        <TouchableOpacity style={styles.toolbarButton} onPress={handleAddMedia}>
          <Ionicons name="images-outline" size={24} color="#1A4B44" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton} onPress={handleTagPeople}>
          <Ionicons name="pricetags-outline" size={24} color="#1A4B44" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton} onPress={handleAddLocation}>
          <Ionicons name="location-outline" size={24} color="#1A4B44" />
        </TouchableOpacity>
        {/* Add more tools like mood, etc. if needed */}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  postButtonTextNavigator: {
    color: '#1A4B44',
    fontSize: 17,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9', // Slightly different background for content area
    paddingHorizontal: 15,
  },
  userInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  userNameText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  titleInput: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    marginBottom: 15,
  },
  contentInput: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
    minHeight: 150, // Start with a decent height
    paddingVertical: 10,
    marginBottom: 20,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  optionIcon: {
    marginRight: 10,
  },
  optionText: {
    fontSize: 15,
    color: '#333',
  },
  mediaPreviewContainer: {
    flexDirection: 'row',
    paddingVertical: 10,
    marginBottom: 10,
  },
  mediaPreviewItem: {
    marginRight: 10,
    position: 'relative',
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  removeMediaButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  bottomToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: Platform.OS === 'ios' ? 15 : 10, // More padding for iOS bottom bar
    paddingBottom: Platform.OS === 'ios' ? 30 : 10, // Extra padding for home indicator on iOS
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  toolbarButton: {
    padding: 10,
  },
});

export default CreateStoryScreen; 