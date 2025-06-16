import {onCall} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {ErrorCode, createError, withErrorHandling} from "./utils/errors";
import {withAuth, withResourceAccess, PermissionLevel, RateLimitType} from "./middleware";
import {sanitizeUserInput} from "./utils/xssSanitization";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";
import {generateStorySearchFields} from "./utils/searchHelpers";

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
      displayName:
        userData?.displayName ||
        `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim() ||
        "Anonymous",
      profilePicture: userData?.profilePictureUrl || userData?.profilePicture || undefined,
    };
  } catch (error) {
    logger.error("Error getting user info:", error);
    // This helper returning a default is acceptable, errors logged internally.
    return {
      id: userId,
      displayName: "Unknown User",
    };
  }
}

/**
 * Batch fetch user information for multiple users - optimized version
 * Reduces database reads from O(n) to O(⌈n/10⌉) using Firestore 'in' queries
 */
async function batchGetUserInfo(
  db: FirebaseFirestore.Firestore,
  userIds: string[]
): Promise<Map<string, UserInfo>> {
  const userInfoMap = new Map<string, UserInfo>();

  // Remove duplicates and filter out empty strings
  const uniqueUserIds = Array.from(new Set(userIds.filter((id) => id && id.trim())));

  if (uniqueUserIds.length === 0) {
    return userInfoMap;
  }

  try {
    // Process users in batches of 10 (Firestore 'in' query limit)
    const BATCH_SIZE = 10;
    for (let i = 0; i < uniqueUserIds.length; i += BATCH_SIZE) {
      const batch = uniqueUserIds.slice(i, i + BATCH_SIZE);

      const batchQuery = await db
        .collection("users")
        .where(admin.firestore.FieldPath.documentId(), "in", batch)
        .get();

      // Create map for quick lookup of fetched user data
      const batchResults = new Map<string, any>();
      batchQuery.docs.forEach((doc) => {
        batchResults.set(doc.id, doc.data());
      });

      // Process each user in batch, handling missing users
      batch.forEach((userId) => {
        const userData = batchResults.get(userId);
        if (userData) {
          userInfoMap.set(userId, {
            id: userId,
            displayName:
              userData.displayName ||
              `${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
              "Anonymous",
            profilePicture: userData.profilePictureUrl || userData.profilePicture || undefined,
          });
        } else {
          // Handle missing user with default values
          userInfoMap.set(userId, {
            id: userId,
            displayName: "Unknown User",
          });
        }
      });
    }
  } catch (error) {
    logger.error("Error batch getting user info:", error);
    // For missing users, provide defaults
    uniqueUserIds.forEach((userId) => {
      if (!userInfoMap.has(userId)) {
        userInfoMap.set(userId, {
          id: userId,
          displayName: "Unknown User",
        });
      }
    });
  }

  return userInfoMap;
}

// Helper function to commit deletions in batches for a collection
async function commitDeletionsInBatches(
  db: FirebaseFirestore.Firestore,
  collectionQuery: FirebaseFirestore.Query, // Pass a query instead of CollectionReference to allow pre-filtering if needed
  batchSize: number = 490 // Firestore limit is 500, stay safe
): Promise<number> {
  let snapshot = await collectionQuery.limit(batchSize).get();
  let numDeleted = 0;
  while (snapshot.size > 0) {
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    numDeleted += snapshot.size;
    logger.info(`Deleted batch of ${snapshot.size} items from query path.`);
    if (snapshot.size < batchSize) {
      break; // Last batch was processed
    }
    snapshot = await collectionQuery.limit(batchSize).get();
  }
  return numDeleted;
}

/**
 * Enriches story data with author and tagged people information
 * OPTIMIZED: Now uses batch user fetching for individual stories
 */
async function enrichStoryWithUserInfo(db: FirebaseFirestore.Firestore, story: Story) {
  try {
    // Get unique list of user IDs to fetch (author + tagged people)
    const userIds = Array.from(new Set([story.authorID, ...(story.peopleInvolved || [])]));

    // Fetch all user info using optimized batch function
    const userInfoMap = await batchGetUserInfo(db, userIds);

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
    // This helper returning a default is acceptable, errors logged internally.
    return {
      ...story,
      author: {id: story.authorID, displayName: "Unknown User"},
      taggedPeople: [],
    };
  }
}

/**
 * Batch enriches multiple stories with user data - MAXIMUM OPTIMIZATION
 * Reduces database reads from O(n×m) to O(⌈U/10⌉) where U = unique users across all stories
 */
