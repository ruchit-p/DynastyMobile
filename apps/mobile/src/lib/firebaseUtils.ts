import { parseFirebaseFunctionError, callFirebaseFunction } from './errorUtils';

// import { type RelativeItem as MobileRelativeItemType } from '../../react-native-relatives-tree/src'; // Adjusted path

// Define the type locally since the import path is not available
type MobileRelativeItemType = {
  id: string;
  name: string;
  [key: string]: any;
};

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
  parents?: { id: string; type: string }[];
  siblings?: { id: string; type: string }[];
  spouses?: { id: string; type: string }[];
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

// MARK: - Family Tree Functions

export const getFamilyTreeDataMobile = async (userId: string): Promise<{ treeNodes: FamilyTreeNode[] }> => {
  try {
    // Assuming 'getFamilyTreeData' is the correct Cloud Function name
    const result = await callFirebaseFunction<{ userId: string }, { treeNodes: FamilyTreeNode[] }>('getFamilyTreeData', { userId });
    return result;
  } catch (error) {
    console.error("Error fetching family tree data:", error);
    // The error is already an AppError from callFirebaseFunction, can be rethrown or handled
    throw error;
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
      // Standardize error throwing for client-side logic if needed
      throw parseFirebaseFunctionError({ code: 'not-found', message: `Member with ID ${memberId} not found in local tree data.` });
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
    throw parseFirebaseFunctionError(error); // Ensure it's an AppError
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
  try {
    // Map client-side 'phone' to server-side 'phoneNumber'
    const { phone, ...restOfProfileData } = profileData;
    const updatesPayload: { [key: string]: any } = { ...restOfProfileData };
    if (phone !== undefined) {
      updatesPayload.phoneNumber = phone;
    }
    // Using 'updateUserProfile' which is the name in auth-updated.ts
    const result = await callFirebaseFunction<{ userId: string, updates: any }, { success: boolean }>('updateUserProfile', { userId: memberId, updates: updatesPayload });
    return result;
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
  try {
    const result = await callFirebaseFunction<any, { success: boolean; userId: string }>('createFamilyMember', {
      userData, 
      relationType, 
      selectedNodeId, 
      options // Pass options if your function uses them
    });
    return result;
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
  try {
    const result = await callFirebaseFunction<any, { success: boolean }>('updateFamilyRelationships', { userId, updates });
    return result;
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
  try {
    const result = await callFirebaseFunction<any, { success: boolean }>('deleteFamilyMember', { memberId, familyTreeId, currentUserId });
    return result;
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
  // Encryption fields
  isEncrypted?: boolean;
  encryptionKeyId?: string;
  encryptedBy?: string;
}

// MARK: - Vault Functions (Mobile Client)

/**
 * Get a signed URL for uploading a file to the vault.
 */
export const getUploadSignedUrlMobile = async (
  fileName: string,
  mimeType: string,
  parentId: string | null,
  isEncrypted: boolean = false
): Promise<{ signedUrl: string; storagePath: string; parentPathInVault: string; isEncrypted: boolean }> => {
  try {
    const result = await callFirebaseFunction<any, { signedUrl: string; storagePath: string; parentPathInVault: string; isEncrypted: boolean }>('getVaultUploadSignedUrl', { fileName, mimeType, parentId, isEncrypted });
    return result;
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
  try {
    const result = await callFirebaseFunction<any, { items: VaultItem[] }>('getVaultItems', { parentId });
    return result;
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
  try {
    const result = await callFirebaseFunction<any, { id: string }>('createVaultFolder', { name, parentId });
    return result;
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
    // Encryption fields
    isEncrypted?: boolean;
    encryptionKeyId?: string | null;
  }
): Promise<{ id: string; downloadURL: string; isEncrypted?: boolean }> => { // Expect downloadURL back from function
  try {
    const result = await callFirebaseFunction<any, { id: string; downloadURL: string; isEncrypted?: boolean }>('addVaultFile', payload);
    return result;
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
  try {
    const result = await callFirebaseFunction<any, { success: boolean }>('renameVaultItem', { itemId, newName });
    return result;
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
  try {
    const result = await callFirebaseFunction<any, { success: boolean }>('moveVaultItem', { itemId, newParentId });
    return result;
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
  try {
    const result = await callFirebaseFunction<any, { success: boolean }>('deleteVaultItem', { itemId });
    return result;
  } catch (error) {
    console.error("Error deleting vault item:", error);
    throw error;
  }
};

// MARK: - Event Functions (Mobile Client - to use new events-service)

// Corresponds to EnrichedEventData on server, but client might not need all fields
// or might transform some (e.g., Timestamps to Dates or strings)
export interface MobileEventDetails {
  id: string;
  title: string;
  eventDate: string; // Keep as string YYYY-MM-DD or transform to Date
  endDate?: string | null;
  startTime?: string | null; // HH:mm
  endTime?: string | null; // HH:mm
  timezone?: string | null;
  location?: {
    address: string;
    lat: number;
    lng: number;
  } | null;
  isVirtual: boolean;
  virtualLink?: string | null;
  description?: string;
  coverPhotoUrls?: string[]; // Generated URLs from server
  privacy: "public" | "family_tree" | "invite_only";
  allowGuestPlusOne: boolean;
  showGuestList: boolean;
  requireRsvp: boolean;
  rsvpDeadline?: string | null;
  dressCode?: string | null;
  whatToBring?: string | null;
  additionalInfo?: string | null;
  hostId: string;
  hostName?: string;
  hostProfilePicture?: string;
  isHost?: boolean; // Is current user the host?
  userRsvpStatus?: "pending" | "accepted" | "declined" | "maybe";
  userHasPlusOne?: boolean;
  // Consider if invitedMemberIds and familyTreeId are needed on client directly
  // Timestamps (createdAt, updatedAt) can be converted to Date or string for display
  createdAt?: any; // Example: string or Date
  updatedAt?: any; // Example: string or Date
}

// Event related types (can be refined based on what each function returns/expects)
export interface MobileEventCreationData {
  title: string;
  eventDate: string; // YYYY-MM-DD
  endDate?: string | null;
  startTime?: string | null; // HH:mm
  endTime?: string | null; // HH:mm
  timezone?: string | null;
  location?: { address: string; lat: number; lng: number; } | null;
  isVirtual: boolean;
  virtualLink?: string | null;
  description?: string;
  // coverPhotoStoragePaths will be set server-side via completeEventCoverPhotoUpload
  privacy: "public" | "family_tree" | "invite_only";
  allowGuestPlusOne: boolean;
  showGuestList: boolean;
  requireRsvp: boolean;
  rsvpDeadline?: string | null;
  dressCode?: string | null;
  whatToBring?: string | null;
  additionalInfo?: string | null;
  invitedMemberIds?: string[];
  familyTreeId?: string | null;
}

export const getEventDetailsMobile = async (eventId: string): Promise<{ event: MobileEventDetails } | null> => {
  try {
    // Changed function name to 'getEventDetails' to match events-service.ts
    const result = await callFirebaseFunction<{ eventId: string }, { event: MobileEventDetails }>(
      'getEventDetails',
      { eventId }
    );
    console.log('[firebaseUtils] Raw response from getEventDetails:', result);

    if (!result || !result.event) {
      console.error("Error: Event data not found in function response.", result);
      throw parseFirebaseFunctionError({ code: 'not-found', message: 'Event data not found in response from getEventDetails' });
    }
    // TODO: Add any necessary mapping from server (EnrichedEventData) to MobileEventDetails if they differ
    // e.g., converting Timestamps to JS Dates or formatted strings
    return { event: result.event };
  } catch (error: any) {
    console.error(`Error fetching event details for ${eventId}:`, error);
    // The error should already be an AppError from callFirebaseFunction
    throw error;
  }
};

// Example for createEvent
export const createEventMobile = async (eventData: MobileEventCreationData): Promise<{ eventId: string; eventData: MobileEventDetails }> => {
  try {
    const result = await callFirebaseFunction<Omit<MobileEventCreationData, 'id' | 'createdAt' | 'updatedAt' | 'hostId' | 'coverPhotoUrls'>, { eventId: string; eventData: MobileEventDetails }>(
      'createEvent',
      eventData // Directly pass the client-side data structure
    );
    return result;
  } catch (error) {
    console.error("Error creating event:", error);
    throw error; // Error is already AppError
  }
};

// MARK: - Update Event

/**
 * Data structure for updating an existing event.
 * Typically, all fields are optional, and only provided fields will be updated.
 * The eventId is crucial for identifying which event to update.
 */
export interface MobileEventUpdateData extends Partial<Omit<MobileEventCreationData, 'familyTreeId' | 'invitedMemberIds'>> { // familyTreeId and invitedMemberIds are usually set at creation or via specific endpoints
  // Omitting coverPhotoStoragePaths as that's handled by completeEventCoverPhotoUpload
  // hostId is implicit from the authenticated user on the backend.
}

export const updateEventMobile = async (
  eventId: string,
  eventData: MobileEventUpdateData
): Promise<{ success: boolean; eventId: string }> => {
  try {
    const result = await callFirebaseFunction<
      { eventId: string; updates: MobileEventUpdateData },
      { success: boolean; eventId: string }
    >(
      'updateEvent',
      { eventId, updates: eventData }
    );
    return result;
  } catch (error) {
    console.error(`Error updating event ${eventId}:`, error);
    throw error;
  }
};

// MARK: - RSVP to Event

export type RsvpStatus = "accepted" | "declined" | "maybe";

export interface RsvpData {
  eventId: string;
  status: RsvpStatus;
  plusOne?: boolean; // Optional: if the user is bringing a guest
}

export interface RsvpResponse {
  success: boolean;
  eventId: string;
  newStatus: RsvpStatus;
  userHasPlusOne: boolean;
}

export const rsvpToEventMobile = async (rsvpData: RsvpData): Promise<RsvpResponse> => {
  try {
    const result = await callFirebaseFunction<RsvpData, RsvpResponse>(
      'rsvpToEvent',
      rsvpData
    );
    return result;
  } catch (error) {
    console.error(`Error RSVPing to event ${rsvpData.eventId}:`, error);
    throw error;
  }
};

// MARK: - Delete Event
export const deleteEventMobile = async (eventId: string): Promise<{ success: boolean }> => {
  try {
    const result = await callFirebaseFunction<{ eventId: string }, { success: boolean }>(
      'deleteEvent',
      { eventId }
    );
    return result;
  } catch (error) {
    console.error(`Error deleting event ${eventId}:`, error);
    throw error;
  }
};

// MARK: - Get Event Attendees

export interface AttendeeData {
  userId: string;
  name: string; // Or displayName
  profilePictureUrl?: string;
  status: RsvpStatus;
  hasPlusOne: boolean;
  // Add any other relevant attendee info you want to display
}

export const getEventAttendeesMobile = async (eventId: string): Promise<{ attendees: AttendeeData[] }> => {
  try {
    const result = await callFirebaseFunction<{ eventId: string }, { attendees: AttendeeData[] }>(
      'getEventAttendees',
      { eventId }
    );
    return result;
  } catch (error) {
    console.error(`Error fetching attendees for event ${eventId}:`, error);
    throw error;
  }
};

// MARK: - Event Listing

export interface UpcomingEventsResponse {
  events: MobileEventDetails[];
  // The backend `getUpcomingEventsForUser` uses lastEventTimestamp and lastEventId for pagination.
  // We can pass these back to the client if needed for subsequent calls, or simplify if not directly used.
  // For simplicity here, let's assume the mobile app might just load more or re-fetch, 
  // but we can include them if complex pagination is needed on the client.
  lastEventTimestamp?: number; 
  lastEventId?: string;
}

/**
 * Fetches upcoming events for the current user.
 * Supports basic pagination via limit and optional startAfterEventId.
 * The backend function `getUpcomingEventsForUser` uses `limit`, `lastEventTimestamp`, and `lastEventId`.
 * This mobile wrapper will abstract that if needed, or pass them through.
 */
export const getUpcomingEventsForUserMobile = async (
  limit: number,
  startAfterEventId?: string, // Client might use ID to fetch next page
  lastEventDate?: string // Changed from startAfterEventTimestamp: number
): Promise<UpcomingEventsResponse> => {
  try {
    const params: { limit: number; lastEventId?: string; lastEventDate?: string } = { limit };
    if (startAfterEventId) {
      params.lastEventId = startAfterEventId;
    }
    if (lastEventDate) { // Use lastEventDate
      params.lastEventDate = lastEventDate;
    }

    const result = await callFirebaseFunction<
      typeof params,
      UpcomingEventsResponse
    >(
      'getUpcomingEventsForUser',
      params
    );
    return result;
  } catch (error) {
    console.error("Error fetching upcoming events:", error);
    throw error;
  }
};

// MARK: - Event Comments

export interface EventCommentData {
  id: string;
  eventId: string; // Usually not directly in the comment object from backend, but useful for context
  userId: string;
  userName: string;
  userProfilePictureUrl?: string;
  text: string;
  createdAt: any; // Timestamp or Date or string
  updatedAt?: any;
  // replies?: EventCommentData[]; // If you implement threaded comments
}

export const addCommentToEventMobile = async (
  eventId: string,
  text: string
): Promise<{ comment: EventCommentData }> => {
  try {
    const result = await callFirebaseFunction<
      { eventId: string; text: string },
      { comment: EventCommentData }
    >(
      'addCommentToEvent',
      { eventId, text }
    );
    return result;
  } catch (error) {
    console.error(`Error adding comment to event ${eventId}:`, error);
    throw error;
  }
};

export const getEventCommentsMobile = async (eventId: string): Promise<{ comments: EventCommentData[] }> => {
  try {
    const result = await callFirebaseFunction<{ eventId: string }, { comments: EventCommentData[] }>(
      'getEventComments',
      { eventId }
    );
    return result;
  } catch (error) {
    console.error(`Error fetching comments for event ${eventId}:`, error);
    throw error;
  }
};

export const deleteEventCommentMobile = async (
  eventId: string, // eventId might be needed for security rules or logging on backend
  commentId: string
): Promise<{ success: boolean }> => {
  try {
    const result = await callFirebaseFunction<
      { eventId: string; commentId: string },
      { success: boolean }
    >(
      'deleteEventComment',
      { eventId, commentId }
    );
    return result;
  } catch (error) {
    console.error(`Error deleting comment ${commentId} from event ${eventId}:`, error);
    throw error;
  }
};

// MARK: - Event Cover Photo Management

export interface EventCoverPhotoUploadUrlResponse {
  signedUrl: string;
  storagePath: string;
}

export const getEventCoverPhotoUploadUrlMobile = async (
  eventId: string,
  fileName: string,
  mimeType: string
): Promise<EventCoverPhotoUploadUrlResponse> => {
  try {
    const result = await callFirebaseFunction<
      { eventId: string; fileName: string; mimeType: string },
      EventCoverPhotoUploadUrlResponse
    >(
      'getEventCoverPhotoUploadUrl',
      { eventId, fileName, mimeType }
    );
    return result;
  } catch (error) {
    console.error(`Error getting cover photo upload URL for event ${eventId}:`, error);
    throw error;
  }
};

export interface CompleteEventCoverPhotoUploadPayload {
  eventId: string;
  storagePath: string;
}

export interface CompleteEventCoverPhotoUploadResponse {
  success: boolean;
  eventId: string;
  storagePath: string;
}

export const completeEventCoverPhotoUploadMobile = async (
  payload: CompleteEventCoverPhotoUploadPayload
): Promise<CompleteEventCoverPhotoUploadResponse> => {
  try {
    const result = await callFirebaseFunction<
      CompleteEventCoverPhotoUploadPayload,
      CompleteEventCoverPhotoUploadResponse
    >(
      'completeEventCoverPhotoUpload',
      payload
    );
    return result;
  } catch (error) {
    console.error(`Error completing cover photo upload for event ${payload.eventId}:`, error);
    throw error;
  }
};
