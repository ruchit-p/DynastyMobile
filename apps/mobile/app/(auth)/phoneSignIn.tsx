import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
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
import { useAuth } from '../contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RNPhoneInput from 'react-native-phone-number-input';

// It's good practice to use a library for phone number input and formatting
// For simplicity, using a basic TextInput here. Consider `react-native-phone-number-input`.

const dynastyLogo = require('../../assets/images/dynasty.png');

// Explicitly cast the component type
const PhoneInput = RNPhoneInput as any;

export default function PhoneSignInScreen() {
  const router = useRouter();
  const { signInWithPhoneNumber, isLoading } = useAuth();
  const [value, setValue] = useState("");
  const [formattedValue, setFormattedValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const phoneInputRef = useRef<RNPhoneInput>(null);

  const handleSendOtp = async () => {
    setError(null);
    const checkValid = phoneInputRef.current?.isValidNumber(value);
    if (!checkValid) {
      setError('Please enter a valid phone number.');
      return;
    }

    try {
      const confirmationResult = await signInWithPhoneNumber(formattedValue);
      if (confirmationResult) {
        router.push({ pathname: '/(auth)/verifyOtp', params: { phoneNumberSent: formattedValue } });
      } else {
        setError("Could not initiate phone sign-in. Please try again.");
      }
    } catch (e: any) {
      console.error("Phone Sign-In failed from screen:", e);
      if (e.code === 'auth/invalid-phone-number') {
        setError('The phone number is not valid. Please check and try again.');
      } else if (e.message.includes('TOO_SHORT')) {
        setError('The phone number is too short. Please enter a valid number.');
      }
      else {
        setError(e.message || "Failed to send OTP. Please try again.");
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />

      <TouchableOpacity 
        onPress={() => router.back()} 
        style={[styles.backButton, { top: insets.top + 5 }]}
      >
        <Ionicons name="arrow-back" size={28} color="#1A4B44" />
      </TouchableOpacity>

      <View style={styles.container}>
        <Image source={dynastyLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Enter Your Phone Number</Text>
        <Text style={styles.subtitle}>We&apos;ll send you a verification code.</Text>

        <PhoneInput
            ref={phoneInputRef}
            defaultValue={value}
            defaultCode="US"
            layout="first"
            onChangeText={(text: string) => {
              setValue(text);
            }}
            onChangeFormattedText={(text: string) => {
              setFormattedValue(text);
            }}
            containerStyle={styles.phoneInputContainer}
            textContainerStyle={styles.phoneInputTextContainer}
            textInputStyle={styles.phoneInputTextInput}
            codeTextStyle={styles.phoneInputCodeText}
            flagButtonStyle={styles.phoneInputFlagButton}
            withDarkTheme={false}
            withShadow
            autoFocus
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
    left: 20,
    zIndex: 1,
    padding: 10,
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
  phoneInputContainer: {
    width: '100%',
    height: 50,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  phoneInputTextContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 8,
  },
  phoneInputTextInput: {
    height: 48,
    fontSize: 16,
    color: '#000000',
  },
  phoneInputCodeText: {
    fontSize: 16,
  },
  phoneInputFlagButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
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