async function batchEnrichStoriesWithUserInfo(db: FirebaseFirestore.Firestore, stories: Story[]) {
  try {
    if (stories.length === 0) {
      return [];
    }

    // Collect all unique user IDs across all stories
    const allUserIds = new Set<string>();
    stories.forEach((story) => {
      allUserIds.add(story.authorID);
      (story.peopleInvolved || []).forEach((userId) => allUserIds.add(userId));
    });

    // Single batch fetch for all users across all stories
    const userInfoMap = await batchGetUserInfo(db, Array.from(allUserIds));

    // Enrich all stories using O(1) lookups
    return stories.map((story) => {
      try {
        const author = userInfoMap.get(story.authorID);
        const taggedPeople = (story.peopleInvolved || [])
          .map((personId) => userInfoMap.get(personId))
          .filter((person) => person !== undefined);

        return {
          ...story,
          author,
          taggedPeople,
        };
      } catch (error) {
        logger.error(`Error enriching story ${story.id} in batch:`, error);
        return {
          ...story,
          author: {id: story.authorID, displayName: "Unknown User"},
          taggedPeople: [],
        };
      }
    });
  } catch (error) {
    logger.error("Error in batch enriching stories:", error);
    // Fallback to individual enrichment
    return Promise.all(stories.map((story) => enrichStoryWithUserInfo(db, story)));
  }
}
/**
 * Handles cascade deletion of child comments iteratively using breadth-first traversal.
 * This avoids deep recursion while still deleting all descendants.
 *
 * @param db Firestore database instance
 * @param parentCommentId ID of the comment whose children should be deleted
 * @param storyId ID of the story (for updating comment counts)
 * @param batch Firestore batch to add operations to
 * @param maxDepth Maximum allowed traversal depth
 * @returns Promise<number> Number of comments scheduled for deletion
 */
async function handleCascadeCommentDeletion(
  db: FirebaseFirestore.Firestore,
  parentCommentId: string,
  storyId: string,
  batch: FirebaseFirestore.WriteBatch,
  maxDepth: number = 10
): Promise<number> {
  try {
    const queue: Array<{ id: string; depth: number }> = [
      { id: parentCommentId, depth: 0 }
    ];
    let totalDeleted = 0;

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= maxDepth) {
        logger.warn(
          `Maximum traversal depth (${maxDepth}) reached while deleting children of ${id}`
        );
        continue;
      }

      const childCommentsQuery = await db
        .collection('comments')
        .where('parentCommentId', '==', id)
        .where('isDeleted', '==', false)
        .get();

      if (childCommentsQuery.empty) {
        continue;
      }

      logger.info(
        `Found ${childCommentsQuery.size} child comments to cascade delete for parent ${id} at depth ${depth}`
      );

      for (const childDoc of childCommentsQuery.docs) {
        const childId = childDoc.id;
        queue.push({ id: childId, depth: depth + 1 });

        batch.update(childDoc.ref, {
          isDeleted: true,
          text: '[deleted]',
          updatedAt: Timestamp.now(),
        });

        const storyRef = db.collection('stories').doc(storyId);
        batch.update(storyRef, {
          commentsCount: FieldValue.increment(-1),
        });

        totalDeleted += 1;

        logger.info(
          `Scheduled cascade deletion for child comment ${childId} (depth: ${depth})`
        );
      }
    }

    logger.info(
      `Scheduled ${totalDeleted} comments for deletion in cascade from parent ${parentCommentId}`
    );
    return totalDeleted;
  } catch (error) {
    logger.error(`Error during cascade comment deletion for parent ${parentCommentId}:`, error);
    throw createError(ErrorCode.INTERNAL, `Failed to cascade delete child comments: ${error}`);
  }
}


// MARK: - Cloud Functions

/**
 * Fetches stories accessible to a user
 */
export const getAccessibleStories = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const {userId, familyTreeId} = request.data;
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    if (!userId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "User ID is required");
    }
    // Ensure the user is requesting with their own ID
    if (userId !== callerUid) {
      throw createError(
        ErrorCode.PERMISSION_DENIED,
        "You can only access stories with your own user ID"
      );
    }
    if (!familyTreeId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Family tree ID is required");
    }

    const db = getFirestore();
    const storiesRef = db.collection("stories");

    // Get all non-deleted stories from the user's family tree
    const familyStoriesQuery = await storiesRef
      .where("familyTreeId", "==", familyTreeId)
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc")
      .get();

    // Filter stories based on privacy settings
    const filteredStories = familyStoriesQuery.docs
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
      });

    // OPTIMIZED: Batch enrich all stories with user data in a single operation
    // This reduces database reads from O(n×m) to O(⌈U/10⌉) where U = unique users
    const accessibleStories = await batchEnrichStoriesWithUserInfo(db, filteredStories);

    return {stories: accessibleStories};
  }, "getAccessibleStories")
);

/**
 * Fetches stories accessible to a user with pagination
 */
export const getAccessibleStoriesPaginated = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const {userId, familyTreeId, lastDocId, limit = 20} = request.data;
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    if (!userId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "User ID is required");
    }
    // Ensure the user is requesting with their own ID
    if (userId !== callerUid) {
      throw createError(
        ErrorCode.PERMISSION_DENIED,
        "You can only access stories with your own user ID"
      );
    }
    if (!familyTreeId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Family tree ID is required");
    }

    // Validate pagination parameters
    const validatedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100); // Between 1 and 100

    const db = getFirestore();
    const storiesRef = db.collection("stories");

    // Build query with pagination
    let query = storiesRef
      .where("familyTreeId", "==", familyTreeId)
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc")
      .limit(validatedLimit);

    // Add pagination cursor if provided
    if (lastDocId) {
      try {
        const lastDoc = await storiesRef.doc(lastDocId).get();
        if (lastDoc.exists) {
          query = query.startAfter(lastDoc);
        } else {
          logger.warn(`Last document ${lastDocId} not found, starting from beginning`);
        }
      } catch (error) {
        logger.error(`Error getting last document ${lastDocId}:`, error);
        // Continue without pagination if there's an error
      }
    }

    const familyStoriesQuery = await query.get();

    // Filter stories based on privacy settings (same logic as original)
    const filteredStories = familyStoriesQuery.docs
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
      });

    // OPTIMIZED: Batch enrich all stories with user data in a single operation
    // This reduces database reads from O(n×m) to O(⌈U/10⌉) where U = unique users
    const accessibleStories = await batchEnrichStoriesWithUserInfo(db, filteredStories);

    // Determine if there are more stories
    const hasMore = familyStoriesQuery.docs.length === validatedLimit;
    const newLastDocId = familyStoriesQuery.docs.length > 0 
      ? familyStoriesQuery.docs[familyStoriesQuery.docs.length - 1].id 
      : undefined;

    return {
      stories: accessibleStories,
      hasMore,
      lastDocId: newLastDocId
    };
  }, "getAccessibleStoriesPaginated")
);

