import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Image,
  Alert,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useRouter, Link, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const dynastyLogo = require('../../assets/images/dynasty.png');

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, signInWithGoogle, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const insets = useSafeAreaInsets();

  const handleSignUp = async () => {
    setError(null);
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    try {
      await signUp(email, password);
    } catch (e: any) {
      console.error("Sign up failed from screen:", e);
      setError(e.message || "Failed to sign up. Please try again.");
    }
  };

  const handleGoogleSignUp = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      console.error("Google Sign-up failed from screen:", e);
      if (e.message.includes('Play Services')) {
        setError("Google Play Services error. Please ensure they are up to date.");
      } else if (e.code && (e.code === 'SIGN_IN_CANCELLED' || e.code === statusCodes.SIGN_IN_CANCELLED)) {
        setError(null);
      } else {
        setError(e.message || "Google Sign-Up failed.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handlePhoneSignUp = () => {
    // TODO: Implement Firebase Phone Sign Up (Navigates to common phone input screen)
    router.push('/(auth)/phoneSignIn'); // Changed from phoneSignUp to phoneSignIn
    // Alert.alert("Phone Sign-Up", "Phone Sign-up logic not yet implemented."); // Remove alert, navigation handles it
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + 5 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={28} color="#1A4B44" />
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.container}>
            <Image source={dynastyLogo} style={styles.logo} resizeMode="contain" />
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join Dynasty and build your family legacy</Text>

            <TextInput
              style={styles.input}
              placeholder="Email Address"
              placeholderTextColor="#888"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#888"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity 
              style={[styles.signUpButton, isLoading && styles.buttonDisabled]} 
              onPress={handleSignUp} 
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.signUpButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.orText}>OR</Text>

            <TouchableOpacity 
              style={[styles.socialButton, styles.googleButton, googleLoading && styles.buttonDisabled]} 
              onPress={handleGoogleSignUp} 
              disabled={isLoading || googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#DB4437" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#DB4437" style={styles.socialIcon} />
                  <Text style={[styles.socialButtonText, styles.googleButtonText]}>Sign Up with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.socialButton, styles.phoneButton, isLoading && styles.buttonDisabled]} onPress={handlePhoneSignUp}>
              <Ionicons name="call-outline" size={20} color="#1A4B44" style={styles.socialIcon} />
              <Text style={[styles.socialButtonText, styles.phoneButtonText]}>Sign Up with Phone</Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Link href="/(auth)/signIn" asChild>
                <TouchableOpacity>
                  <Text style={styles.linkText}>Sign In</Text>
                </TouchableOpacity>
              </Link>
            </View>
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
    paddingVertical: 20, // Added padding for scroll view content
  },
  logo: {
    width: 100, 
    height: 100,
    marginBottom: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A4B44',
    marginBottom: 8,
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
  signUpButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#0A5C36',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  signUpButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  orText: {
    fontSize: 14,
    color: '#888',
    marginVertical: 15, // Adjusted margin
  },
  socialButton: {
    width: '100%',
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
  },
  socialIcon: {
    marginRight: 10,
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DB4437',
  },
  googleButtonText: {
    color: '#DB4437',
  },
  phoneButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#1A4B44',
  },
  phoneButtonText: {
    color: '#1A4B44',
  },
  footer: {
    flexDirection: 'row',
    marginTop: 20, // Adjusted margin
    marginBottom: 10, // Ensure it's visible in scroll
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
  errorText: {
    color: 'red',
    marginBottom: 10,
    textAlign: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#A9A9A9',
  },
  backButton: {
    position: 'absolute',
    left: 15,
    padding: 10,
    zIndex: 10,
  },
}); 