import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../src/contexts/AuthContext'; // Adjust path as needed
import { getFirebaseFunctions } from '../../src/lib/firebase'; // Corrected import for functions
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Fonts from '../../constants/Fonts';
// You might want a gender picker component (e.g., dropdown)

// Define the expected structure of data from the completeOnboarding Firebase function
interface CompleteOnboardingResultData {
  success: boolean;
  message?: string;
}

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState(user?.displayName?.split(' ')[0] || '');
  const [lastName, setLastName] = useState(user?.displayName?.split(' ').slice(1).join(' ') || '');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState(''); // 'male', 'female', 'other', 'unspecified'
  const [showGenderPicker, setShowGenderPicker] = useState(false); // Added for gender picker
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChangeDate = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false); // Modal picker on Android, close after interaction
    }

    if (event.type === 'set') {
      if (selectedDate) {
        // Basic validation for future dates, though maximumDate should handle age.
        const today = new Date();
        if (selectedDate > today) {
          setError('Date of birth cannot be in the future.');
          // Optionally revert to previous date or null
          // setDateOfBirth(dateOfBirth); // Keep previous valid date if any
          return;
        }
        setDateOfBirth(selectedDate);
        setError(null); // Clear previous date-related errors

        // Optional: hide iOS spinner after selection
        // if (Platform.OS === 'ios') {
        //   setShowDatePicker(false);
        // }
      }
    } else if (event.type === 'dismissed') {
      // User cancelled. For Android, picker is already closed.
      // For iOS, if it's a modal, it would be handled. Spinner remains.
    }
  };

  const handleSelectGender = (selectedGender: string) => {
    setGender(selectedGender);
    setShowGenderPicker(false);
  };

  const handleSubmit = async () => {
    if (!firstName || !lastName) {
      setError('First and last name are required.');
      return;
    }
    // Basic DOB validation (more robust validation needed for production)
    let dateOfBirthISO: string | null = null;
    if (dateOfBirth) {
      const yearNum = dateOfBirth.getFullYear();
      // The DateTimePicker's minimumDate and maximumDate props should enforce this range.
      // This is an additional safeguard or if dateOfBirth could be set by other means.
      if (yearNum <= 1900 || yearNum > new Date().getFullYear() - 13) { // Ensure they are at least 13
        setError('Please select a valid date of birth (you must be at least 13 years old).');
        return;
      }
      dateOfBirthISO = dateOfBirth.toISOString();
    }

    setIsLoading(true);
    setError(null);
    try {
      if (!user) {
        throw new Error('User not authenticated.');
      }
      // Get functions instance for callable
      const firebaseFunctions = getFirebaseFunctions();
      const completeOnboardingFn = firebaseFunctions.httpsCallable('completeOnboarding');
      const result = await completeOnboardingFn({
        userId: user.uid,
        firstName,
        lastName,
        // Ensure dateOfBirth is sent in a format your backend expects (e.g., ISO string or Timestamp)
        dateOfBirth: dateOfBirthISO,
        gender: gender || 'Prefer not to say', // Updated to use selected gender, default if empty
        displayName: `${firstName} ${lastName}`.trim(), // Added displayName
      }) as { data: CompleteOnboardingResultData }; // Added type assertion for the result

      if (result.data.success) {
        Alert.alert('Profile Updated', 'Your profile has been set up!');
        // Navigation to the main app will be handled by AuthContext's useEffect
        // after it detects onboardingCompleted is true.
        await refreshUser(); // Refresh user data in AuthContext
        // AuthContext's useEffect should now handle the redirect.
        // router.replace('/(tabs)/home'); // Remove direct navigation
      } else {
        throw new Error(result.data.message || 'Failed to complete onboarding.');
      }
    } catch (e: any) {
      console.error("Onboarding submission failed:", e);
      setError(e.message || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  // TODO: Implement proper Date Picker and Gender Picker (e.g., using a library or custom component)
  // The Date Picker part is now being addressed by DateTimePicker.

  return (
    <>
      <Stack.Screen options={{ title: 'Set Up Your Profile', headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.container}>
            <Image 
              source={require('../../assets/images/dynasty.png')} 
              style={styles.logo}
              resizeMode="contain" 
            />
            <Text style={styles.title}>Welcome to Dynasty!</Text>
            <Text style={styles.subtitle}>Let&apos;s set up your profile to get started.</Text>

            <TextInput
              style={styles.input}
              placeholder="First Name"
              value={firstName}
              onChangeText={setFirstName}
            />
            <TextInput
              style={styles.input}
              placeholder="Last Name"
              value={lastName}
              onChangeText={setLastName}
            />
            
            <Text style={styles.label}>Date of Birth (Optional)</Text>
            <TouchableOpacity 
              onPress={() => setShowDatePicker(prev => !prev)} 
              style={styles.datePickerButton}
            >
              <Text style={styles.datePickerButtonText}>
                {dateOfBirth ? dateOfBirth.toLocaleDateString() : 'Select Date'}
              </Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                testID="dateTimePicker"
                value={dateOfBirth || new Date(new Date().getFullYear() - 18, 0, 1)} // Default to 18 years ago
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onChangeDate}
                maximumDate={new Date(new Date().getFullYear() - 13, new Date().getMonth(), new Date().getDate())} // Must be at least 13 years old
                minimumDate={new Date(1900, 0, 1)} // Earliest selectable date
              />
            )}

            <Text style={styles.label}>Gender (Optional)</Text>
            {/* Replace with a proper Picker component */}
            <TouchableOpacity 
              onPress={() => setShowGenderPicker(prev => !prev)} 
              style={styles.pickerButton}
            >
              <Text style={styles.pickerButtonText}>
                {gender || 'Select Gender'}
              </Text>
            </TouchableOpacity>

            {showGenderPicker && (
              <View style={styles.pickerOptionsContainer}>
                {GENDER_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={styles.pickerOptionButton}
                    onPress={() => handleSelectGender(option)}
                  >
                    <Text style={styles.pickerOptionText}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity 
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSubmit} 
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Complete Setup</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  container: {
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingVertical: 20,
  },
  logo: {
    width: 100, // Adjust size as needed
    height: 100, // Adjust size as needed
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A4B44',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 25,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    fontFamily: Fonts.type.base,
    fontWeight: Fonts.weight.regular,
  },
  label: {
    fontSize: 14,
    color: '#333',
    alignSelf: 'flex-start',
    marginBottom: 5,
    marginLeft: 5, // Small indent for the label
  },
  datePickerButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  datePickerButtonText: {
    fontSize: 16,
    color: '#333', // Color for selected date
  },
  pickerButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#333',
  },
  pickerOptionsContainer: {
    width: '100%',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    borderColor: '#E0E0E0',
    borderWidth: 1,
    marginTop: -10, // Adjust to overlap slightly with button or align as needed
    marginBottom: 15,
  },
  pickerOptionButton: {
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#333',
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#0A5C36',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
    textAlign: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#A9A9A9',
  },
}); 