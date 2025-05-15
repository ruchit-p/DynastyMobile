import { getFirebaseFunctions } from './firebase';
import { httpsCallable } from '@react-native-firebase/functions';

import { type RelativeItem as MobileRelativeItemType } from '../../react-native-relatives-tree/src'; // Adjusted path

// Re-define or import the Items type used in FamilyTreeScreen.tsx
// This ensures consistency. For now, I'll define a structure based on what FamilyTreeScreen uses.
export type FamilyTreeNode = MobileRelativeItemType & {
  id: string;
  name: string;
  spouse?: FamilyTreeNode;
  dob: string;
  dod?: string;
  avatar?: string;
  // Ensure this matches the structure returned by your Cloud Function and used by react-native-relatives-tree
  children?: FamilyTreeNode[]; 
  gender?: 'male' | 'female' | 'other';
  parents?: Array<{ id: string; type: string }>;
  siblings?: Array<{ id: string; type: string }>;
  spouses?: Array<{ id: string; type: string }>;
  attributes?: {
    displayName: string;
    profilePicture?: string;
    familyTreeId: string;
    isBloodRelated: boolean;
    status?: string;
    treeOwnerId?: string;
    email?: string;
    phoneNumber?: string;
  };
};

// For the profile view screen
export type MemberProfile = {
  id: string;
  name: string;
  avatar?: string;
  email?: string;
  phone?: string;
  bio?: string;
  [key: string]: any; // For any additional fields
};

// Initialize Firebase Functions
// const functionsInstance = getFunctions(firebaseApp, 'us-central1'); // Ensure 'us-central1' is your functions region
// React Native Firebase functions are typically accessed via functions() or functions('region')

// MARK: - Family Tree Functions

export const getFamilyTreeDataMobile = async (userId: string): Promise<{ treeNodes: FamilyTreeNode[] }> => {
  const functionsInstance = getFirebaseFunctions(); // Get the instance
  const functionRef = httpsCallable(functionsInstance, 'getFamilyTreeData');
  try {
    const result = await functionRef({ userId });
    // Ensure the data from the cloud function matches FamilyTreeNode[]
    // Add any necessary mapping here if the structures differ.
    return result.data as { treeNodes: FamilyTreeNode[] };
  } catch (error) {
    console.error("Error fetching family tree data:", error);
    throw error; // Rethrow or handle as appropriate for your app
  }
};

// Function to get a single member's profile data
export const getMemberProfileDataMobile = async (memberId: string): Promise<MemberProfile> => {
  try {
    // First fetch the family tree data which contains all members
    const { treeNodes } = await getFamilyTreeDataMobile(memberId);
    
    // First try to find the member by the exact ID
    let memberNode = treeNodes.find(node => node.id === memberId);
    
    // If member not found (might happen if memberId is not the tree owner), search through all nodes
    if (!memberNode) {
      for (const node of treeNodes) {
        const foundMember = findMemberInSubtree(node, memberId);
        if (foundMember) {
          memberNode = foundMember;
          break;
        }
      }
    }
    
    if (!memberNode) {
      throw new Error(`Member with ID ${memberId} not found`);
    }
    
    // Map the node data to the profile format expected by the UI
    return {
      id: memberNode.id,
      name: memberNode.attributes?.displayName || memberNode.name || '',
      avatar: memberNode.attributes?.profilePicture || memberNode.avatar,
      email: memberNode.attributes?.email || '',
      phone: memberNode.attributes?.phoneNumber || '',
      // Add any other fields you want to expose
    };
  } catch (error) {
    console.error("Error fetching member profile data:", error);
    throw error;
  }
};

// Helper function to find a member in a subtree
const findMemberInSubtree = (
  node: FamilyTreeNode,
  memberId: string,
  visited: Set<string> = new Set()
): FamilyTreeNode | null => {
  // Prevent infinite recursion by tracking visited nodes
  if (visited.has(node.id)) {
    return null;
  }

  visited.add(node.id);

  if (node.id === memberId) {
    return node;
  }

  // Check spouse
  if (node.spouse && node.spouse.id === memberId) {
    return node.spouse;
  }

  // Check children recursively
  if (node.children) {
    for (const child of node.children) {
      // Skip already visited nodes
      if (visited.has(child.id)) continue;

      const foundInChild = findMemberInSubtree(child, memberId, visited);
      if (foundInChild) {
        return foundInChild;
      }
    }
  }

  return null;
};

