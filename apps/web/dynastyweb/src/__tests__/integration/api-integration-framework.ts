/**
 * API Integration Test Framework
 * 
 * This framework provides utilities for testing real communication between
 * the web frontend and Firebase backend using Firebase emulators.
 * 
 * Features:
 * - Firebase emulator setup and teardown
 * - Real Firebase function calls (no mocks)
 * - Test data seeding and cleanup
 * - Authentication helpers
 * - Firestore data verification
 */

import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, Auth, User } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, collection, addDoc, deleteDoc, query, where, getDocs, Firestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable, Functions } from 'firebase/functions';
import { FirebaseFunctionsClient, createFirebaseClient } from '@/lib/functions-client';

// Test Firebase configuration for emulators
const testFirebaseConfig = {
  apiKey: 'fake-api-key',
  authDomain: 'dynasty-eba63.firebaseapp.com',
  projectId: 'dynasty-eba63',
  storageBucket: 'dynasty-eba63.appspot.com',
  messagingSenderId: '123456789',
  appId: 'fake-app-id',
};

// Emulator configuration
const EMULATOR_CONFIG = {
  auth: {
    host: 'localhost',
    port: 9099,
  },
  firestore: {
    host: 'localhost',
    port: 8080,
  },
  functions: {
    host: 'localhost',
    port: 5001,
  },
};

export interface TestUser {
  uid: string;
  email: string;
  password: string;
  firestoreData?: Record<string, any>;
}

export interface IntegrationTestContext {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  functionsClient: FirebaseFunctionsClient;
  currentUser: User | null;
  cleanup: () => Promise<void>;
}

/**
 * Sets up Firebase emulators for integration testing
 */
export async function setupFirebaseEmulators(): Promise<IntegrationTestContext> {
  // Clean up any existing apps
  const existingApps = getApps();
  await Promise.all(existingApps.map(app => deleteApp(app)));

  // Initialize Firebase app for testing
  const app = initializeApp(testFirebaseConfig, 'integration-test');
  
  // Initialize services
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'us-central1');
  
  // Connect to emulators
  try {
    connectFirestoreEmulator(db, EMULATOR_CONFIG.firestore.host, EMULATOR_CONFIG.firestore.port);
  } catch (error) {
    // Emulator might already be connected
    console.log('Firestore emulator connection failed or already connected:', error);
  }
  
  try {
    connectFunctionsEmulator(functions, EMULATOR_CONFIG.functions.host, EMULATOR_CONFIG.functions.port);
  } catch (error) {
    console.log('Functions emulator connection failed or already connected:', error);
  }

  // Create functions client
  const functionsClient = createFirebaseClient(functions);

  // Create cleanup function
  const cleanup = async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
      await deleteApp(app);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  };

  return {
    app,
    auth,
    db,
    functions,
    functionsClient,
    currentUser: null,
    cleanup,
  };
}

/**
 * Creates a test user in Firebase Auth and optionally in Firestore
 */
export async function createTestUser(
  context: IntegrationTestContext,
  userData: {
    email: string;
    password: string;
    firestoreData?: Record<string, any>;
  }
): Promise<TestUser> {
  const { auth, db } = context;

  // Create user in Firebase Auth
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    userData.email,
    userData.password
  );

  const uid = userCredential.user.uid;

  // Create user document in Firestore if data provided
  if (userData.firestoreData) {
    const userDoc = {
      id: uid,
      email: userData.email,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...userData.firestoreData,
    };

    await setDoc(doc(db, 'users', uid), userDoc);
  }

  return {
    uid,
    email: userData.email,
    password: userData.password,
    firestoreData: userData.firestoreData,
  };
}

/**
 * Signs in a test user
 */
export async function signInTestUser(
  context: IntegrationTestContext,
  email: string,
  password: string
): Promise<User> {
  const { auth } = context;
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  context.currentUser = userCredential.user;
  return userCredential.user;
}

/**
 * Signs out the current user
 */
export async function signOutTestUser(context: IntegrationTestContext): Promise<void> {
  const { auth } = context;
  await signOut(auth);
  context.currentUser = null;
}

/**
 * Seeds test data in Firestore
 */
