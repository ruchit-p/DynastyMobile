import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ScrollView, Alert, Platform, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createFamilyMemberMobile } from '../../src/lib/firebaseUtils'; // Adjust path if your lib folder is elsewhere
// import { useAuth } from '../contexts/AuthContext'; // Assuming you have an Auth context for user and familyTreeId

// TODO: If you don't have a date picker, you might need to install one:
// npm install @react-native-community/datetimepicker
// import DateTimePicker from '@react-native-community/datetimepicker';

const AddFamilyMemberScreen = () => {
  const router = useRouter();
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
  const [displayName, setDisplayName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(new Date()); // Default to today, user should change
  // const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState(''); // Consider a Picker: e.g., Male, Female, Other
  const [status, setStatus] = useState('Living'); // Consider a Picker: Living, Deceased
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
    router.setOptions({ title: dynamicTitle });
  }, [router, relationType]);

  useEffect(() => {
    if (firstName && lastName) {
      setDisplayName(`${firstName} ${lastName}`);
    } else if (firstName) {
      setDisplayName(firstName);
    } else {
      setDisplayName('');
    }
  }, [firstName, lastName]);

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
    if (!firstName.trim() || !gender.trim()) { // Last name can sometimes be optional depending on culture/preference
        Alert.alert("Validation Error", "First name and gender are required.");
        return;
    }

    setIsLoading(true);
    try {
      const userData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: displayName.trim() || `${firstName.trim()} ${lastName.trim()}`.trim(),
        dateOfBirth, // Ensure this is in a format your Firebase function expects (e.g., ISO string or Timestamp)
        gender: gender.trim(),
        status,
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

  // const onDateChange = (event: any, selectedDate?: Date) => {
  //   const currentDate = selectedDate || dateOfBirth;
  //   setShowDatePicker(Platform.OS === 'ios'); // Keep picker open on iOS until dismissal
  //   if (currentDate) setDateOfBirth(currentDate);
  // };

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
      
      <Text style={styles.label}>Last Name</Text>
      <TextInput style={styles.input} placeholder="Enter last name (optional)" value={lastName} onChangeText={setLastName} />
      
      <Text style={styles.label}>Display Name</Text>
      <TextInput style={styles.input} placeholder="Full name (auto-updated)" value={displayName} onChangeText={setDisplayName} />
      
      <Text style={styles.label}>Date of Birth*:</Text>
      {/* <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
        <Text style={styles.dateText}>{dateOfBirth ? dateOfBirth.toLocaleDateString() : "Select Date"}</Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          testID="dateTimePicker"
          value={dateOfBirth || new Date()} // Ensure a valid Date object
          mode="date"
          display={Platform.OS === 'ios' ? "spinner" : "default"}
          onChange={onDateChange}
        />
      )} */}
      <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={dateOfBirth ? dateOfBirth.toISOString().split('T')[0] : ''} onChangeText={(text) => setDateOfBirth(new Date(text))} />

      <Text style={styles.label}>Gender*</Text>
      <TextInput style={styles.input} placeholder="(e.g., Male, Female, Other)" value={gender} onChangeText={setGender} />
      
      <Text style={styles.label}>Status</Text>
      <TextInput style={styles.input} placeholder="(e.g., Living, Deceased)" value={status} onChangeText={setStatus} />
      
      <Text style={styles.label}>Email (Optional)</Text>
      <TextInput style={styles.input} placeholder="Enter email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      
      <Text style={styles.label}>Phone (Optional)</Text>
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
    marginBottom: 15,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
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