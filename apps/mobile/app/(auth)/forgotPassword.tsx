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
import { useRouter, Stack, Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext'; // Updated path
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { httpsCallable } from '@react-native-firebase/functions'; // Import from @react-native-firebase/functions

const dynastyLogo = require('../../assets/images/dynasty.png');

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { functions } = useAuth(); // Get functions instance directly
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const handleSendResetLink = async () => {
    setError(null);
    setSuccessMessage(null);
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        setError('Please enter a valid email address.');
        return;
    }

    setIsLoading(true);
    try {
      const initiatePasswordReset = httpsCallable(functions, 'initiatePasswordReset');
      const result = await initiatePasswordReset({ email });
      
      // Assuming the function returns { success: true } on success
      // @ts-ignore
      if (result.data.success) {
        setSuccessMessage('Password reset email sent. Please check your inbox (and spam folder).');
        setEmail(''); // Clear email field on success
      } else {
        // @ts-ignore
        setError(result.data.error || 'Failed to send password reset email. Please try again.');
      }
    } catch (e: any) {
      console.error("Forgot Password failed:", e);
      setError(e.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
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
        <Text style={styles.title}>Forgot Password?</Text>
        <Text style={styles.subtitle}>Enter your email address below and we&apos;ll send you a link to reset your password.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email Address"
          placeholderTextColor="#888"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        {error && <Text style={styles.errorText}>{error}</Text>}
        {successMessage && <Text style={styles.successText}>{successMessage}</Text>}

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSendResetLink}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Send Reset Link</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Link href="/(auth)/signIn" asChild>
            <TouchableOpacity>
              <Text style={styles.linkText}>Back to Sign In</Text>
            </TouchableOpacity>
          </Link>
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
  successText: {
    color: 'green',
    marginBottom: 10,
    textAlign: 'center',
  },
  footer: {
    marginTop: 30,
  },
  linkText: {
    fontSize: 14,
    color: '#0A5C36',
    fontWeight: 'bold',
  },
}); 