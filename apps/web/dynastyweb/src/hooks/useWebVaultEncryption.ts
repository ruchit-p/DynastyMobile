// Web Vault Encryption Hook for Dynasty Web App
// Provides React integration for vault encryption operations

import { useState, useCallback, useEffect, useRef } from 'react';
import { WebVaultCryptoService, EncryptedFileMetadata } from '../services/encryption/VaultCryptoService';
import { WebVaultKeyManager } from '../services/encryption/WebVaultKeyManager';
import { errorHandler, ErrorSeverity } from '../services/ErrorHandlingService';

// Types
export interface UseWebVaultEncryptionState {
  isUnlocked: boolean;
  isLoading: boolean;
  error: string | null;
  biometricSupported: boolean;
  biometricEnabled: boolean;
  keyRotationDue: boolean;
}

export interface EncryptionProgress {
  progress: number;
  status: 'encrypting' | 'decrypting' | 'uploading' | 'complete' | 'error';
  currentFile?: string;
  totalFiles?: number;
  processedFiles?: number;
}

export interface WebVaultEncryptionResult {
  success: boolean;
  encryptedFile?: Uint8Array;
  metadata?: Record<string, unknown>;
  header?: Uint8Array;
  error?: string;
}

/**
 * React hook for web vault encryption operations
 * Provides state management and encryption/decryption functionality
 */