/**
 * Fetches stories created by a specific user
 */
export const getUserStories = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const {userId} = request.data; // userId is the ID of the user whose stories are being requested
    const callerUid = request.auth?.uid;

    if (!callerUid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    // If userId is provided, it means we are fetching stories for a specific profile (could be self or other)
    // If userId is not provided, default to fetching stories for the caller.
    const targetUserId = userId || callerUid;

    // Additional check: If a specific userId is requested, ensure it's for a profile the caller can view.
    // This might involve checking familyTreeId or other privacy rules if fetching for someone else.
    // For now, let's assume if userId is passed, it's permissible, but this could be a point of enhancement.
    // If strictly only own stories, then:
    // if (targetUserId !== callerUid) {
    //   throw createError(ErrorCode.PERMISSION_DENIED, "You can only access your own stories with this endpoint if no specific userId is passed.");
    // }

    const db = getFirestore();
    const storiesRef = db.collection("stories");
    const userStoriesQuery = await storiesRef
      .where("authorID", "==", targetUserId)
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc")
      .get();

    logger.debug(`Found ${userStoriesQuery.docs.length} stories for user ${targetUserId}`);

    // Get story data from documents
    const storiesData = userStoriesQuery.docs.map((doc) => {
      return {
        id: doc.id,
        ...doc.data(),
      } as Story;
    });

    // OPTIMIZED: Batch enrich stories with user data
    // Reduces database reads from O(n×m) to O(⌈U/10⌉) where U = unique users
    const enrichedStories = await batchEnrichStoriesWithUserInfo(db, storiesData);

    return {stories: enrichedStories};
  }, "getUserStories")
);

/**
 * Fetches a single story by its ID
 */
export const getStoryById = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withResourceAccess(
    async (request, story) => {
      // Privacy Check for deleted stories
      if (story.isDeleted) {
        throw createError(ErrorCode.NOT_FOUND, "Story not found or has been deleted.");
      }

      const db = getFirestore();
      const storyToEnrich = {...story};
      storyToEnrich.id = request.data.storyId; // Set the id from request data
      const enrichedStory = await enrichStoryWithUserInfo(db, storyToEnrich);

      return {story: enrichedStory};
    },
    "getStoryById",
    {
      resourceType: "story",
      resourceIdField: "storyId",
      requiredLevel: [PermissionLevel.ADMIN, PermissionLevel.FAMILY_MEMBER],
      additionalPermissionCheck: async (resource, uid) => {
        // Check for custom access members if privacy is set to "custom"
        if (resource.privacy === "custom") {
          return resource.customAccessMembers?.includes(uid) || false;
        }
        // For family privacy, family membership check is handled by FAMILY_MEMBER level
        // For private stories, only author can access (handled by ADMIN level)
        return resource.privacy === "family";
      },
    }
  )
);

/**
 * Creates a new story
 */
