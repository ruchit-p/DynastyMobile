import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Image,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useRouter, useLocalSearchParams, Link, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../src/contexts/AuthContext'; // Updated path
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

const dynastyLogo = require('../../assets/images/dynasty.png');

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { resendVerificationEmail, user, isLoading, signOut, refreshUser } = useAuth(); // Assuming resendVerificationEmail and user exist in AuthContext
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Email Verification Error',
    trackCurrentScreen: true
  });
  const params = useLocalSearchParams<{ email?: string }>();
  const displayEmail = params.email || user?.email;

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false); // New state for manual refresh
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isError) {
      setError(null);
    }
  }, [isError]);

  useEffect(() => {
    if (user && user.emailVerified) {
      // If somehow user lands here but is already verified, navigate away
      // This navigation should ideally be handled by a central auth state listener in AuthContext
      router.replace('/(tabs)/home'); // Or to onboarding if not completed
    }
  }, [user, router]);

  const handleResendEmail = withErrorHandling(async () => {
    console.log("VerifyEmailScreen: handleResendEmail TRIGGERED");
    if (!user) {
      setError("You need to be signed in to resend a verification email.");
      return;
    }
    reset();
    setError(null);
    setMessage(null);
    setIsResending(true);
    try {
      // The resendVerificationEmail function in AuthContext should call the
      // 'sendVerificationEmail' Firebase function.
      // It needs { userId, email, displayName }
      // We might need to fetch displayName or use a default.
      // For now, assuming resendVerificationEmail handles this.
      await resendVerificationEmail();
      setMessage('A new verification email has been sent. Please check your inbox.');
    } catch (e: any) {
      handleError(e, { 
        action: 'resendVerificationEmail',
        metadata: { email: displayEmail || 'unknown' }
      });
      setError(e.message || "Failed to resend verification email.");
    } finally {
      setIsResending(false);
    }
  });

  // New handler for checking verification status manually
  const handleCheckVerificationStatus = withErrorHandling(async () => {
    reset();
    setError(null);
    setMessage(null);
    setIsCheckingStatus(true);
    console.log("VerifyEmailScreen: Manually checking verification status...");
    try {
      await refreshUser(); // Call refreshUser from AuthContext
      // No explicit navigation here; AuthContext's useEffect should handle it if status changed.
      // We can set a message if the user is still not verified.
      if (user && !user.emailVerified) {
        setMessage("Email is still pending verification. Please check your email or try resending.");
      } else if (user && user.emailVerified) {
        setMessage("Email successfully verified! Redirecting..."); 
        // AuthContext should redirect. If not, router.replace here could be a fallback.
      }
    } catch (e: any) {
      handleError(e, { 
        action: 'checkVerificationStatus',
        metadata: { email: displayEmail || 'unknown' }
      });
      setError(e.message || "Failed to check verification status.");
    } finally {
      setIsCheckingStatus(false);
    }
  });

  const handleSignOut = withErrorHandling(async () => {
    await signOut();
    router.replace('/(auth)/signIn');
  });

  return (
    <ErrorBoundary screenName="VerifyEmailScreen">
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />
        <View style={styles.container}>
          <Image source={dynastyLogo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Verify Your Email</Text>
          {displayEmail ? (
            <Text style={styles.subtitle}>
              A verification link has been sent to <Text style={styles.emailText}>{displayEmail}</Text>.
              Please check your inbox (and spam folder) and click the link to complete your registration.
            </Text>
          ) : (
            <Text style={styles.subtitle}>
              A verification link has been sent to your email address.
              Please check your inbox (and spam folder) and click the link to complete your registration.
            </Text>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}
          {message && <Text style={styles.messageText}>{message}</Text>}

          <TouchableOpacity
            style={[styles.button, (isLoading || isResending) && styles.buttonDisabled]}
            onPress={handleResendEmail}
            disabled={isLoading || isResending || isCheckingStatus} // Disable if checking status too
          >
            {isResending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Resend Verification Email</Text>
            )}
          </TouchableOpacity>

          {/* New Button for Manual Refresh */}
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, (isLoading || isCheckingStatus) && styles.buttonDisabled]}
            onPress={handleCheckVerificationStatus}
            disabled={isLoading || isCheckingStatus || isResending}
          >
            {isCheckingStatus ? (
              <ActivityIndicator size="small" color="#0A5C36" />
            ) : (
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>Refresh Verification Status</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already verified? </Text>
            <Link href="/(auth)/signIn" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
            <Text style={styles.signOutButtonText}>Or Sign Out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ErrorBoundary>
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
    width: 100,
    height: 100,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A4B44',
    marginBottom: 15,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 30,
    textAlign: 'center',
    lineHeight: 24,
  },
  emailText: {
    fontWeight: 'bold',
    color: '#0A5C36',
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#0A5C36',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#A9A9A9',
  },
  secondaryButton: { // Style for the new button
    backgroundColor: '#E0E0E0',
    marginTop: 10, // Add some space if needed
  },
  secondaryButtonText: { // Style for text on new button
    color: '#0A5C36',
  },
  errorText: {
    color: 'red',
    marginBottom: 15,
    textAlign: 'center',
  },
  messageText: {
    color: 'green',
    marginBottom: 15,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    marginTop: 20,
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
  signOutButton: {
    marginTop: 15,
    padding: 10,
  },
  signOutButtonText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  }
}); 