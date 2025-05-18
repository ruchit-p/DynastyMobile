import { getFirebaseFunctions } from './firebase';
import { httpsCallable } from '@react-native-firebase/functions';

/**
 * Types and interfaces for story operations
 */
export interface StoryBlock {
  type: 'text' | 'image' | 'video' | 'audio';
  data: string | string[];
  localId: string;
}

export interface Story {
  id: string;
  title: string;
  subtitle?: string;
  authorID: string;
  createdAt: { seconds: number; nanoseconds: number };
  eventDate?: { seconds: number; nanoseconds: number };
  location?: { lat: number; lng: number; address: string };
  privacy: 'family' | 'privateAccess' | 'custom';
  customAccessMembers?: string[];
  blocks: StoryBlock[];
  familyTreeId: string;
  peopleInvolved: string[];
  isDeleted: boolean;
  coverImageURL?: string;
  likeCount?: number;
  commentCount?: number;
  author?: {
    id: string;
    displayName: string;
    profilePicture?: string;
    subtitle?: string;
  };
}

/**
 * Fetch stories accessible to the user (family stories)
 */
export const fetchAccessibleStoriesMobile = async (
  userId: string,
  familyTreeId: string
): Promise<Story[]> => {
  const functionsInstance = getFirebaseFunctions();
  const functionRef = httpsCallable(functionsInstance, 'getAccessibleStories');
  const res = await functionRef({ userId, familyTreeId });
  const data = res.data as { stories: Story[] };
  return data.stories;
};

/**
 * Fetch stories created by the user
 */
export const fetchUserStoriesMobile = async (
  userId: string
): Promise<Story[]> => {
  const functionsInstance = getFirebaseFunctions();
  const functionRef = httpsCallable(functionsInstance, 'getUserStories');
  const res = await functionRef({ userId });
  const data = res.data as { stories: Story[] };
  return data.stories;
};

/**
 * Create a new story
 * @returns the new story ID
 */
export const createStoryMobile = async (storyData: {
  authorID: string;
  title: string;
  subtitle?: string;
  eventDate?: string | Date;
  location?: { lat: number; lng: number; address: string };
  privacy: 'family' | 'privateAccess' | 'custom';
  customAccessMembers?: string[];
  blocks: StoryBlock[];
  familyTreeId: string;
  peopleInvolved: string[];
  coverImageURL?: string;
}): Promise<string> => {
  const functionsInstance = getFirebaseFunctions();
  const functionRef = httpsCallable(functionsInstance, 'createStory');
  const res = await functionRef(storyData);
  const data = res.data as { id: string };
  return data.id;
};

/**
 * Update an existing story
 */
export const updateStoryMobile = async (
  storyId: string,
  userId: string,
  updates: Partial<{
    title: string;
    subtitle: string;
    eventDate: string | Date;
    location: { lat: number; lng: number; address: string };
    privacy: 'family' | 'privateAccess' | 'custom';
    customAccessMembers: string[];
    blocks: StoryBlock[];
    peopleInvolved: string[];
    coverImageURL?: string | null;
  }>
): Promise<boolean> => {
  const functionsInstance = getFirebaseFunctions();
  const functionRef = httpsCallable(functionsInstance, 'updateStory');
  const res = await functionRef({ storyId, userId, updates });
  const data = res.data as { success: boolean };
  return data.success;
};

/**
 * Delete (soft delete) a story
 */
export const deleteStoryMobile = async (
  storyId: string,
  userId: string
): Promise<boolean> => {
  const functionsInstance = getFirebaseFunctions();
  const functionRef = httpsCallable(functionsInstance, 'deleteStory');
  const res = await functionRef({ storyId, userId });
  const data = res.data as { success: boolean };
  return data.success;
};

/**
 * Toggle like on a story with optimistic update
 */
export const toggleStoryLikeMobile = async (
  storyId: string,
  isCurrentlyLiked: boolean,
  onLikeChange?: (liked: boolean, countChange: number) => void
): Promise<boolean> => {
  if (onLikeChange) {
    onLikeChange(!isCurrentlyLiked, isCurrentlyLiked ? -1 : 1);
  }
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'likeStory');
    const res = await functionRef({ storyId });
    const data = res.data as { success: boolean; liked: boolean };
    if (!data.success && onLikeChange) {
      onLikeChange(isCurrentlyLiked, 0);
    }
    return data.success;
  } catch (error) {
    if (onLikeChange) onLikeChange(isCurrentlyLiked, 0);
    console.error('Error toggling story like:', error);
    return false;
  }
};

/**
 * Check if current user has liked a story
 */
export const checkStoryLikeStatusMobile = async (
  storyId: string
): Promise<boolean> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'checkStoryLikeStatus');
    const res = await functionRef({ storyId });
    const data = res.data as { isLiked: boolean };
    return data.isLiked;
  } catch (error) {
    console.error('Error checking story like status:', error);
    return false;
  }
};

/**
 * Get users who liked a story
 */
export const getStoryLikesMobile = async (
  storyId: string
): Promise<Array<any>> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getStoryLikes');
    const res = await functionRef({ storyId });
    const data = res.data as { likes?: Array<any> };
    return data.likes || [];
  } catch (error) {
    console.error('Error fetching story likes:', error);
    return [];
  }
};

/**
 * Fetch comments for a story
 */
export const getStoryCommentsMobile = async (
  storyId: string
): Promise<Array<any>> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getStoryComments');
    const res = await functionRef({ storyId });
    const data = res.data as { status?: string; comments?: Array<any> };
    if (data.status === 'error') {
      return [];
    }
    return data.comments || [];
  } catch (error) {
    console.error('Error fetching story comments:', error);
    return [];
  }
};

/**
 * Add a comment to a story
 */
export const addCommentMobile = async (
  storyId: string,
  text: string,
  parentId?: string
): Promise<{ success: boolean; comment: any | null; error?: string }> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'commentOnStory');
    const res = await functionRef({ storyId, text, parentId });
    const data = res.data as { success: boolean; comment: any };
    if (data.success && data.comment) {
      return { success: true, comment: data.comment };
    } else {
      return { success: false, comment: null, error: "Failed to add comment or comment data missing from response." };
    }
  } catch (error: any) {
    console.error('Error adding comment:', error);
    return { success: false, comment: null, error: error.message || "Unknown error adding comment" };
  }
};

/**
 * Toggle like on a comment
 */
export const toggleCommentLikeMobile = async (
  commentId: string
): Promise<{ success: boolean; liked: boolean; error?: string }> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'likeComment');
    const res = await functionRef({ commentId });
    const data = res.data as { success: boolean; liked: boolean; error?: string };
    if (typeof data.success === 'boolean' && typeof data.liked === 'boolean') {
       return { success: data.success, liked: data.liked, error: data.error };
    } else {
      console.error('Invalid response structure from likeComment:', data);
      return { success: false, liked: false, error: "Invalid response from server." };
    }
  } catch (error: any) {
    console.error('Error toggling comment like:', error);
    return { success: false, liked: false, error: error.message || "Unknown error toggling comment like" };
  }
};

/**
 * Get users who liked a comment
 */
export const getCommentLikesMobile = async (
  commentId: string
): Promise<Array<any>> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getCommentLikes');
    const res = await functionRef({ commentId });
    const data = res.data as { likes?: Array<any> };
    return data.likes || [];
  } catch (error) {
    console.error('Error fetching comment likes:', error);
    return [];
  }
}; 