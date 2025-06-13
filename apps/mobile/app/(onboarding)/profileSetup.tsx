import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Image
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../src/contexts/AuthContext';
import { getFirebaseFunctions } from '../../src/lib/firebase';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Fonts from '../../constants/Fonts';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { z } from 'zod';
import { profileSetupSchema, formatValidationErrors } from '../../src/lib/validation';
import { ValidatedInput } from '../../components/ui/ValidatedInput';
import { useSanitizedInput } from '../../src/hooks/useSanitizedInput';

// Import design system constants
// import { Colors } from '../../constants/Colors';
// import { Typography } from '../../constants/Typography';
// import { Spacing, BorderRadius } from '../../constants/Spacing';

// Define the expected structure of data from the completeOnboarding Firebase function
interface CompleteOnboardingResultData {
  success: boolean;
  message?: string;
}

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  
  // Use sanitized input hooks
  const firstNameInput = useSanitizedInput(user?.displayName?.split(' ')[0] || '', 'text', { maxLength: 50 });
  const lastNameInput = useSanitizedInput(user?.displayName?.split(' ').slice(1).join(' ') || '', 'text', { maxLength: 50 });
  
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState(''); // 'male', 'female', 'other', 'unspecified'
  const [showGenderPicker, setShowGenderPicker] = useState(false); // Added for gender picker
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Initialize our error handler
  const { handleError, withErrorHandling } = useErrorHandler({
    title: 'Profile Setup Error',
  });

  // Monitor XSS detection
  React.useEffect(() => {
    const xssErrors = [
      firstNameInput.xssDetected && 'First name contains potentially harmful content',
      lastNameInput.xssDetected && 'Last name contains potentially harmful content'
    ].filter(Boolean);
    
    if (xssErrors.length > 0) {
      setError(xssErrors[0]);
    } else if (error?.includes('potentially harmful content')) {
      setError(null);
    }
  }, [firstNameInput.xssDetected, lastNameInput.xssDetected, error]);

  // Clear field error when user types
  const handleFieldChange = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const onChangeDate = withErrorHandling((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }

    if (event.type === 'set') {
      if (selectedDate) {
        setDateOfBirth(selectedDate);
        setError(null);
        if (fieldErrors.dateOfBirth) {
          setFieldErrors(prev => ({ ...prev, dateOfBirth: '' }));
        }
      }
    }
  });

  const handleSelectGender = withErrorHandling((selectedGender: string) => {
    setGender(selectedGender);
    setShowGenderPicker(false);
    if (fieldErrors.gender) {
      setFieldErrors(prev => ({ ...prev, gender: '' }));
    }
  });

  const handleSubmit = withErrorHandling(async () => {
    setError(null);
    setFieldErrors({});

    // Check for XSS patterns before submission
    if (firstNameInput.xssDetected || lastNameInput.xssDetected) {
      setError('Please remove any special characters and try again');
      return;
    }

    try {
      // Use sanitized values for validation
      const validatedData = profileSetupSchema.parse({
        firstName: firstNameInput.sanitizedValue,
        lastName: lastNameInput.sanitizedValue,
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
      });
      
      // Convert date for API if provided
      let dateOfBirthISO: string | null = null;
      if (validatedData.dateOfBirth) {
        dateOfBirthISO = validatedData.dateOfBirth.toISOString();
      }

      setIsLoading(true);
      if (!user) {
        throw new Error('User not authenticated.');
      }
      // Get functions instance for callable
      const firebaseFunctions = getFirebaseFunctions();
      const completeOnboardingFn = firebaseFunctions.httpsCallable('completeOnboarding');
      const result = await completeOnboardingFn({
        userId: user.uid,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        dateOfBirth: dateOfBirthISO,
        gender: validatedData.gender || 'Prefer not to say',
        displayName: `${validatedData.firstName} ${validatedData.lastName}`.trim(),
      }) as { data: CompleteOnboardingResultData };

      if (result.data.success) {
        // Navigate to encryption setup
        await refreshUser(); // Refresh user data in AuthContext
        router.push('/(onboarding)/encryptionSetup');
      } else {
        throw new Error(result.data.message || 'Failed to complete onboarding.');
      }
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        setFieldErrors(formatValidationErrors(e.errors));
      } else {
        handleError(e, {
          severity: ErrorSeverity.ERROR,
          metadata: {
            action: 'completeOnboarding',
            userId: user?.uid,
            firstName,
            lastName
          }
        });
        setError(e.message || 'An error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  });

  return (
    <ErrorBoundary screenName="ProfileSetupScreen">
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

            <ValidatedInput
              label="First Name"
              placeholder="Enter your first name"
              value={firstNameInput.value}
              onChangeText={(value) => {
                firstNameInput.setValue(value);
                handleFieldChange('firstName');
              }}
              error={fieldErrors.firstName || (firstNameInput.xssDetected ? 'Invalid characters detected' : undefined)}
              required
            />
            
            <ValidatedInput
              label="Last Name"
              placeholder="Enter your last name"
              value={lastNameInput.value}
              onChangeText={(value) => {
                lastNameInput.setValue(value);
                handleFieldChange('lastName');
              }}
              error={fieldErrors.lastName || (lastNameInput.xssDetected ? 'Invalid characters detected' : undefined)}
              required
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
    </ErrorBoundary>
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