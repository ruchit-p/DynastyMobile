import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ScrollView, Alert, Platform, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { createFamilyMemberMobile } from '../../src/lib/firebaseUtils'; // Adjust path if your lib folder is elsewhere
// import { useAuth } from '../contexts/AuthContext'; // Assuming you have an Auth context for user and familyTreeId
import { commonHeaderOptions } from '../../constants/headerConfig';

// TODO: If you don't have a date picker, you might need to install one:
// npm install @react-native-community/datetimepicker
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker'; // Import Picker

const AddFamilyMemberScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  // Ensure selectedNodeName is passed from FamilyTreeScreen or handle its potential undefined state
  const { selectedNodeId, relationType, selectedNodeName = "Selected Member" } = useLocalSearchParams<{
    selectedNodeId: string;
    relationType: 'parent' | 'spouse' | 'child';
    selectedNodeName?: string; 
  }>();
  
  // const { currentUser, familyTreeId } = useAuth(); // Get current user and their familyTreeId
  // const currentFamilyTreeId = familyTreeId; // From auth context
  // TODO: Replace this placeholder with actual familyTreeId from your auth context or state management
  const placeholderFamilyTreeId = "your_actual_family_tree_id";


  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // const [displayName, setDisplayName] = useState(''); // Removed
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(new Date()); // Default to today, user should change
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === 'ios'); // Keep open on iOS by default
  const [gender, setGender] = useState<string>(''); // Initialize as empty or a default value
  // const [status, setStatus] = useState('Living'); // Removed
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // TODO: Add state for profilePictureUrl if you plan to implement avatar uploads
  // const [profilePictureUrl, setProfilePictureUrl] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Dynamically set the header title based on relationType
    const dynamicTitle = relationType
      ? `Add New ${relationType.charAt(0).toUpperCase() + relationType.slice(1)}`
      : "Add Family Member";
    navigation.setOptions({ 
      ...commonHeaderOptions, // Apply common header styles
      title: dynamicTitle 
    });
  }, [navigation, relationType]);

  // useEffect(() => { // Removed, displayName will be constructed on save
  //   if (firstName && lastName) {
  //     setDisplayName(`${firstName} ${lastName}`);
  //   } else if (firstName) {
  //     setDisplayName(firstName);
  //   } else {
  //     setDisplayName('');
  //   }
  // }, [firstName, lastName]);

  const handleSaveMember = async () => {
    if (!selectedNodeId || !relationType) {
      Alert.alert("Error", "Missing required information (selected node or relation type). Please go back and try again.");
      return;
    }

    // TODO: Replace placeholderFamilyTreeId with actual dynamic familyTreeId
    if (!placeholderFamilyTreeId) {
        Alert.alert("Configuration Error", "Family Tree ID not found. Please ensure you are logged in.");
        return;
    }
    if (!dateOfBirth) {
        Alert.alert("Validation Error", "Date of birth is required.");
        return;
    }
    if (!firstName.trim() || !lastName.trim() || !gender.trim()) { 
        Alert.alert("Validation Error", "First name, last name, and gender are required.");
        return;
    }

    setIsLoading(true);
    try {
      const constructedDisplayName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const userData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: constructedDisplayName,
        dateOfBirth, // Ensure this is in a format your Firebase function expects (e.g., ISO string or Timestamp)
        gender: gender.trim(),
        // status, // Removed
        phone: phone.trim(),
        email: email.trim(),
        familyTreeId: placeholderFamilyTreeId, // Use actual familyTreeId
        // profilePictureUrl, // if implementing avatar
      };

      // TODO: Determine correct 'options' based on relationType and your Cloud Function logic.
      // For example, if adding a parent, does it automatically link to existing spouse of the child node?
      // These options are defined in the web's functionUtils.ts but their backend effect needs checking.
      const options = {
        // connectToChildren: relationType === 'parent', 
        // connectToSpouse: relationType === 'spouse', 
        // connectToExistingParent: relationType === 'child', 
      };

      await createFamilyMemberMobile(userData, relationType, selectedNodeId, options);
      Alert.alert(
        "Success", 
        `${userData.displayName} has been successfully added as a ${relationType} to ${selectedNodeName}.`,
        [
          { text: "OK", onPress: () => router.back() } // Navigate back after user acknowledges
        ]
      );
      // TODO: Implement a robust refresh mechanism for FamilyTreeScreen
      // e.g., using a global state update, event emitter, or router.refresh() if applicable
    } catch (error: any) {
      console.error("Failed to add family member:", error);
      Alert.alert("Error", `Failed to add family member. ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || dateOfBirth;
    if (Platform.OS === 'android') {
      setShowDatePicker(false); // Close picker on Android after selection
    }
    if (currentDate) {
      setDateOfBirth(currentDate);
    }
  };

  // const relativeToTitle = `Relative to: ${selectedNodeName}`;
  // Use selectedNodeName directly in the Text component for clarity

  // The screenTitle computed here is now for the content area, 
  // header title is set via router.setOptions
  const contentAreaTitle = relationType 
    ? `Add New ${relationType.charAt(0).toUpperCase() + relationType.slice(1)}` 
    : "Add New Member";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>{contentAreaTitle}</Text>
      <Text style={styles.subtitle}>Relative to: {selectedNodeName}</Text>
      
      <Text style={styles.label}>First Name*</Text>
      <TextInput style={styles.input} placeholder="Enter first name" value={firstName} onChangeText={setFirstName} />
      
      <Text style={styles.label}>Last Name*</Text>
      <TextInput style={styles.input} placeholder="Enter last name" value={lastName} onChangeText={setLastName} />
      
      {/* <Text style={styles.label}>Display Name</Text> // Removed
      <TextInput style={styles.input} placeholder="Full name (auto-updated)" value={displayName} onChangeText={setDisplayName} /> */}
      
      <Text style={styles.label}>Date of Birth*</Text>
      {Platform.OS === 'android' && (
        <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
          <Text style={styles.dateText}>{dateOfBirth ? dateOfBirth.toLocaleDateString() : "Select Date"}</Text>
        </TouchableOpacity>
      )}
      {(showDatePicker || Platform.OS === 'ios') && (
        <DateTimePicker
          testID="dateTimePicker"
          value={dateOfBirth || new Date()} 
          mode="date"
          display={Platform.OS === 'ios' ? "spinner" : "default"}
          onChange={onDateChange}
          maximumDate={new Date()} // Users cannot be born in the future
          style={Platform.OS === 'ios' ? styles.iosDatePicker : {}}
        />
      )}

      <Text style={styles.label}>Gender*</Text>
      <View style={styles.pickerContainer}> 
        <Picker
          selectedValue={gender}
          onValueChange={(itemValue, itemIndex) => setGender(itemValue)}
          style={styles.picker}
          itemStyle={styles.pickerItem} // For iOS item styling if needed
        >
          <Picker.Item label="Select Gender..." value="" />
          <Picker.Item label="Female" value="Female" />
          <Picker.Item label="Male" value="Male" />
          <Picker.Item label="Non-binary" value="Non-binary" />
          <Picker.Item label="Other" value="Other" />
          <Picker.Item label="Prefer not to say" value="Prefer not to say" />
        </Picker>
      </View>
      
      {/* <Text style={styles.label}>Status</Text> // Removed
      <TextInput style={styles.input} placeholder="(e.g., Living, Deceased)" value={status} onChangeText={setStatus} /> */}
      
      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} placeholder="Enter email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      
      <Text style={styles.label}>Phone</Text>
      <TextInput style={styles.input} placeholder="Enter phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" textContentType="telephoneNumber" />

      <TouchableOpacity 
        style={[styles.button, styles.saveButton]} 
        onPress={handleSaveMember} 
        disabled={isLoading}
      >
        <Text style={styles.buttonText}>{isLoading ? "Saving..." : "Save Member"}</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[styles.button, styles.cancelButton]} 
        onPress={() => router.back()} 
        disabled={isLoading} // Good to disable cancel if save is in progress
      >
        <Text style={[styles.buttonText, styles.cancelButtonText]}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8', // Light gray background
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24, // Increased size
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#1A4B44', // Dynasty Dark Green
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 30, // Increased bottom margin
    textAlign: 'center',
    color: '#555555', // Darker gray
  },
  input: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D0D0', // Lighter border
    borderWidth: 1,
    marginBottom: 18, // Increased margin
    paddingHorizontal: 15,
    borderRadius: 8, // More rounded corners
    fontSize: 16,
    color: '#333333',
  },
  label: {
    fontSize: 14, // Slightly smaller label
    color: '#4A4A4A', // Darker gray for label
    marginBottom: 6,
    fontWeight: '500',
  },
  dateButton: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderColor: '#DDD',
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 18, // Match input margin
  },
  dateText: {
    fontSize: 16,
    color: '#333',
  },
  iosDatePicker: {
    height: 120, // Adjust height for iOS spinner
    marginBottom: 18,
  },
  pickerContainer: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D0D0',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 18, // Match input margin
    justifyContent: 'center', // Center picker content vertically
  },
  picker: {
    height: '100%', // Take full height of container
    width: '100%',
    // backgroundColor: 'transparent', // Optional: for better iOS appearance
  },
  pickerItem: {
    // For iOS, if you need to style individual items (e.g., font size)
    // height: 120, // Example for iOS item height to make spinner taller
  },
  buttonContainer: {
    marginTop: 10,
    borderRadius: 8,
    overflow: 'hidden',
    width: '100%', // Make button containers take full width
    marginBottom: 10, // Add space between buttons
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12, // Space between buttons
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  saveButton: {
    backgroundColor: '#006400', // Dynasty Green
  },
  cancelButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#006400', // Dynasty Green border
    borderWidth: 1,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButtonText: {
    color: '#006400', // Dynasty Green text for cancel button
  }
});

export default AddFamilyMemberScreen; 