import React, { useState, useEffect } from 'react';
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
import { useAuth } from '../../src/contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

// Import design system constants
import { Colors } from '../../constants/Colors';
import Typography from '../../constants/Typography';
import { Spacing, BorderRadius } from '../../constants/Spacing';

const dynastyLogo = require('../../assets/images/dynasty.png');

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, signInWithGoogle, isLoading } = useAuth();
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Sign Up Error',
    trackCurrentScreen: true
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isError) {
      setError(null);
    }
  }, [isError]);

  const handleSignUp = withErrorHandling(async () => {
    reset();
    setError(null);
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    await signUp(email, password);
  });

  const handleGoogleSignUp = async () => {
    reset();
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      if (e.message.includes('Play Services')) {
        setError("Google Play Services error. Please ensure they are up to date.");
      } else if (e.code && (e.code === 'SIGN_IN_CANCELLED' || e.code === 'statusCodes.SIGN_IN_CANCELLED')) {
        setError(null);
      } else {
        handleError(e, { 
          action: 'googleSignUp',
          metadata: { email: email || 'unknown' }
        });
        setError(e.message || "Google Sign-Up failed.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handlePhoneSignUp = () => {
    router.push('/(auth)/phoneSignIn'); // Changed from phoneSignUp to phoneSignIn
  };

  return (
    <ErrorBoundary screenName="SignUpScreen">
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
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.background.primary,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  container: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg + Spacing.xs,
    paddingVertical: Spacing.lg,
  },
  logo: {
    width: 100, 
    height: 100,
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.styles.heading3,
    color: Colors.dynastyGreen,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.tertiary,
    marginBottom: Spacing.lg + Spacing.xs,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    ...Typography.styles.bodyMedium,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border.primary,
  },
  signUpButton: {
    width: '100%',
    height: 50,
    backgroundColor: Colors.dynastyGreen,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  signUpButtonText: {
    ...Typography.styles.button,
    color: Colors.light.text.inverse,
  },
  orText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.tertiary,
    marginVertical: Spacing.md,
  },
  socialButton: {
    width: '100%',
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  socialIcon: {
    marginRight: Spacing.sm,
  },
  socialButtonText: {
    ...Typography.styles.bodyMedium,
    fontWeight: Typography.weight.medium,
  },
  googleButton: {
    backgroundColor: Colors.light.background.primary,
    borderColor: '#DB4437', // Keep Google's brand color
  },
  googleButtonText: {
    color: '#DB4437', // Keep Google's brand color
  },
  phoneButton: {
    backgroundColor: Colors.light.background.primary,
    borderColor: Colors.dynastyGreen,
  },
  phoneButtonText: {
    color: Colors.dynastyGreen,
  },
  footer: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  footerText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.tertiary,
  },
  linkText: {
    ...Typography.styles.bodySmall,
    color: Colors.dynastyGreen,
    fontWeight: Typography.weight.bold,
  },
  errorText: {
    color: Colors.light.text.error,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  buttonDisabled: {
    backgroundColor: Colors.light.border.secondary,
  },
  backButton: {
    position: 'absolute',
    left: Spacing.md,
    padding: Spacing.sm,
    zIndex: 10,
  },
}); 