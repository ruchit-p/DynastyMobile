import {onCall} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";

// MARK: - Types

interface Location {
  lat: number;
  lng: number;
  address: string;
}

interface StorageBlock {
  type: "text" | "image" | "video" | "audio";
  data: string | string[];
  localId: string;
}

interface Story {
  id: string;
  title: string;
  subtitle?: string;
  authorID: string;
  createdAt: Timestamp;
  eventDate?: Timestamp;
  location?: Location;
  privacy: "family" | "privateAccess" | "custom";
  customAccessMembers?: string[];
  blocks: StorageBlock[];
  familyTreeId: string;
  peopleInvolved: string[];
  isDeleted: boolean;
  coverImageURL?: string;
}

// Used in the cloud functions
interface UserInfo {
  id: string;
  displayName: string;
  profilePicture?: string;
}

// MARK: - Helper Functions

/**
 * Get user information for display
 */
async function getUserInfo(db: FirebaseFirestore.Firestore, userId: string): Promise<UserInfo> {
  try {
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return {
        id: userId,
        displayName: "Unknown User",
      };
    }

    const userData = userDoc.data();

    return {
      id: userId,
      displayName: userData?.displayName || `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim() || "Anonymous",
      profilePicture: userData?.profilePicture || undefined,
    };
  } catch (error) {
    logger.error("Error getting user info:", error);
    return {
      id: userId,
      displayName: "Unknown User",
    };
  }
}

/**
 * Enriches story data with author and tagged people information
 */
async function enrichStoryWithUserInfo(db: FirebaseFirestore.Firestore, story: Story) {
  try {
    // Get unique list of user IDs to fetch (author + tagged people)
    const userIds = new Set([story.authorID, ...(story.peopleInvolved || [])]);

    // Fetch all user info in parallel
    const userInfoMap = new Map();
    await Promise.all(
      Array.from(userIds).map(async (userId) => {
        const userInfo = await getUserInfo(db, userId);
        userInfoMap.set(userId, userInfo);
      })
    );

    // Get author info
    const author = userInfoMap.get(story.authorID);

    // Get tagged people info
    const taggedPeople = story.peopleInvolved?.map((personId) => userInfoMap.get(personId)) || [];

    return {
      ...story,
      author,
      taggedPeople: taggedPeople.filter((person) => person !== undefined),
    };
  } catch (error) {
    logger.error(`Error enriching story ${story.id} with user info:`, error);
    // Return story with minimal author info if enrichment fails
    return {
      ...story,
      author: {id: story.authorID, displayName: "Unknown User"},
      taggedPeople: [],
    };
  }
}

// MARK: - Cloud Functions

/**
 * Fetches stories accessible to a user
 */
export const getAccessibleStories = onCall({
  region: DEFAULT_REGION,
  memory: "256MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  try {
    const {userId, familyTreeId} = request.data;
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new Error("Authentication required");
    }

    if (!userId) {
      throw new Error("User ID is required");
    }
    // Ensure the user is requesting with their own ID
    if (userId !== callerUid) {
      throw new Error("You can only access stories with your own user ID");
    }
    if (!familyTreeId) {
      throw new Error("Family tree ID is required");
    }

    const db = getFirestore();
    const storiesRef = db.collection("stories");

    // Get all non-deleted stories from the user's family tree
    const familyStoriesQuery = await storiesRef
      .where("familyTreeId", "==", familyTreeId)
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc")
      .get();

    // Filter stories based on privacy settings and enrich with user data
    const accessibleStories = await Promise.all(
      familyStoriesQuery.docs
        .map((doc) => {
          const data = doc.data();
          // Validate required fields
          if (!data.title || !data.authorID || !data.createdAt || !data.privacy) {
            logger.warn(`Story ${doc.id} is missing required fields:`, data);
            return null;
          }
          return {
            id: doc.id,
            ...data,
          } as Story;
        })
        .filter((story): story is Story => {
          if (!story) return false;

          // User can always see their own stories
          if (story.authorID === userId) return true;

          // For family-wide stories
          if (story.privacy === "family") return true;

          // For private stories
          if (story.privacy === "privateAccess") {
            return story.authorID === userId;
          }

          // For custom access stories
          if (story.privacy === "custom") {
            return story.customAccessMembers?.includes(userId) || false;
          }

          return false;
        })
        .map((story) => enrichStoryWithUserInfo(db, story))
    );

    return {stories: accessibleStories};
  } catch (error) {
    logger.error("Error in getAccessibleStories:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to fetch accessible stories");
  }
});

/**
 * Fetches stories created by a specific user
 */
export const getUserStories = onCall({
  region: DEFAULT_REGION,
  memory: "256MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  try {
    const {userId} = request.data;
    const callerUid = request.auth?.uid;

    if (!callerUid) {
      throw new Error("Authentication required");
    }

    // Ensure the user is requesting their own stories
    if (userId && userId !== callerUid) {
      throw new Error("You can only access your own stories");
    }

    const uid = callerUid;
    const db = getFirestore();
    const storiesRef = db.collection("stories");
    const userStoriesQuery = await storiesRef
      .where("authorID", "==", uid)
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc")
      .get();

    logger.debug(`Found ${userStoriesQuery.docs.length} stories for user ${uid}`);

    const stories = [];
    for (const doc of userStoriesQuery.docs) {
      const storyData = doc.data();
      stories.push({
        id: doc.id,
        ...storyData,
      });
    }

    // Get story data from documents
    const storiesData = userStoriesQuery.docs.map((doc) => {
      return {
        id: doc.id,
        ...doc.data(),
      } as Story;
    });

    // Enrich stories with author and tagged people info
    const enrichedStories = await Promise.all(
      storiesData.map((story) => enrichStoryWithUserInfo(db, story))
    );

    return {stories: enrichedStories};
  } catch (error) {
    logger.error("Error in getUserStories:", error);
    throw new Error(error instanceof Error ? error.message : "Unknown error");
  }
});

/**
 * Creates a new story
 */
export const createStory = onCall({
  region: DEFAULT_REGION,
  memory: "256MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  try {
    const {
      authorID,
      title,
      subtitle,
      eventDate,
      location,
      privacy,
      customAccessMembers,
      blocks,
      familyTreeId,
      peopleInvolved,
      coverImageURL,
    } = request.data;

    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new Error("Authentication required");
    }

    // Validate request data
    if (!authorID || authorID !== callerUid) {
      throw new Error("Invalid authorID");
    }

    if (!title || !title.trim()) {
      throw new Error("Title is required");
    }

    if (!familyTreeId) {
      throw new Error("Family tree ID is required");
    }

    // Verify user has access to the family tree
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(callerUid).get();

    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();

    if (userData?.familyTreeId !== familyTreeId) {
      throw new Error("User does not have access to this family tree");
    }

    // Create story data object
    const storyData = {
      authorID,
      blocks,
      createdAt: FieldValue.serverTimestamp(),
      eventDate: eventDate ? Timestamp.fromDate(new Date(eventDate)) : null,
      familyTreeId,
      isDeleted: false,
      location,
      peopleInvolved,
      privacy: privacy === "privateAccess" ? "privateAccess" : privacy,
      subtitle: subtitle?.trim(),
      title: title.trim(),
      updatedAt: FieldValue.serverTimestamp(),
      customAccessMembers: privacy === "custom" ? customAccessMembers : undefined,
      coverImageURL,
    };

    // Remove any undefined or null fields
    Object.keys(storyData).forEach((key) => {
      if (storyData[key as keyof typeof storyData] === undefined ||
          storyData[key as keyof typeof storyData] === null) {
        delete storyData[key as keyof typeof storyData];
      }
    });

    // Add the story to Firestore
    const docRef = await db.collection("stories").add(storyData);

    // Return success response
    return {id: docRef.id};
  } catch (error) {
    logger.error("Error in createStory:", error);
    throw new Error(error instanceof Error ? error.message : "Unknown error");
  }
});

/**
 * Updates an existing story
 */
export const updateStory = onCall({
  region: DEFAULT_REGION,
  memory: "256MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  try {
    const {storyId, userId, updates} = request.data;
    const callerUid = request.auth?.uid;

    if (!callerUid) {
      throw new Error("Authentication required");
    }

    // Validate request data
    if (!storyId) {
      throw new Error("Story ID is required");
    }

    if (!userId || userId !== callerUid) {
      throw new Error("Invalid user ID");
    }

    // Get Firestore instance
    const db = getFirestore();

    // Verify story exists and user has permission
    const storyRef = db.collection("stories").doc(storyId);
    const storyDoc = await storyRef.get();

    if (!storyDoc.exists) {
      throw new Error("Story not found");
    }

    const storyData = storyDoc.data();
    if (storyData?.authorID !== userId) {
      throw new Error("You don't have permission to edit this story");
    }

    // Prepare update data
    const updateData: any = {
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (updates.eventDate) {
      updateData.eventDate = Timestamp.fromDate(new Date(updates.eventDate));
    }

    // Remove any undefined fields
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Update the story
    await storyRef.update(updateData);

    // Return success response
    return {success: true, id: storyId};
  } catch (error) {
    logger.error("Error in updateStory:", error);
    throw new Error(error instanceof Error ? error.message : "Unknown error");
  }
});

/**
 * Deletes a story (soft delete)
 */
export const deleteStory = onCall({
  region: DEFAULT_REGION,
  memory: "256MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  try {
    const {storyId, userId} = request.data;
    const callerUid = request.auth?.uid;

    if (!callerUid) {
      throw new Error("Authentication required");
    }

    // Validate request data
    if (!storyId) {
      throw new Error("Story ID is required");
    }

    if (!userId || userId !== callerUid) {
      throw new Error("Invalid user ID");
    }

    // Get Firestore instance
    const db = getFirestore();

    // Verify story exists and user has permission
    const storyRef = db.collection("stories").doc(storyId);
    const storyDoc = await storyRef.get();

    if (!storyDoc.exists) {
      throw new Error("Story not found");
    }

    const storyData = storyDoc.data();
    if (storyData?.authorID !== userId) {
      throw new Error("You don't have permission to delete this story");
    }

    // Soft delete the story
    await storyRef.update({
      isDeleted: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Return success response
    return {success: true};
  } catch (error) {
    logger.error("Error in deleteStory:", error);
    throw new Error(error instanceof Error ? error.message : "Unknown error");
  }
});

// MARK: - Like Functions

/**
 * Toggle like on a story
 */
export const likeStory = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  // Ensure authenticated
  if (!request.auth) {
    throw new Error("Authentication required");
  }

  const userId = request.auth.uid;
  const {storyId} = request.data;

  if (!storyId) {
    throw new Error("Story ID is required");
  }

  const db = getFirestore();
  const storyLikeRef = db.collection("storyLikes").doc(`${storyId}_${userId}`);
  const storyRef = db.collection("stories").doc(storyId);

  try {
    // Check if like already exists
    const likeDoc = await storyLikeRef.get();

    if (likeDoc.exists) {
      // Unlike: Delete the like document
      await storyLikeRef.delete();
      await storyRef.update({
        likeCount: FieldValue.increment(-1),
      });
      return {success: true, liked: false};
    } else {
      // Like: Create a new like document
      await storyLikeRef.set({
        userId,
        storyId,
        createdAt: FieldValue.serverTimestamp(),
      });
      await storyRef.update({
        likeCount: FieldValue.increment(1),
      });
      return {success: true, liked: true};
    }
  } catch (error) {
    logger.error("Error toggling story like:", error);
    throw new Error("Failed to toggle like on story");
  }
});

/**
 * Get users who liked a story
 */
export const getStoryLikes = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  // Ensure authenticated
  if (!request.auth) {
    throw new Error("Authentication required");
  }

  const {storyId} = request.data;

  if (!storyId) {
    throw new Error("Story ID is required");
  }

  const db = getFirestore();

  try {
    const likesSnapshot = await db.collection("storyLikes")
      .where("storyId", "==", storyId)
      .orderBy("createdAt", "desc")
      .get();

    if (likesSnapshot.empty) {
      return {likes: []};
    }

    // Get user info for each like
    const likes = await Promise.all(
      likesSnapshot.docs.map(async (doc) => {
        const likeData = doc.data();
        const userInfo = await getUserInfo(db, likeData.userId);
        return {
          userId: likeData.userId,
          createdAt: likeData.createdAt,
          user: userInfo,
        };
      })
    );

    return {likes};
  } catch (error) {
    logger.error("Error getting story likes:", error);
    throw new Error("Failed to get story likes");
  }
});

// MARK: - Comment Functions

/**
 * Add a comment to a story
 */
export const commentOnStory = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  // Ensure authenticated
  if (!request.auth) {
    throw new Error("Authentication required");
  }

  const userId = request.auth.uid;
  const {storyId, text, parentId} = request.data;

  if (!storyId || !text) {
    throw new Error("Story ID and comment text are required");
  }

  const db = getFirestore();
  const commentRef = db.collection("comments").doc();
  const storyRef = db.collection("stories").doc(storyId);

  try {
    // Get the story to make sure it exists
    const storyDoc = await storyRef.get();
    if (!storyDoc.exists) {
      throw new Error("Story not found");
    }

    // Create the comment
    const commentData: any = {
      id: commentRef.id,
      storyId,
      userId,
      text,
      createdAt: FieldValue.serverTimestamp(),
      likes: [],
      depth: 0, // Default depth for top-level comments
      parentPath: [], // Path to parent comments for nested queries
    };

    // If this is a reply, add the parent comment ID and update depth and path
    if (parentId) {
      const parentComment = await db.collection("comments").doc(parentId).get();
      if (!parentComment.exists) {
        throw new Error("Parent comment not found");
      }

      const parentData = parentComment.data() || {};
      commentData.parentId = parentId;

      // Set depth as parent depth + 1
      commentData.depth = (parentData.depth || 0) + 1;

      // Add parent to path, with path length limited to avoid excessive nesting
      commentData.parentPath = [
        ...(parentData.parentPath || []),
        parentId,
      ].slice(-5); // Limit path length to prevent excessive nesting
    }

    await commentRef.set(commentData);

    // Increment comment count on the story
    await storyRef.update({
      commentCount: FieldValue.increment(1),
    });

    // Get user info for the comment
    const userInfo = await getUserInfo(db, userId);

    // Convert server timestamp to actual timestamp since serverTimestamp()
    // returns an empty object when the comment is first created
    const now = new Date();
    const currentTimestamp = {
      seconds: Math.floor(now.getTime() / 1000),
      nanoseconds: 0,
    };

    return {
      success: true,
      comment: {
        ...commentData,
        // Replace the empty serverTimestamp with current timestamp
        createdAt: currentTimestamp,
        user: userInfo,
      },
    };
  } catch (error) {
    logger.error("Error adding comment:", error);
    throw new Error("Failed to add comment");
  }
});

/**
 * Get comments for a story
 */
export const getStoryComments = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  // Ensure authenticated
  if (!request.auth) {
    throw new Error("Authentication required");
  }

  const userId = request.auth.uid;
  const {storyId} = request.data;

  if (!storyId) {
    throw new Error("Story ID is required");
  }

  const db = getFirestore();
  logger.debug(`Fetching comments for story ID: ${storyId} by user ${userId}`);

  try {
    // Get all comments for the story, ordered by created time
    logger.debug(`Querying 'comments' collection for storyId: ${storyId}`);
    const allCommentsSnapshot = await db.collection("comments")
      .where("storyId", "==", storyId)
      .orderBy("createdAt", "desc")
      .get();

    logger.debug(`Retrieved ${allCommentsSnapshot.docs.length} total comments from Firestore`);

    // If no comments were found, return a successful response with empty comments array
    if (allCommentsSnapshot.empty) {
      logger.debug(`No comments found for story ID: ${storyId}`);
      return {
        status: "success",
        comments: [],
      };
    }

    // Organize comments into a hierarchy
    // First, create a map of all comments for quick lookup
    const commentMap: {[key: string]: any} = {};
    const commentDocs: {[key: string]: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>} = {};

    // Process all comments to build lookup maps
    allCommentsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      commentMap[doc.id] = {
        ...data,
        replies: [],
      };
      commentDocs[doc.id] = doc;
    });

    // Root level comments (no parent)
    const topLevelComments: any[] = [];

    // Process replies and build hierarchy
    for (const commentId in commentMap) {
      if (Object.prototype.hasOwnProperty.call(commentMap, commentId)) {
        const comment = commentMap[commentId];
        if (comment.parentId) {
          const parentComment = commentMap[comment.parentId];
          parentComment.replies.push(comment);
        } else {
          topLevelComments.push(comment);
        }
      }
    }

    // Process top-level comments and include their replies
    const comments = await Promise.all(
      topLevelComments.map(async (comment) => {
        const userInfo = await getUserInfo(db, comment.userId);

        return {
          ...comment,
          user: userInfo,
          // Add a flag for if the current user has liked this comment
          isLikedByMe: comment.likes && comment.likes.includes(userId),
          // Add replies for this comment
          replies: await Promise.all(comment.replies.map(async (reply: any) => {
            const replyUserInfo = await getUserInfo(db, reply.userId);

            // Process nested replies recursively
            const nestedReplies = await Promise.all(reply.replies.map(async (nestedReply: any) => {
              const nestedUserInfo = await getUserInfo(db, nestedReply.userId);
              return {
                ...nestedReply,
                user: nestedUserInfo,
                isLikedByMe: nestedReply.likes && nestedReply.likes.includes(userId),
              };
            }));

            return {
              ...reply,
              user: replyUserInfo,
              isLikedByMe: reply.likes && reply.likes.includes(userId),
              replies: nestedReplies,
            };
          })),
        };
      })
    );

    return {
      status: "success",
      comments,
    };
  } catch (error) {
    logger.error("Error getting story comments:", error);
    return {
      status: "error",
      message: "Failed to get story comments",
      error: error instanceof Error ? error.message : "Unknown error",
      comments: [],
    };
  }
});

/**
 * Toggle like on a comment
 */
export const likeComment = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  // Ensure authenticated
  if (!request.auth) {
    throw new Error("Authentication required");
  }

  const userId = request.auth.uid;
  const {commentId} = request.data;

  if (!commentId) {
    throw new Error("Comment ID is required");
  }

  const db = getFirestore();
  const commentRef = db.collection("comments").doc(commentId);

  try {
    // Get the comment
    const commentDoc = await commentRef.get();
    if (!commentDoc.exists) {
      throw new Error("Comment not found");
    }

    const commentData = commentDoc.data();
    if (!commentData) {
      throw new Error("Comment data not found");
    }

    const likes = commentData.likes || [];
    const isLiked = likes.includes(userId);

    if (isLiked) {
      // Unlike: Remove user ID from likes array
      await commentRef.update({
        likes: FieldValue.arrayRemove(userId),
      });
      return {success: true, liked: false};
    } else {
      // Like: Add user ID to likes array
      await commentRef.update({
        likes: FieldValue.arrayUnion(userId),
      });
      return {success: true, liked: true};
    }
  } catch (error) {
    logger.error("Error toggling comment like:", error);
    throw new Error("Failed to toggle like on comment");
  }
});

/**
 * Get users who liked a comment
 */
export const getCommentLikes = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  // Ensure authenticated
  if (!request.auth) {
    throw new Error("Authentication required");
  }

  const {commentId} = request.data;

  if (!commentId) {
    throw new Error("Comment ID is required");
  }

  const db = getFirestore();

  try {
    // Get the comment
    const commentDoc = await db.collection("comments").doc(commentId).get();
    if (!commentDoc.exists) {
      throw new Error("Comment not found");
    }

    const commentData = commentDoc.data();
    if (!commentData || !commentData.likes || commentData.likes.length === 0) {
      return {likes: []};
    }

    // Get user info for each person who liked the comment
    const likes = await Promise.all(
      commentData.likes.map(async (userId: string) => {
        const userInfo = await getUserInfo(db, userId);
        return {
          userId,
          user: userInfo,
        };
      })
    );

    return {likes};
  } catch (error) {
    logger.error("Error getting comment likes:", error);
    throw new Error("Failed to get comment likes");
  }
});

/**
 * Delete a comment
 */
export const deleteComment = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  // Ensure authenticated
  if (!request.auth) {
    throw new Error("Authentication required");
  }

  const userId = request.auth.uid;
  const {commentId} = request.data;

  if (!commentId) {
    throw new Error("Comment ID is required");
  }

  const db = getFirestore();
  const commentRef = db.collection("comments").doc(commentId);

  try {
    // Get the comment
    const commentDoc = await commentRef.get();
    if (!commentDoc.exists) {
      throw new Error("Comment not found");
    }

    const commentData = commentDoc.data();
    if (!commentData) {
      throw new Error("Comment data not found");
    }

    // Check if the user is the comment author
    if (commentData.userId !== userId) {
      throw new Error("You can only delete your own comments");
    }

    // Get the story reference to update comment count
    const storyRef = db.collection("stories").doc(commentData.storyId);

    // Get any replies to this comment
    const repliesSnapshot = await db.collection("comments")
      .where("parentId", "==", commentId)
      .get();

    // We need to update the comment count on the story
    // For each reply deleted, decrement the count by 1
    const decrementCount = 1 + repliesSnapshot.size;

    // Start a transaction to ensure consistency
    await db.runTransaction(async (transaction) => {
      // Delete any replies first
      repliesSnapshot.docs.forEach((doc) => {
        transaction.delete(doc.ref);
      });

      // Delete the comment itself
      transaction.delete(commentRef);

      // Update the story comment count
      transaction.update(storyRef, {
        commentCount: FieldValue.increment(-decrementCount),
      });
    });

    return {
      success: true,
      message: "Comment deleted successfully",
      deletedCommentCount: decrementCount,
    };
  } catch (error) {
    logger.error("Error deleting comment:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to delete comment");
  }
});

/**
 * Check if a user has liked a story
 */
export const checkStoryLikeStatus = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  // Ensure authenticated
  if (!request.auth) {
    throw new Error("Authentication required");
  }

  const userId = request.auth.uid;
  const {storyId} = request.data;

  if (!storyId) {
    throw new Error("Story ID is required");
  }

  const db = getFirestore();

  try {
    const likeDoc = await db.collection("storyLikes").doc(`${storyId}_${userId}`).get();
    return {isLiked: likeDoc.exists};
  } catch (error) {
    logger.error("Error checking story like status:", error);
    throw new Error("Failed to check story like status");
  }
});

/**
 * Synchronize pending stories that were created or modified while offline
 */
export const syncPendingStories = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  // Ensure authenticated
  if (!request.auth) {
    throw new Error("Authentication required");
  }

  const userId = request.auth.uid;
  const {pendingStories} = request.data;

  if (!pendingStories || !Array.isArray(pendingStories) || pendingStories.length === 0) {
    return {
      success: true,
      message: "No pending stories to sync",
      results: [],
    };
  }

  const db = getFirestore();
  const results = [];

  try {
    // Process each pending story
    for (const pendingStory of pendingStories) {
      const {id, operation, data} = pendingStory;

      // Validate required fields
      if (!id || !operation || !data) {
        results.push({
          id: id || "unknown",
          success: false,
          operation,
          error: "Missing required fields (id, operation, or data)",
        });
        continue;
      }

      // Validate operation
      if (!["create", "update", "delete"].includes(operation)) {
        results.push({
          id,
          success: false,
          operation,
          error: "Invalid operation. Must be 'create', 'update', or 'delete'",
        });
        continue;
      }

      // Check ownership for operations on existing stories
      if (operation !== "create") {
        const storyDoc = await db.collection("stories").doc(id).get();

        if (!storyDoc.exists) {
          results.push({
            id,
            success: false,
            operation,
            error: "Story not found",
          });
          continue;
        }

        const storyData = storyDoc.data();
        if (!storyData || storyData.authorID !== userId) {
          results.push({
            id,
            success: false,
            operation,
            error: "You can only modify your own stories",
          });
          continue;
        }
      }

      try {
        // Process based on operation type
        if (operation === "create") {
          // For create, ensure the story has required fields
          if (!data.title || !data.familyTreeId) {
            results.push({
              id,
              success: false,
              operation,
              error: "Missing required fields for story creation",
            });
            continue;
          }

          // Set creation metadata
          const storyData = {
            ...data,
            id,
            authorID: userId,
            createdAt: FieldValue.serverTimestamp(),
            isDeleted: false,
          };

          // Ensure we have required fields
          await db.collection("stories").doc(id).set(storyData);

          results.push({
            id,
            success: true,
            operation,
          });
        } else if (operation === "update") {
          // For update, remove fields that shouldn't be modified
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const {authorID, createdAt, isDeleted, ...updateData} = data;

          // Add updatedAt timestamp
          updateData.updatedAt = FieldValue.serverTimestamp();

          await db.collection("stories").doc(id).update(updateData);

          results.push({
            id,
            success: true,
            operation,
          });
        } else if (operation === "delete") {
          // For delete, we'll soft delete by setting isDeleted flag
          await db.collection("stories").doc(id).update({
            isDeleted: true,
            deletedAt: FieldValue.serverTimestamp(),
          });

          results.push({
            id,
            success: true,
            operation,
          });
        }
      } catch (opError) {
        logger.error(`Error processing ${operation} operation for story ${id}:`, opError);
        results.push({
          id,
          success: false,
          operation,
          error: opError instanceof Error ? opError.message : "Unknown error",
        });
      }
    }

    return {
      success: true,
      message: `Processed ${pendingStories.length} pending stories`,
      results,
    };
  } catch (error) {
    logger.error("Error syncing pending stories:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to sync pending stories");
  }
});
