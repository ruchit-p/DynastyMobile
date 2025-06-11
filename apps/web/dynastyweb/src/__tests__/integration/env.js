/**
 * Environment Setup for Integration Tests
 * 
 * Sets up environment variables required for integration testing.
 */

// Set test type
process.env.TEST_TYPE = 'integration';

// Firebase Emulator Configuration
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
process.env.FUNCTIONS_EMULATOR = 'true';

// Firebase Configuration for Testing
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'dynasty-eba63';
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'fake-api-key';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'dynasty-eba63.firebaseapp.com';
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'dynasty-eba63.appspot.com';
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '123456789';
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = 'fake-app-id';

// Disable analytics and other external services
process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = '';
process.env.NODE_ENV = 'test';

console.log('🔧 Integration test environment variables configured');