export const createStory = onCall(
  {
    region: DEFAULT_REGION,
    memory: "512MiB", // Increased memory for potential large block data
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withAuth(
    async (request) => {
      try {
        if (!request.auth?.uid) {
          throw new Error("User not authenticated");
        }
        const callerUid = request.auth.uid;

        // Validate and sanitize input using centralized validator
        const validatedData = validateRequest(
          request.data,
          VALIDATION_SCHEMAS.createStory,
          callerUid
        );

        const storyData = validatedData.story;

        // Additional sanitization for blocks as they may contain HTML
        if (storyData.blocks && Array.isArray(storyData.blocks)) {
          storyData.blocks = storyData.blocks.map((block: StorageBlock) => {
            if (block.type === "text" && typeof block.data === "string") {
              // Allow basic HTML formatting for text blocks
              return {
                ...block,
                data: sanitizeUserInput(block.data, {
                  allowHtml: true,
                  allowedTags: ["b", "i", "u", "strong", "em", "p", "br", "blockquote"],
                  maxLength: 50000, // Allow longer content for story blocks
                }),
              };
            }
            return block;
          });
        }

        logger.info(`Creating story for user ${callerUid}`, {
          storyTitle: storyData.title,
          storyDataKeys: Object.keys(storyData),
        });

        // Extract fields from validated data
        const {
          title,
          authorID,
          privacy,
          blocks,
          familyTreeId,
          peopleInvolved, // Optional but good to have
          subtitle, // Optional
          eventDate, // Optional
          location, // Optional
          customAccessMembers, // Optional, but required if privacy is "custom"
          coverImageURL, // Optional
        } = storyData;

        if (!title || !authorID || !privacy || !blocks || !familyTreeId) {
          throw createError(
            ErrorCode.MISSING_PARAMETERS,
            "Missing required story fields: title, authorID, privacy, blocks, or familyTreeId."
          );
        }

        if (authorID !== callerUid) {
          throw createError(
            ErrorCode.PERMISSION_DENIED,
            "You can only create stories as yourself."
          );
        }

        if (privacy === "custom" && (!customAccessMembers || customAccessMembers.length === 0)) {
          throw createError(
            ErrorCode.MISSING_PARAMETERS,
            "Custom access members are required for 'custom' privacy setting."
          );
        }
        if (privacy !== "custom" && customAccessMembers && customAccessMembers.length > 0) {
          logger.warn(
            "customAccessMembers provided but privacy is not 'custom'. These will be ignored."
          );
        }

        // Validate block structure
        if (!Array.isArray(blocks) || blocks.length === 0) {
          throw createError(ErrorCode.INVALID_ARGUMENT, "Blocks must be a non-empty array");
        }

        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i];
          if (!block.type || !block.localId) {
            throw createError(
              ErrorCode.INVALID_ARGUMENT,
              `Block ${i} is missing required fields (type, localId)`
            );
          }

          const validTypes = ["text", "image", "video", "audio"];
          if (!validTypes.includes(block.type)) {
            throw createError(
              ErrorCode.INVALID_ARGUMENT,
              `Block ${i} has invalid type: ${block.type}`
            );
          }

          // Validate data exists
          if (block.data === undefined || block.data === null) {
            throw createError(ErrorCode.INVALID_ARGUMENT, `Block ${i} is missing data`);
          }
        }

        const db = getFirestore();
        const newStoryRef = db.collection("stories").doc();

        // Safe timestamp conversion
        let eventTimestamp: Timestamp | undefined = undefined;
        if (eventDate) {
          try {
            eventTimestamp = Timestamp.fromDate(new Date(eventDate));
          } catch (error: any) {
            logger.error(`Invalid eventDate format: ${eventDate}`, error);
            throw createError(ErrorCode.INVALID_ARGUMENT, `Invalid eventDate format: ${eventDate}`);
          }
        }

        const newStory: Story = {
          id: newStoryRef.id,
          title,
          subtitle: subtitle || "",
          authorID,
          createdAt: Timestamp.now(),
          eventDate: eventTimestamp,
          location: location || undefined,
          privacy,
          customAccessMembers: privacy === "custom" ? customAccessMembers : [],
          blocks,
          familyTreeId,
          peopleInvolved: peopleInvolved || [],
          isDeleted: false,
          coverImageURL: coverImageURL || undefined,
        };

        // Generate searchable fields for optimized search
        const searchFields = generateStorySearchFields(title, subtitle, blocks);

        try {
          await newStoryRef.set({
            ...newStory,
            ...searchFields,
          });
          logger.info(`Story created with ID: ${newStoryRef.id} by user ${callerUid}`);

          // Potentially, enrich and return the created story
          const enrichedStory = await enrichStoryWithUserInfo(db, newStory);
          return {story: enrichedStory};
        } catch (error: any) {
          logger.error("Error setting story document:", {
            error: error?.message || error,
            stack: error?.stack,
            storyId: newStoryRef.id,
            storyData: JSON.stringify(newStory, null, 2),
            callerUid,
          });
          throw createError(
            ErrorCode.INTERNAL,
            `Failed to create story: ${error?.message || error}`
          );
        }
      } catch (error: any) {
        logger.error("Unexpected error in createStory:", {
          error: error?.message || error,
          stack: error?.stack,
          requestData: JSON.stringify(request.data, null, 2),
          callerUid: request.auth?.uid,
        });

        // Re-throw if it's already a createError, otherwise wrap it
        if (error?.code && error?.message) {
          throw error;
        } else {
          throw createError(
            ErrorCode.INTERNAL,
            `Unexpected error creating story: ${error?.message || error}`
          );
        }
      }
    },
    "createStory",
    {
      authLevel: "verified", // Require verified user for story creation
      rateLimitConfig: {
        type: RateLimitType.WRITE,
        maxRequests: 10, // 10 stories per hour
        windowSeconds: 3600,
      },
    }
  )
);

/**
 * Updates an existing story
 */