export async function seedTestData(
  context: IntegrationTestContext,
  data: {
    collection: string;
    documents: Array<{ id?: string; data: Record<string, any> }>;
  }[]
): Promise<Record<string, string[]>> {
  const { db } = context;
  const createdDocs: Record<string, string[]> = {};

  for (const { collection: collectionName, documents } of data) {
    createdDocs[collectionName] = [];
    
    for (const { id, data: docData } of documents) {
      if (id) {
        await setDoc(doc(db, collectionName, id), {
          ...docData,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        createdDocs[collectionName].push(id);
      } else {
        const docRef = await addDoc(collection(db, collectionName), {
          ...docData,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        createdDocs[collectionName].push(docRef.id);
      }
    }
  }

  return createdDocs;
}

/**
 * Cleans up test data from Firestore
 */
export async function cleanupTestData(
  context: IntegrationTestContext,
  createdDocs: Record<string, string[]>
): Promise<void> {
  const { db } = context;

  for (const [collectionName, docIds] of Object.entries(createdDocs)) {
    for (const docId of docIds) {
      try {
        await deleteDoc(doc(db, collectionName, docId));
      } catch (error) {
        console.error(`Failed to delete doc ${docId} from ${collectionName}:`, error);
      }
    }
  }
}

/**
 * Verifies data exists in Firestore
 */
export async function verifyFirestoreData(
  context: IntegrationTestContext,
  collection: string,
  docId: string,
  expectedData: Partial<Record<string, any>>
): Promise<boolean> {
  const { db } = context;
  
  const docRef = doc(db, collection, docId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return false;
  }

  const data = docSnap.data();
  
  // Check if all expected fields match
  for (const [key, expectedValue] of Object.entries(expectedData)) {
    if (data[key] !== expectedValue) {
      console.error(`Field ${key} mismatch. Expected: ${expectedValue}, Got: ${data[key]}`);
      return false;
    }
  }

  return true;
}

/**
 * Calls a Firebase function and returns the result
 */
export async function callFirebaseFunction<TData = unknown, TResult = unknown>(
  context: IntegrationTestContext,
  functionName: string,
  data: TData
): Promise<TResult> {
  const { functionsClient } = context;
  return await functionsClient.createTypedFunction<TData, TResult>(functionName)(data);
}

/**
 * Waits for authentication state to be ready
 */
export async function waitForAuthReady(context: IntegrationTestContext, timeoutMs = 5000): Promise<void> {
  const { auth } = context;
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Auth state timeout'));
    }, timeoutMs);

    const unsubscribe = auth.onAuthStateChanged((user) => {
      clearTimeout(timeout);
      unsubscribe();
      context.currentUser = user;
      resolve();
    });
  });
}

/**
 * Helper to run queries on Firestore
 */
export async function queryFirestore(
  context: IntegrationTestContext,
  collectionName: string,
  field: string,
  operator: any,
  value: any
): Promise<any[]> {
  const { db } = context;
  
  const q = query(collection(db, collectionName), where(field, operator, value));
  const querySnapshot = await getDocs(q);
  
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Creates a complete integration test suite setup
 */
export function createIntegrationTestSuite() {
  let testContext: IntegrationTestContext;

  beforeAll(async () => {
    testContext = await setupFirebaseEmulators();
    await waitForAuthReady(testContext);
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    if (testContext) {
      await testContext.cleanup();
    }
  }, 10000); // 10 second timeout for cleanup

  beforeEach(async () => {
    // Sign out any existing user
    if (testContext.currentUser) {
      await signOutTestUser(testContext);
    }
  });

  return {
    getContext: () => testContext,
    createUser: (userData: { email: string; password: string; firestoreData?: Record<string, any> }) =>
      createTestUser(testContext, userData),
    signIn: (email: string, password: string) => signInTestUser(testContext, email, password),
    signOut: () => signOutTestUser(testContext),
    seedData: (data: { collection: string; documents: Array<{ id?: string; data: Record<string, any> }> }[]) =>
      seedTestData(testContext, data),
    cleanupData: (createdDocs: Record<string, string[]>) => cleanupTestData(testContext, createdDocs),
    verifyData: (collection: string, docId: string, expectedData: Partial<Record<string, any>>) =>
      verifyFirestoreData(testContext, collection, docId, expectedData),
    callFunction: <TData = unknown, TResult = unknown>(functionName: string, data: TData) =>
      callFirebaseFunction<TData, TResult>(testContext, functionName, data),
    query: (collectionName: string, field: string, operator: any, value: any) =>
      queryFirestore(testContext, collectionName, field, operator, value),
  };
}

/**
 * Common test user data
 */
export const TEST_USERS = {
  admin: {
    email: 'admin@test.com',
    password: 'TestPass123!',
    firestoreData: {
      displayName: 'Test Admin',
      firstName: 'Test',
      lastName: 'Admin',
      isAdmin: true,
      canAddMembers: true,
      canEdit: true,
      isPendingSignUp: false,
      emailVerified: true,
      dateOfBirth: new Date('1990-01-01'),
      gender: 'prefer-not-to-say',
      parentIds: [],
      childrenIds: [],
      spouseIds: [],
      dataRetentionPeriod: 'forever' as const,
    },
  },
  regular: {
    email: 'user@test.com',
    password: 'TestPass123!',
    firestoreData: {
      displayName: 'Test User',
      firstName: 'Test',
      lastName: 'User',
      isAdmin: false,
      canAddMembers: false,
      canEdit: false,
      isPendingSignUp: false,
      emailVerified: true,
      dateOfBirth: new Date('1995-06-15'),
      gender: 'prefer-not-to-say',
      parentIds: [],
      childrenIds: [],
      spouseIds: [],
      dataRetentionPeriod: 'year' as const,
    },
  },
  pending: {
    email: 'pending@test.com',
    password: 'TestPass123!',
    firestoreData: {
      displayName: 'Pending User',
      firstName: 'Pending',
      lastName: 'User',
      isAdmin: false,
      canAddMembers: false,
      canEdit: false,
      isPendingSignUp: true,
      emailVerified: false,
      dateOfBirth: new Date('1988-03-20'),
      gender: 'prefer-not-to-say',
      parentIds: [],
      childrenIds: [],
      spouseIds: [],
      dataRetentionPeriod: 'month' as const,
    },
  },
};