// Function to update a member's profile data
export const updateMemberProfileDataMobile = async (memberId: string, profileData: Partial<MemberProfile>): Promise<{ success: boolean }> => {
  const functionRef = httpsCallable(functionsInstance, 'updateUserProfile');
  try {
    // Map client-side 'phone' to server-side 'phoneNumber'
    const { phone, ...restOfProfileData } = profileData;
    const updatesPayload: { [key: string]: any } = { ...restOfProfileData };
    if (phone !== undefined) {
      updatesPayload.phoneNumber = phone;
    }

    const result = await functionRef({ userId: memberId, updates: updatesPayload });
    return result.data as { success: boolean };
  } catch (error) {
    console.error("Error updating member profile data:", error);
    throw error;
  }
};

export const createFamilyMemberMobile = async (
  userData: {
    firstName: string;
    lastName: string;
    displayName: string;
    dateOfBirth: Date; // Or string, depending on what your form and function expect
    gender: string;
    status: string; // e.g., 'Living', 'Deceased'
    phone?: string;
    email?: string;
    familyTreeId: string; // This likely comes from the current user's context
    // Add any other fields your createFamilyMember cloud function expects for a new user
    profilePictureUrl?: string; 
  },
  relationType: 'parent' | 'spouse' | 'child',
  selectedNodeId: string,
  // Options might be needed based on web's createFamilyMember
  // Check apps/firebase/functions/src/... to see what options the actual cloud function takes
  options?: { 
    connectToChildren?: boolean;
    connectToSpouse?: boolean;
    connectToExistingParent?: boolean;
  }
): Promise<{ success: boolean; userId: string }> => {
  const functionsInstance = getFirebaseFunctions(); // Get the instance
  const functionRef = httpsCallable(functionsInstance, 'createFamilyMember');
  try {
    const result = await functionRef({ 
      userData, 
      relationType, 
      selectedNodeId, 
      options // Pass options if your function uses them
    });
    return result.data as { success: boolean; userId: string };
  } catch (error) {
    console.error(`Error creating family member (type: ${relationType}):`, error);
    throw error;
  }
};

// MARK: - Additional helper functions for family tree

export const updateFamilyRelationshipsMobile = async (
  userId: string,
  updates: {
    addParents?: string[];
    removeParents?: string[];
    addChildren?: string[];
    removeChildren?: string[];
    addSpouses?: string[];
    removeSpouses?: string[];
  }
): Promise<{ success: boolean }> => {
  const functionsInstance = getFirebaseFunctions(); // Get the instance
  const functionRef = httpsCallable(functionsInstance, 'updateFamilyRelationships');
  try {
    const result = await functionRef({ userId, updates });
    return result.data as { success: boolean };
  } catch (error) {
    console.error("Error updating family relationships:", error);
    throw error;
  }
};

export const deleteFamilyMemberMobile = async (
  memberId: string,
  familyTreeId: string,
  currentUserId: string
): Promise<{ success: boolean }> => {
  const functionsInstance = getFirebaseFunctions(); // Get the instance
  const functionRef = httpsCallable(functionsInstance, 'deleteFamilyMember');
  try {
    const result = await functionRef({ memberId, familyTreeId, currentUserId });
    return result.data as { success: boolean };
  } catch (error) {
    console.error("Error deleting family member:", error);
    throw error;
  }
};

