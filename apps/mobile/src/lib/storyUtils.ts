import { getFirebaseFunctions } from './firebase';
import { httpsCallable } from '@react-native-firebase/functions';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';
import { logger } from '../services/LoggingService';

/**
 * Types and interfaces for story operations
 */
export interface StoryBlock {
  type: 'text' | 'image' | 'video' | 'audio';
  data: string | string[] | any; // Allow any for complex media objects
  localId: string;
  isEncrypted?: boolean;
  encryptionKey?: string;
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
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getAccessibleStories');
    const res = await functionRef({ userId, familyTreeId });
    const data = res.data as { stories: Story[] };
    return data.stories;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Story Error',
      metadata: {
        action: 'fetchAccessibleStories',
        userId,
        familyTreeId
      }
    });
    throw error;
  }
};

/**
 * Fetch stories created by the user
 */
export const fetchUserStoriesMobile = async (
  userId: string
): Promise<Story[]> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getUserStories');
    const res = await functionRef({ userId });
    const data = res.data as { stories: Story[] };
    return data.stories;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Story Error',
      metadata: {
        action: 'fetchUserStories',
        userId
      }
    });
    throw error;
  }
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
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'createStory');
    const res = await functionRef({ story: storyData });
    const data = res.data as { id: string };
    return data.id;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Story Creation Error',
      metadata: {
        action: 'createStory',
        authorID: storyData.authorID,
        familyTreeId: storyData.familyTreeId,
        title: storyData.title
      }
    });
    throw error;
  }
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
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'updateStory');
    const res = await functionRef({ storyId, userId, updates });
    const data = res.data as { success: boolean };
    return data.success;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Story Update Error',
      metadata: {
        action: 'updateStory',
        storyId,
        userId
      }
    });
    throw error;
  }
};

/**
 * Delete (soft delete) a story
 */
export const deleteStoryMobile = async (
  storyId: string,
  userId: string
): Promise<boolean> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'deleteStory');
    const res = await functionRef({ storyId, userId });
    const data = res.data as { success: boolean };
    return data.success;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Story Deletion Error',
      metadata: {
        action: 'deleteStory',
        storyId,
        userId
      }
    });
    throw error;
  }
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
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.WARNING,
      title: 'Like Error',
      metadata: {
        action: 'toggleStoryLike',
        storyId,
        isCurrentlyLiked
      },
      showAlert: false // Don't show alert for like failures, just reset state
    });
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
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.WARNING,
      title: 'Like Status Error',
      metadata: {
        action: 'checkStoryLikeStatus',
        storyId
      },
      showAlert: false // Don't show alert for like check failures
    });
    return false;
  }
};

/**
 * Get users who liked a story
 */
export const getStoryLikesMobile = async (
  storyId: string
): Promise<any[]> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getStoryLikes');
    const res = await functionRef({ storyId });
    const data = res.data as { likes?: any[] };
    return data.likes || [];
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.WARNING,
      title: 'Likes Fetch Error',
      metadata: {
        action: 'getStoryLikes',
        storyId
      },
      showAlert: false
    });
    return [];
  }
};

/**
 * Fetch comments for a story
 */
export const getStoryCommentsMobile = async (
  storyId: string
): Promise<any[]> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getStoryComments');
    const res = await functionRef({ storyId });
    const data = res.data as { status?: string; comments?: any[] };
    if (data.status === 'error') {
      return [];
    }
    return data.comments || [];
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.WARNING,
      title: 'Comments Fetch Error',
      metadata: {
        action: 'getStoryComments',
        storyId
      }
    });
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
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Comment Submission Error',
      metadata: {
        action: 'addComment',
        storyId,
        parentId,
        textLength: text?.length
      }
    });
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
      logger.error('Invalid response structure from likeComment:', data);
      return { success: false, liked: false, error: "Invalid response from server." };
    }
  } catch (error: any) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.WARNING,
      title: 'Comment Like Error',
      metadata: {
        action: 'toggleCommentLike',
        commentId
      },
      showAlert: false
    });
    return { success: false, liked: false, error: error.message || "Unknown error toggling comment like" };
  }
};

/**
 * Get users who liked a comment
 */
export const getCommentLikesMobile = async (
  commentId: string
): Promise<any[]> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getCommentLikes');
    const res = await functionRef({ commentId });
    const data = res.data as { likes?: any[] };
    return data.likes || [];
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.WARNING,
      title: 'Comment Likes Fetch Error',
      metadata: {
        action: 'getCommentLikes',
        commentId
      },
      showAlert: false
    });
    return [];
  }
}; 