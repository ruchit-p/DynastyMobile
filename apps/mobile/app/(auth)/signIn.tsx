import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Image,
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
import { loginFormSchema, formatValidationErrors } from '../../src/lib/validation';
import { ValidatedInput } from '../../components/ui/ValidatedInput';
import { useSanitizedInput } from '../../src/hooks/useSanitizedInput';
import { AppleSignInButton, useAppleSignInAvailable } from '../../components/ui/AppleSignInButton';
import { logger } from '../../src/services/LoggingService';

// Import design system constants
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Spacing, BorderRadius } from '../../constants/Spacing';

// Import feature flags
import { useFeatureFlags, useFeatureEnabled } from '../../hooks/useFeatureFlags';

const dynastyLogo = require('../../assets/images/dynasty.png');

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, signInWithGoogle, signInWithApple, isLoading } = useAuth(); // Use signIn, signInWithGoogle, and signInWithApple from context
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Sign In Error',
    trackCurrentScreen: true
  });
  
  // Feature flags for authentication methods
  const { getFlag, isLoading: flagsLoading } = useFeatureFlags([
    'ENABLE_GOOGLE_SIGNIN',
    'ENABLE_APPLE_SIGNIN',
    'ENABLE_PHONE_AUTH',
    'ENABLE_BIOMETRIC_AUTH',
  ]);
  
  const googleSignInEnabled = useFeatureEnabled('ENABLE_GOOGLE_SIGNIN');
  const appleSignInEnabled = useFeatureEnabled('ENABLE_APPLE_SIGNIN');
  const phoneAuthEnabled = useFeatureEnabled('ENABLE_PHONE_AUTH');
  const biometricAuthEnabled = useFeatureEnabled('ENABLE_BIOMETRIC_AUTH');
  
  // Use sanitized input hooks
  const emailInput = useSanitizedInput('', 'email');
  const passwordInput = useSanitizedInput('', 'password');
  
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [googleLoading, setGoogleLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const isAppleSignInAvailable = useAppleSignInAvailable();

  // Calculate available auth methods
  const availableAuthMethods = [
    googleSignInEnabled && 'google',
    appleSignInEnabled && isAppleSignInAvailable && 'apple',
    phoneAuthEnabled && 'phone',
  ].filter(Boolean);

  useEffect(() => {
    if (!isError) {
      setError(null);
    }
  }, [isError]);

  // Monitor XSS detection
  useEffect(() => {
    const xssErrors = [
      emailInput.xssDetected && 'Email contains potentially harmful content',
      passwordInput.xssDetected && 'Password contains potentially harmful content'
    ].filter((error): error is string => Boolean(error));
    
    if (xssErrors.length > 0) {
      setError(xssErrors[0]);
    } else if (error?.includes('potentially harmful content')) {
      setError(null);
    }
  }, [emailInput.xssDetected, passwordInput.xssDetected, error]);

  // Clear field error when user types
  const handleFieldChange = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSignIn = withErrorHandling(async () => {
    reset();
    setError(null);
    setFieldErrors({});

    // Check for XSS patterns before submission
    if (emailInput.xssDetected || passwordInput.xssDetected) {
      setError('Please remove any special characters and try again');
      return;
    }

    try {
      // Validate form data using sanitized values
      const validatedData = loginFormSchema.parse({
        email: emailInput.sanitizedValue,
        password: passwordInput.value, // Use raw value for password
      });
      
      await signIn(validatedData.email, validatedData.password);
    } catch (e) {
      if (e instanceof z.ZodError) {
        setFieldErrors(formatValidationErrors(e.errors));
      } else {
        throw e; // Let withErrorHandling handle other errors
      }
    }
  });

  const handleGoogleSignIn = async () => {
    if (!googleSignInEnabled) {
      setError('Google Sign-In is currently unavailable');
      return;
    }

    reset();
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // Navigation is handled by AuthProvider
    } catch (e: any) {
      // Check for specific Google errors if needed, or use a generic message
      if (e.message.includes('Play Services')) {
        setError("Google Play Services error. Please ensure they are up to date.");
      } else if (e.code && (e.code === 'SIGN_IN_CANCELLED' || e.code === 'statusCodes.SIGN_IN_CANCELLED')) {
        // Don't show an error if user cancelled
        setError(null); 
      } else {
        handleError(e, { 
          action: 'googleSignIn',
          metadata: { email: emailInput.sanitizedValue || 'unknown' }
        });
        setError(e.message || "Google Sign-In failed.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (!appleSignInEnabled) {
      setError('Apple Sign-In is currently unavailable');
      return;
    }

    reset();
    setError(null);
    try {
      await signInWithApple();
      // Navigation is handled by AuthProvider
    } catch (e: any) {
      // Don't show error if user cancelled
      if (e.code !== 'auth/user-cancelled') {
        handleError(e, {
          action: 'appleSignIn',
          showToUser: true
        });
        setError(e.message || "Apple Sign-In failed.");
      }
    }
  };

  const handlePhoneSignIn = () => {
    if (!phoneAuthEnabled) {
      setError('Phone authentication is currently unavailable');
      return;
    }
    router.push('/(auth)/phoneSignIn');
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/'); // Fallback to landing page
    }
  };

  // Show loading if feature flags are still loading
  if (flagsLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.container, styles.loadingContainer]}>
          <ActivityIndicator size="large" color={Colors.dynastyGreen} />
          <Text style={styles.loadingText}>Loading sign-in options...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ErrorBoundary screenName="SignInScreen">
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />

        {/* Custom Back Button */}
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + 5 }]} // Position using insets
          onPress={handleBack} // Updated onPress
        >
          <Ionicons name="arrow-back" size={28} color="#1A4B44" />
        </TouchableOpacity>

        <View style={styles.container}>
          <Image source={dynastyLogo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue your story</Text>

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
            placeholder="Enter your password"
            value={passwordInput.value}
            onChangeText={(value) => {
              passwordInput.setValue(value);
              handleFieldChange('password');
            }}
            isPassword
            error={fieldErrors.password || (passwordInput.xssDetected ? 'Invalid characters detected' : undefined)}
            required
          />

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

          {/* Show alternative auth methods only if any are available */}
          {availableAuthMethods.length > 0 && (
            <>
              <Text style={styles.orText}>OR</Text>

              {googleSignInEnabled && (
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
              )}

              {appleSignInEnabled && isAppleSignInAvailable && (
                <AppleSignInButton 
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                  disabled={isLoading}
                />
              )}

              {phoneAuthEnabled && (
                <TouchableOpacity style={[styles.socialButton, styles.phoneButton]} onPress={handlePhoneSignIn}>
                  <Ionicons name="call-outline" size={20} color="#1A4B44" style={styles.socialIcon} />
                  <Text style={[styles.socialButtonText, styles.phoneButtonText]}>Sign In with Phone</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Feature flag debug info in development */}
          {__DEV__ && (
            <View style={styles.debugInfo}>
              <Text style={styles.debugTitle}>Available Auth Methods:</Text>
              <Text style={styles.debugText}>Google: {googleSignInEnabled ? '✅' : '❌'}</Text>
              <Text style={styles.debugText}>Apple: {appleSignInEnabled && isAppleSignInAvailable ? '✅' : '❌'}</Text>
              <Text style={styles.debugText}>Phone: {phoneAuthEnabled ? '✅' : '❌'}</Text>
              <Text style={styles.debugText}>Biometric: {biometricAuthEnabled ? '✅' : '❌'}</Text>
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don&apos;t have an account? </Text>
            <Link href="/(auth)/signUp" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>Sign Up</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.background.primary,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg + Spacing.xs,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  logo: {
    width: 120, 
    height: 120,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.styles.heading3,
    color: Colors.dynastyGreen,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.tertiary,
    marginBottom: Spacing['2xl'],
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
    fontFamily: Typography.family.regular,
  },
  signInButton: {
    width: '100%',
    height: 50,
    backgroundColor: Colors.dynastyGreen,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  signInButtonText: {
    ...Typography.styles.button,
    color: Colors.light.text.inverse,
  },
  orText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.tertiary,
    marginVertical: Spacing.lg,
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
    color: '#DB4437',
  },
  appleButton: {
    marginBottom: Spacing.md,
  },
  phoneButton: {
    backgroundColor: Colors.light.background.primary,
    borderColor: Colors.dynastyGreen,
  },
  phoneButtonText: {
    color: Colors.dynastyGreen,
  },
  errorText: {
    color: Colors.light.text.error,
    ...Typography.styles.bodySmall,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    padding: 10,
    zIndex: 1,
  },
  footer: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
  },
  footerText: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.tertiary,
  },
  linkText: {
    ...Typography.styles.bodyMedium,
    color: Colors.dynastyGreen,
    fontWeight: Typography.weight.semiBold,
  },
  // Debug styles (only shown in development)
  debugInfo: {
    marginTop: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: BorderRadius.sm,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.light.text.warning,
  },
  debugTitle: {
    ...Typography.styles.bodyMedium,
    fontWeight: Typography.weight.semiBold,
    color: Colors.light.text.warning,
    marginBottom: Spacing.xs,
  },
  debugText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.secondary,
    marginBottom: Spacing.xs,
  },
}); 