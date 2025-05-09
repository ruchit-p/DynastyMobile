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
  ActivityIndicator
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../contexts/AuthContext'; // Adjust path as needed
import { functions } from '../../src/lib/firebase'; // For calling cloud functions
// You might want a date picker component
// import DateTimePicker from '@react-native-community/datetimepicker';
// You might want a gender picker component (e.g., dropdown)

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState(user?.displayName?.split(' ')[0] || '');
  const [lastName, setLastName] = useState(user?.displayName?.split(' ').slice(1).join(' ') || '');
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [gender, setGender] = useState(''); // 'male', 'female', 'other', 'unspecified'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!firstName || !lastName) {
      setError('First and last name are required.');
      return;
    }
    // Basic DOB validation (more robust validation needed for production)
    let dateOfBirth = null;
    if (dobYear && dobMonth && dobDay) {
      const yearNum = parseInt(dobYear, 10);
      const monthNum = parseInt(dobMonth, 10) -1; // Month is 0-indexed in JS Date
      const dayNum = parseInt(dobDay, 10);
      if (yearNum > 1900 && yearNum < new Date().getFullYear() && monthNum >= 0 && monthNum <= 11 && dayNum > 0 && dayNum <= 31) {
        dateOfBirth = new Date(yearNum, monthNum, dayNum);
      } else {
        setError('Please enter a valid date of birth.');
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    try {
      if (!user) {
        throw new Error('User not authenticated.');
      }
      const completeOnboardingFn = functions.httpsCallable('completeOnboarding');
      const result = await completeOnboardingFn({
        userId: user.uid,
        firstName,
        lastName,
        // Ensure dateOfBirth is sent in a format your backend expects (e.g., ISO string or Timestamp)
        dateOfBirth: dateOfBirth ? dateOfBirth.toISOString() : null, 
        gender: gender || 'unspecified',
        displayName: `${firstName} ${lastName}`.trim(), // Added displayName
      });

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

  return (
    <>
      <Stack.Screen options={{ title: 'Set Up Your Profile' }} />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.container}>
            <Text style={styles.title}>Welcome to Dynasty!</Text>
            <Text style={styles.subtitle}>Let's set up your profile to get started.</Text>

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
            <View style={styles.dobContainer}>
              <TextInput style={[styles.input, styles.dobInput]} placeholder="MM" value={dobMonth} onChangeText={setDobMonth} keyboardType="number-pad" maxLength={2} />
              <TextInput style={[styles.input, styles.dobInput]} placeholder="DD" value={dobDay} onChangeText={setDobDay} keyboardType="number-pad" maxLength={2} />
              <TextInput style={[styles.input, styles.dobInput]} placeholder="YYYY" value={dobYear} onChangeText={setDobYear} keyboardType="number-pad" maxLength={4} />
            </View>

            <Text style={styles.label}>Gender (Optional)</Text>
            {/* Replace with a proper Picker component */}
            <TextInput
              style={styles.input}
              placeholder="Gender (e.g., male, female, other)"
              value={gender}
              onChangeText={setGender}
            />

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
  },
  label: {
    fontSize: 14,
    color: '#333',
    alignSelf: 'flex-start',
    marginBottom: 5,
    marginLeft: 5, // Small indent for the label
  },
  dobContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 15,
  },
  dobInput: {
    width: '30%', // Adjust width for MM, DD, YYYY inputs
    textAlign: 'center',
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