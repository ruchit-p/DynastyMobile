import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from '@/components/ui/use-toast';
import eventManager, { LikeEventData } from "./eventUtils";
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

export interface Story {
  id: string;
  title: string;
  subtitle?: string;
  authorID: string;
  createdAt: Timestamp;
  eventDate?: Timestamp;
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
  isDeleted: boolean;
  likeCount?: number;
  commentCount?: number;
}

export interface CommentUser {
  id: string;
  displayName: string;
  profilePicture?: string;
}

export interface Comment {
  id: string;
  storyId: string;
  userId: string;
  text: string;
  createdAt: { seconds: number; nanoseconds: number };
  likes: string[];
  isLikedByMe: boolean;
  user: CommentUser;
  parentId?: string;
  parentPath?: string[]; // Path to parent comments (for nested structure)
  depth?: number; // Nesting level (0 for top-level comments)
  replies?: Comment[]; // Nested replies
}

export const fetchUserStories = async (userId: string): Promise<Story[]> => {
  try {
    const storiesRef = collection(db, 'stories');
    // Simplified query that only filters by authorID and isDeleted
    const q = query(
      storiesRef,
      where('authorID', '==', userId),
      where('isDeleted', '==', false)
    );

    const querySnapshot = await getDocs(q);
    const stories = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Story[];
    
    // Sort stories by createdAt in descending order
    return stories.sort((a: Story, b: Story) => 
      b.createdAt.toMillis() - a.createdAt.toMillis()
    );
  } catch (error) {
    console.error('Error fetching user stories:', error);
    throw error;
  }
};

export const fetchAccessibleStories = async (
  userId: string,
  familyTreeId: string
): Promise<Story[]> => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    if (!familyTreeId) {
      throw new Error('Family tree ID is required');
    }

    const storiesRef = collection(db, 'stories');
    
    // Get all non-deleted stories from the user's family tree
    const familyStoriesQuery = query(
      storiesRef,
      where('familyTreeId', '==', familyTreeId),
      where('isDeleted', '==', false),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(familyStoriesQuery);
    
    // Filter stories based on privacy settings
    const accessibleStories = querySnapshot.docs
      .map(doc => {
        const data = doc.data();
        // Validate required fields
        if (!data.title || !data.authorID || !data.createdAt || !data.privacy) {
          console.warn(`Story ${doc.id} is missing required fields:`, data);
          return null;
        }
        return {
          id: doc.id,
          ...data
        } as Story;
      })
      .filter((story): story is Story => {
        if (!story) return false;
        
        // User can always see their own stories
        if (story.authorID === userId) return true;

        // For family-wide stories
        if (story.privacy === 'family') return true;

        // For private stories
        if (story.privacy === 'privateAccess') {
          return story.authorID === userId;
        }

        // For custom access stories
        if (story.privacy === 'custom') {
          return story.customAccessMembers?.includes(userId) || false;
        }

        return false;
      });

    return accessibleStories;
  } catch (error) {
    console.error('Error fetching accessible stories:', error);
    throw error instanceof Error 
      ? error 
      : new Error('Failed to fetch accessible stories');
  }
};

// MARK: - Social Features

/**
 * Toggle like on a story and handle optimistic UI updates
 * 
 * @param storyId The ID of the story to like/unlike
 * @param isCurrentlyLiked Whether the story is currently liked by the user
 * @param onLikeChange Callback that will be called with the new like state and count change
 * @returns Promise that resolves to true if the operation was successful
 */