export function useWebVaultEncryption(userId: string) {
  // State
  const [state, setState] = useState<UseWebVaultEncryptionState>({
    isUnlocked: false,
    isLoading: false,
    error: null,
    biometricSupported: false,
    biometricEnabled: false,
    keyRotationDue: false
  });

  const [progress, setProgress] = useState<EncryptionProgress | null>(null);

  // Refs
  const cryptoService = useRef(WebVaultCryptoService.getInstance());
  const keyManager = useRef(WebVaultKeyManager.getInstance());
  const currentMasterKey = useRef<Uint8Array | null>(null);

  // Initialize hook
  useEffect(() => {
    const initialize = async () => {
      try {
        setState(prev => ({ ...prev, isLoading: true }));

        // Initialize key manager
        await keyManager.current.initialize();

        // Check biometric support
        const biometricSupported = cryptoService.current.isWebAuthnSupported();

        // Check if vault keys exist
        const hasKeys = await keyManager.current.hasVaultKeys(userId);

        // Get vault configuration
        const config = await keyManager.current.retrieveVaultConfiguration(userId);

        setState(prev => ({
          ...prev,
          biometricSupported,
          biometricEnabled: config?.biometricEnabled || false,
          keyRotationDue: false, // TODO: Implement key rotation check
          isLoading: false
        }));

        // Try to get key from session
        if (hasKeys) {
          const sessionKey = await keyManager.current.retrieveVaultMasterKey(userId);
          if (sessionKey) {
            currentMasterKey.current = sessionKey;
            setState(prev => ({ ...prev, isUnlocked: true }));
          }
        }
      } catch (error) {
        errorHandler.handleError(error, ErrorSeverity.HIGH, {
          action: 'initialize-web-vault-encryption',
          userId
        });
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to initialize vault encryption'
        }));
      }
    };

    if (userId) {
      initialize();
    }
  }, [userId]);

  // Setup vault with password
  const setupVault = useCallback(async (
    password: string,
    options: {
      enableBiometric?: boolean;
      keyRotation?: boolean;
    } = {}
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Generate master key
      const salt = cryptoService.current.generateSalt();
      const masterKey = await cryptoService.current.deriveVaultMasterKey(password, salt);

      // Store master key
      await keyManager.current.storeVaultMasterKey(
        userId,
        masterKey,
        password,
        options
      );

      // Update state
      currentMasterKey.current = masterKey;
      setState(prev => ({
        ...prev,
        isUnlocked: true,
        isLoading: false,
        biometricEnabled: options.enableBiometric || false
      }));

      console.log('Vault setup completed successfully');
      return { success: true };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.CRITICAL, {
        action: 'setup-vault',
        userId
      });
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to setup vault'
      }));
      return { success: false, error: 'Failed to setup vault' };
    }
  }, [userId]);

  // Unlock vault with password
  const unlockVault = useCallback(async (
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const masterKey = await keyManager.current.retrieveVaultMasterKey(
        userId,
        password,
        false
      );

      if (!masterKey) {
        throw new Error('Invalid password or vault not found');
      }

      currentMasterKey.current = masterKey;
      setState(prev => ({ ...prev, isUnlocked: true, isLoading: false }));

      return { success: true };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'unlock-vault',
        userId
      });
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Invalid password'
      }));
      return { success: false, error: 'Invalid password' };
    }
  }, [userId]);

  // Unlock vault with biometric
  const unlockVaultWithBiometric = useCallback(async (): Promise<{ 
    success: boolean; 
    error?: string 
  }> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const masterKey = await keyManager.current.retrieveVaultMasterKey(
        userId,
        undefined,
        true
      );

      if (!masterKey) {
        throw new Error('Biometric unlock failed');
      }

      currentMasterKey.current = masterKey;
      setState(prev => ({ ...prev, isUnlocked: true, isLoading: false }));

      return { success: true };
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'unlock-vault-biometric',
        userId
      });
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Biometric authentication failed'
      }));
      return { success: false, error: 'Biometric authentication failed' };
    }
  }, [userId]);

  // Lock vault
  const lockVault = useCallback(() => {
    try {
      // Clear master key from memory
      if (currentMasterKey.current) {
        cryptoService.current.memzero(currentMasterKey.current);
        currentMasterKey.current = null;
      }

      // Clear session storage
      keyManager.current.clearSessionKey(userId);

      setState(prev => ({ ...prev, isUnlocked: false }));
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'lock-vault',
        userId
      });
    }
  }, [userId]);

  // Encrypt file
  const encryptFile = useCallback(async (
    file: File,
    fileId: string
  ): Promise<WebVaultEncryptionResult> => {
    if (!currentMasterKey.current) {
      return { success: false, error: 'Vault is locked' };
    }

    try {
      setProgress({
        progress: 0,
        status: 'encrypting',
        currentFile: file.name
      });

      // Derive file-specific key
      const fileKey = cryptoService.current.deriveFileKey(
        currentMasterKey.current,
        fileId
      );

      // Encrypt file
      setProgress(prev => prev ? { ...prev, progress: 50 } : null);
      
      const result = await cryptoService.current.encryptFile(file, fileKey);

      setProgress({
        progress: 100,
        status: 'complete',
        currentFile: file.name
      });

      // Clear file key from memory
      cryptoService.current.memzero(fileKey);

      return {
        success: true,
        encryptedFile: result.encryptedFile,
        metadata: result.metadata as unknown as Record<string, unknown>,
        header: result.header
      };
    } catch (error) {
      setProgress({
        progress: 0,
        status: 'error',
        currentFile: file.name
      });

      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'encrypt-file',
        userId,
        fileName: file.name
      });

      return { success: false, error: 'File encryption failed' };
    }
  }, [userId]);

  // Decrypt file
  const decryptFile = useCallback(async (
    encryptedFile: Uint8Array,
    header: Uint8Array,
    metadata: Record<string, unknown>,
    fileId: string
  ): Promise<WebVaultEncryptionResult> => {
    if (!currentMasterKey.current) {
      return { success: false, error: 'Vault is locked' };
    }

    try {
      setProgress({
        progress: 0,
        status: 'decrypting',
        currentFile: metadata.originalName as string
      });

      // Derive file-specific key
      const fileKey = cryptoService.current.deriveFileKey(
        currentMasterKey.current,
        fileId
      );

      // Decrypt file
      setProgress(prev => prev ? { ...prev, progress: 50 } : null);
      
      const decryptedFile = await cryptoService.current.decryptFile(
        encryptedFile,
        header,
        fileKey,
        metadata as unknown as EncryptedFileMetadata
      );

      setProgress({
        progress: 100,
        status: 'complete',
        currentFile: metadata.originalName as string
      });

      // Clear file key from memory
      cryptoService.current.memzero(fileKey);

      return {
        success: true,
        encryptedFile: decryptedFile
      };
    } catch (error) {
      setProgress({
        progress: 0,
        status: 'error',
        currentFile: metadata.originalName as string
      });

      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'decrypt-file',
        userId,
        fileName: metadata.originalName
      });

      return { success: false, error: 'File decryption failed' };
    }
  }, [userId]);

  // Encrypt multiple files
  const encryptFiles = useCallback(async (
    files: File[],
    fileIds: string[]
  ): Promise<WebVaultEncryptionResult[]> => {
    if (!currentMasterKey.current) {
      return files.map(() => ({ success: false, error: 'Vault is locked' }));
    }

    const results: WebVaultEncryptionResult[] = [];

    try {
      setProgress({
        progress: 0,
        status: 'encrypting',
        totalFiles: files.length,
        processedFiles: 0
      });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileId = fileIds[i];

        setProgress(prev => prev ? {
          ...prev,
          progress: (i / files.length) * 100,
          currentFile: file.name,
          processedFiles: i
        } : null);

        const result = await encryptFile(file, fileId);
        results.push(result);
      }

      setProgress({
        progress: 100,
        status: 'complete',
        totalFiles: files.length,
        processedFiles: files.length
      });

      return results;
    } catch (error) {
      setProgress({
        progress: 0,
        status: 'error',
        totalFiles: files.length,
        processedFiles: results.length
      });

      errorHandler.handleError(error, ErrorSeverity.HIGH, {
        action: 'encrypt-multiple-files',
        userId,
        fileCount: files.length
      });

      // Fill remaining results with errors
      while (results.length < files.length) {
        results.push({ success: false, error: 'Batch encryption failed' });
      }

      return results;
    }
  }, [userId, encryptFile]);

  // Check vault status
  const checkVaultStatus = useCallback(async (): Promise<{
    hasVault: boolean;
    isUnlocked: boolean;
    biometricEnabled: boolean;
  }> => {
    try {
      const hasKeys = await keyManager.current.hasVaultKeys(userId);
      const config = await keyManager.current.retrieveVaultConfiguration(userId);

      return {
        hasVault: hasKeys,
        isUnlocked: state.isUnlocked,
        biometricEnabled: config?.biometricEnabled || false
      };
    } catch {
      return {
        hasVault: false,
        isUnlocked: false,
        biometricEnabled: false
      };
    }
  }, [userId, state.isUnlocked]);

  // Clear progress
  const clearProgress = useCallback(() => {
    setProgress(null);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    ...state,
    progress,

    // Actions
    setupVault,
    unlockVault,
    unlockVaultWithBiometric,
    lockVault,
    encryptFile,
    decryptFile,
    encryptFiles,
    checkVaultStatus,

    // Utilities
    clearProgress,
    clearError
  };
} 