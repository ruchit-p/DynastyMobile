import React, { useState, useEffect } from 'react';
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
import { useRouter, useLocalSearchParams, Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../src/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const dynastyLogo = require('../../assets/images/dynasty.png');

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { confirmPhoneCode, isLoading, phoneAuthConfirmation, signInWithPhoneNumber } = useAuth();
  const params = useLocalSearchParams<{ phoneNumberSent?: string }>();
  const phoneNumberSent = params.phoneNumberSent;

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [countdown, setCountdown] = useState(30); // Countdown for resend OTP

  useEffect(() => {
    if (!phoneAuthConfirmation && !isLoading) {
      // This might happen if user navigates here directly or context was lost.
      // Alert and redirect or allow re-sending OTP for the passed phone number.
      // Alert.alert("Verification Error", "Verification process was not initiated correctly. Please try sending OTP again.");
      // router.replace('/(auth)/phoneSignIn');
      console.warn("No phoneAuthConfirmation found in context on VerifyOtpScreen load.")
    }
  }, [phoneAuthConfirmation, isLoading, router]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>; // Correct type for setTimeout timer ID
    if (resendDisabled && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0) {
      setResendDisabled(false);
      setCountdown(30); // Reset countdown
    }
    return () => clearTimeout(timer);
  }, [resendDisabled, countdown]);

  const handleVerifyOtp = async () => {
    setError(null);
    if (!otp.trim() || otp.length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }
    if (!phoneAuthConfirmation) {
        setError("Verification session expired or not found. Please request a new OTP.");
        return;
    }
    if (!phoneNumberSent) {
        setError("Phone number not available. Cannot verify OTP.");
        return;
    }
    try {
      await confirmPhoneCode(phoneNumberSent, otp);
      // Navigation is handled by AuthProvider on successful auth state change
    } catch (e: any) {
      console.error("OTP Verification failed:", e);
      setError(e.message || "Failed to verify OTP. Check the code or try again.");
    }
  };

  const handleResendOtp = async () => {
    if (!phoneNumberSent) {
        setError("Cannot resend OTP without a phone number.");
        return;
    }
    setError(null);
    setResendDisabled(true);
    try {
        // Re-call signInWithPhoneNumber to send a new OTP
        // This will update the phoneAuthConfirmation in the context
        await signInWithPhoneNumber(phoneNumberSent);
        Alert.alert("OTP Resent", `A new OTP has been sent to ${phoneNumberSent}.`);
    } catch (e: any) {
        setError(e.message || "Failed to resend OTP.");
        setResendDisabled(false); // Allow trying again if resend fails
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />
      <View style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1A4B44" />
        </TouchableOpacity>
        <Image source={dynastyLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Verify Your Phone</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to {phoneNumberSent || 'your phone'}.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="XXXXXX"
          placeholderTextColor="#888"
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          textContentType="oneTimeCode"
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity 
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleVerifyOtp} 
          disabled={isLoading}
        >
          {isLoading && !resendDisabled ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Verify Code</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
            onPress={handleResendOtp} 
            disabled={resendDisabled || isLoading} 
            style={styles.resendContainer}
        >
          <Text style={[styles.resendText, (resendDisabled || isLoading) && styles.disabledText]}>
            {resendDisabled ? `Resend OTP in ${countdown}s` : "Didn't receive code? Resend OTP"}
          </Text>
        </TouchableOpacity>

        <View style={styles.footer}>
            <Text style={styles.footerText}>Entered wrong number? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/phoneSignIn')}>
                <Text style={styles.linkText}>Change Number</Text>
            </TouchableOpacity>
        </View>
      </View>
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
    width: 80, 
    height: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A4B44',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 30,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  input: {
    width: '60%', // Adjust for OTP input
    height: 50,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 18, // Larger for OTP
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    textAlign: 'center',
    letterSpacing: 8, // Space out OTP digits
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
  resendContainer: {
    marginTop: 20,
  },
  resendText: {
    fontSize: 14,
    color: '#0A5C36',
    fontWeight: '500',
  },
  disabledText: {
    color: '#999',
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