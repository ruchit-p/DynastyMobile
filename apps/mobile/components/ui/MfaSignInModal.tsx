import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

const MfaSignInModal: React.FC = () => {
  const {
    isMfaPromptVisible,
    mfaResolver,
    sendMfaSignInOtp,
    confirmMfaSignIn,
    cancelMfaProcess,
    mfaError,
    clearMfaError,
    isLoading, // To show activity indicator during MFA operations
  } = useAuth();

  const [otp, setOtp] = useState('');

  if (!isMfaPromptVisible || !mfaResolver) {
    return null;
  }

  const hint = mfaResolver.hints?.[0];
  const factorDisplayName = hint?.displayName || (hint?.phoneNumber ? `Phone (${hint.phoneNumber.slice(-4)})` : 'your second factor');

  const handleConfirm = async () => {
    if (!otp.trim()) {
      Alert.alert('OTP Required', 'Please enter the verification code.');
      return;
    }
    clearMfaError();
    try {
      await confirmMfaSignIn(otp);
      // On success, the modal will be hidden by isMfaPromptVisible becoming false
      // and onAuthStateChanged will handle the rest.
      setOtp(''); // Clear OTP input
    } catch (error) {
      // Error is handled and displayed via mfaError from context
    }
  };

  const handleResend = async () => {
    clearMfaError();
    try {
      await sendMfaSignInOtp();
      Alert.alert('Code Sent', 'A new verification code has been sent.');
    } catch (error) {
      // Error is handled and displayed via mfaError from context
    }
  };

  const handleCancel = () => {
    setOtp('');
    cancelMfaProcess();
  };

  return (
    <Modal
      transparent={true}
      visible={isMfaPromptVisible}
      animationType="slide"
      onRequestClose={handleCancel} // For Android back button
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.closeButton} onPress={handleCancel}>
            <Ionicons name="close-circle" size={28} color={Colors.light.textFaded} />
          </TouchableOpacity>
          <Text style={styles.title}>Two-Factor Authentication</Text>
          <Text style={styles.description}>
            A verification code has been sent to {factorDisplayName}. Please enter the code below to complete your sign-in.
          </Text>

          {mfaError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{mfaError}</Text>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="Enter OTP"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry={true} // Optional: hide OTP as it's typed
          />

          {isLoading ? (
            <ActivityIndicator size="large" color={Colors.light.primary} style={styles.loader} />
          ) : (
            <>
              <TouchableOpacity style={styles.actionButton} onPress={handleConfirm}>
                <Text style={styles.actionButtonText}>Confirm Sign-In</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleResend}>
                <Text style={styles.secondaryButtonText}>Resend Code</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    backgroundColor: Colors.light.background,
    borderRadius: 15,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  closeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.light.text,
    marginBottom: 15,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: Colors.light.textFaded,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  input: {
    width: '100%',
    backgroundColor: Colors.light.cardBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 3, // Add some spacing for OTPs
  },
  actionButton: {
    width: '100%',
    backgroundColor: Colors.light.primary,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: Colors.light.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Colors.light.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: Colors.light.errorBackground,
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
    width: '100%',
    alignItems: 'center',
  },
  errorText: {
    color: Colors.light.errorText,
    fontSize: 14,
    textAlign: 'center',
  },
  loader: {
    marginVertical: 20,
  },
});

export default MfaSignInModal; 