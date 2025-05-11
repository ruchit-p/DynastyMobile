import { functions as firebaseFunctions } from './firebase';
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
  coverPhoto?: string;
  likeCount?: number;
  commentCount?: number;
  author?: {
    id: string;
    displayName: string;
    profilePicture?: string;
  };
}

/**
 * Fetch stories accessible to the user (family stories)
 */
export const fetchAccessibleStoriesMobile = async (
  userId: string,
  familyTreeId: string
): Promise<Story[]> => {
  const functionRef = httpsCallable(firebaseFunctions, 'getAccessibleStories');
  const res = await functionRef({ userId, familyTreeId });
  return res.data.stories as Story[];
};

/**
 * Fetch stories created by the user
 */
export const fetchUserStoriesMobile = async (
  userId: string
): Promise<Story[]> => {
  const functionRef = httpsCallable(firebaseFunctions, 'getUserStories');
  const res = await functionRef({ userId });
  return res.data.stories as Story[];
};

/**
 * Create a new story
 * @returns the new story ID
 */
export const createStoryMobile = async (storyData: {
  authorID: string;
  title: string;
  subtitle?: string;
  eventDate?: Date;
  location?: { lat: number; lng: number; address: string };
  privacy: 'family' | 'privateAccess' | 'custom';
  customAccessMembers?: string[];
  blocks: StoryBlock[];
  familyTreeId: string;
  peopleInvolved: string[];
  coverPhoto?: string;
}): Promise<string> => {
  const functionRef = httpsCallable(firebaseFunctions, 'createStory');
  const res = await functionRef(storyData);
  return res.data.id as string;
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
    eventDate: Date;
    location: { lat: number; lng: number; address: string };
    privacy: 'family' | 'privateAccess' | 'custom';
    customAccessMembers: string[];
    blocks: StoryBlock[];
    peopleInvolved: string[];
  }>
): Promise<boolean> => {
  const functionRef = httpsCallable(firebaseFunctions, 'updateStory');
  const res = await functionRef({ storyId, userId, updates });
  return Boolean(res.data.success);
};

/**
 * Delete (soft delete) a story
 */
export const deleteStoryMobile = async (
  storyId: string,
  userId: string
): Promise<boolean> => {
  const functionRef = httpsCallable(firebaseFunctions, 'deleteStory');
  const res = await functionRef({ storyId, userId });
  return Boolean(res.data.success);
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
    const functionRef = httpsCallable(firebaseFunctions, 'likeStory');
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
    const functionRef = httpsCallable(firebaseFunctions, 'checkStoryLikeStatus');
    const res = await functionRef({ storyId });
    return Boolean(res.data.isLiked);
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
    const functionRef = httpsCallable(firebaseFunctions, 'getStoryLikes');
    const res = await functionRef({ storyId });
    return res.data.likes || [];
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
    const functionRef = httpsCallable(firebaseFunctions, 'getStoryComments');
    const res = await functionRef({ storyId });
    if (res.data.status === 'error') {
      return [];
    }
    return res.data.comments || [];
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
): Promise<any | null> => {
  try {
    const functionRef = httpsCallable(firebaseFunctions, 'commentOnStory');
    const res = await functionRef({ storyId, text, parentId });
    const data = res.data as { success: boolean; comment: any };
    return data.success ? data.comment : null;
  } catch (error) {
    console.error('Error adding comment:', error);
    return null;
  }
};

/**
 * Toggle like on a comment
 */
export const toggleCommentLikeMobile = async (
  commentId: string,
  isCurrentlyLiked: boolean,
  onCommentUpdated?: (liked: boolean) => void
): Promise<boolean> => {
  if (onCommentUpdated) onCommentUpdated(!isCurrentlyLiked);
  try {
    const functionRef = httpsCallable(firebaseFunctions, 'likeComment');
    const res = await functionRef({ commentId });
    const data = res.data as { success: boolean; liked: boolean };
    if (!data.success && onCommentUpdated) onCommentUpdated(isCurrentlyLiked);
    return data.success;
  } catch (error) {
    if (onCommentUpdated) onCommentUpdated(isCurrentlyLiked);
    console.error('Error toggling comment like:', error);
    return false;
  }
};

/**
 * Get users who liked a comment
 */
export const getCommentLikesMobile = async (
  commentId: string
): Promise<Array<any>> => {
  try {
    const functionRef = httpsCallable(firebaseFunctions, 'getCommentLikes');
    const res = await functionRef({ commentId });
    return res.data.likes || [];
  } catch (error) {
    console.error('Error fetching comment likes:', error);
    return [];
  }
}; 