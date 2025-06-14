/**
 * Centralized Firebase Functions Client
 * Provides singleton access to Firebase Functions client across the application
 */

import { functions } from '@/lib/firebase';
import { FirebaseFunctionsClient, createFirebaseClient } from '@/lib/functions-client';

class FunctionsClientManager {
  private static instance: FunctionsClientManager;
  private functionsClient: FirebaseFunctionsClient | null = null;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    this.initializationPromise = this.initialize();
  }

  static getInstance(): FunctionsClientManager {
    if (!FunctionsClientManager.instance) {
      FunctionsClientManager.instance = new FunctionsClientManager();
    }
    return FunctionsClientManager.instance;
  }

  private async initialize(): Promise<void> {
    try {
      if (functions) {
        this.functionsClient = createFirebaseClient(functions);
        console.log('Firebase Functions client initialized successfully');
      } else {
        console.warn('Firebase Functions not available');
      }
    } catch (error) {
      console.error('Failed to initialize Firebase Functions client:', error);
    }
  }

  async getClient(): Promise<FirebaseFunctionsClient> {
    // Wait for initialization to complete
    await this.initializationPromise;
    
    if (!this.functionsClient) {
      throw new Error('Firebase Functions client not initialized');
    }
    
    return this.functionsClient;
  }

  // Synchronous getter for cases where we know client is initialized
  getClientSync(): FirebaseFunctionsClient {
    if (!this.functionsClient) {
      throw new Error('Firebase Functions client not initialized. Use getClient() for async initialization.');
    }
    return this.functionsClient;
  }

  isInitialized(): boolean {
    return this.functionsClient !== null;
  }
}

// Export singleton instance and convenience functions
const functionsClientManager = FunctionsClientManager.getInstance();

export const getFunctionsClient = (): FirebaseFunctionsClient => {
  return functionsClientManager.getClientSync();
};

export const getFunctionsClientAsync = async (): Promise<FirebaseFunctionsClient> => {
  return functionsClientManager.getClient();
};

export const isFunctionsClientInitialized = (): boolean => {
  return functionsClientManager.isInitialized();
};

export default functionsClientManager;