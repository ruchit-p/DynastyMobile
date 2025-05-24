import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ScrollView, Alert, Platform, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { createFamilyMemberMobile } from '../../src/lib/firebaseUtils';
import { commonHeaderOptions } from '../../constants/headerConfig';
import { useAuth } from '../../src/contexts/AuthContext';
import { showErrorAlert } from '../../src/lib/errorUtils';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

// Custom components
import FullScreenDatePicker from '../../components/ui/FullScreenDatePicker';
import SelectorButton from '../../components/ui/SelectorButton';
import GenderPicker from '../../components/ui/GenderPicker';

// TODO: If you don't have a date picker, you might need to install one:
// npm install @react-native-community/datetimepicker
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker'; // Import Picker

const AddFamilyMemberScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, firestoreUser } = useAuth();
  
  // Initialize error handler with ERROR severity and specific title
  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Add Family Member Error',
    showAlert: true,
    trackCurrentScreen: true
  });
  
  // Ensure selectedNodeName is passed from FamilyTreeScreen or handle its potential undefined state
  const { selectedNodeId, relationType, selectedNodeName = "Selected Member" } = useLocalSearchParams<{
    selectedNodeId: string;
    relationType: 'parent' | 'spouse' | 'child';
    selectedNodeName?: string; 
  }>();
  
  const familyTreeId = firestoreUser?.familyTreeId;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // const [displayName, setDisplayName] = useState(''); // Removed
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(new Date()); // Default to today, user should change
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<string>(''); // Initialize as empty or a default value
  // const [status, setStatus] = useState('Living'); // Removed
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // TODO: Add state for profilePictureUrl if you plan to implement avatar uploads
  // const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [showGenderPicker, setShowGenderPicker] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  // useEffect for error state reset when component mounts
  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    // Dynamically set the header title based on relationType
    try {
      const dynamicTitle = relationType
        ? `Add New ${relationType.charAt(0).toUpperCase() + relationType.slice(1)}`
        : "Add Family Member";
      navigation.setOptions({ 
        ...commonHeaderOptions, // Apply common header styles
        title: dynamicTitle 
      });
    } catch (error) {
      handleError(error, { 
        action: 'setNavigationOptions',
        relationType,
        context: 'header setup'
      });
    }
  }, [navigation, relationType, handleError]);

  // useEffect(() => { // Removed, displayName will be constructed on save
  //   if (firstName && lastName) {
  //     setDisplayName(`${firstName} ${lastName}`);
  //   } else if (firstName) {
  //     setDisplayName(firstName);
  //   } else {
  //     setDisplayName('');
  //   }
  // }, [firstName, lastName]);

  const handleSaveMember = withErrorHandling(async () => {
    try {
      // Validation with error handling
      if (!selectedNodeId || !relationType) {
        const error = new Error("Missing required information (selected node or relation type). Please go back and try again.");
        handleError(error, { 
          action: 'validateRequiredParams',
          selectedNodeId,
          relationType,
          context: 'initial validation'
        });
        return;
      }

      if (!familyTreeId) {
        const error = new Error("Family Tree ID not found. Please ensure you are logged in.");
        handleError(error, { 
          action: 'validateFamilyTreeId',
          familyTreeId,
          userId: user?.uid,
          context: 'configuration validation'
        });
        return;
      }

      if (!dateOfBirth) {
        const error = new Error("Date of birth is required.");
        handleError(error, { 
          action: 'validateDateOfBirth',
          dateOfBirth,
          context: 'field validation'
        });
        return;
      }

      if (!firstName.trim() || !lastName.trim() || !gender.trim()) { 
        const error = new Error("First name, last name, and gender are required.");
        handleError(error, { 
          action: 'validateRequiredFields',
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          gender: gender.trim(),
          context: 'field validation'
        });
        return;
      }

      setIsLoading(true);
      
      const constructedDisplayName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const userData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: constructedDisplayName,
        dateOfBirth, // Ensure this is in a format your Firebase function expects (e.g., ISO string or Timestamp)
        gender: gender.trim(),
        status: 'Living',
        phone: phone.trim(),
        email: email.trim(),
        familyTreeId: familyTreeId,
        // profilePictureUrl, // if implementing avatar
      };

      // Determine correct 'options' based on relationType
      const options = {
        connectToSpouse: relationType === 'child',       // link child to selected node's spouse
        connectToExistingParent: relationType === 'parent', // link new parent to existing parent of selected node
        connectToChildren: relationType === 'spouse',      // link new spouse to children of selected node
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
      handleError(error, { 
        action: 'createFamilyMember',
        userData: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          gender: gender.trim(),
          email: email.trim(),
          phone: phone.trim()
        },
        relationType,
        selectedNodeId,
        familyTreeId,
        context: 'member creation'
      });
    } finally {
      setIsLoading(false);
    }
  });

  const onDateChange = withErrorHandling(async (selectedDate: Date) => {
    try {
      setDateOfBirth(selectedDate);
      setShowDatePicker(false);
    } catch (error) {
      handleError(error, { 
        action: 'onDateChange',
        selectedDate: selectedDate?.toISOString(),
        context: 'date picker handler'
      });
    }
  });

  // const relativeToTitle = `Relative to: ${selectedNodeName}`;
  // Use selectedNodeName directly in the Text component for clarity

  // The screenTitle computed here is now for the content area, 
  // header title is set via router.setOptions
  const contentAreaTitle = relationType 
    ? `Add New ${relationType.charAt(0).toUpperCase() + relationType.slice(1)}` 
    : "Add New Member";

  // Close gender picker when opening date picker
  const openDatePicker = withErrorHandling(async () => {
    try {
      if (showGenderPicker) {
        setShowGenderPicker(false);
      }
      setShowDatePicker(true);
    } catch (error) {
      handleError(error, { 
        action: 'openDatePicker',
        showGenderPicker,
        context: 'date picker UI interaction'
      });
    }
  });

  // Close date picker when opening gender picker
  const openGenderPicker = withErrorHandling(async () => {
    try {
      if (showDatePicker) {
        setShowDatePicker(false);
      }
      setShowGenderPicker(true);
    } catch (error) {
      handleError(error, { 
        action: 'openGenderPicker',
        showDatePicker,
        context: 'gender picker UI interaction'
      });
    }
  });

  // Handle gender selection
  const handleGenderChange = withErrorHandling(async (selectedGender: string) => {
    try {
      setGender(selectedGender);
      setShowGenderPicker(false);
    } catch (error) {
      handleError(error, { 
        action: 'handleGenderChange',
        selectedGender,
        context: 'gender selection handler'
      });
    }
  });

  return (
    <ErrorBoundary screenName="AddFamilyMemberScreen">
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.subtitle}>Relative to: {selectedNodeName}</Text>

        <Text style={styles.label}>First Name*</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter first name"
          value={firstName}
          onChangeText={setFirstName}
          placeholderTextColor="#A0A0A0"
        />

        <Text style={styles.label}>Last Name*</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter last name"
          value={lastName}
          onChangeText={setLastName}
          placeholderTextColor="#A0A0A0"
        />

        <SelectorButton
          label="Date of Birth"
          placeholder="Select Date of Birth"
          value={dateOfBirth ? dateOfBirth.toLocaleDateString() : null}
          onPress={openDatePicker}
          required={true}
        />

        <FullScreenDatePicker
          isVisible={showDatePicker}
          onDismiss={() => setShowDatePicker(false)}
          onDateChange={onDateChange}
          value={dateOfBirth || new Date()}
          maximumDate={new Date()} // Users cannot be born in the future
          mode="date"
          display="spinner"
          doneButtonLabel="Done"
        />

        <SelectorButton
          label="Gender"
          placeholder="Select Gender"
          value={gender}
          onPress={openGenderPicker}
          required={true}
        />

        <GenderPicker
          isVisible={showGenderPicker}
          onDismiss={() => setShowGenderPicker(false)}
          onGenderChange={handleGenderChange}
          value={gender}
          doneButtonLabel="Done"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholderTextColor="#A0A0A0"
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          placeholderTextColor="#A0A0A0"
        />

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
          disabled={isLoading}
        >
          <Text style={[styles.buttonText, styles.cancelButtonText]}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8', // Light gray background
  },
  contentContainer: {
    padding: 20,
    paddingTop: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#1A4B44', // Dynasty Dark Green
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
    textAlign: 'center',
    color: '#555555', // Darker gray
  },
  input: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D0D0', // Lighter border
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 15,
    borderRadius: 8, // More rounded corners
    fontSize: 16,
    color: '#333333',
  },
  label: {
    fontSize: 15,
    color: '#4A4A4A', // Darker gray for label
    marginBottom: 8,
    fontWeight: '500',
  },
  selectorButton: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D0D0',
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  selectorButtonText: {
    fontSize: 16,
    color: '#333333',
  },
  placeholderText: {
    color: '#A0A0A0', // Lighter color for placeholders
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  saveButton: {
    backgroundColor: '#1A4B44', // Dynasty Green dark
    marginTop: 10,
  },
  cancelButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#1A4B44', // Dynasty Green border
    borderWidth: 1,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButtonText: {
    color: '#1A4B44', // Dynasty Green text for cancel button
  }
});

export default AddFamilyMemberScreen; 