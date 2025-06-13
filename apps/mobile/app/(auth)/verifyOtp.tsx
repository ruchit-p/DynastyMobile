import React, { useState, useEffect, useRef } from 'react';
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
  Image,
  Animated
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../src/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { 
  PHONE_AUTH_CONFIG, 
  isTestPhoneNumber, 
  getTestVerificationCode,
  PHONE_AUTH_ERROR_MESSAGES 
} from '../../src/config/phoneAuth';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { logger } from '../../src/services/LoggingService';

const dynastyLogo = require('../../assets/images/dynasty.png');

// OTP Session timeout (5 minutes)
const OTP_SESSION_TIMEOUT = 5 * 60 * 1000;

// Enhanced error messages with recovery actions for OTP verification
const getOtpErrorMessageAndAction = (errorCode: string) => {
  const errorInfo = {
    message: (PHONE_AUTH_ERROR_MESSAGES as Record<string, string>)[errorCode] || 'Verification failed. Please try again.',
    action: null as string | null,
    canRetry: true
  };

  switch(errorCode) {
    case 'auth/invalid-verification-code':
      errorInfo.message = 'Invalid code. Please check and try again.';
      errorInfo.action = 'Make sure you entered the 6-digit code correctly.';
      break;
    case 'auth/code-expired':
    case 'auth/invalid-verification-id':
      errorInfo.message = 'This code has expired.';
      errorInfo.action = 'Request a new verification code.';
      errorInfo.canRetry = false;
      break;
    case 'auth/too-many-requests':
      errorInfo.message = 'Too many failed attempts.';
      errorInfo.action = 'Please wait a few minutes before trying again.';
      errorInfo.canRetry = false;
      break;
    case 'auth/session-expired':
      errorInfo.message = 'Verification session expired.';
      errorInfo.action = 'Please go back and request a new code.';
      errorInfo.canRetry = false;
      break;
    case 'auth/network-request-failed':
      errorInfo.action = 'Check your internet connection.';
      break;
  }

  return errorInfo;
};

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { confirmPhoneCode, isLoading, phoneAuthConfirmation, phoneNumberInProgress, signInWithPhoneNumber } = useAuth();
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'OTP Verification Error',
    trackCurrentScreen: true
  });
  const params = useLocalSearchParams<{ phoneNumberSent?: string }>();
  // Use phone number from context if available, fallback to params
  const phoneNumberSent = phoneNumberInProgress || params.phoneNumberSent;
  const insets = useSafeAreaInsets();

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(true);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [countdown, setCountdown] = useState(30); // Countdown for resend OTP
  const [sessionStartTime] = useState(Date.now());
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState(OTP_SESSION_TIMEOUT);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Verifying code...');
  const [attemptCount, setAttemptCount] = useState(0);
  
  const errorAnimation = useRef(new Animated.Value(0)).current;
  const successAnimation = useRef(new Animated.Value(0)).current;
  // const inputRefs = useRef<TextInput[]>([]); // eslint-disable-line @typescript-eslint/no-unused-vars
  const hasLoggedInitialLoad = useRef(false);

  // Reduce excessive logging - only log on meaningful state changes
  useEffect(() => {
    if (!hasLoggedInitialLoad.current) {
      logger.debug('[VerifyOtpScreen] Component Load: isLoading:', isLoading, 'phoneAuthConfirmation exists:', !!phoneAuthConfirmation, 'phoneNumberSent:', phoneNumberSent);
      hasLoggedInitialLoad.current = true;
    }
  }, [isLoading, phoneAuthConfirmation, phoneNumberSent]);

  useEffect(() => {
    if (!isError) {
      setError(null);
      setErrorAction(null);
    }
  }, [isError]);

  // Track session timeout
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - sessionStartTime;
      const remaining = OTP_SESSION_TIMEOUT - elapsed;
      
      if (remaining <= 0) {
        setIsSessionExpired(true);
        setSessionTimeRemaining(0);
        setError('Verification session expired.');
        setErrorAction('Please go back and request a new code.');
        setCanRetry(false);
        clearInterval(interval);
      } else {
        setSessionTimeRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionStartTime]);

  // Format time remaining
  const formatTimeRemaining = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Animate error message
  useEffect(() => {
    if (error) {
      Animated.sequence([
        Animated.timing(errorAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(errorAnimation, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [error, errorAnimation]);

  // Auto-fill test code in development
  useEffect(() => {
    if (__DEV__ && PHONE_AUTH_CONFIG.testMode.autoFillTestCode && phoneNumberSent) {
      const testCode = getTestVerificationCode(phoneNumberSent);
      if (testCode) {
        setOtp(testCode);
        logger.debug('📱 Auto-filled test verification code');
      }
    }
  }, [phoneNumberSent]);

  useEffect(() => {
    logger.debug('[VerifyOtpScreen] useEffect (initial): isLoading:', isLoading, 'phoneAuthConfirmation exists:', !!phoneAuthConfirmation);
    if (!phoneAuthConfirmation && !isLoading && !phoneNumberSent) {
      // No confirmation and no phone number means user navigated here directly
      logger.warn("No phoneAuthConfirmation and no phone number. Redirecting to phone sign in.");
      router.replace('/(auth)/phoneSignIn');
    }
    // Removed immediate error for missing confirmation - let user try first
    // If confirmation is missing, the error will be shown when they try to verify
  }, [phoneAuthConfirmation, isLoading, phoneNumberSent, router]);

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

  const handleVerifyOtp = withErrorHandling(async () => {
    reset();
    setError(null);
    setErrorAction(null);
    setLoadingMessage('Verifying code...');
    setAttemptCount(prev => prev + 1);
    
    if (!otp.trim() || otp.length !== 6) {
      setError('Please enter the 6-digit code.');
      setErrorAction('The code should be 6 digits.');
      return;
    }
    
    if (isSessionExpired) {
      const errorInfo = getOtpErrorMessageAndAction('auth/session-expired');
      setError(errorInfo.message);
      setErrorAction(errorInfo.action);
      setCanRetry(errorInfo.canRetry);
      return;
    }
    
    if (!phoneAuthConfirmation) {
      // If we have a phone number but no confirmation (due to app reload), 
      // provide helpful guidance to user
      if (phoneNumberSent) {
        setError('Verification session has expired.');
        setErrorAction('Please tap "Resend" below to get a new verification code.');
        setCanRetry(false);
        return;
      } else {
        setError('No verification session found.');
        setErrorAction('Please go back and request a new verification code.');
        setCanRetry(false);
        return;
      }
    }
    
    if (!phoneNumberSent) {
      setError("Phone number not available. Cannot verify OTP.");
      setCanRetry(false);
      return;
    }
    
    try {
      // Log for debugging
      if (PHONE_AUTH_CONFIG.enableDebugLogging) {
        logger.debug('Verifying OTP for:', phoneNumberSent);
        if (isTestPhoneNumber(phoneNumberSent)) {
          logger.debug('📱 Verifying test phone number');
        }
      }
      
      setLoadingMessage('Almost there...');
      await confirmPhoneCode(phoneNumberSent, otp);
      
      // Success animation
      setLoadingMessage('Success! Signing you in...');
      Animated.timing(successAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      // Navigation is handled by AuthProvider on successful auth state change
    } catch (e: any) {
      logger.error('OTP verification error:', e);
      
      const errorCode = e.code || 'default';
      const errorInfo = getOtpErrorMessageAndAction(errorCode);
      
      setError(errorInfo.message);
      setErrorAction(errorInfo.action);
      setCanRetry(errorInfo.canRetry);
      
      // Check if too many attempts
      if (attemptCount >= 3 && errorCode === 'auth/invalid-verification-code') {
        setErrorAction('You have 3 more attempts before this code expires.');
      }
      
      handleError(e, { 
        action: 'verifyOtp',
        metadata: { 
          phoneNumber: phoneNumberSent || 'unknown', 
          otpLength: otp.length,
          errorCode,
          attemptCount,
          isTestNumber: phoneNumberSent ? isTestPhoneNumber(phoneNumberSent) : false
        }
      });
    }
  });

  const handleResendOtp = withErrorHandling(async () => {
    if (!phoneNumberSent) {
        setError("Cannot resend OTP without a phone number.");
        return;
    }
    reset();
    setError(null);
    setErrorAction(null);
    setResendDisabled(true);
    setLoadingMessage('Sending new code...');
    
    try {
        // Re-call signInWithPhoneNumber to send a new OTP
        // This will update the phoneAuthConfirmation in the context
        await signInWithPhoneNumber(phoneNumberSent);
        
        // Reset session timer
        setIsSessionExpired(false);
        setAttemptCount(0);
        setOtp('');
        
        // Show success message
        Animated.timing(successAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setTimeout(() => {
            Animated.timing(successAnimation, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }).start();
          }, 2000);
        });
        
        Alert.alert(
          "Code Sent!",
          `A new verification code has been sent to ${phoneNumberSent}.`,
          [{ text: "OK", style: "default" }],
          { cancelable: true }
        );
    } catch (e: any) {
        const errorCode = e.code || 'default';
        const errorInfo = getOtpErrorMessageAndAction(errorCode);
        
        setError(errorInfo.message);
        setErrorAction(errorInfo.action);
        
        handleError(e, { 
          action: 'resendOtp',
          metadata: { phoneNumber: phoneNumberSent || 'unknown', errorCode }
        });
        setResendDisabled(false); // Allow trying again if resend fails
    }
  });

  return (
    <ErrorBoundary screenName="VerifyOtpScreen">
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />
      <TouchableOpacity onPress={() => router.replace('/(auth)/phoneSignIn')} style={[styles.backButton, { top: insets.top + 5 }]}>
        <Ionicons name="arrow-back" size={28} color="#1A4B44" />
      </TouchableOpacity>
      <View style={styles.container}>
        <Image source={dynastyLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Verify Your Phone</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to {phoneNumberSent || 'your phone'}.
        </Text>

        {/* Session Timer */}
        <View style={styles.timerContainer}>
          <Ionicons 
            name="time-outline" 
            size={16} 
            color={isSessionExpired ? Colors.palette.status.error : Colors.light.text.secondary} 
          />
          <Text style={[
            styles.timerText, 
            isSessionExpired && styles.timerExpired
          ]}>
            {isSessionExpired ? 'Session expired' : `Time remaining: ${formatTimeRemaining(sessionTimeRemaining)}`}
          </Text>
        </View>

        <TextInput
          style={[
            styles.input,
            error && styles.inputError,
            isSessionExpired && styles.inputDisabled
          ]}
          placeholder="XXXXXX"
          placeholderTextColor="#888"
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          textContentType="oneTimeCode"
          editable={!isSessionExpired}
        />

        {/* Enhanced Error Display */}
        {error && (
          <Animated.View 
            style={[
              styles.errorContainer, 
              { 
                opacity: errorAnimation,
                transform: [{ scale: errorAnimation }]
              }
            ]}
          >
            <View style={styles.errorHeader}>
              <Ionicons name="alert-circle" size={20} color={Colors.palette.status.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
            {errorAction && (
              <Text style={styles.errorAction}>{errorAction}</Text>
            )}
          </Animated.View>
        )}

        {/* Success Animation */}
        <Animated.View 
          style={[
            styles.successContainer,
            { 
              opacity: successAnimation,
              transform: [{ scale: successAnimation }]
            }
          ]}
        >
          <Ionicons name="checkmark-circle" size={24} color={Colors.palette.status.success} />
          <Text style={styles.successText}>Code sent!</Text>
        </Animated.View>

        <TouchableOpacity 
          style={[
            styles.button, 
            (isLoading || isSessionExpired || !canRetry) && styles.buttonDisabled
          ]}
          onPress={handleVerifyOtp} 
          disabled={isLoading || isSessionExpired || !canRetry}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={[styles.buttonText, styles.loadingText]}>{loadingMessage}</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Verify Code</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
            onPress={handleResendOtp} 
            disabled={resendDisabled || isLoading || isSessionExpired} 
            style={styles.resendContainer}
        >
          <Text style={[
            styles.resendText, 
            (resendDisabled || isLoading || isSessionExpired) && styles.disabledText
          ]}>
            {resendDisabled ? `Resend code in ${countdown}s` : "Didn't receive code? Resend"}
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
  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 1,
    padding: 10,
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
    color: Colors.palette.status.error,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
    flex: 1,
    marginLeft: Spacing.xs,
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
  // Enhanced UI Styles
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: BorderRadius.full,
  },
  timerText: {
    fontSize: Typography.size.sm,
    color: Colors.light.text.secondary,
    marginLeft: Spacing.xs,
  },
  timerExpired: {
    color: Colors.palette.status.error,
  },
  inputError: {
    borderColor: Colors.palette.status.error,
    borderWidth: 2,
  },
  inputDisabled: {
    backgroundColor: Colors.light.background.secondary,
    opacity: 0.6,
  },
  errorContainer: {
    backgroundColor: Colors.palette.status.error + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginVertical: Spacing.sm,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.palette.status.error + '30',
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  errorAction: {
    fontSize: Typography.size.sm,
    color: Colors.light.text.secondary,
    marginTop: Spacing.xs,
    lineHeight: Typography.lineHeight.sm,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.sm,
  },
  successText: {
    color: Colors.palette.status.success,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
    marginLeft: Spacing.xs,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginLeft: Spacing.sm,
    fontSize: Typography.size.md,
  },
}); 