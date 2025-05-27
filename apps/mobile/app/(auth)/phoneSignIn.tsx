import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ActivityIndicator,
  Image,
  Animated
} from 'react-native';
import { useRouter, Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RNPhoneInput from 'react-native-phone-number-input';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { 
  PHONE_AUTH_CONFIG, 
  isTestPhoneNumber, 
  PHONE_AUTH_ERROR_MESSAGES 
} from '../../src/config/phoneAuth';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { logger } from '../../src/services/LoggingService';

const dynastyLogo = require('../../assets/images/dynasty.png');

// Explicitly cast the component type
const PhoneInput = RNPhoneInput as any;

// Enhanced error messages with recovery actions
const getErrorMessageAndAction = (errorCode: string) => {
  const errorInfo = {
    message: (PHONE_AUTH_ERROR_MESSAGES as Record<string, string>)[errorCode] || 'Something went wrong. Please try again.',
    action: null as string | null,
    canRetry: true
  };

  switch(errorCode) {
    case 'auth/too-many-requests':
      errorInfo.action = 'Please wait a few minutes before trying again.';
      errorInfo.canRetry = false;
      break;
    case 'auth/quota-exceeded':
      errorInfo.action = 'Try again tomorrow or use email sign-in.';
      errorInfo.canRetry = false;
      break;
    case 'auth/network-request-failed':
      errorInfo.action = 'Check your internet connection.';
      break;
    case 'auth/invalid-phone-number':
    case 'TOO_SHORT':
    case 'TOO_LONG':
      errorInfo.action = 'Double-check your phone number.';
      break;
    case 'auth/app-not-authorized':
    case 'auth/operation-not-allowed':
      errorInfo.action = 'Contact support for assistance.';
      errorInfo.canRetry = false;
      break;
  }

  return errorInfo;
};

export default function PhoneSignInScreen() {
  const router = useRouter();
  const { signInWithPhoneNumber, isLoading } = useAuth();
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Phone Sign In Error',
    trackCurrentScreen: true
  });
  const [value, setValue] = useState("");
  const [formattedValue, setFormattedValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Sending verification code...');
  const insets = useSafeAreaInsets();
  const phoneInputRef = useRef<RNPhoneInput>(null);
  const errorAnimation = useRef(new Animated.Value(0)).current;
  const successAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isError) {
      setError(null);
      setErrorAction(null);
    }
  }, [isError]);

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

  // Retry with exponential backoff
  const calculateRetryDelay = () => {
    return Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
  };

  const handleSendOtp = withErrorHandling(async () => {
    reset();
    setError(null);
    setErrorAction(null);
    setLoadingMessage('Validating phone number...');
    
    const checkValid = phoneInputRef.current?.isValidNumber(value);
    if (!checkValid) {
      const errorInfo = getErrorMessageAndAction('auth/invalid-phone-number');
      setError(errorInfo.message);
      setErrorAction(errorInfo.action);
      setCanRetry(errorInfo.canRetry);
      return;
    }

    setLoadingMessage('Sending verification code...');

    try {
      // Development helper: Show if using test number
      if (PHONE_AUTH_CONFIG.enableDebugLogging) {
        logger.debug('Attempting to send OTP to:', formattedValue);
        if (isTestPhoneNumber(formattedValue)) {
          logger.debug('📱 Using test phone number');
        }
      }
      
      const confirmationResult = await signInWithPhoneNumber(formattedValue);
      if (!confirmationResult) {
        setError("Could not initiate phone sign-in. Please try again.");
        setCanRetry(true);
      } else {
        // Success feedback
        setLoadingMessage('Code sent successfully!');
        Animated.timing(successAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    } catch (e: any) {
      logger.error('Phone auth error:', e);
      
      const errorCode = e.code || (e.message?.includes('TOO_SHORT') ? 'TOO_SHORT' : 'default');
      const errorInfo = getErrorMessageAndAction(errorCode);
      
      setError(errorInfo.message);
      setErrorAction(errorInfo.action);
      setCanRetry(errorInfo.canRetry);
      
      handleError(e, { 
        action: 'sendOtp',
        metadata: { 
          phoneNumber: formattedValue || 'unknown',
          errorCode,
          retryCount,
          isTestNumber: isTestPhoneNumber(formattedValue)
        }
      });
      
      setRetryCount(prev => prev + 1);
    }
  });

  const handleRetry = async () => {
    if (!canRetry) return;
    
    setIsRetrying(true);
    const delay = calculateRetryDelay();
    setLoadingMessage(`Retrying in ${Math.ceil(delay / 1000)} seconds...`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    setIsRetrying(false);
    handleSendOtp();
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/signIn');
    }
  };

  return (
    <ErrorBoundary screenName="PhoneSignInScreen">
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />

      <TouchableOpacity 
        onPress={handleBack} 
        style={[styles.backButton, { top: insets.top + 5 }]}
      >
        <Ionicons name="arrow-back" size={28} color="#1A4B44" />
      </TouchableOpacity>

      <View style={styles.container}>
        <Image source={dynastyLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Enter Your Phone Number</Text>
        <Text style={styles.subtitle}>We&apos;ll send you a verification code.</Text>

        <PhoneInput
            ref={phoneInputRef}
            defaultValue={value}
            defaultCode="US"
            layout="first"
            onChangeText={(text: string) => {
              setValue(text);
            }}
            onChangeFormattedText={(text: string) => {
              setFormattedValue(text);
            }}
            containerStyle={styles.phoneInputContainer}
            textContainerStyle={styles.phoneInputTextContainer}
            textInputStyle={styles.phoneInputTextInput}
            codeTextStyle={styles.phoneInputCodeText}
            flagButtonStyle={styles.phoneInputFlagButton}
            withDarkTheme={false}
            withShadow
            autoFocus
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
            {canRetry && retryCount > 0 && (
              <TouchableOpacity 
                style={styles.retryButton}
                onPress={handleRetry}
                disabled={isRetrying}
              >
                <Text style={styles.retryButtonText}>
                  {isRetrying ? 'Retrying...' : 'Try Again'}
                </Text>
              </TouchableOpacity>
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
        </Animated.View>

        <TouchableOpacity 
          style={[
            styles.button, 
            (isLoading || isRetrying) && styles.buttonDisabled,
            !canRetry && styles.buttonError
          ]}
          onPress={handleSendOtp} 
          disabled={isLoading || isRetrying || !canRetry}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={[styles.buttonText, styles.loadingText]}>{loadingMessage}</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Send Code</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Changed your mind? </Text>
          <Link href="/(auth)/signIn" asChild>
            <TouchableOpacity>
              <Text style={styles.linkText}>Go to Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
      {/* 
        RECAPTCHA IMPLEMENTATION NOTE:
        
        React Native Firebase handles phone authentication differently than the web SDK:
        
        1. iOS: Uses silent push notifications (APNs) - no reCAPTCHA needed
        2. Android: Uses SafetyNet API automatically - no reCAPTCHA needed
        3. Web/Expo Go: Would require reCAPTCHA, but not supported in React Native Firebase
        
        For development testing:
        - Use real devices with SIM cards when possible
        - Configure test phone numbers in Firebase Console:
          Authentication > Sign-in method > Phone > Phone numbers for testing
        - Test numbers bypass SMS sending and work without reCAPTCHA
        
        If you need to test in Expo Go or web, consider:
        - Using Firebase JS SDK instead of React Native Firebase
        - Implementing a web-based phone auth flow in a WebView
        - Using test phone numbers configured in Firebase Console
        
        Production apps on real devices will work without any reCAPTCHA implementation.
      */}
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
  phoneInputContainer: {
    width: '100%',
    height: 50,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  phoneInputTextContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 8,
  },
  phoneInputTextInput: {
    height: 48,
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Helvetica Neue',
  },
  phoneInputCodeText: {
    fontSize: 16,
  },
  phoneInputFlagButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
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
  // Enhanced Error UI Styles
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
  retryButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.palette.status.error,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: Colors.light.text.inverse,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
  successContainer: {
    position: 'absolute',
    right: Spacing.md,
    top: '50%',
    marginTop: -12,
  },
  buttonError: {
    backgroundColor: Colors.palette.neutral.medium,
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