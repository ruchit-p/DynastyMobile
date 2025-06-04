import type { Node } from 'relatives-tree/lib/types';
import type { Story } from './storyUtils';
import { Timestamp } from 'firebase/firestore';
import { functions } from '@/lib/firebase';
import { FirebaseFunctionsClient, createFirebaseClient } from '@/lib/functions-client';

// Firebase Functions client
let functionsClient: FirebaseFunctionsClient | null = null;

// Initialize the functions client
if (functions) {
  functionsClient = createFirebaseClient(functions);
}

function getFunctionsClient(): FirebaseFunctionsClient {
  if (!functionsClient) {
    throw new Error('Firebase Functions not initialized');
  }
  return functionsClient;
}

// Define the enriched story type
type EnrichedStory = Story & {
  author: {
    id: string;
    displayName: string;
    profilePicture?: string;
  };
  taggedPeople: Array<{
    id: string;
    displayName: string;
  }>;
};

// MARK: - Family Tree Functions

export const getFamilyTreeData = async (userId: string) => {
  const result = await getFunctionsClient().callFunction('getFamilyTreeData', { userId });
  return result.data as { treeNodes: Node[] };
};

export const updateFamilyRelationships = async (
  userId: string,
  updates: {
    addParents?: string[];
    removeParents?: string[];
    addChildren?: string[];
    removeChildren?: string[];
    addSpouses?: string[];
    removeSpouses?: string[];
  }
) => {
  const result = await getFunctionsClient().callFunction('updateFamilyRelationships', { userId, updates });
  return result.data as { success: boolean };
};

// MARK: - Stories Functions

export const getAccessibleStories = async (userId: string, familyTreeId: string) => {
  const result = await getFunctionsClient().callFunction('getAccessibleStories', { userId, familyTreeId });
  return result.data as { stories: EnrichedStory[] };
};

export const getUserStories = async (userId: string) => {
  const result = await getFunctionsClient().callFunction('getUserStories', { userId });
  return result.data as { stories: EnrichedStory[] };
};

export const createStory = async (storyData: {
  authorID: string;
  title: string;
  subtitle?: string;
  eventDate?: Date;
  location?: {
    lat: number;
    lng: number;
    address: string;
  };
  privacy: 'family' | 'privateAccess' | 'custom';
  customAccessMembers?: string[];
  blocks: Array<{
    type: 'text' | 'image' | 'video' | 'audio';
    data: string | string[];
    localId: string;
  }>;
  familyTreeId: string;
  peopleInvolved: string[];
  coverPhoto?: string;
}) => {
  console.log("📞 Creating function reference for createStory");
  
  try {
    console.log("📤 Sending story data to Firebase function", { 
      title: storyData.title,
      blocksCount: storyData.blocks.length,
      hasCoverPhoto: !!storyData.coverPhoto,
      familyTreeId: storyData.familyTreeId
    });
    
    // Add debugger for browser inspection
    debugger;
    
    const result = await getFunctionsClient().callFunction('createStory', storyData);
    console.log("📥 Received response from createStory function", result.data);
    return result.data as { id: string };
  } catch (error) {
    console.error("❌ Error in createStory function call:", error);
    throw error;
  }
};

export const updateStory = async (
  storyId: string,
  userId: string,
  updates: Partial<{
    title: string;
    subtitle: string;
    eventDate: Date;
    location: {
      lat: number;
      lng: number;
      address: string;
    };
    privacy: 'family' | 'privateAccess' | 'custom';
    customAccessMembers: string[];
    blocks: Array<{
      type: 'text' | 'image' | 'video' | 'audio';
      data: string | string[];
      localId: string;
    }>;
    peopleInvolved: string[];
  }>
) => {
  const result = await getFunctionsClient().callFunction('updateStory', { storyId, userId, updates });
  return result.data as { success: boolean; id?: string };
};

