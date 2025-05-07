import { 
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  query,
  where,
  getDocs,
  FieldValue
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// MARK: - Types
export interface FamilyTree {
  adminUserIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp | FieldValue;
  lastUpdatedBy: string;
  memberUserIds: string[];
  createdBy: string;
  treeName: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  parents: string[];
  children: string[];
  spouse?: string;
  birthDate?: string;
  deathDate?: string;
  imageUrl?: string;
  bio?: string;
}

// MARK: - Constants
const FAMILY_TREES_COLLECTION = 'familyTrees';

// MARK: - Helper Functions
const getFamilyTreeRef = (treeId: string) => 
  doc(db, FAMILY_TREES_COLLECTION, treeId);

// MARK: - Main Functions
/**
 * Creates a new family tree for a user
 * @param userId - The ID of the user creating the tree
 * @param treeName - The name of the family tree
 * @returns The ID of the created family tree
 */
export const createFamilyTree = async (userId: string, treeName: string): Promise<string> => {
  try {
    const treeData: Omit<FamilyTree, 'createdAt' | 'updatedAt'> = {
      adminUserIds: [userId],
      lastUpdatedBy: userId,
      memberUserIds: [userId],
      createdBy: userId,
      treeName
    };

    // Create a new document with a generated ID
    const treeRef = doc(collection(db, FAMILY_TREES_COLLECTION));
    
    await setDoc(treeRef, {
      ...treeData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return treeRef.id;
  } catch (error) {
    console.error('Error creating family tree:', error);
    throw error;
  }
};

/**
 * Retrieves a family tree by its ID
 * @param treeId - The ID of the family tree to retrieve
 * @returns The family tree data
 */
export const getFamilyTree = async (treeId: string): Promise<FamilyTree | null> => {
  try {
    const treeRef = getFamilyTreeRef(treeId);
    const treeSnap = await getDoc(treeRef);
    
    if (!treeSnap.exists()) {
      return null;
    }

    return treeSnap.data() as FamilyTree;
  } catch (error) {
    console.error('Error getting family tree:', error);
    throw error;
  }
};

/**
 * Adds a member to a family tree
 * @param treeId - The ID of the family tree
 * @param userId - The ID of the user to add
 * @param isAdmin - Whether the user should be added as an admin
 */
export const addMemberToTree = async (
  treeId: string,
  userId: string,
  currentUserId: string,
  isAdmin: boolean = false
): Promise<void> => {
  try {
    const treeRef = getFamilyTreeRef(treeId);
    const treeData = await getFamilyTree(treeId);

    if (!treeData) {
      throw new Error('Family tree not found');
    }

    // Check if current user is an admin
    if (!treeData.adminUserIds.includes(currentUserId)) {
      throw new Error('Only admins can add members to the tree');
    }

    const updateData: Partial<FamilyTree> = {
      memberUserIds: [...new Set([...treeData.memberUserIds, userId])],
      updatedAt: serverTimestamp(),
      lastUpdatedBy: currentUserId
    };

    if (isAdmin) {
      updateData.adminUserIds = [...new Set([...treeData.adminUserIds, userId])];
    }

    // Remove any undefined values
    Object.keys(updateData).forEach((key) => {
      if (updateData[key as keyof typeof updateData] === undefined) {
        delete updateData[key as keyof typeof updateData];
      }
    });

    await updateDoc(treeRef, updateData);
  } catch (error) {
    console.error('Error adding member to family tree:', error);
    throw error;
  }
};

/**
 * Updates the name of a family tree
 * @param treeId - The ID of the family tree
 * @param newName - The new name for the tree
 * @param currentUserId - The ID of the user making the change
 */
export const updateTreeName = async (
  treeId: string,
  newName: string,
  currentUserId: string
): Promise<void> => {
  try {
    const treeRef = getFamilyTreeRef(treeId);
    const treeData = await getFamilyTree(treeId);

    if (!treeData) {
      throw new Error('Family tree not found');
    }

    // Check if current user is an admin
    if (!treeData.adminUserIds.includes(currentUserId)) {
      throw new Error('Only admins can update the tree name');
    }

    const updateData: Partial<FamilyTree> = {
      treeName: newName,
      updatedAt: serverTimestamp(),
      lastUpdatedBy: currentUserId
    };

    // Remove any undefined values
    Object.keys(updateData).forEach((key) => {
      if (updateData[key as keyof typeof updateData] === undefined) {
        delete updateData[key as keyof typeof updateData];
      }
    });

    await updateDoc(treeRef, updateData);
  } catch (error) {
    console.error('Error updating family tree name:', error);
    throw error;
  }
};

/**
 * Removes a member from a family tree
 * @param treeId - The ID of the family tree
 * @param userId - The ID of the user to remove
 * @param currentUserId - The ID of the user making the change
 */
export const removeMemberFromTree = async (
  treeId: string,
  userId: string,
  currentUserId: string
): Promise<void> => {
  try {
    const treeRef = getFamilyTreeRef(treeId);
    const treeData = await getFamilyTree(treeId);

    if (!treeData) {
      throw new Error('Family tree not found');
    }

    // Check if current user is an admin
    if (!treeData.adminUserIds.includes(currentUserId)) {
      throw new Error('Only admins can remove members from the tree');
    }

    const updateData: Partial<FamilyTree> = {
      memberUserIds: treeData.memberUserIds.filter(id => id !== userId),
      adminUserIds: treeData.adminUserIds.filter(id => id !== userId),
      updatedAt: serverTimestamp(),
      lastUpdatedBy: currentUserId
    };

    // Remove any undefined values
    Object.keys(updateData).forEach((key) => {
      if (updateData[key as keyof typeof updateData] === undefined) {
        delete updateData[key as keyof typeof updateData];
      }
    });

    await updateDoc(treeRef, updateData);
  } catch (error) {
    console.error('Error removing member from family tree:', error);
    throw error;
  }
};

/**
 * Gets the family tree ID for a user
 * @param userId - The ID of the user
 * @returns The ID of the family tree the user belongs to, or null if not found
 */
export const getUserFamilyTreeId = async (userId: string): Promise<string | null> => {
  try {
    // Query to find the family tree that contains the user
    const q = query(
      collection(db, FAMILY_TREES_COLLECTION),
      where('memberUserIds', 'array-contains', userId)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    // Return the first family tree ID found (users should only belong to one tree)
    return snapshot.docs[0].id;
  } catch (error) {
    console.error('Error getting user family tree:', error);
    throw error;
  }
}; 