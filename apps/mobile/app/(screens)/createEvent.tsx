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
// import DateTimePicker from '@react-native-community/datetimepicker'; // For a better date/time picker

const CreateEventScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();

  const [eventName, setEventName] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [eventTime, setEventTime] = useState(new Date()); // Separate state for time
  const [eventLocation, setEventLocation] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);

  // const [showDatePicker, setShowDatePicker] = useState(false);
  // const [showTimePicker, setShowTimePicker] = useState(false);

  React.useEffect(() => {
    navigation.setOptions({
      title: 'Create Event',
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10 }}>
          <Ionicons name="arrow-back" size={26} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={handlePostEvent} style={{ marginRight: 15 }}>
          <Text style={styles.postButtonTextNavigator}>Create</Text>
        </TouchableOpacity>
      ),
      headerTitleAlign: 'center',
    });
  }, [navigation, router, eventName, eventLocation]);

  const handlePostEvent = () => {
    if (!eventName.trim() || !eventLocation.trim()) {
      Alert.alert('Missing Information', 'Please provide an event name and location.');
      return;
    }
    // TODO: Implement actual event posting logic
    console.log({
      name: eventName,
      description: eventDescription,
      date: eventDate.toISOString().split('T')[0],
      time: eventTime.toTimeString().split(' ')[0], // Format as HH:MM:SS
      location: eventLocation,
      coverImage,
    });
    Alert.alert('Event Created!', 'Your event has been successfully created.');
    router.back(); // Go back after posting
  };

  const handleAddCoverImage = async () => {
    // TODO: Implement image picking for cover image
    // const result = await ImagePicker.launchImageLibraryAsync(...);
    // if (!result.canceled) setCoverImage(result.assets[0].uri);
    Alert.alert("Add Cover Image", "Cover image selection will be implemented here.");
  };

  // const onDateChange = (event, selectedDate) => {
  //   const currentDate = selectedDate || eventDate;
  //   setShowDatePicker(Platform.OS === 'ios');
  //   setEventDate(currentDate);
  // };

  // const onTimeChange = (event, selectedTime) => {
  //   const currentTime = selectedTime || eventTime;
  //   setShowTimePicker(Platform.OS === 'ios');
  //   setEventTime(currentTime);
  // };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.coverImageContainer} onPress={handleAddCoverImage}>
          {coverImage ? (
            <Image source={{ uri: coverImage }} style={styles.coverImage} />
          ) : (
            <View style={styles.coverImagePlaceholder}>
              <Ionicons name="camera-outline" size={40} color="#CCC" />
              <Text style={styles.coverImagePlaceholderText}>Add Cover Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.inputField}
          placeholder="Event Name"
          value={eventName}
          onChangeText={setEventName}
          placeholderTextColor="#888"
        />

        <TextInput
          style={styles.inputFieldMultiLine}
          placeholder="Event Description (Optional)"
          value={eventDescription}
          onChangeText={setEventDescription}
          multiline
          textAlignVertical="top"
          placeholderTextColor="#888"
        />

        {/* Date Picker Placeholder */}
        <TouchableOpacity style={styles.optionButton} onPress={() => Alert.alert("Date Picker", "Date picker for event will be implemented here.")}>
          <Ionicons name="calendar-outline" size={20} color="#555" style={styles.optionIcon} />
          <Text style={styles.optionText}>Date: {eventDate.toLocaleDateString()}</Text>
        </TouchableOpacity>

        {/* Time Picker Placeholder */}
        <TouchableOpacity style={styles.optionButton} onPress={() => Alert.alert("Time Picker", "Time picker for event will be implemented here.")}>
          <Ionicons name="time-outline" size={20} color="#555" style={styles.optionIcon} />
          <Text style={styles.optionText}>Time: {eventTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.inputField}
          placeholder="Location (e.g., Central Park, Online)"
          value={eventLocation}
          onChangeText={setEventLocation}
          placeholderTextColor="#888"
        />
        
        {/* Add more fields as needed: e.g., Guest list, privacy settings */}
      </ScrollView>
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
    backgroundColor: '#F9F9F9',
    paddingHorizontal: 15,
  },
  coverImageContainer: {
    height: 200,
    backgroundColor: '#E9E9E9',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 20,
    marginTop: 10,
    overflow: 'hidden', // Ensures the Image respects borderRadius
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImagePlaceholderText: {
    marginTop: 8,
    color: '#AAA',
    fontSize: 16,
  },
  inputField: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 15,
  },
  inputFieldMultiLine: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 15,
    minHeight: 100, 
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 15,
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
});

export default CreateEventScreen; 