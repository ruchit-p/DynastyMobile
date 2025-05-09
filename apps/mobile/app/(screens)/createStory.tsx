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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useNavigation, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

const CreateStoryScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();

  const [storyTitle, setStoryTitle] = useState('');
  const [storyContent, setStoryContent] = useState('');
  const [storyDate, setStoryDate] = useState(new Date()); // Default to today
  const [selectedImages, setSelectedImages] = useState<string[]>([]); 

  // Placeholder for user avatar/name
  const userAvatar = 'https://via.placeholder.com/40';
  const userName = 'Current User';

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
      headerStyle: { backgroundColor: '#F8F8F8' }, // Consistent header style
      headerTintColor: '#333333', // Consistent header style
      headerTitleStyle: { fontWeight: '600' }, // Consistent header style
      headerBackTitleVisible: false, // Consistent header style
    });
  }, [navigation, router, storyTitle, storyContent]);

  const handlePostStory = () => {
    if (!storyTitle.trim() || !storyContent.trim()) {
      Alert.alert('Missing Information', 'Please provide a title and content for your story.');
      return;
    }
    // Simulate posting
    console.log({
      title: storyTitle,
      content: storyContent,
      date: storyDate.toISOString().split('T')[0], 
      images: selectedImages,
    });
    Alert.alert('Story Posted (Simulated)', 'Your story has been successfully created.');
    router.back(); 
  };

  const handleAddMedia = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Allow access to photos to add media.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, 
        quality: 0.7,
        allowsMultipleSelection: true, 
      });
  
      if (!result.canceled && result.assets) {
        const newImageUris = result.assets.map(asset => asset.uri);
        setSelectedImages(prevImages => [...prevImages, ...newImageUris]);
      } else {
        console.log('Image picking was canceled or no assets were selected.');
      }
    } catch (error) {
      console.error("Error picking images: ", error);
      Alert.alert("Image Picker Error", "Could not select images.");
    }
  };

  const handleTagPeople = () => {
    Alert.alert("Tag People", "People tagging will be implemented here.");
  };

  const handleAddLocation = () => {
    Alert.alert("Add Location", "Location functionality will be implemented here.");
    // Consider navigating to a map screen or using a simple TextInput modal
  };

  // Helper to format Date objects for display (borrowed from createEvent)
  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { 
      // More concise format for story date?
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const inputAccessoryViewID = 'storyInputAccessory'; // Unique ID

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
            <TouchableOpacity onPress={handlePostStory} style={{ marginRight: 15 }}>
              <Text style={styles.postButtonTextNavigator}>Post</Text>
            </TouchableOpacity>
          ),
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: '#FFFFFF' }, // White background for header
          headerTintColor: '#1A4B44', // Dark green for title and items
          headerTitleStyle: { fontWeight: '600', fontSize: 18, color: '#1A4B44' },
          headerBackTitleVisible: false,
          headerShadowVisible: false, // Remove header shadow
        }}
      />
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.scrollContentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* User Info remains similar */}
        <View style={styles.userInfoSection}>
          <Image source={{ uri: userAvatar }} style={styles.avatar} />
          <Text style={styles.userNameText}>{userName}</Text>
        </View>

        {/* Wrap main inputs in a form section */}
        <View style={styles.formSection}>
          <TextInput
            style={styles.inputStoryTitle} // New style similar to inputEventName
            placeholder="Story Title"
            placeholderTextColor="#B0B0B0" // Lighter placeholder
            value={storyTitle}
            onChangeText={setStoryTitle}
            autoCorrect={false}
            // inputAccessoryViewID={inputAccessoryViewID} // Can be removed if not using custom accessory view
          />
          
          {/* Separator */}
          <View style={styles.separatorThinNoMargin} /> 

          <TextInput
            style={styles.inputStoryContent} // New style for content
            placeholder="What's your story? Share the details..."
            placeholderTextColor="#B0B0B0" // Lighter placeholder
            value={storyContent}
            onChangeText={setStoryContent}
            multiline
            textAlignVertical="top"
            // inputAccessoryViewID={inputAccessoryViewID} // Can be removed
          />

          {/* Separator */}
          <View style={styles.separatorThinNoMargin} /> 

           {/* Date Picker Row (Optional - using Alert for now) */}
          <TouchableOpacity 
            style={styles.inputRow} 
            onPress={() => Alert.alert("Date Picker", "Date picker functionality can be added here.")} 
          >
             <MaterialCommunityIcons name="calendar-month-outline" size={24} color={styles.inputIcon.color} style={styles.inputIcon} />
             <Text style={styles.inputRowText}>Date</Text> 
             <View style={styles.inputRowValueContainer}>
                <Text style={styles.inputRowValueText}>
                {formatDate(storyDate)}
                </Text>
                <Ionicons name="chevron-forward" size={22} color="#C7C7CC" style={styles.inputRowChevron}/>
             </View>
           </TouchableOpacity>
        </View>

        {/* Selected Media Preview - Keep outside formSection or style differently */}
        {selectedImages.length > 0 && (
          <View style={styles.mediaSection}> 
            <Text style={styles.mediaTitle}>Media</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaPreviewContainer}>
              {selectedImages.map((uri, index) => (
                <View key={index} style={styles.mediaPreviewItem}>
                  <Image source={{ uri }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.removeMediaButton}
                    onPress={() => setSelectedImages(prev => prev.filter((_, i) => i !== index))}
                  >
                    <Ionicons name="close-circle" size={22} color="rgba(0,0,0,0.7)" />
                  </TouchableOpacity>
                </View>
              ))}
              {/* Optional: Add a button here to add more media */}
              <TouchableOpacity style={styles.addMoreMediaButton} onPress={handleAddMedia}>
                 <Ionicons name="add" size={24} color="#555" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      
      </ScrollView>
    </SafeAreaView>
  );
};

