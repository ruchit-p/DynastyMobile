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
  ActivityIndicator,
  Image
} from 'react-native';
import { useRouter, Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';

// It's good practice to use a library for phone number input and formatting
// For simplicity, using a basic TextInput here. Consider `react-native-phone-number-input`.

const dynastyLogo = require('../../assets/images/dynasty.png');

export default function PhoneSignInScreen() {
  const router = useRouter();
  const { signInWithPhoneNumber, isLoading } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState(''); // E.g., ' +1 650-555-3434'
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async () => {
    setError(null);
    if (!phoneNumber.trim()) {
      setError('Please enter your phone number.');
      return;
    }
    // Basic validation: ensure it starts with + and has some digits. 
    // A proper library would handle this much better.
    if (!phoneNumber.startsWith('+') || phoneNumber.length < 10) {
        setError('Please enter a valid phone number with country code (e.g., +1 XXX-XXX-XXXX).');
        return;
    }

    try {
      const confirmationResult = await signInWithPhoneNumber(phoneNumber);
      if (confirmationResult) {
        // Navigate to OTP screen, passing the confirmation object is tricky with expo-router params directly.
        // One way is to store it temporarily in context (less ideal) or use a more robust state management.
        // For now, we rely on the AuthContext to hold it if it chose to do so, or we manage it via screen props in a stack if not using AuthContext state for this.
        // Since we removed it from context state, we should pass what's necessary or re-fetch if that's the pattern.
        // Let's assume for now router can pass simple params, and for complex objects, alternative state management needed.
        // For this flow, `signInWithPhoneNumber` in context returns confirmation, but it's better for the OTP screen to get it.
        // A common pattern is for `signInWithPhoneNumber` to return the confirmation, and then this screen navigates with it.
        // To simplify, we'll navigate and the OTP screen will have to re-trigger or get it. This is not ideal but fits current context structure.
        // router.push({ pathname: '/(auth)/verifyOtp', params: { phoneNumber } }); // Pass phone number to OTP screen.

        // A better approach if confirmation object is complex: It needs to be available to the next screen.
        // For this example, let's assume the AuthContext can hold the confirmation object or we manage it.
        // If the confirmation object is to be passed, it CANNOT be directly in router.push params as it's a complex object.
        // Instead, we can make the confirmation object available via a temporary state in AuthContext or another global state.

        // For now, let's use the fact that `signInWithPhoneNumber` returns the confirmation object.
        // We need a way for `verifyOtp.tsx` to access this `confirmationResult`.
        // The easiest way *without* global state for *this specific object* is to pass it if router supports it, otherwise, manage in parent or context.
        // Expo Router can pass serializable params. `FirebaseAuthTypes.ConfirmationResult` is NOT serializable.

        // Option 1: Store confirmation in a temporary state accessible by VerifyOtpScreen (e.g., parent component or a new context)
        // Option 2: The AuthContext can have a field `currentPhoneAuthConfirmation` (we removed this direct approach earlier for cleanliness)
        // Option 3: Re-architect slightly. For now, let's proceed simply by navigating and the verify screen will prompt for OTP.
        // The `confirmPhoneCode` function in AuthContext takes the confirmation result. This means it must be available.
        
        // Let's go with storing it in AuthContext temporarily. We need to re-add that state to AuthContext.
        // (Going back to add `phoneConfirmation` state and `setPhoneConfirmation` to AuthContext value for this flow)
        // Then the VerifyOtp screen can retrieve it.
        router.push({ pathname: '/(auth)/verifyOtp', params: { phoneNumberSent: phoneNumber } });

      } else {
        setError("Could not initiate phone sign-in. Please try again.");
      }
    } catch (e: any) {
      console.error("Phone Sign-In failed from screen:", e);
      setError(e.message || "Failed to send OTP.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />
      <View style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1A4B44" />
        </TouchableOpacity>
        <Image source={dynastyLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Enter Your Phone Number</Text>
        <Text style={styles.subtitle}>We'll send you a verification code.</Text>

        <TextInput
          style={styles.input}
          placeholder="Phone Number (e.g., +14155552671)"
          placeholderTextColor="#888"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity 
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSendOtp} 
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Send Code</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Changed your mind? </Text>
          <Link href="/(auth)/signIn" asChild>
            <TouchableOpacity>
              <Text style={styles.linkText}>Go to Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
      {/* Invisible reCAPTCHA verifier (needed for web, and sometimes for mobile with @react-native-firebase) */}
      {/* For @R signéNFirebase, it often uses native capabilities (SafetyNet on Android, silent APNs on iOS) */}
      {/* but you might need a FirebaseRecaptchaVerifierModal for dev or certain flows */}
      {/* <FirebaseRecaptchaVerifierModal ref={recaptchaVerifier} firebaseConfig={firebase.app().options} /> */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 25,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 25,
    zIndex: 1,
  },
  logo: {
    width: 100, 
    height: 100,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A4B44',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#0A5C36',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#A9A9A9',
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    marginTop: 30,
  },
  footerText: {
    fontSize: 14,
    color: '#555',
  },
  linkText: {
    fontSize: 14,
    color: '#0A5C36',
    fontWeight: 'bold',
  },
}); 