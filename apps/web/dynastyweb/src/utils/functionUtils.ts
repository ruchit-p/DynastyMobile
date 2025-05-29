import type { Node } from 'relatives-tree/lib/types';
import type { Story } from './storyUtils';
import { Timestamp } from 'firebase/firestore';
import { CSRFProtectedClient } from '@/lib/csrf-client';

// CSRF client for API calls
let csrfClient: CSRFProtectedClient | null = null;

export function setFunctionUtilsCSRFClient(client: CSRFProtectedClient) {
  csrfClient = client;
}

function getCSRFClient(): CSRFProtectedClient {
  if (!csrfClient) {
    throw new Error('CSRF client not initialized for functionUtils. Please ensure CSRFProvider is set up.');
  }
  return csrfClient;
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
  const result = await getCSRFClient().callFunction('getFamilyTreeData', { userId });
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
  const result = await getCSRFClient().callFunction('updateFamilyRelationships', { userId, updates });
  return result.data as { success: boolean };
};

// MARK: - Stories Functions

export const getAccessibleStories = async (userId: string, familyTreeId: string) => {
  const result = await getCSRFClient().callFunction('getAccessibleStories', { userId, familyTreeId });
  return result.data as { stories: EnrichedStory[] };
};

export const getUserStories = async (userId: string) => {
  const result = await getCSRFClient().callFunction('getUserStories', { userId });
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
    
    const result = await getCSRFClient().callFunction('createStory', storyData);
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
  const result = await getCSRFClient().callFunction('updateStory', { storyId, userId, updates });
  return result.data as { success: boolean; id?: string };
};

export const deleteStory = async (storyId: string, userId: string) => {
  const result = await getCSRFClient().callFunction('deleteStory', { storyId, userId });
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
  const result = await getCSRFClient().callFunction('createFamilyMember', { userData, relationType, selectedNodeId, options });
  return result.data as { success: boolean; userId: string };
};

export const deleteFamilyMember = async (
  memberId: string,
  familyTreeId: string,
  currentUserId: string
) => {
  const result = await getCSRFClient().callFunction('deleteFamilyMember', { memberId, familyTreeId, currentUserId });
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
  const result = await getCSRFClient().callFunction('updateFamilyMember', { memberId, updates, familyTreeId });
  return result.data as { success: boolean };
};

// MARK: - Family Tree Admin Management

export const promoteToAdmin = async (
  memberId: string,
  familyTreeId: string,
  currentUserId: string
) => {
  const result = await getCSRFClient().callFunction('promoteToAdmin', { memberId, familyTreeId, currentUserId });
  return result.data as { success: boolean; message?: string };
};

export const demoteToMember = async (
  memberId: string,
  familyTreeId: string,
  currentUserId: string
) => {
  const result = await getCSRFClient().callFunction('demoteToMember', { memberId, familyTreeId, currentUserId });
  return result.data as { success: boolean; message?: string };
};

/**
 * Fetches the family tree management data including members and their admin status
 * @returns Family tree data and members with admin/owner status
 */
export const getFamilyManagementData = async () => {
  const result = await getCSRFClient().callFunction('getFamilyManagementData', {});
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
    
    const result = await getCSRFClient().callFunction<
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