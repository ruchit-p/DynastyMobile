import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Alert } from 'react-native';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { getFirebaseAuth } from '../lib/firebase';
import { callFirebaseFunction } from '../lib/errorUtils';
import { ChatEncryptionService, LibsignalService } from '../../src/services/encryption';
import { logger } from '../services/LoggingService';

interface EncryptionContextType {
  isEncryptionReady: boolean;
  isEncryptionEnabled: boolean;
  isInitializing: boolean;
  // Compatibility properties for components expecting different names
  isInitialized: boolean;
  status: 'initialized' | 'not_initialized' | 'initializing' | 'error';
  initializeEncryption: () => Promise<void>;
  resetEncryption: () => Promise<void>;
  verifyKeyFingerprint: (remoteUserId: string, fingerprint: string) => Promise<void>;
  getVerificationStatus: (remoteUserId: string) => Promise<boolean>;
  encryptionError: Error | null;
}

const EncryptionContext = createContext<EncryptionContextType | undefined>(undefined);

export const useEncryption = () => {
  const context = useContext(EncryptionContext);
  if (!context) {
    throw new Error('useEncryption must be used within an EncryptionProvider');
  }
  return context;
};

interface EncryptionProviderProps {
  children: ReactNode;
}

export const EncryptionProvider: React.FC<EncryptionProviderProps> = ({ children }) => {
  const [isEncryptionReady, setIsEncryptionReady] = useState(false);
  const [isEncryptionEnabled, setIsEncryptionEnabled] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [encryptionError, setEncryptionError] = useState<Error | null>(null);
  const [currentUser, setCurrentUser] = useState<FirebaseAuthTypes.User | null>(null);

  const initializeEncryption = useCallback(async () => {
    if (isInitializing || isEncryptionReady) return;

    try {
      setIsInitializing(true);
      setEncryptionError(null);

      logger.debug('Initializing end-to-end encryption...');
      
      // Initialize the encryption service
      await ChatEncryptionService.initializeEncryption();
      
      setIsEncryptionReady(true);
      setIsEncryptionEnabled(true);
      logger.debug('End-to-end encryption initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize encryption:', error);
      setEncryptionError(error as Error);
      
      Alert.alert(
        'Encryption Setup Failed',
        'Failed to set up end-to-end encryption. You can still use the app, but messages won\'t be encrypted.',
        [
          { text: 'Retry', onPress: () => initializeEncryption() },
          { text: 'Continue', style: 'cancel' }
        ]
      );
    } finally {
      setIsInitializing(false);
    }
  }, [isInitializing, isEncryptionReady]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Check if encryption is already initialized
        const ready = await ChatEncryptionService.isEncryptionReady();
        setIsEncryptionReady(ready);
        setIsEncryptionEnabled(ready);
        
        if (!ready) {
          // Auto-initialize encryption for logged-in users
          await initializeEncryption();
        }
      } else {
        // User logged out, reset encryption state
        setIsEncryptionReady(false);
        setIsEncryptionEnabled(false);
        setEncryptionError(null);
      }
    });

    return unsubscribe;
  }, [initializeEncryption]);

  const resetEncryption = async () => {
    try {
      Alert.alert(
        'Reset Encryption?',
        'This will delete all your encryption keys and encrypted messages. You will need to re-verify with your contacts. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset',
            style: 'destructive',
            onPress: async () => {
              await LibsignalService.clearAllData();
              setIsEncryptionReady(false);
              
              // Re-initialize
              await initializeEncryption();
            }
          }
        ]
      );
    } catch (error) {
      logger.error('Failed to reset encryption:', error);
      Alert.alert('Error', 'Failed to reset encryption');
    }
  };

  const verifyKeyFingerprint = async (remoteUserId: string, fingerprint: string) => {
    try {
      // Call Firebase function to store verification
      const result = await callFirebaseFunction('verifyKeyFingerprint', {
        targetUserId: remoteUserId,
        fingerprint
      });
      
      if (!result.success) {
        throw new Error('Failed to verify key fingerprint');
      }
      
      logger.debug('Key fingerprint verified successfully');
    } catch (error) {
      logger.error('Failed to verify key fingerprint:', error);
      throw error;
    }
  };

  const getVerificationStatus = async (remoteUserId: string): Promise<boolean> => {
    try {
      // Check verification status from Firebase
      const result = await callFirebaseFunction('getKeyVerificationStatus', {
        targetUserId: remoteUserId
      });
      
      return result.result?.verified || false;
    } catch (error) {
      logger.error('Failed to get verification status:', error);
      return false;
    }
  };

  // Determine status for compatibility
  const getStatus = (): 'initialized' | 'not_initialized' | 'initializing' | 'error' => {
    if (encryptionError) return 'error';
    if (isInitializing) return 'initializing';
    if (isEncryptionReady) return 'initialized';
    return 'not_initialized';
  };

  const value: EncryptionContextType = {
    isEncryptionReady,
    isEncryptionEnabled,
    isInitializing,
    // Compatibility properties
    isInitialized: isEncryptionReady,
    status: getStatus(),
    initializeEncryption,
    resetEncryption,
    verifyKeyFingerprint,
    getVerificationStatus,
    encryptionError,
  };

  return (
    <EncryptionContext.Provider value={value}>
      {children}
    </EncryptionContext.Provider>
  );
};

export default EncryptionContext;