// --- Styles Updated to match createEvent structure ---
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF', // Changed to white for a cleaner look
  },
  container: {
    flex: 1,
  },
   scrollContentContainer: {
    paddingBottom: 20, // Removed extra padding for bottom toolbar, some padding remains
  },
  postButtonTextNavigator: {
    color: '#1A4B44', // Dynasty Green
    fontSize: 17,
    fontWeight: '600',
  },
  // User Info Section Styles (can remain similar)
  userInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 15, // Add horizontal padding
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12, // Increased margin
  },
  userNameText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  // Form Section Styling (Adopted from createEvent)
  formSection: {
    marginTop: 20,
    marginHorizontal: 15,
    backgroundColor: '#FFFFFF', 
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, 
    shadowRadius: 3,
    elevation: 2,
  },
  inputStoryTitle: {
    fontSize: 18, // Slightly larger for title
    paddingHorizontal: 18,
    paddingVertical: 18, // Increased padding
    color: '#222222',
    fontWeight: '500',
  },
   inputStoryContent: {
    fontSize: 16,
    paddingHorizontal: 18,
    paddingVertical: 15,
    color: '#333333',
    minHeight: 150, // Good starting height for story content
    lineHeight: 22,
  },
  // Input Row Styling (Adopted from createEvent)
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18, // Consistent padding
    backgroundColor: '#FFFFFF', // Ensure it's white if formSection isn't or if it's the last item
  },
  inputIcon: {
    marginRight: 15,
    color: '#1A4B44', // Dynasty Green for icons
  },
  inputRowText: { // For "Date" label
    fontSize: 16,
    color: '#222222', // Darker text for label
    flex: 1, // Allow label to take available space
  },
  inputRowValueContainer: { // To group date text and chevron
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputRowValueText: { // For the actual date value
    fontSize: 16,
    color: '#555555', // Medium gray for value
  },
  inputRowChevron: {
    marginLeft: 8,
    color: '#C7C7CC', // Standard iOS chevron color
  },
  placeholderText: { // No longer directly used, placeholderTextColor handles it
    color: '#B0B0B0',
  },
  // Separator Styling (Adopted from createEvent)
  separatorThin: {
    height: 0.5,
    backgroundColor: '#E0E0E0',
    marginLeft: 20 + 22 + 15, // Aligns with icon + margin
  },
  separatorThinNoMargin: { // Separator directly under inputs
    height: 1,
    backgroundColor: '#EFEFF4', // Lighter separator
  },
  // Media Section Styles (New/Adjusted)
  mediaSection: {
     marginTop: 20,
     marginHorizontal: 15,
     // Can add background/border/padding if desired
  },
   mediaTitle: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
    paddingLeft: 5, // Small indent
  },
  mediaPreviewContainer: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingLeft: 5, // Align with title indent
  },
  mediaPreviewItem: {
    marginRight: 12, // Increased spacing
    position: 'relative',
  },
  previewImage: {
    width: 90, // Slightly larger preview
    height: 90,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#eee', // Background for loading/error
  },
   addMoreMediaButton: {
    width: 90,
    height: 90,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#CCC',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    marginLeft: 5, // Spacing after last image
  },
  removeMediaButton: {
    position: 'absolute',
    top: -7, // Adjusted position
    right: -7, // Adjusted position
    backgroundColor: '#FFFFFF',
    borderRadius: 12, // Make it circular
    padding: 1, // Add padding for easier touch
    shadowColor: '#000', // Add shadow for visibility
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});

export default CreateStoryScreen;
