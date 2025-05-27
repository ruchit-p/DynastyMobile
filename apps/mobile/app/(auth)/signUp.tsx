import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Image,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useRouter, Link, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { z } from 'zod';
import { signupFormSchema, formatValidationErrors } from '../../src/lib/validation';
import { ValidatedInput } from '../../components/ui/ValidatedInput';
import { PasswordStrengthIndicator } from '../../components/ui/PasswordStrengthIndicator';
import { useSanitizedInput } from '../../src/hooks/useSanitizedInput';
import { AppleSignInButton, useAppleSignInAvailable } from '../../components/ui/AppleSignInButton';
import { logger } from '../../src/services/LoggingService';

// Import design system constants
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
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
  
  // Use sanitized input hooks for all form fields
  const emailInput = useSanitizedInput('', 'email');
  const passwordInput = useSanitizedInput('', 'password');
  const confirmPasswordInput = useSanitizedInput('', 'password');
  
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [googleLoading, setGoogleLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const isAppleSignInAvailable = useAppleSignInAvailable();

  useEffect(() => {
    if (!isError) {
      setError(null);
    }
  }, [isError]);

  // Combine XSS errors from all inputs
  useEffect(() => {
    const xssErrors = [
      emailInput.xssDetected && 'Email contains potentially harmful content',
      passwordInput.xssDetected && 'Password contains potentially harmful content',
      confirmPasswordInput.xssDetected && 'Confirm password contains potentially harmful content'
    ].filter(Boolean);
    
    if (xssErrors.length > 0) {
      setError(xssErrors[0]);
    } else if (error?.includes('potentially harmful content')) {
      setError(null);
    }
  }, [emailInput.xssDetected, passwordInput.xssDetected, confirmPasswordInput.xssDetected, error]);

  // Clear field error when user types
  const handleFieldChange = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSignUp = withErrorHandling(async () => {
    reset();
    setError(null);
    setFieldErrors({});

    // Check for XSS patterns before submission
    if (emailInput.xssDetected || passwordInput.xssDetected || confirmPasswordInput.xssDetected) {
      setError('Please remove any special characters and try again');
      return;
    }

    try {
      // Validate form data using sanitized values
      const validatedData = signupFormSchema.parse({
        email: emailInput.sanitizedValue,
        password: passwordInput.value, // Use raw value for password
        confirmPassword: confirmPasswordInput.value, // Use raw value for password
      });
      
      await signUp(validatedData.email, validatedData.password);
    } catch (e) {
      if (e instanceof z.ZodError) {
        setFieldErrors(formatValidationErrors(e.errors));
      } else {
        throw e; // Let withErrorHandling handle other errors
      }
    }
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
          metadata: { email: emailInput.sanitizedValue || 'unknown' }
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

            <ValidatedInput
              label="Email Address"
              placeholder="Enter your email"
              value={emailInput.value}
              onChangeText={(value) => {
                emailInput.setValue(value);
                handleFieldChange('email');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              error={fieldErrors.email || (emailInput.xssDetected ? 'Invalid characters detected' : undefined)}
              required
            />
            
            <ValidatedInput
              label="Password"
              placeholder="Create a strong password"
              value={passwordInput.value}
              onChangeText={(value) => {
                passwordInput.setValue(value);
                handleFieldChange('password');
              }}
              isPassword
              error={fieldErrors.password || (passwordInput.xssDetected ? 'Invalid characters detected' : undefined)}
              required
            />
            
            {passwordInput.value && <PasswordStrengthIndicator password={passwordInput.value} />}
            
            <ValidatedInput
              label="Confirm Password"
              placeholder="Re-enter your password"
              value={confirmPasswordInput.value}
              onChangeText={(value) => {
                confirmPasswordInput.setValue(value);
                handleFieldChange('confirmPassword');
              }}
              isPassword
              error={fieldErrors.confirmPassword || (confirmPasswordInput.xssDetected ? 'Invalid characters detected' : undefined)}
              required
              containerStyle={{ marginTop: Spacing.sm }}
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

            {isAppleSignInAvailable && (
              <AppleSignInButton 
                style={styles.appleButton}
                onSuccess={() => {
                  logger.debug('Apple sign up successful');
                  router.replace('/(tabs)/feed');
                }}
                onError={(error) => {
                  handleError(error, {
                    context: 'Apple sign up failed',
                    showToUser: true
                  });
                }}
              />
            )}

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
  appleButton: {
    width: '100%',
    marginBottom: Spacing.md,
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