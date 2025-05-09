import functions from '@react-native-firebase/functions';

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
};

// Initialize Firebase Functions
// const functionsInstance = getFunctions(firebaseApp, 'us-central1'); // Ensure 'us-central1' is your functions region
// React Native Firebase functions are typically accessed via functions() or functions('region')

// MARK: - Family Tree Functions

export const getFamilyTreeDataMobile = async (userId: string): Promise<{ treeNodes: FamilyTreeNode[] }> => {
  // const functionRef = httpsCallable(functionsInstance, 'getFamilyTreeData');
  const functionRef = functions().httpsCallable('getFamilyTreeData');
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
  // const functionRef = httpsCallable(functionsInstance, 'createFamilyMember');
  const functionRef = functions().httpsCallable('createFamilyMember');
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