export const deleteStory = async (storyId: string, userId: string) => {
  const result = await getFunctionsClient().callFunction('deleteStory', { storyId, userId });
  return result.data as { success: boolean };
};

export const createFamilyMember = async (
  userData: {
    firstName: string;
    lastName: string;
    displayName: string;
    dateOfBirth: Date;
    gender: string;
    status: string;
    phone?: string;
    email?: string;
    familyTreeId: string;
  },
  relationType: 'parent' | 'spouse' | 'child',
  selectedNodeId: string,
  options: {
    connectToChildren?: boolean;
    connectToSpouse?: boolean;
    connectToExistingParent?: boolean;
  }
) => {
  const result = await getFunctionsClient().callFunction('createFamilyMember', { userData, relationType, selectedNodeId, options });
  return result.data as { success: boolean; userId: string };
};

export const deleteFamilyMember = async (
  memberId: string,
  familyTreeId: string,
  currentUserId: string
) => {
  const result = await getFunctionsClient().callFunction('deleteFamilyMember', { memberId, familyTreeId, currentUserId });
  return result.data as { success: boolean };
};

export const updateFamilyMember = async (
  memberId: string,
  updates: {
    firstName: string;
    lastName: string;
    displayName: string;
    gender: string;
    phone?: string;
    email?: string;
  },
  familyTreeId: string
) => {
  const result = await getFunctionsClient().callFunction('updateFamilyMember', { memberId, updates, familyTreeId });
  return result.data as { success: boolean };
};

// MARK: - Family Tree Admin Management

export const promoteToAdmin = async (
  memberId: string,
  familyTreeId: string,
  currentUserId: string
) => {
  const result = await getFunctionsClient().callFunction('promoteToAdmin', { memberId, familyTreeId, currentUserId });
  return result.data as { success: boolean; message?: string };
};

export const demoteToMember = async (
  memberId: string,
  familyTreeId: string,
  currentUserId: string
) => {
  const result = await getFunctionsClient().callFunction('demoteToMember', { memberId, familyTreeId, currentUserId });
  return result.data as { success: boolean; message?: string };
};

/**
 * Fetches the family tree management data including members and their admin status
 * @returns Family tree data and members with admin/owner status
 */
export const getFamilyManagementData = async () => {
  const result = await getFunctionsClient().callFunction('getFamilyManagementData', {});
  return result.data as {
    tree: {
      id: string;
      ownerUserId: string;
      memberUserIds: string[];
      adminUserIds: string[];
      treeName: string;
      createdAt: Timestamp;
    };
    members: Array<{
      id: string;
      displayName: string;
      profilePicture: string | null;
      createdAt: Timestamp;
      isAdmin: boolean;
      isOwner: boolean;
    }>;
  };
};

/**
 * Get events for the feed
 */
export async function getEventsForFeed(userId: string, familyTreeId: string) {
  try {
    console.log('Fetching events for feed with userId:', userId, 'familyTreeId:', familyTreeId);
    
    const result = await getFunctionsClient().callFunction<
      { userId: string; familyTreeId: string },
      { events: unknown[] }
    >('getEventsForFeedApi', { userId, familyTreeId });
    
    if (!result.data || !Array.isArray(result.data.events)) {
      console.error('Invalid events data structure:', result.data);
      return { events: [] };
    }
    
    return { events: result.data.events };
  } catch (error) {
    console.error('Error fetching events for feed:', error);
    // Return empty events array instead of throwing an error
    // This prevents the feed from breaking if event fetching fails
    return { events: [] };
  }
}

/**
 * Update user profile information
 */
export async function updateUserProfile(data: {
  userId: string;
  updates: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string | null;
    gender?: string;
    dateOfBirth?: Date | null;
    profilePicture?: string | null;
  };
}) {
  const result = await getFunctionsClient().callFunction('updateUserProfile', data);
  return result.data;
}

/**
 * Check encryption status for the user
 */
