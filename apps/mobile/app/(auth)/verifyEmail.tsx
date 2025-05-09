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
import { useAuth } from '../contexts/AuthContext'; // Assuming this path
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const dynastyLogo = require('../../assets/images/dynasty.png');

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { resendVerificationEmail, user, isLoading, signOut } = useAuth(); // Assuming resendVerificationEmail and user exist in AuthContext
  const params = useLocalSearchParams<{ email?: string }>();
  const displayEmail = params.email || user?.email;

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (user && user.emailVerified) {
      // If somehow user lands here but is already verified, navigate away
      // This navigation should ideally be handled by a central auth state listener in AuthContext
      router.replace('/(tabs)/home'); // Or to onboarding if not completed
    }
  }, [user, router]);

  const handleResendEmail = async () => {
    if (!user) {
      setError("You need to be signed in to resend a verification email.");
      return;
    }
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
      console.error("Resend email failed from screen:", e);
      setError(e.message || "Failed to resend verification email.");
    } finally {
      setIsResending(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/(auth)/signIn');
    } catch (e:any) {
      setError(e.message || "Failed to sign out.");
    }
  }

  return (
    <>
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
            disabled={isLoading || isResending}
          >
            {isResending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Resend Verification Email</Text>
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