export const toggleStoryLike = async (
  storyId: string,
  isCurrentlyLiked: boolean,
  onLikeChange?: (liked: boolean, countChange: number) => void
): Promise<boolean> => {
  try {
    // Optimistic update
    if (onLikeChange) {
      onLikeChange(!isCurrentlyLiked, isCurrentlyLiked ? -1 : 1);
    }
    
    // Call Firebase Function
    const result = await getFunctionsClient().callFunction('likeStory', { storyId });
    const data = result.data as { success: boolean; liked: boolean };
    
    if (!data.success) {
      // Revert optimistic update if backend failed
      if (onLikeChange) {
        onLikeChange(isCurrentlyLiked, 0);
      }
      
      toast({
        title: 'Error',
        description: 'Failed to update like status',
        variant: 'destructive',
      });
      
      return false;
    }
    
    // Publish event to notify all subscribers
    const eventType = !isCurrentlyLiked ? 'story:liked' : 'story:unliked';
    eventManager.publish<LikeEventData>(eventType, { storyId, liked: !isCurrentlyLiked });
    
    return true;
  } catch (error) {
    console.error('Error toggling story like:', error);
    
    // Revert optimistic update
    if (onLikeChange) {
      onLikeChange(isCurrentlyLiked, 0);
    }
    
    toast({
      title: 'Error',
      description: 'Failed to update like status',
      variant: 'destructive',
    });
    
    return false;
  }
};

/**
 * Check if a user has liked a story
 * 
 * @param storyId The ID of the story to check
 * @returns Promise that resolves to true if the user has liked the story
 */
export const checkStoryLikeStatus = async (storyId: string): Promise<boolean> => {
  try {
    // Use the cloud function instead of direct Firestore access to avoid security rule issues
    const result = await getFunctionsClient().callFunction('checkStoryLikeStatus', { storyId });
    const data = result.data as { isLiked: boolean };
    return data.isLiked;
  } catch (error) {
    console.error('Error checking story like status:', error);
    // Don't show a toast for this error as it's not critical for the user experience
    return false;
  }
};

/**
 * Get users who liked a story
 * 
 * @param storyId The ID of the story
 * @returns Promise that resolves to an array of user objects
 */
export const getStoryLikes = async (storyId: string): Promise<CommentUser[]> => {
  try {
    const result = await getFunctionsClient().callFunction('getStoryLikes', { storyId });
    const data = result.data as { likes: Array<{ userId: string; user: CommentUser }> };
    return data.likes.map(like => like.user);
  } catch (error) {
    console.error('Error fetching story likes:', error);
    
    toast({
      title: 'Error',
      description: 'Failed to load likes',
      variant: 'destructive',
    });
    
    return [];
  }
};

/**
 * Toggle like on a comment and handle optimistic UI updates
 * 
 * @param commentId The ID of the comment to like/unlike
 * @param isCurrentlyLiked Whether the comment is currently liked by the user
 * @param onCommentUpdated Callback that will be called with the updated comment status
 * @returns Promise that resolves to true if the operation was successful
 */