export const updateStory = onCall(
  {
    region: DEFAULT_REGION,
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withResourceAccess(
    async (request, story) => {
      const {storyId, updates} = request.data;

      if (!updates || Object.keys(updates).length === 0) {
        throw createError(ErrorCode.MISSING_PARAMETERS, "No updates provided for the story.");
      }

      if (story.isDeleted) {
        throw createError(ErrorCode.ABORTED, "Cannot update a deleted story. Restore it first.");
      }

      const db = getFirestore();
      const storyRef = db.collection("stories").doc(storyId);

      // Validate updates: prevent changing authorID, id, createdAt, familyTreeId directly
      const forbiddenUpdates = ["authorID", "id", "createdAt", "familyTreeId", "isDeleted"];
      for (const key of forbiddenUpdates) {
        if (updates[key] !== undefined) {
          throw createError(ErrorCode.INVALID_ARGUMENT, `Cannot update protected field: ${key}.`);
        }
      }

      // Specific validation for privacy and customAccessMembers
      const newPrivacy = updates.privacy || story.privacy;
      const newCustomAccessMembers = updates.customAccessMembers || story.customAccessMembers;

      if (
        newPrivacy === "custom" &&
        (!newCustomAccessMembers || newCustomAccessMembers.length === 0)
      ) {
        throw createError(
          ErrorCode.MISSING_PARAMETERS,
          "Custom access members are required if privacy is set to 'custom'."
        );
      }
      if (newPrivacy !== "custom" && newCustomAccessMembers && newCustomAccessMembers.length > 0) {
        // If privacy is changing away from 'custom', ensure customAccessMembers is cleared.
        updates.customAccessMembers = [];
      }

      // Convert eventDate if provided
      if (updates.eventDate) {
        updates.eventDate = Timestamp.fromDate(new Date(updates.eventDate));
      }

      // Regenerate searchable fields if title, subtitle, or blocks are updated
      if (updates.title || updates.subtitle || updates.blocks) {
        const finalTitle = updates.title || story.title;
        const finalSubtitle = updates.subtitle !== undefined ? updates.subtitle : story.subtitle;
        const finalBlocks = updates.blocks || story.blocks;

        const searchFields = generateStorySearchFields(finalTitle, finalSubtitle, finalBlocks);
        Object.assign(updates, searchFields);
      }

      await storyRef.update(updates);
      logger.info(`Story ${storyId} updated by user ${request.auth?.uid}.`);

      const updatedStoryDoc = await storyRef.get();
      const updatedStoryData = {id: updatedStoryDoc.id, ...updatedStoryDoc.data()} as Story;
      const enrichedStory = await enrichStoryWithUserInfo(db, updatedStoryData);

      return {story: enrichedStory};
    },
    "updateStory",
    {
      resourceConfig: {
        resourceType: "story",
        resourceIdField: "storyId",
        requiredLevel: PermissionLevel.ADMIN, // Only story author can update
      },
    }
  )
);

/**
 * Deletes a story (soft delete)
 */
export const deleteStory = onCall(
  {
    region: DEFAULT_REGION,
    memory: "128MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withResourceAccess(
    async (request, story) => {
      const {storyId} = request.data;

      if (story.isDeleted) {
        throw createError(ErrorCode.ABORTED, "Story is already deleted.");
      }

      const db = getFirestore();
      const storyRef = db.collection("stories").doc(storyId);

      await storyRef.update({isDeleted: true});
      logger.info(`Story ${storyId} soft deleted by user ${request.auth?.uid}.`);

      // Also delete associated likes and comments
      // Note: This should ideally be a batched write or a separate cleanup process for very active stories.
      // For now, direct deletion for simplicity.

      const likesRef = db.collection('likes').where('storyId', '==', storyId);
      const commentsRef = db.collection('comments').where('storyId', '==', storyId);

      // Delete likes and comments concurrently for faster execution
      const [likesDeletedCount, commentsDeletedCount] = await Promise.all([
        commitDeletionsInBatches(db, likesRef),
        commitDeletionsInBatches(db, commentsRef),
      ]);
      logger.info(`Deleted ${likesDeletedCount} likes for story ${storyId}.`);
      logger.info(`Deleted ${commentsDeletedCount} comments for story ${storyId}.`);

      // await batch.commit();
      // logger.info(`Associated likes and comments for story ${storyId} deleted.`);

      return {
        success: true,
        message: `Story ${storyId} and its associations deleted successfully.`,
      };
    },
    "deleteStory",
    {
      resourceConfig: {
        resourceType: "story",
        resourceIdField: "storyId",
        requiredLevel: [PermissionLevel.ADMIN, PermissionLevel.TREE_OWNER], // Story author or tree owner can delete
      },
    }
  )
);

// MARK: - Likes

/**
 * Adds a like to a story
 */
export const likeStory = onCall(
  {
    region: DEFAULT_REGION,
    memory: "128MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withResourceAccess(
    async (request, story) => {
      const {storyId} = request.data;
      const userId = request.auth?.uid; // User who is liking the story

      if (story.isDeleted) {
        throw createError(ErrorCode.NOT_FOUND, "Story not found or has been deleted.");
      }

      const db = getFirestore();
      const storyRef = db.collection("stories").doc(storyId);
      const likeRef = db.collection("likes").doc(`${storyId}_${userId}`); // Composite ID for likes

      const likeDoc = await likeRef.get();
      if (likeDoc.exists) {
        throw createError(ErrorCode.ALREADY_EXISTS, "User has already liked this story.");
      }

      await likeRef.set({
        storyId: storyId,
        userId: userId,
        createdAt: Timestamp.now(),
      });

      // Atomically increment likes count on the story
      await storyRef.update({
        likesCount: FieldValue.increment(1),
      });

      logger.info(`User ${userId} liked story ${storyId}.`);
      return {success: true, message: "Story liked successfully."};
    },
    "likeStory",
    {
      resourceConfig: {
        resourceType: "story",
        resourceIdField: "storyId",
        requiredLevel: [PermissionLevel.ADMIN, PermissionLevel.FAMILY_MEMBER],
        additionalPermissionCheck: async (resource, uid) => {
          // Same access check as getStoryById - if you can view it, you can like it
          if (resource.privacy === "custom") {
            return resource.customAccessMembers?.includes(uid) || false;
          }
          return resource.privacy === "family";
        },
      },
    }
  )
);

/**
 * Removes a like from a story
 */
export const unlikeStory = onCall(
  {
    region: DEFAULT_REGION,
    memory: "128MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const {storyId} = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required to unlike a story.");
      }
      if (!storyId) {
        throw createError(ErrorCode.MISSING_PARAMETERS, "Story ID is required to unlike a story.");
      }

      const db = getFirestore();
      const storyRef = db.collection("stories").doc(storyId);
      const likeRef = db.collection("likes").doc(`${storyId}_${userId}`);

      const likeDoc = await likeRef.get();
      if (!likeDoc.exists) {
        throw createError(
          ErrorCode.NOT_FOUND,
          "Like not found. User might have already unliked or never liked the story."
        );
      }

      await likeRef.delete();

      // Atomically decrement likes count on the story
      // Ensure likesCount doesn't go below zero, though FieldValue.increment(-1) handles this well.
      await storyRef.update({
        likesCount: FieldValue.increment(-1),
      });

      logger.info(`User ${userId} unliked story ${storyId}.`);
      return {success: true, message: "Story unliked successfully."};
    },
    "unlikeStory",
    {
      authLevel: "auth",
    }
  )
);

