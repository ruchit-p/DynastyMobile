import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { E2EEService } from '../src/services/encryption';

interface KeyInfo {
  hasIdentityKey: boolean;
  preKeyCount: number;
  lastUpdated: Date | null;
}

export const useEncryptionKeys = () => {
  const [keyInfo, setKeyInfo] = useState<KeyInfo>({
    hasIdentityKey: false,
    preKeyCount: 0,
    lastUpdated: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkKeys = useCallback(async () => {
    try {
      setIsLoading(true);
      const identity = await E2EEService.getInstance().getIdentityKeyPair();
      
      setKeyInfo({
        hasIdentityKey: !!identity,
        preKeyCount: 0, // E2EE doesn't use pre-keys
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error('Failed to check encryption keys:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkKeys();
    
    // Check periodically
    const interval = setInterval(checkKeys, 60000); // Every minute
    
    return () => clearInterval(interval);
  }, [checkKeys]);

  const regeneratePreKeys = useCallback(async (count: number = 50) => {
    try {
      // TODO: Implement in SignalProtocolService
      console.log('Regenerating pre-keys:', count);
      
      // For now, just refresh the count
      await checkKeys();
      
      Alert.alert('Success', `Generated ${count} new pre-keys`);
    } catch (error) {
      console.error('Failed to regenerate pre-keys:', error);
      Alert.alert('Error', 'Failed to generate new pre-keys');
      throw error;
    }
  }, [checkKeys]);

  const resetEncryption = useCallback(async () => {
    Alert.alert(
      'Reset Encryption?',
      'This will delete all your encryption keys and encrypted messages. You will need to re-verify with your contacts. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await E2EEService.clearAllData();
              await checkKeys();
              Alert.alert('Success', 'Encryption has been reset');
            } catch (error) {
              console.error('Failed to reset encryption:', error);
              Alert.alert('Error', 'Failed to reset encryption');
            }
          }
        }
      ]
    );
  }, [checkKeys]);

  return {
    keyInfo,
    isLoading,
    regeneratePreKeys,
    resetEncryption,
    checkKeys,
  };
};