// MARK: - Vault Types (already defined, ensure it matches)
export interface VaultItem {
  id: string;
  // userId is usually implicit by function security rules, not stored directly in what client gets for list
  name: string;
  type: "folder" | "file";
  parentId: string | null;
  path: string; // Logical path in vault, not GCS path
  createdAt: { seconds: number; nanoseconds: number }; // Or string, or Date, depending on transform
  updatedAt: { seconds: number; nanoseconds: number }; // Or string, or Date
  fileType?: "image" | "video" | "audio" | "document" | "other";
  size?: number;
  // storagePath is an implementation detail for the backend, not usually sent to client for listing
  downloadURL?: string; // This is what the client uses to display/download
  mimeType?: string;
  // isDeleted items are filtered out by the function
}

// MARK: - Vault Functions (Mobile Client)

/**
 * Get a signed URL for uploading a file to the vault.
 */
export const getUploadSignedUrlMobile = async (
  fileName: string,
  mimeType: string,
  parentId: string | null
): Promise<{ signedUrl: string; storagePath: string; parentPathInVault: string }> => {
  const functionRef = httpsCallable(functionsInstance, 'getVaultUploadSignedUrl');
  try {
    const result = await functionRef({ fileName, mimeType, parentId });
    return result.data as { signedUrl: string; storagePath: string; parentPathInVault: string };
  } catch (error) {
    console.error("Error getting upload signed URL:", error);
    throw error;
  }
};

/**
 * Fetch vault items for a user and optional parent folder
 */
export const getVaultItemsMobile = async (
  parentId: string | null
): Promise<{ items: VaultItem[] }> => {
  const functionRef = httpsCallable(functionsInstance, 'getVaultItems');
  try {
    const result = await functionRef({ parentId });
    return result.data as { items: VaultItem[] };
  } catch (error) {
    console.error("Error fetching vault items:", error);
    throw error;
  }
};

/**
 * Create a new folder in the vault
 */
export const createVaultFolderMobile = async (
  name: string,
  parentId: string | null
): Promise<{ id: string }> => {
  const functionRef = httpsCallable(functionsInstance, 'createVaultFolder');
  try {
    const result = await functionRef({ name, parentId });
    return result.data as { id: string };
  } catch (error) {
    console.error("Error creating vault folder:", error);
    throw error;
  }
};

/**
 * Add a new file entry to the vault (metadata only).
 * This is called AFTER the file has been uploaded to storage via a signed URL.
 */
export const addVaultFileMobile = async (
  payload: {
    name: string;
    parentId: string | null;
    storagePath: string; // Path in GCS where the file was uploaded
    fileType: "image" | "video" | "audio" | "document" | "other";
    size: number;
    mimeType: string;
  }
): Promise<{ id: string; downloadURL: string }> => { // Expect downloadURL back from function
  const functionRef = httpsCallable(functionsInstance, 'addVaultFile');
  try {
    const result = await functionRef(payload);
    return result.data as { id: string; downloadURL: string };
  } catch (error) {
    console.error("Error adding vault file metadata:", error);
    throw error;
  }
};

/**
 * Rename an existing vault item
 */
export const renameVaultItemMobile = async (
  itemId: string,
  newName: string
): Promise<{ success: boolean }> => {
  const functionRef = httpsCallable(functionsInstance, 'renameVaultItem');
  try {
    const result = await functionRef({ itemId, newName });
    return result.data as { success: boolean };
  } catch (error) {
    console.error("Error renaming vault item:", error);
    throw error;
  }
};

/**
 * Move a vault item to a new parent folder
 */
export const moveVaultItemMobile = async (
  itemId: string,
  newParentId: string | null
): Promise<{ success: boolean }> => {
  const functionRef = httpsCallable(functionsInstance, 'moveVaultItem');
  try {
    const result = await functionRef({ itemId, newParentId });
    return result.data as { success: boolean };
  } catch (error) {
    console.error("Error moving vault item:", error);
    throw error;
  }
};

/**
 * Delete a vault item (and children if folder)
 */
export const deleteVaultItemMobile = async (
  itemId: string
): Promise<{ success: boolean }> => {
  const functionRef = httpsCallable(functionsInstance, 'deleteVaultItem');
  try {
    const result = await functionRef({ itemId });
    return result.data as { success: boolean };
  } catch (error) {
    console.error("Error deleting vault item:", error);
    throw error;
  }
};
