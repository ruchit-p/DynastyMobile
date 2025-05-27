import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  SafeAreaView,
  Image,
  TouchableOpacity,
  Platform
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext'; // Updated path
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

const dynastyLogo = require('../../assets/images/dynasty.png');

export default function ConfirmEmailVerificationScreen() {
  const router = useRouter();
  const { confirmEmailVerificationLink } = useAuth(); // Assuming this function exists and calls your 'verifyEmail' cloud function
  const { handleError } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Email Verification Error',
    trackCurrentScreen: true
  });
  const params = useLocalSearchParams<{ uid?: string; token?: string }>();
  const { uid, token } = params;

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState<string>('Verifying your email...');

  useEffect(() => {
    const verify = async () => {
      if (uid && token) {
        try {
          // confirmEmailVerificationLink should call your backend 'verifyEmail' function
          await confirmEmailVerificationLink(uid, token);
          setStatus('success');
          setMessage('Email successfully verified! You will be redirected shortly.');
          // Navigation to appropriate screen (onboarding or home) should be handled
          // by the main auth state listener in AuthContext after user.emailVerified updates.
          // Trigger a check or wait for listener:
          setTimeout(() => {
            // router.replace('/(tabs)/home'); // Or onboarding screen
            // For now, let AuthProvider handle navigation based on new state
          }, 2000);
        } catch (e: any) {
          handleError(e, { 
            action: 'confirmEmailVerification',
            metadata: { uid: uid || 'unknown', hasToken: !!token }
          });
          setStatus('error');
          setMessage(e.message || 'Failed to verify email. The link may be invalid or expired.');
        }
      } else {
        setStatus('error');
        setMessage('Verification link is incomplete. Please try again.');
      }
    };

    verify();
  }, [uid, token, confirmEmailVerificationLink, router, handleError]);

  return (
    <ErrorBoundary screenName="ConfirmEmailVerificationScreen">
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />
        <View style={styles.container}>
          <Image source={dynastyLogo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>
            {status === 'verifying' && 'Verifying Email'}
            {status === 'success' && 'Email Verified!'}
            {status === 'error' && 'Verification Failed'}
          </Text>
          {status === 'verifying' && <ActivityIndicator size="large" color="#0A5C36" style={styles.loader} />}
          <Text style={styles.message}>{message}</Text>
          {status === 'error' && (
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/signIn')}>
              <Text style={styles.buttonText}>Go to Sign In</Text>
            </TouchableOpacity>
          )}
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
    textAlign: 'center',
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A4B44',
    marginBottom: 20,
  },
  loader: {
    marginBottom: 20,
  },
  message: {
    fontSize: 16,
    color: '#555',
    marginBottom: 30,
    textAlign: 'center',
  },
  button: {
    width: '80%',
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
}); 