/**
 * Fetches likes for a story
 */
export const getStoryLikes = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const {storyId, limit = 20, offset = 0} = request.data; // Add limit and offset for pagination
    const callerUid = request.auth?.uid;

    if (!callerUid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }
    if (!storyId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Story ID is required.");
    }

    const db = getFirestore();
    // First, verify story exists and caller can view it (important for privacy)
    const storyDoc = await db.collection("stories").doc(storyId).get();
    if (!storyDoc.exists || storyDoc.data()?.isDeleted) {
      throw createError(ErrorCode.NOT_FOUND, "Story not found or has been deleted.");
    }
    // Simplified privacy check: if they request likes, they should be able to view the story.
    // A full check like in getStoryById could be implemented here for stricter privacy.

    const likesQuery = db
      .collection("likes")
      .where("storyId", "==", storyId)
      .orderBy("createdAt", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    const likesSnapshot = await likesQuery.get();

    // OPTIMIZED: Batch fetch user info for all likes
    // Reduces database reads from O(n) to O(⌈n/10⌉) where n = number of likes
    const likeUserIds = likesSnapshot.docs.map((doc) => doc.data().userId);
    const userInfoMap = await batchGetUserInfo(db, likeUserIds);

    const likes = likesSnapshot.docs.map((doc) => {
      const likeData = doc.data();
      const userInfo = userInfoMap.get(likeData.userId)!;
      return {
        id: doc.id,
        userId: likeData.userId,
        storyId: likeData.storyId,
        createdAt: likeData.createdAt.toDate().toISOString(), // Convert to ISO string
        user: userInfo,
      };
    });

    // For pagination, also get total count
    const totalLikesQuery = db.collection("likes").where("storyId", "==", storyId);
    const totalLikesSnapshot = await totalLikesQuery.count().get();
    const totalLikes = totalLikesSnapshot.data().count;

    return {
      likes,
      totalLikes,
      limit: Number(limit),
      offset: Number(offset),
      hasMore: Number(offset) + likes.length < totalLikes,
    };
  }, "getStoryLikes")
);

// MARK: - Comments

interface Comment {
  id: string;
  storyId: string;
  authorID: string;
  text: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  parentCommentId?: string; // For threaded comments
  repliesCount?: number;
  likesCount?: number;
  isEdited?: boolean;
  isDeleted?: boolean; // Soft delete
}

/**
 * Adds a comment to a story
 */
export const addCommentToStory = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withResourceAccess(
    async (request, story) => {
      const {storyId, text, parentCommentId} = request.data;
      const authorID = request.auth?.uid;

      if (!text) {
        throw createError(ErrorCode.MISSING_PARAMETERS, "Comment text is required.");
      }
      if (text.trim().length === 0) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Comment text cannot be empty.");
      }
      if (text.length > 1000) {
        // Example limit
        throw createError(
          ErrorCode.INVALID_ARGUMENT,
          "Comment text exceeds maximum length of 1000 characters."
        );
      }

      if (story.isDeleted) {
        throw createError(ErrorCode.NOT_FOUND, "Story not found or has been deleted.");
      }

      const db = getFirestore();
      const storyRef = db.collection("stories").doc(storyId);
      const commentRef = db.collection("comments").doc();

      const newComment: Comment = {
        id: commentRef.id,
        storyId,
        authorID: authorID!,
        text,
        createdAt: Timestamp.now(),
        parentCommentId: parentCommentId || null, // Store as null if undefined
        repliesCount: 0,
        likesCount: 0,
        isEdited: false,
        isDeleted: false,
      };

      await commentRef.set(newComment);

      // Atomically increment comments count on the story
      await storyRef.update({
        commentsCount: FieldValue.increment(1),
      });

      // If it's a reply, increment repliesCount on parent comment
      if (parentCommentId) {
        const parentRef = db.collection("comments").doc(parentCommentId);
        await parentRef.update({
          repliesCount: FieldValue.increment(1),
        });
      }

      logger.info(`User ${authorID} added comment ${commentRef.id} to story ${storyId}.`);

      // Enrich and return the comment
      const authorInfo = await getUserInfo(db, authorID!);
      const enrichedComment = {
        ...newComment,
        createdAt: newComment.createdAt.toDate().toISOString(), // Convert to ISO string for client
        author: authorInfo,
      };

      return {comment: enrichedComment};
    },
    "addCommentToStory",
    {
      resourceType: "story",
      resourceIdField: "storyId",
      requiredLevel: [PermissionLevel.ADMIN, PermissionLevel.FAMILY_MEMBER],
      additionalPermissionCheck: async (resource, uid) => {
        // Same access check as getStoryById - if you can view it, you can comment
        if (resource.privacy === "custom") {
          return resource.customAccessMembers?.includes(uid) || false;
        }
        return resource.privacy === "family";
      },
    }
  )
);

