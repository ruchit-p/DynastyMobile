import NativeLibsignal from '../specs/NativeLibsignal';
import { logger } from './LoggingService';
import firestore from '@react-native-firebase/firestore';
import { getFirebaseAuth } from '../lib/firebase';

export interface SafetyNumberData {
  numberString: string;
  qrCodeData: string;
}

export interface VerificationStatus {
  userId: string;
  verified: boolean;
  verifiedAt?: Date;
  identityKey?: string;
}

/**
 * Service for handling Signal Protocol safety numbers and verification
 */
export class SafetyNumberService {
  private static instance: SafetyNumberService;
  private db = firestore();
  private verificationCache = new Map<string, VerificationStatus>();

  private constructor() {}

  static getInstance(): SafetyNumberService {
    if (!SafetyNumberService.instance) {
      SafetyNumberService.instance = new SafetyNumberService();
    }
    return SafetyNumberService.instance;
  }

  /**
   * Generate safety number for a conversation
   */
  async generateSafetyNumber(
    remoteUserId: string,
    remoteUserName: string
  ): Promise<SafetyNumberData> {
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Get local user's identity key
      const localIdentity = await NativeLibsignal.getIdentityKeyPair();
      if (!localIdentity) {
        throw new Error('Local identity not found');
      }

      // Get remote user's identity key from Firebase
      const remoteUserDoc = await this.db
        .collection('users')
        .doc(remoteUserId)
        .get();

      if (!remoteUserDoc.exists) {
        throw new Error('Remote user not found');
      }

      const remoteUserData = remoteUserDoc.data();
      const remoteDevice = remoteUserData?.signalDevices?.[0]; // Get primary device
      
      if (!remoteDevice?.identityKey) {
        throw new Error('Remote user has no Signal identity');
      }

      // Generate safety number using native module
      const safetyNumber = await NativeLibsignal.generateSafetyNumber(
        localIdentity.publicKey,
        remoteDevice.identityKey,
        currentUser.displayName || currentUser.email || 'You',
        remoteUserName
      );

      logger.info(`Generated safety number for conversation with ${remoteUserName}`);

      return safetyNumber;
    } catch (error) {
      logger.error('Failed to generate safety number:', error);
      throw error;
    }
  }

  /**
   * Verify a scanned QR code
   */
  async verifySafetyNumber(
    remoteUserId: string,
    remoteUserName: string,
    scannedData: string
  ): Promise<boolean> {
    try {
      // Generate the expected safety number
      const expectedSafetyNumber = await this.generateSafetyNumber(
        remoteUserId,
        remoteUserName
      );

      // Compare with scanned data
      const isValid = expectedSafetyNumber.qrCodeData === scannedData;

      if (isValid) {
        // Store verification status
        await this.markUserAsVerified(remoteUserId, true);
      }

      return isValid;
    } catch (error) {
      logger.error('Failed to verify safety number:', error);
      throw error;
    }
  }

  /**
   * Mark a user as verified or unverified
   */
  async markUserAsVerified(
    userId: string,
    verified: boolean
  ): Promise<void> {
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Update verification status in Firebase
      const verificationRef = this.db
        .collection('users')
        .doc(currentUser.uid)
        .collection('verifiedContacts')
        .doc(userId);

      const status: VerificationStatus = {
        userId,
        verified,
        verifiedAt: verified ? new Date() : undefined,
      };

      await verificationRef.set(status, { merge: true });

      // Update cache
      this.verificationCache.set(userId, status);

      logger.info(`Marked user ${userId} as ${verified ? 'verified' : 'unverified'}`);
    } catch (error) {
      logger.error('Failed to mark user as verified:', error);
      throw error;
    }
  }

  /**
   * Get verification status for a user
   */
  async getVerificationStatus(userId: string): Promise<VerificationStatus | null> {
    try {
      // Check cache first
      if (this.verificationCache.has(userId)) {
        return this.verificationCache.get(userId)!;
      }

      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return null;
      }

      // Fetch from Firebase
      const verificationDoc = await this.db
        .collection('users')
        .doc(currentUser.uid)
        .collection('verifiedContacts')
        .doc(userId)
        .get();

      if (!verificationDoc.exists) {
        return null;
      }

      const status = verificationDoc.data() as VerificationStatus;
      
      // Update cache
      this.verificationCache.set(userId, status);

      return status;
    } catch (error) {
      logger.error('Failed to get verification status:', error);
      return null;
    }
  }

  /**
   * Check if identity key has changed for a user
   */
  async checkIdentityKeyChange(
    userId: string,
    newIdentityKey: string
  ): Promise<boolean> {
    try {
      const verificationStatus = await this.getVerificationStatus(userId);
      
      if (!verificationStatus?.identityKey) {
        // First time seeing this user's key
        return false;
      }

      // Check if key has changed
      const hasChanged = verificationStatus.identityKey !== newIdentityKey;

      if (hasChanged) {
        // Mark as unverified if key changed
        await this.markUserAsVerified(userId, false);
        logger.warn(`Identity key changed for user ${userId}`);
      }

      return hasChanged;
    } catch (error) {
      logger.error('Failed to check identity key change:', error);
      return false;
    }
  }

  /**
   * Get all verified contacts
   */
  async getVerifiedContacts(): Promise<VerificationStatus[]> {
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return [];
      }

      const snapshot = await this.db
        .collection('users')
        .doc(currentUser.uid)
        .collection('verifiedContacts')
        .where('verified', '==', true)
        .get();

      const verifiedContacts: VerificationStatus[] = [];
      
      snapshot.forEach((doc) => {
        const status = doc.data() as VerificationStatus;
        verifiedContacts.push(status);
        
        // Update cache
        this.verificationCache.set(status.userId, status);
      });

      return verifiedContacts;
    } catch (error) {
      logger.error('Failed to get verified contacts:', error);
      return [];
    }
  }

  /**
   * Clear verification cache
   */
  clearCache(): void {
    this.verificationCache.clear();
  }
}