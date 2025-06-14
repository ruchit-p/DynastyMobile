import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';

let app: App;

/**
 * Initialize Firebase Admin SDK for server-side operations
 * This should only be used in API routes and server components
 */
function initializeFirebaseAdmin(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  try {
    // Use environment variables for Firebase Admin configuration
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    
    if (!projectId) {
      throw new Error('Firebase project ID not found in environment variables');
    }

    // Initialize with application default credentials in production
    // In development, this will use gcloud auth or service account key
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      // If service account key is provided as JSON string
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId,
      });
    } else {
      // Use application default credentials (for Google Cloud environments)
      app = initializeApp({
        projectId,
      });
    }

    logger.info('Firebase Admin SDK initialized successfully');
    return app;
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK:', error);
    throw error;
  }
}

// Initialize on module load
const adminApp = initializeFirebaseAdmin();

// Export initialized services
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

/**
 * Verify ID token and check if user is admin
 * @param idToken Firebase ID token from client
 * @returns User data with admin status
 */
export async function verifyAdminUser(idToken: string): Promise<{
  uid: string;
  email: string | undefined;
  isAdmin: boolean;
}> {
  try {
    // Verify the ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const { uid } = decodedToken;

    // Fetch user document to check admin status
    const userDoc = await adminDb.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      throw new Error('User document not found');
    }

    const userData = userDoc.data();
    const isAdmin = userData?.isAdmin === true;

    return {
      uid,
      email: decodedToken.email,
      isAdmin,
    };
  } catch (error) {
    logger.error('Error verifying admin user:', error);
    throw error;
  }
}

/**
 * Middleware helper to extract and verify Firebase ID token from request
 * @param authHeader Authorization header value
 * @returns Verified user data
 */
export async function verifyAuthHeader(authHeader: string | null): Promise<{
  uid: string;
  email: string | undefined;
  isAdmin: boolean;
} | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    return await verifyAdminUser(idToken);
  } catch (error) {
    logger.error('Error verifying auth header:', error);
    return null;
  }
}