/**
 * Updates a comment
 */
export const updateComment = onCall(
  {
    region: DEFAULT_REGION,
    memory: "128MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withResourceAccess(
    async (request, comment) => {
      const {commentId, text} = request.data;

      if (!text) {
        throw createError(ErrorCode.MISSING_PARAMETERS, "New text is required.");
      }
      if (text.trim().length === 0) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Comment text cannot be empty.");
      }
      if (text.length > 1000) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Comment text exceeds maximum length.");
      }

      if (comment.isDeleted) {
        throw createError(ErrorCode.ABORTED, "Cannot edit a deleted comment.");
      }

      const db = getFirestore();
      const commentRef = db.collection("comments").doc(commentId);

      await commentRef.update({
        text: text,
        updatedAt: Timestamp.now(),
        isEdited: true,
      });

      logger.info(`User ${request.auth?.uid} updated comment ${commentId}.`);

      // Enrich and return the updated comment
      const updatedCommentDoc = await commentRef.get();
      const updatedCommentData = {
        id: updatedCommentDoc.id,
        ...updatedCommentDoc.data(),
      } as Comment;
      const authorInfo = await getUserInfo(db, updatedCommentData.authorID);

      return {
        comment: {
          ...updatedCommentData,
          createdAt: updatedCommentData.createdAt.toDate().toISOString(),
          updatedAt: updatedCommentData.updatedAt?.toDate().toISOString(),
          author: authorInfo,
        },
      };
    },
    "updateComment",
    {
      resourceType: "comment",
      resourceIdField: "commentId",
      requiredLevel: PermissionLevel.ADMIN, // Only comment author can update
    }
  )
);

/**
 * Deletes a comment (soft delete) and cascades deletion to all child comments.
 * When a comment is deleted, all replies to that comment are also automatically deleted
 * to maintain data integrity and prevent orphaned comments.
 */
export const deleteComment = onCall(
  {
    region: DEFAULT_REGION,
    memory: "128MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withResourceAccess(
    async (request, comment) => {
      const {commentId} = request.data;

      if (comment.isDeleted) {
        throw createError(ErrorCode.ABORTED, "Comment is already deleted.");
      }

      const db = getFirestore();
      const commentRef = db.collection("comments").doc(commentId);

      const batch = db.batch();
      batch.update(commentRef, {isDeleted: true, text: "[deleted]"}); // Clear text for deleted comments

      // Decrement counts
      const storyRef = db.collection("stories").doc(comment.storyId);
      batch.update(storyRef, {commentsCount: FieldValue.increment(-1)});

      if (comment.parentCommentId) {
        const parentCommentRef = db.collection("comments").doc(comment.parentCommentId);
        batch.update(parentCommentRef, {repliesCount: FieldValue.increment(-1)});
      }

      // Handle cascade deletion of child comments
      const cascadeDeletedCount = await handleCascadeCommentDeletion(
        db,
        commentId,
        comment.storyId,
        batch
      );

      if (cascadeDeletedCount > 0) {
        logger.info(
          `Cascade deletion will remove ${cascadeDeletedCount} child comments for parent comment ${commentId}`
        );

        // Check if we're approaching Firestore batch limits (500 operations max)
        // Each comment deletion involves 2 operations: update comment + update story count
        const estimatedOperations = 3 + cascadeDeletedCount * 2; // 3 for parent (comment + story + possible parent update) + 2 per child

        if (estimatedOperations > 450) {
          // Leave some buffer
          logger.warn(
            `Large cascade deletion detected (${estimatedOperations} estimated operations). Consider implementing batched deletion for better performance.`
          );
        }
      }

      await batch.commit();
      logger.info(`User ${request.auth?.uid} deleted comment ${commentId}.`);
      return {success: true, message: "Comment deleted successfully."};
    },
    "deleteComment",
    {
      resourceType: "comment",
      resourceIdField: "commentId",
      requiredLevel: [PermissionLevel.ADMIN, PermissionLevel.TREE_OWNER], // Comment author or tree owner can delete
      additionalPermissionCheck: async (resource, uid) => {
        // Also allow story authors to delete comments on their stories
        const db = getFirestore();
        const storyDoc = await db.collection("stories").doc(resource.storyId).get();
        if (storyDoc.exists) {
          const storyData = storyDoc.data();
          return storyData?.authorID === uid;
        }
        return false;
      },
    }
  )
);

/**
 * Fetches comments for a story (paginated, can fetch top-level or replies)
 */
