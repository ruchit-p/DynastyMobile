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
  ActivityIndicator
} from 'react-native';
import { useRouter, Link, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons'; // For Google icon
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext'; // Import useAuth
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // <-- Add this import

const dynastyLogo = require('../../assets/images/dynasty.png'); // Adjust path if logo moves

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, signInWithGoogle, isLoading } = useAuth(); // Use signIn and signInWithGoogle from context
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false); // Separate loading for Google
  const insets = useSafeAreaInsets(); // <-- Get safe area insets

  const handleSignIn = async () => {
    setError(null);
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    try {
      await signIn(email, password);
      // Navigation is handled by AuthProvider
    } catch (e: any) {
      console.error("Sign in failed from screen:", e);
      setError(e.message || "Failed to sign in. Please check your credentials.");
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // Navigation is handled by AuthProvider
    } catch (e: any) {
      console.error("Google Sign-in failed from screen:", e);
      // Check for specific Google errors if needed, or use a generic message
      if (e.message.includes('Play Services')) {
        setError("Google Play Services error. Please ensure they are up to date.");
      } else if (e.code && (e.code === 'SIGN_IN_CANCELLED' || e.code === statusCodes.SIGN_IN_CANCELLED)) {
        // Don't show an error if user cancelled
        setError(null); 
      } else {
        setError(e.message || "Google Sign-In failed.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handlePhoneSignIn = () => {
    // TODO: Implement Firebase Phone Sign In
    // This might navigate to a separate phone number input screen
    router.push('/(auth)/phoneSignIn'); // Example, create this screen later
    Alert.alert("Phone Sign-In", "Phone Sign-in logic not yet implemented.");
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />

        {/* Custom Back Button */}
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + 5 }]} // Position using insets
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={28} color="#1A4B44" />
        </TouchableOpacity>

        <View style={styles.container}>
          <Image source={dynastyLogo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue your story</Text>

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

          <TouchableOpacity onPress={() => router.push('/(auth)/forgotPassword')} style={styles.forgotPasswordButton}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity 
            style={[styles.signInButton, isLoading && styles.buttonDisabled]}
            onPress={handleSignIn} 
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.signInButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.orText}>OR</Text>

          <TouchableOpacity 
            style={[styles.socialButton, styles.googleButton, googleLoading && styles.buttonDisabled]} 
            onPress={handleGoogleSignIn}
            disabled={isLoading || googleLoading} // Disable if main loading or google loading
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color="#DB4437" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#DB4437" style={styles.socialIcon} />
                <Text style={[styles.socialButtonText, styles.googleButtonText]}>Sign In with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.socialButton, styles.phoneButton]} onPress={handlePhoneSignIn}>
            <Ionicons name="call-outline" size={20} color="#1A4B44" style={styles.socialIcon} />
            <Text style={[styles.socialButtonText, styles.phoneButtonText]}>Sign In with Phone</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Link href="/(auth)/signUp" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>Sign Up</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </SafeAreaView>
    </>
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
  logo: {
    width: 120, 
    height: 120,
    marginBottom: 20,
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
  signInButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#0A5C36',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  orText: {
    fontSize: 14,
    color: '#888',
    marginVertical: 20,
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
  errorText: {
    color: 'red',
    marginBottom: 10,
    textAlign: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#A9A9A9', // Darker gray for disabled state
  },
  backButton: {
    position: 'absolute',
    left: 15,
    padding: 10, // Increase touchable area
    zIndex: 10, // Ensure it's on top
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginBottom: 15, // Space before Sign In button
  },
  forgotPasswordText: {
    color: '#0A5C36',
    fontSize: 14,
    fontWeight: '500',
  },
}); 