export const toggleCommentLike = async (
  commentId: string,
  isCurrentlyLiked: boolean,
  onCommentUpdated?: (liked: boolean) => void
): Promise<boolean> => {
  try {
    // Optimistic update
    if (onCommentUpdated) {
      onCommentUpdated(!isCurrentlyLiked);
    }
    
    // Call Firebase Function
    const result = await getFunctionsClient().callFunction('likeComment', { commentId });
    const data = result.data as { success: boolean; liked: boolean };
    
    if (!data.success) {
      // Revert optimistic update if backend failed
      if (onCommentUpdated) {
        onCommentUpdated(isCurrentlyLiked);
      }
      
      toast({
        title: 'Error',
        description: 'Failed to update like status',
        variant: 'destructive',
      });
      
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error toggling comment like:', error);
    
    // Revert optimistic update
    if (onCommentUpdated) {
      onCommentUpdated(isCurrentlyLiked);
    }
    
    toast({
      title: 'Error',
      description: 'Failed to update like status',
      variant: 'destructive',
    });
    
    return false;
  }
};

/**
 * Get users who liked a comment
 * 
 * @param commentId The ID of the comment
 * @returns Promise that resolves to an array of user objects
 */
export const getCommentLikes = async (commentId: string): Promise<CommentUser[]> => {
  try {
    const result = await getFunctionsClient().callFunction('getCommentLikes', { commentId });
    const data = result.data as { likes: Array<{ userId: string; user: CommentUser }> };
    return data.likes.map(like => like.user);
  } catch (error) {
    console.error('Error fetching comment likes:', error);
    
    toast({
      title: 'Error',
      description: 'Failed to load likes',
      variant: 'destructive',
    });
    
    return [];
  }
};

/**
 * Get comments for a story
 * 
 * @param storyId The ID of the story
 * @returns Promise that resolves to an array of comment objects
 */
export const getStoryComments = async (storyId: string): Promise<Comment[]> => {
  try {
    console.log(`Fetching comments for story: ${storyId}`);
    const result = await getFunctionsClient().callFunction('getStoryComments', { storyId });
    const data = result.data as { 
      status: 'success' | 'error',
      message?: string,
      comments: Comment[], 
      error?: string 
    };
    
    // Check if there was an error in the response
    if (data.status === 'error') {
      console.error(`Server returned an error: ${data.message || data.error}`);
      toast({
        title: 'Error',
        description: 'Failed to load comments',
        variant: 'destructive',
      });
      return [];
    }
    
    // No need to show any error for no comments - it's a valid state
    if (data.status === 'success' && data.message === 'No comments found') {
      console.log('No comments found for this story');
      return [];
    }
    
    console.log(`Retrieved ${data.comments?.length || 0} comments from server`);
    
    // Ensure all comments have valid timestamps
    const processedComments = (data.comments || []).map(comment => {
      // If createdAt is an empty object, add a timestamp
      if (comment.createdAt && 
          typeof comment.createdAt === 'object' && 
          Object.keys(comment.createdAt).length === 0) {
        console.log(`Comment ${comment.id} has empty timestamp, adding fallback`);
        return {
          ...comment,
          createdAt: {
            seconds: Math.floor(Date.now() / 1000),
            nanoseconds: 0
          }
        };
      }
      return comment;
    });
    
    return processedComments;
  } catch (error) {
    // This is a technical error (network, auth, etc.), not just empty comments
    console.error('Error fetching comments:', error);
    
    // Extract the error message to check for specific conditions
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Don't show toast if the error is related to no comments being found
    const isNoCommentsError = errorMessage.includes('No comments found') || 
                             errorMessage.includes('no comments') ||
                             errorMessage.includes('empty result');
    
    if (!isNoCommentsError) {
      toast({
        title: 'Error',
        description: 'Failed to load comments',
        variant: 'destructive',
      });
    }
    
    return [];
  }
};

/**
 * Add a comment to a story
 * 
 * @param storyId The ID of the story to comment on
 * @param text The comment text
 * @param parentId Optional ID of the parent comment if this is a reply
 * @returns Promise that resolves to the created comment object or null if failed
 */
export const addComment = async (
  storyId: string,
  text: string,
  parentId?: string
): Promise<Comment | null> => {
  try {
    const commentData = {
      storyId,
      text: text.trim(),
      ...(parentId && { parentId }),
    };
    
    const result = await getFunctionsClient().callFunction('commentOnStory', commentData);
    const data = result.data as { success: boolean; comment: Comment };
    
    if (data.success) {
      // If createdAt is an empty object, add a client-side timestamp
      if (data.comment && typeof data.comment.createdAt === 'object' && 
          Object.keys(data.comment.createdAt).length === 0) {
        data.comment.createdAt = { 
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0
        };
      }
      return data.comment;
    }
    
    toast({
      title: 'Error',
      description: 'Failed to post your comment',
      variant: 'destructive',
    });
    
    return null;
  } catch (error) {
    console.error('Error adding comment:', error);
    
    toast({
      title: 'Error',
      description: 'Failed to post your comment',
      variant: 'destructive',
    });
    
    return null;
  }
}; 