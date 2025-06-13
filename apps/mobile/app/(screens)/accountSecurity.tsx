import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../src/lib/firebase'; // Import auth for user info
// import { sendPasswordResetEmail } from 'firebase/auth'; // REMOVED - For password reset
import { commonHeaderOptions } from '../../constants/headerConfig'; // Import common header options
import { showErrorAlert } from '../../src/lib/errorUtils'; // Added import
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler, ErrorSeverity } from '../../hooks/useErrorHandler';
import { useEncryption } from '../../src/contexts/EncryptionContext';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../src/contexts/AuthContext';

// Mock data - replace with actual data fetching if needed
const MOCK_LOGIN_ACTIVITY: { id: string; device: string; location: string; lastLogin: string }[] = [];

const AccountSecurityScreen = () => {
  const navigation = useNavigation();
  const router = useRouter();
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Account Security Error',
    trackCurrentScreen: true
  });
  const { isEncryptionEnabled } = useEncryption();
  const {
    enrolledMfaFactors,
    getEnrolledMfaFactors,
    startPhoneMfaEnrollment,
    confirmPhoneMfaEnrollment,
    unenrollMfaFactor,
    isMfaSetupInProgress,
    mfaVerificationId,
    mfaError,
    clearMfaError,
    cancelMfaProcess,
  } = useAuth();

  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [enrollmentOtp, setEnrollmentOtp] = useState('');

  // Reset error state when isError changes
  useEffect(() => {
    if (!isError) {
      // Clear any local error states when global error is cleared
    }
  }, [isError]);

  // Fetch enrolled factors on component mount
  useEffect(() => {
    getEnrolledMfaFactors();
  }, [getEnrolledMfaFactors]);

  useEffect(() => {
    navigation.setOptions({
      ...commonHeaderOptions, // Spread common options
      title: 'Account Security',
    });
  }, [navigation]);

  const handleChangePassword = withErrorHandling(async () => {
    reset();
    
    if (!auth.currentUser || !auth.currentUser.email) {
      const error = { message: "Could not determine your email address. Please ensure you are logged in.", code: "unauthenticated" };
      handleError(error, { 
        action: 'changePassword',
        metadata: { hasCurrentUser: !!auth.currentUser, hasEmail: !!auth.currentUser?.email }
      });
      showErrorAlert(error, "Authentication Error");
      return;
    }

    try {
      // sendPasswordResetEmail(auth, auth.currentUser.email) // OLD WAY
      await auth.sendPasswordResetEmail(auth.currentUser.email); // CHANGED for RNFB
      Alert.alert(
        "Password Reset Email Sent",
        "An email has been sent to your registered address with instructions to reset your password."
      );
    } catch (error: any) {
      handleError(error, { 
        action: 'sendPasswordResetEmail',
        metadata: { email: auth.currentUser.email }
      });
      showErrorAlert(error, "Error Sending Email");
    }
    // TODO: For a more secure in-app password change, you'd typically re-authenticate the user 
    // and then use Firebase Auth's updatePassword method.
  });

  const handleEnrollNewPhone = withErrorHandling(async () => {
    if (!newPhoneNumber.trim()) {
      Alert.alert('Input Required', 'Please enter a phone number.');
      return;
    }
    clearMfaError();
    try {
      await startPhoneMfaEnrollment(newPhoneNumber);
      Alert.alert('Verification Code Sent', 'A verification code has been sent to your phone.');
      // UI will now show OTP input based on isMfaSetupInProgress and mfaVerificationId
    } catch (err: any) {
      // mfaError will be set by AuthContext, or use err here
      showErrorAlert(err, 'Enrollment Error');
    }
  });

  const handleConfirmEnrollmentOtp = withErrorHandling(async () => {
    if (!enrollmentOtp.trim()) {
      Alert.alert('Input Required', 'Please enter the OTP.');
      return;
    }
    clearMfaError();
    try {
      await confirmPhoneMfaEnrollment(enrollmentOtp, `Phone (${newPhoneNumber.slice(-4)})`);
      Alert.alert('Success', 'Phone number enrolled for 2FA.');
      setNewPhoneNumber('');
      setEnrollmentOtp('');
      // getEnrolledMfaFactors() is called within confirmPhoneMfaEnrollment in AuthContext
    } catch (err: any) {
      showErrorAlert(err, 'Verification Error');
    }
  });

  const handleUnenrollFactor = withErrorHandling(async (factorUid: string) => {
    clearMfaError();
    Alert.alert(
      'Confirm Unenroll',
      'Are you sure you want to remove this two-factor authentication method?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unenroll',
          style: 'destructive',
          onPress: async () => {
            try {
              await unenrollMfaFactor(factorUid);
              Alert.alert('Success', 'Two-factor method removed.');
              // getEnrolledMfaFactors() is called within unenrollMfaFactor in AuthContext
            } catch (err: any) {
              showErrorAlert(err, 'Unenrollment Error');
            }
          },
        },
      ]
    );
  });

  return (
    <ErrorBoundary screenName="AccountSecurityScreen">
      <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <Text style={styles.sectionHeader}>Password</Text>
        <TouchableOpacity style={styles.settingItemContainer} onPress={handleChangePassword}>
          <Ionicons name="lock-closed-outline" size={22} color="#555" style={styles.itemIcon} />
          <Text style={styles.settingLabel}>Change Password</Text>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>Two-Factor Authentication</Text>
        
        {mfaError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{mfaError}</Text>
            <TouchableOpacity onPress={clearMfaError}>
              <Text style={styles.clearErrorText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Display Enrolled Factors */}
        {enrolledMfaFactors.length > 0 ? (
          enrolledMfaFactors.map((factor) => (
            <View key={factor.uid} style={styles.settingItemContainer}>
              <View style={styles.textContainer}>
                <Text style={styles.settingLabel}>{factor.displayName || 'Phone Number'}</Text>
                {factor.phoneNumber && <Text style={styles.settingDescription}>{factor.phoneNumber}</Text>}
              </View>
              <TouchableOpacity onPress={() => handleUnenrollFactor(factor.uid)} style={styles.unenrollButton}>
                <Text style={styles.unenrollButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.settingItemContainer}>
            <Text style={styles.settingDescription}>No two-factor authentication methods enabled.</Text>
          </View>
        )}

        {/* Enroll New Phone Factor */}
        <View style={styles.enrollSection}>
          <Text style={styles.subSectionHeader}>Add Phone Verification</Text>
          {!isMfaSetupInProgress || !mfaVerificationId ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Enter phone number (e.g., +15551234567)"
                value={newPhoneNumber}
                onChangeText={setNewPhoneNumber}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
              />
              <TouchableOpacity style={styles.actionButton} onPress={handleEnrollNewPhone}>
                <Text style={styles.actionButtonText}>Send Verification Code</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Enter OTP from SMS"
                value={enrollmentOtp}
                onChangeText={setEnrollmentOtp}
                keyboardType="number-pad"
              />
              <TouchableOpacity style={styles.actionButton} onPress={handleConfirmEnrollmentOtp}>
                <Text style={styles.actionButtonText}>Verify and Enroll Phone</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { cancelMfaProcess(); setNewPhoneNumber(''); setEnrollmentOtp(''); }} style={styles.cancelButton}>
                 <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={styles.sectionHeader}>Encryption</Text>
        
        {!isEncryptionEnabled && (
          <View style={styles.encryptionPrompt}>
            <View style={styles.encryptionPromptIcon}>
              <Ionicons name="shield-outline" size={32} color={Colors.light.primary} />
            </View>
            <Text style={styles.encryptionPromptTitle}>Secure Your Data</Text>
            <Text style={styles.encryptionPromptDescription}>
              Enable end-to-end encryption to protect your family&apos;s photos, messages, and memories
            </Text>
            <TouchableOpacity 
              style={styles.encryptionPromptButton}
              onPress={() => router.push('/(onboarding)/encryptionSetup' as any)}
            >
              <Text style={styles.encryptionPromptButtonText}>Set Up Encryption</Text>
            </TouchableOpacity>
          </View>
        )}
        
        <TouchableOpacity 
          style={styles.settingItemContainer} 
          onPress={() => router.push('/(screens)/encryptionSettings' as any)}
        >
          <Ionicons name="lock-closed-outline" size={22} color="#555" style={styles.itemIcon} />
          <Text style={styles.settingLabel}>Encryption Settings</Text>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.settingItemContainer} 
          onPress={() => router.push('/(screens)/keyBackup' as any)}
        >
          <Ionicons name="cloud-upload-outline" size={22} color="#555" style={styles.itemIcon} />
          <Text style={styles.settingLabel}>Key Backup</Text>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>Device Management</Text>
        <TouchableOpacity 
          style={styles.settingItemContainer} 
          onPress={() => router.push('/(screens)/trustedDevices' as any)}
        >
          <Ionicons name="shield-checkmark-outline" size={22} color="#555" style={styles.itemIcon} />
          <Text style={styles.settingLabel}>Trusted Devices</Text>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>Security Monitoring</Text>
        <TouchableOpacity 
          style={styles.settingItemContainer} 
          onPress={() => router.push('/(screens)/auditLogs' as any)}
        >
          <Ionicons name="document-text-outline" size={22} color="#555" style={styles.itemIcon} />
          <Text style={styles.settingLabel}>Audit Logs</Text>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>Login Activity</Text>
        {MOCK_LOGIN_ACTIVITY.map((activity, index) => (
          <View key={activity.id} style={[styles.settingItemContainer, styles.activityItem]}>
            <Ionicons name={activity.device.toLowerCase().includes('iphone') ? "phone-portrait-outline" : "laptop-outline"} size={22} color="#555" style={styles.itemIcon} />
            <View style={styles.textContainer}>
                <Text style={styles.settingLabel}>{activity.device}</Text>
                <Text style={styles.settingDescription}>{activity.location} - {activity.lastLogin}</Text>
            </View>
            {/* TODO: Add option to sign out of specific device if API allows */}
          </View>
        ))}
        {MOCK_LOGIN_ACTIVITY.length === 0 && (
            <View style={styles.settingItemContainer}>
                <Text style={styles.settingDescription}>No recent login activity found.</Text>
            </View>
        )}
         {/* TODO: Add a "Sign out of all other devices" option */}
      </ScrollView>
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  container: {
    flex: 1,
  },
  sectionHeader: {
      fontSize: 14,
      color: '#666',
      fontWeight: '600',
      textTransform: 'uppercase',
      paddingHorizontal: 15,
      paddingTop: 25,
      paddingBottom: 8,
  },
  settingItemContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DCDCDC',
  },
  activityItem: {
    justifyContent: 'flex-start',
  },
  itemIcon: {
    marginRight: 15,
  },
  textContainer: {
      flex: 1, 
      marginRight: 10,
  },
  settingLabel: {
      fontSize: 16,
      color: '#000',
  },
  settingDescription: {
      fontSize: 13,
      color: '#666',
      marginTop: 2,
  },
  encryptionPrompt: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 15,
    marginVertical: 10,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  encryptionPromptIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.light.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  encryptionPromptTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  encryptionPromptDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  encryptionPromptButton: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  encryptionPromptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FFD2D2',
    padding: 10,
    marginHorizontal: 15,
    marginVertical: 10,
    borderRadius: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#D8000C',
    flex: 1,
  },
  clearErrorText: {
    color: '#D8000C',
    fontWeight: 'bold',
    marginLeft: 10,
  },
  unenrollButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#FF3B30',
    borderRadius: 5,
  },
  unenrollButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  enrollSection: {
    marginTop: 15,
    paddingHorizontal: 15,
  },
  subSectionHeader: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DCDCDC',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  actionButton: {
    backgroundColor: Colors.light.primary,
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: Colors.light.text,
    fontSize: 15,
  },
});

export default AccountSecurityScreen; 