export async function checkEncryptionStatus() {
  const result = await getFunctionsClient().callFunction('checkEncryptionStatus', {});
  return result.data as {
    publicKeyExists: boolean;
    backupExists: boolean;
    lastRotation?: string;
  };
}

/**
 * Upload encryption keys
 */
export async function uploadEncryptionKeys(data: {
  publicKey: string;
}) {
  const result = await getFunctionsClient().callFunction('uploadEncryptionKeys', data);
  return result.data;
}

/**
 * Rotate encryption keys
 */
export async function rotateEncryptionKeys(data: {
  newPublicKey: string;
}) {
  const result = await getFunctionsClient().callFunction('rotateEncryptionKeys', data);
  return result.data;
}

/**
 * Add a family member
 */
export async function addFamilyMember(data: {
  firstName: string;
  lastName: string;
  email?: string;
  dateOfBirth?: string;
  gender?: string;
  phoneNumber?: string;
  relationshipType?: string;
  relationshipTo?: string;
  sendInvite: boolean;
}) {
  const result = await getFunctionsClient().callFunction('addFamilyMember', data);
  return result.data;
}

/**
 * Get family tree members
 */
export async function getFamilyTreeMembers(data: {
  familyTreeId: string;
}) {
  const result = await getFunctionsClient().callFunction('getFamilyTreeMembers', data);
  return result.data as { members: Array<{
    id: string;
    displayName: string;
    email: string;
    profilePicture?: string;
    role: 'owner' | 'admin' | 'member';
    joinedAt: string;
    status: 'active' | 'invited' | 'inactive';
  }> };
}

/**
 * Get pending invitations
 */
export async function getPendingInvitations(data: {
  familyTreeId: string;
}) {
  const result = await getFunctionsClient().callFunction('getPendingInvitations', data);
  return result.data as { invitations: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    invitedBy: string;
    invitedAt: string;
    status: 'pending' | 'accepted' | 'expired';
  }> };
}

/**
 * Send family invitation
 */
export async function sendFamilyInvitation(data: {
  email: string;
  firstName: string;
  lastName: string;
  relationship?: string;
}) {
  const result = await getFunctionsClient().callFunction('sendFamilyInvitation', data);
  return result.data;
}

/**
 * Remove family member
 */
export async function removeFamilyMember(data: {
  memberId: string;
  familyTreeId: string;
}) {
  const result = await getFunctionsClient().callFunction('removeFamilyMember', data);
  return result.data;
}

/**
 * Update family member role
 */
export async function updateFamilyMemberRole(data: {
  memberId: string;
  role: 'admin' | 'member';
  familyTreeId: string;
}) {
  const result = await getFunctionsClient().callFunction('updateFamilyMemberRole', data);
  return result.data;
}

/**
 * Cancel family invitation
 */
export async function cancelFamilyInvitation(data: {
  invitationId: string;
}) {
  const result = await getFunctionsClient().callFunction('cancelFamilyInvitation', data);
  return result.data;
}

/**
 * Get member profile
 */
export async function getMemberProfile(userId: string) {
  const result = await getFunctionsClient().callFunction('getMemberProfile', { userId });
  return result.data as {
    profile: {
      id: string;
      displayName: string;
      firstName: string;
      lastName: string;
      email: string;
      phoneNumber?: string;
      dateOfBirth?: Date;
      gender?: string;
      profilePicture?: string;
      bio?: string;
      location?: string;
      role: 'admin' | 'member';
      canAddMembers: boolean;
      canEdit: boolean;
      joinedAt: Date;
      relationship?: string;
      parentIds: string[];
      childrenIds: string[];
      spouseIds: string[];
      stats: {
        storiesCount: number;
        eventsCount: number;
        photosCount: number;
      };
    };
    relationships: Array<{
      id: string;
      displayName: string;
      profilePicture?: string;
      relationship: string;
    }>;
  };
} 