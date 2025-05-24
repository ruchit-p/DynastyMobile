import { collection, doc, getDoc, getDocs, query, where, FieldPath } from '@react-native-firebase/firestore';
import { getFirebaseDb } from './firebase'; // Corrected import
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';

export interface UserProfile {
  id: string;
  displayName: string;
  profilePictureUrl?: string;
}

/**
 * Fetches user profiles for a given list of user IDs.
 * @param userIds - An array of user IDs.
 * @returns A promise that resolves to an array of UserProfile objects.
 */
export const fetchUserProfilesByIds = async (userIds: string[]): Promise<UserProfile[]> => {
  if (!userIds || userIds.length === 0) {
    return [];
  }

  const db = getFirebaseDb(); // Get Firestore instance

  // Firestore 'in' queries are limited to 30 items per query.
  // If you have more than 30 user IDs, you'll need to batch the requests.
  const MAX_IDS_PER_QUERY = 30;
  const userProfiles: UserProfile[] = [];
  const batchedUserIds: string[][] = [];

  for (let i = 0; i < userIds.length; i += MAX_IDS_PER_QUERY) {
    batchedUserIds.push(userIds.slice(i, i + MAX_IDS_PER_QUERY));
  }

  try {
    for (const batch of batchedUserIds) {
      if (batch.length > 0) {
        const usersCollectionRef = collection(db, 'users');
        const q = query(usersCollectionRef, where(FieldPath.documentId(), 'in', batch));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            userProfiles.push({
              id: docSnap.id,
              displayName: data.displayName || 'Unknown User', // Fallback for missing displayName
              profilePictureUrl: data.profilePictureUrl || undefined,
            });
          } else {
            console.warn(`No document found for user ID: ${docSnap.id} (this should not happen with 'in' query if ID was in chunk)`);
          }
        });
      }
    }
    return userProfiles;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'User Profiles Error',
      metadata: {
        action: 'fetchUserProfilesByIds',
        userIdCount: userIds.length,
        batchCount: batchedUserIds.length
      },
      showAlert: false // Don't show alert for background data fetching
    });
    // Depending on requirements, you might want to throw the error or return an empty array / partial data
    return []; 
  }
};

/**
 * Fetches a single user profile by ID.
 * @param userId - The ID of the user.
 * @returns A promise that resolves to a UserProfile object or null if not found.
 */
export const fetchUserProfileById = async (userId: string): Promise<UserProfile | null> => {
  if (!userId) {
    console.log("fetchUserProfileById: No userId provided");
    return null;
  }
  const db = getFirebaseDb(); // Get Firestore instance
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      return {
        id: userDocSnap.id,
        displayName: data.displayName || 'Unknown User',
        profilePictureUrl: data.profilePictureUrl || undefined,
      };
    } else {
      console.warn(`No user found with ID: ${userId}`);
      return null;
    }
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.WARNING,
      title: 'User Profile Error',
      metadata: {
        action: 'fetchUserProfileById',
        userId
      },
      showAlert: false
    });
    return null;
  }
}; 