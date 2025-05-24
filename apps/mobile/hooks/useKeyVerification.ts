import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ChatEncryptionService } from '../src/services/encryption';

interface UseKeyVerificationOptions {
  remoteUserId: string;
  remoteUserName: string;
}

export const useKeyVerification = ({ remoteUserId, remoteUserName }: UseKeyVerificationOptions) => {
  const [isVerified, setIsVerified] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [fingerprint, setFingerprint] = useState<string>('');

  useEffect(() => {
    const checkVerification = async () => {
      try {
        setIsChecking(true);
        
        // TODO: Check verification status from Firebase
        // For now, just set to false
        setIsVerified(false);
        
        // Generate fingerprint
        // This would involve getting both users' public keys and generating a combined fingerprint
        // For now, use a placeholder
        setFingerprint('ABCD EFGH IJKL MNOP QRST UVWX YZ12 3456');
      } catch (error) {
        console.error('Failed to check verification status:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkVerification();
  }, [remoteUserId]);

  const verifyFingerprint = useCallback(async (scannedFingerprint: string) => {
    try {
      if (scannedFingerprint !== fingerprint) {
        Alert.alert(
          'Verification Failed',
          'The security codes do not match. This could indicate a security issue.',
          [{ text: 'OK', style: 'default' }]
        );
        return false;
      }

      // Call Firebase function to mark as verified
      const functions = getFunctions();
      const verifyKey = httpsCallable(functions, 'verifyKeyFingerprint');
      
      await verifyKey({
        targetUserId: remoteUserId,
        fingerprint: fingerprint,
      });

      setIsVerified(true);
      Alert.alert(
        'Verification Successful',
        `You have successfully verified ${remoteUserName}'s encryption keys.`,
        [{ text: 'OK', style: 'default' }]
      );
      
      return true;
    } catch (error) {
      console.error('Failed to verify fingerprint:', error);
      Alert.alert('Error', 'Failed to verify keys. Please try again.');
      return false;
    }
  }, [remoteUserId, remoteUserName, fingerprint]);

  const showVerificationDialog = useCallback(() => {
    Alert.alert(
      'Verify Encryption Keys',
      `To ensure secure communication with ${remoteUserName}, compare the following security number on both devices:\n\n${fingerprint}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as Verified',
          onPress: async () => {
            const confirmed = await new Promise<boolean>((resolve) => {
              Alert.alert(
                'Confirm Verification',
                'Have you confirmed that the security number matches on both devices?',
                [
                  { text: 'No', onPress: () => resolve(false), style: 'cancel' },
                  { text: 'Yes', onPress: () => resolve(true) },
                ]
              );
            });

            if (confirmed) {
              await verifyFingerprint(fingerprint);
            }
          },
        },
      ]
    );
  }, [remoteUserName, fingerprint, verifyFingerprint]);

  return {
    isVerified,
    isChecking,
    fingerprint,
    verifyFingerprint,
    showVerificationDialog,
  };
};