export const getStoryComments = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const {storyId, parentCommentId = null, limit = 10, offset = 0} = request.data;
    const callerUid = request.auth?.uid;

    if (!callerUid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }
    if (!storyId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Story ID is required.");
    }

    const db = getFirestore();
    // Verify story exists and is accessible (simplified check)
    const storyDoc = await db.collection("stories").doc(storyId).get();
    if (!storyDoc.exists || storyDoc.data()?.isDeleted) {
      throw createError(ErrorCode.NOT_FOUND, "Story not found or has been deleted.");
    }

    let commentsQuery = db
      .collection("comments")
      .where("storyId", "==", storyId)
      .where("isDeleted", "==", false) // Don't fetch soft-deleted comments directly
      .orderBy("createdAt", "asc"); // Replies usually shown oldest to newest, or by likes

    if (parentCommentId) {
      commentsQuery = commentsQuery.where("parentCommentId", "==", parentCommentId);
    } else {
      // Fetch only top-level comments if no parentCommentId is provided
      commentsQuery = commentsQuery.where("parentCommentId", "==", null);
    }

    // Count total before pagination for metadata
    const totalCountSnapshot = await commentsQuery.count().get();
    const totalComments = totalCountSnapshot.data().count;

    // Apply pagination
    commentsQuery = commentsQuery.limit(Number(limit)).offset(Number(offset));

    const commentsSnapshot = await commentsQuery.get();

    // OPTIMIZED: Batch fetch author info for all comments
    // Reduces database reads from O(n) to O(⌈n/10⌉) where n = number of comments
    const commentAuthorIds = commentsSnapshot.docs.map((doc) => (doc.data() as Comment).authorID);
    const authorInfoMap = await batchGetUserInfo(db, commentAuthorIds);

    const comments = commentsSnapshot.docs.map((doc) => {
      const commentData = doc.data() as Comment;
      const authorInfo = authorInfoMap.get(commentData.authorID)!;
      // TODO: Add user's like status for each comment if implementing comment likes
      return {
        ...commentData,
        id: doc.id,
        createdAt: commentData.createdAt.toDate().toISOString(),
        updatedAt: commentData.updatedAt?.toDate().toISOString(),
        author: authorInfo,
      };
    });

    return {
      comments,
      totalComments,
      limit: Number(limit),
      offset: Number(offset),
      hasMore: Number(offset) + comments.length < totalComments,
      parentCommentId,
    };
  }, "getStoryComments")
);

// MARK: - Search and Discovery (Example - could be expanded)

/**
 * Searches stories by title or content (basic implementation)
 * Note: Firestore is not ideal for full-text search. For advanced search,
 * consider Algolia, Elasticsearch, or Typesense.
 */
export const searchStories = onCall(
  {
    region: DEFAULT_REGION,
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withErrorHandling(async (request) => {
    const {query, familyTreeId} = request.data;
    const callerUid = request.auth?.uid;

    if (!callerUid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }
    if (!query || typeof query !== "string" || query.trim() === "") {
      throw createError(
        ErrorCode.MISSING_PARAMETERS,
        "Search query is required and must be a non-empty string."
      );
    }
    if (!familyTreeId) {
      throw createError(
        ErrorCode.MISSING_PARAMETERS,
        "FamilyTree ID is required for search context."
      );
    }

    const db = getFirestore();

    // Normalize the search query for comparison with searchable fields
    const normalizedQuery = query.toLowerCase().trim();

    // Create queries for different searchable fields
    const storiesRef = db.collection("stories");

    // Query 1: Search in searchableTitle (optimized with Firestore index)
    const titleQuery = storiesRef
      .where("familyTreeId", "==", familyTreeId)
      .where("isDeleted", "==", false)
      .where("searchableTitle", ">=", normalizedQuery)
      .where("searchableTitle", "<=", normalizedQuery + "\uf8ff")
      .limit(50); // Limit results for performance

    // Query 2: Search in searchableContent (optimized with Firestore index)
    const contentQuery = storiesRef
      .where("familyTreeId", "==", familyTreeId)
      .where("isDeleted", "==", false)
      .where("searchableContent", ">=", normalizedQuery)
      .where("searchableContent", "<=", normalizedQuery + "\uf8ff")
      .limit(50);

    // Query 3: Search in keywords array (optimized with array-contains)
    const keywordQuery = storiesRef
      .where("familyTreeId", "==", familyTreeId)
      .where("isDeleted", "==", false)
      .where("searchKeywords", "array-contains", normalizedQuery)
      .limit(50);

    // Execute all queries in parallel for better performance
    const [titleResults, contentResults, keywordResults] = await Promise.all([
      titleQuery.get(),
      contentQuery.get(),
      keywordQuery.get(),
    ]);

    // Combine results and deduplicate
    const matchedStoriesMap = new Map<string, Story>();

    // Helper function to add story if it passes privacy checks
    const addStoryIfAllowed = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const story = {id: doc.id, ...doc.data()} as Story;

      // Privacy filter - only add if user has access
      if (
        story.authorID === callerUid ||
        story.privacy === "family" ||
        (story.privacy === "custom" && story.customAccessMembers?.includes(callerUid))
      ) {
        matchedStoriesMap.set(doc.id, story);
      }
    };

    // Process all results
    titleResults.docs.forEach(addStoryIfAllowed);
    contentResults.docs.forEach(addStoryIfAllowed);
    keywordResults.docs.forEach(addStoryIfAllowed);

    // OPTIMIZED: Batch enrich search results with user data
    // Reduces database reads from O(n×m) to O(⌈U/10⌉) where U = unique users
    const matchedStories = Array.from(matchedStoriesMap.values());
    const enrichedResults = await batchEnrichStoriesWithUserInfo(db, matchedStories);

    // Sort results (e.g., by relevance if a scoring mechanism was used, or by date)
    enrichedResults.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

    return {stories: enrichedResults};
  }, "searchStories")
);
