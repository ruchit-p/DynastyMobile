import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT, DEFAULT_MEMORY} from "./common";
import {
  createError,
  withErrorHandling,
  ErrorCode,
} from "./utils/errors";
import {withAuth} from "./middleware";
import {SECURITY_CONFIG} from "./config/security-config";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";
import {validateLocation as validateLocationCoords} from "./utils/validation-extended";

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore();
const storage = getStorage();

// MARK: - Types

export interface EventLocation {
  address: string;
  lat: number;
  lng: number;
}

export interface EventDaySpecificTime {
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
}

export interface EventData {
  id?: string; // Optional on create, required on fetch/update
  hostId: string;
  title: string;
  description?: string;
  eventDate: string; // YYYY-MM-DD (start date for multi-day)
  endDate?: string | null; // YYYY-MM-DD (end date for multi-day)
  startTime?: string | null; // HH:mm (general start time if not day-specific)
  endTime?: string | null; // HH:mm (general end time if not day-specific)
  timezone?: string | null; // e.g., "America/New_York"
  // For multi-day events with varying times per day
  daySpecificTimes?: Record<string, EventDaySpecificTime> | null; // Key is YYYY-MM-DD
  location?: EventLocation | null;
  isVirtual: boolean;
  virtualLink?: string | null;
  coverPhotoStoragePaths?: string[]; // Store relative paths to GCS
  coverPhotoUrls?: string[]; // For client consumption, generated on demand
  privacy: "public" | "family_tree" | "invite_only"; // More granular privacy
  allowGuestPlusOne: boolean;
  showGuestList: boolean;
  requireRsvp: boolean;
  rsvpDeadline?: string | null; // YYYY-MM-DDTHH:mm:ssZ or just YYYY-MM-DD
  // Details
  dressCode?: string | null;
  whatToBring?: string | null;
  additionalInfo?: string | null;
  // Tracking
  invitedMemberIds?: string[]; // Users explicitly invited
  familyTreeId?: string | null; // If privacy is 'family_tree'
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface EventInvitation {
  id?: string; // document ID
  eventId: string;
  userId: string; // ID of the invited user
  status: "pending" | "accepted" | "declined" | "maybe";
  plusOne?: boolean;
  plusOneName?: string | null;
  respondedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface EventComment {
  id?: string;
  eventId: string;
  userId: string;
  text: string;
  parentId?: string | null; // For threaded comments
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  // User details can be denormalized here or fetched separately
  userName?: string;
  userProfilePicture?: string;
}

export interface Attendee extends EventInvitation {
  userName?: string;
  userProfilePicture?: string;
}

export interface EnrichedEventData extends EventData {
  hostName?: string;
  hostProfilePicture?: string;
  isHost?: boolean;
  userRsvpStatus?: EventInvitation["status"];
  userHasPlusOne?: boolean;
}

export interface ThreadedComment extends EventComment {
  replies?: ThreadedComment[];
  replyCount?: number;
}

export interface EventInvitationWithUser extends EventInvitation {
  userName?: string;
  userProfilePicture?: string;
  userEmail?: string;
}

// MARK: - Helper Functions

/**
 * Validates date format (YYYY-MM-DD) and ensures it's a valid date.
 */
function validateDateFormat(dateString: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return date.toISOString().split("T")[0] === dateString;
}

/**
 * Validates time format (HH:mm) and ensures it's a valid time.
 */
function validateTimeFormat(timeString: string): boolean {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(timeString);
}

/**
 * Validates timezone string.
 */
function validateTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, {timeZone: timezone});
    return true;
  } catch {
    return false;
  }
}


/**
 * Optimized function to enrich events with user data using batch fetching.
 */
async function enrichEventListOptimized(
  events: EventData[],
  uid: string,
): Promise<EnrichedEventData[]> {
  if (events.length === 0) return [];

  // Collect all unique host IDs
  const hostIds = [...new Set(events.map((event) => event.hostId))];
  const eventIds = events.map((event) => event.id).filter(Boolean) as string[];

  // Batch fetch host data
  const hostDataMap = new Map<string, any>();
  if (hostIds.length > 0) {
    // Firestore 'in' query limit is 10, so we need to batch
    const hostBatches = [];
    for (let i = 0; i < hostIds.length; i += 10) {
      hostBatches.push(hostIds.slice(i, i + 10));
    }

    for (const batch of hostBatches) {
      const hostSnapshot = await db.collection("users")
        .where(admin.firestore.FieldPath.documentId(), "in", batch)
        .get();

      hostSnapshot.forEach((doc) => {
        const userData = doc.data();
        hostDataMap.set(doc.id, {
          displayName: userData?.displayName || `${userData?.firstName} ${userData?.lastName}`.trim() || "Unknown Host",
          profilePictureUrl: userData?.profilePictureUrl,
        });
      });
    }
  }

  // Batch fetch RSVP data for the user
  const rsvpDataMap = new Map<string, EventInvitation>();
  if (eventIds.length > 0) {
    const rsvpPromises = eventIds.map(async (eventId) => {
      try {
        const rsvpDoc = await db.collection("events").doc(eventId).collection("rsvps").doc(uid).get();
        if (rsvpDoc.exists) {
          rsvpDataMap.set(eventId, rsvpDoc.data() as EventInvitation);
        }
      } catch (err) {
        logger.warn(`Could not fetch RSVP for event ${eventId}:`, err);
      }
    });
    await Promise.all(rsvpPromises);
  }

  // Enrich events
  const enrichedEvents: EnrichedEventData[] = [];
  for (const event of events) {
    if (!event.id) {
      logger.warn("enrichEventListOptimized: Skipping event due to missing ID", event);
      continue;
    }

    const enrichedEvent: EnrichedEventData = {
      ...event,
      isHost: event.hostId === uid,
    };

    // Generate cover photo URLs
    if (event.coverPhotoStoragePaths && event.coverPhotoStoragePaths.length > 0) {
      try {
        enrichedEvent.coverPhotoUrls = await generateSignedUrlsForPaths(event.coverPhotoStoragePaths);
      } catch (err) {
        logger.warn(`Could not generate cover photo URLs for event ${event.id}:`, err);
        enrichedEvent.coverPhotoUrls = [];
      }
    }

    // Add host details from batch data
    const hostData = hostDataMap.get(event.hostId);
    if (hostData) {
      enrichedEvent.hostName = hostData.displayName;
      enrichedEvent.hostProfilePicture = hostData.profilePictureUrl;
    }

    // Add RSVP status from batch data
    const rsvpData = rsvpDataMap.get(event.id);
    if (rsvpData) {
      enrichedEvent.userRsvpStatus = rsvpData.status;
      enrichedEvent.userHasPlusOne = rsvpData.plusOne;
    }

    enrichedEvents.push(enrichedEvent);
  }

  return enrichedEvents;
}

/**
 * Organizes flat comments into a threaded structure.
 */
function organizeCommentsIntoThreads(comments: EventComment[]): ThreadedComment[] {
  const commentMap = new Map<string, ThreadedComment>();
  const rootComments: ThreadedComment[] = [];

  // First pass: create ThreadedComment objects
  comments.forEach((comment) => {
    const threadedComment: ThreadedComment = {
      ...comment,
      replies: [],
      replyCount: 0,
    };
    commentMap.set(comment.id!, threadedComment);
  });

  // Second pass: organize into threads
  comments.forEach((comment) => {
    const threadedComment = commentMap.get(comment.id!)!;

    if (comment.parentId) {
      const parent = commentMap.get(comment.parentId);
      if (parent) {
        parent.replies!.push(threadedComment);
        parent.replyCount = (parent.replyCount || 0) + 1;
      } else {
        // Parent not found, treat as root comment
        rootComments.push(threadedComment);
      }
    } else {
      rootComments.push(threadedComment);
    }
  });

  // Sort replies by creation time
  const sortReplies = (comments: ThreadedComment[]) => {
    comments.forEach((comment) => {
      if (comment.replies && comment.replies.length > 0) {
        comment.replies.sort((a, b) => {
          const aTime = a.createdAt?.toMillis() || 0;
          const bTime = b.createdAt?.toMillis() || 0;
          return aTime - bTime;
        });
        sortReplies(comment.replies);
      }
    });
  };

  sortReplies(rootComments);
  return rootComments;
}

/**
 * Generates signed URLs for an array of GCS storage paths.
 * @param storagePaths Array of GCS storage paths.
 * @param expiresInMs Expiration time for the URLs in milliseconds.
 * @returns Array of signed URLs.
 */
async function generateSignedUrlsForPaths(storagePaths: string[], expiresInMs: number = 15 * 60 * 1000): Promise<string[]> {
  if (!storagePaths || storagePaths.length === 0) {
    return [];
  }
  const bucket = storage.bucket();
  try {
    const urls = await Promise.all(
      storagePaths.map(async (path) => {
        const [url] = await bucket.file(path).getSignedUrl({
          action: "read",
          expires: Date.now() + expiresInMs,
          version: "v4",
        });
        return url;
      }),
    );
    return urls;
  } catch (error) {
    logger.error("Error generating signed URLs for event cover photos:", error);
    // Depending on strictness, could throw or return empty/partial
    return storagePaths.map(() => ""); // Return empty strings on failure for partial success
  }
}

/**
 * Checks if a user has permission to access/modify an event.
 * This is a basic check, can be expanded with roles (host, admin, attendee).
 */
async function ensureEventAccess(
  eventId: string,
  userId: string,
  requiredAccess: "view" | "edit" | "admin" = "view",
): Promise<EventData> {
  const eventRef = db.collection("events").doc(eventId);
  const eventDoc = await eventRef.get();

  if (!eventDoc.exists) {
    throw createError(ErrorCode.NOT_FOUND, `Event ${eventId} not found.`);
  }

  const eventData = eventDoc.data() as EventData;

  // TODO: Implement more granular permission logic based on eventData.privacy, eventData.hostId, familyTreeId, invitedMemberIds etc.
  // For now, very basic checks:
  if (requiredAccess === "edit" || requiredAccess === "admin") {
    if (eventData.hostId !== userId) {
      // Check if user is a designated admin for the event if that role exists
      throw createError(ErrorCode.PERMISSION_DENIED, `User ${userId} does not have permission to edit event ${eventId}.`);
    }
  }
  // For 'view' access, further checks might be needed based on privacy
  // e.g., if 'invite_only', check if userId is in invitedMemberIds or is host
  // if 'family_tree', check if user belongs to that family tree
  return eventData;
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
    // Fetch the next batch. We don't need startAfter because we're deleting.
    // The next query will naturally fetch the next set of documents.
    snapshot = await collectionQuery.limit(batchSize).get();
  }
  return numDeleted;
}

/**
 * Recursively handles cascade deletion of child event comments when a parent comment is deleted
 *
 * @param db Firestore database instance
 * @param eventId Event ID that contains the comments
 * @param parentCommentId Comment ID of the parent being deleted
 * @param currentDepth Current recursion depth to prevent infinite loops
 * @param maxDepth Maximum allowed recursion depth
 * @returns Promise resolving to the number of child comments scheduled for deletion
 */
async function handleEventCommentCascadeDeletion(
  db: FirebaseFirestore.Firestore,
  eventId: string,
  parentCommentId: string,
  currentDepth: number = 0,
  maxDepth: number = 10
): Promise<number> {
  try {
    // Prevent infinite recursion
    if (currentDepth >= maxDepth) {
      logger.warn(`Max recursion depth ${maxDepth} reached for event comment cascade deletion. Comment: ${parentCommentId}, Event: ${eventId}`);
      return 0;
    }

    // Find all direct child comments of the parent
    const childCommentsQuery = await db.collection("events")
      .doc(eventId)
      .collection("comments")
      .where("parentId", "==", parentCommentId)
      .get();

    if (childCommentsQuery.empty) {
      logger.info(`No child comments found for parent event comment ${parentCommentId} in event ${eventId}`);
      return 0;
    }

    logger.info(`Found ${childCommentsQuery.size} child comments to cascade delete for parent ${parentCommentId} in event ${eventId}`);

    let totalDeleted = 0;

    // Process each child comment
    for (const childDoc of childCommentsQuery.docs) {
      const childCommentId = childDoc.id;

      // Recursively handle grandchildren first (depth-first deletion)
      const childrenDeleted = await handleEventCommentCascadeDeletion(
        db,
        eventId,
        childCommentId,
        currentDepth + 1,
        maxDepth
      );

      // Delete this child comment
      await childDoc.ref.delete();
      totalDeleted += 1 + childrenDeleted;

      logger.info(`Deleted event comment ${childCommentId} and ${childrenDeleted} of its descendants from event ${eventId}`);
    }

    logger.info(`Deleted ${totalDeleted} event comments in cascade from parent ${parentCommentId} in event ${eventId}`);
    return totalDeleted;
  } catch (error) {
    logger.error(`Error in event comment cascade deletion for comment ${parentCommentId} in event ${eventId}:`, error);
    throw createError(ErrorCode.INTERNAL, `Failed to cascade delete event comments: ${error}`);
  }
}

// MARK: - Event CRUD Functions

export const createEvent = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withAuth(async (request) => {
    const uid = request.auth?.uid || "";

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.createEvent,
      uid
    );

    const eventData = validatedData as Omit<EventData, "id" | "createdAt" | "updatedAt" | "coverPhotoUrls" | "hostId">;

    // Additional custom validations not covered by the schema

    // Validate date format (already validated as string in schema)
    if (!validateDateFormat(eventData.eventDate)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid event date format. Use YYYY-MM-DD.");
    }

    // Validate end date if provided
    if (eventData.endDate && !validateDateFormat(eventData.endDate)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid end date format. Use YYYY-MM-DD.");
    }

    // Validate date logic
    if (eventData.endDate && eventData.endDate < eventData.eventDate) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "End date cannot be before start date.");
    }

    // Validate time formats
    if (eventData.startTime && !validateTimeFormat(eventData.startTime)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid start time format. Use HH:mm.");
    }

    if (eventData.endTime && !validateTimeFormat(eventData.endTime)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid end time format. Use HH:mm.");
    }

    // Validate timezone
    if (eventData.timezone && !validateTimezone(eventData.timezone)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid timezone format.");
    }

    // Validate location using the extended validation
    if (eventData.location) {
      validateLocationCoords(eventData.location);
      if (!eventData.location.address || eventData.location.address.trim().length === 0) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Location address must not be empty.");
      }
    }

    // Validate virtual event requirements
    if (eventData.isVirtual && !eventData.virtualLink) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Virtual link is required for virtual events.");
    }

    // Validate RSVP deadline
    if (eventData.rsvpDeadline) {
      try {
        const deadlineDate = new Date(eventData.rsvpDeadline);
        const eventDate = new Date(eventData.eventDate);
        if (deadlineDate > eventDate) {
          throw createError(ErrorCode.INVALID_ARGUMENT, "RSVP deadline cannot be after the event date.");
        }
      } catch (error) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid RSVP deadline format.");
      }
    }

    // Validate day-specific times if provided
    if (eventData.daySpecificTimes) {
      for (const [date, times] of Object.entries(eventData.daySpecificTimes)) {
        if (!validateDateFormat(date)) {
          throw createError(ErrorCode.INVALID_ARGUMENT, `Invalid date format in daySpecificTimes: ${date}`);
        }
        if (!validateTimeFormat(times.startTime) || !validateTimeFormat(times.endTime)) {
          throw createError(ErrorCode.INVALID_ARGUMENT, `Invalid time format in daySpecificTimes for ${date}`);
        }
      }
    }

    const newEventRef = db.collection("events").doc();
    const newEventId = newEventRef.id;

    const finalEventData: EventData = {
      ...eventData,
      id: newEventId,
      hostId: uid,
      // Ensure coverPhotoUrls is not directly set, it's generated on fetch
      coverPhotoStoragePaths: eventData.coverPhotoStoragePaths || [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await newEventRef.set(finalEventData);
    logger.info(`Event created by ${uid} with ID: ${newEventId}`, {eventId: newEventId});

    // Optionally, auto-RSVP the host
    const rsvpRef = db.collection("events").doc(newEventId).collection("rsvps").doc(uid);
    await rsvpRef.set({
      eventId: newEventId,
      userId: uid,
      status: "accepted", // Host is always going
      plusOne: false,
      respondedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    } as EventInvitation);

    // Send SMS notifications to invited members
    if (eventData.invitedMemberIds && eventData.invitedMemberIds.length > 0) {
      try {
        const {getTwilioService} = await import("./services/twilioService");
        const twilioService = getTwilioService();

        // Get invited users' details
        const invitedUsersSnapshot = await db.collection("users")
          .where("__name__", "in", eventData.invitedMemberIds)
          .get();

        // Get host details
        const hostDoc = await db.collection("users").doc(uid).get();
        const hostData = hostDoc.data();
        const hostName = hostData?.displayName || `${hostData?.firstName} ${hostData?.lastName}` || "Someone";

        // Send SMS to each invited user who has SMS enabled
        const smsPromises = invitedUsersSnapshot.docs.map(async (userDoc) => {
          const userData = userDoc.data();
          if (userData.phoneNumber && userData.smsPreferences?.enabled && userData.smsPreferences?.eventInvites) {
            try {
              const eventDate = new Date(eventData.eventDate);
              const dateString = eventDate.toLocaleDateString("en-US", {month: "short", day: "numeric"});
              const eventLink = `https://mydynastyapp.com/events/${newEventId}`;

              await twilioService.sendSms(
                {
                  to: userData.phoneNumber,
                  body: `${hostName} invited you to "${eventData.title}" on ${dateString}. RSVP here: ${eventLink}`,
                },
                uid,
                "event_invite",
                {
                  eventId: newEventId,
                  inviteeId: userDoc.id,
                }
              );
              logger.info(`Sent event invitation SMS to user ${userDoc.id}`);
            } catch (smsError) {
              logger.error(`Failed to send SMS to user ${userDoc.id}:`, smsError);
            }
          }
        });

        await Promise.allSettled(smsPromises);
      } catch (error) {
        // Log error but don't fail the event creation
        logger.error("Failed to send event invitation SMS notifications:", error);
      }
    }

    return {eventId: newEventId, eventData: finalEventData};
  }, "createEvent", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  }),
);

export const getEventDetails = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }
    const {eventId} = request.data;
    if (!eventId || typeof eventId !== "string") {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Event ID is required.");
    }

    const eventData = await ensureEventAccess(eventId, uid, "view"); // Basic view access check

    // Enrich with dynamic coverPhotoUrls
    if (eventData.coverPhotoStoragePaths && eventData.coverPhotoStoragePaths.length > 0) {
      eventData.coverPhotoUrls = await generateSignedUrlsForPaths(eventData.coverPhotoStoragePaths);
    }

    // Enrich with host details (example)
    let hostName = "Unknown Host";
    let hostProfilePicture = undefined;
    try {
      const hostDoc = await db.collection("users").doc(eventData.hostId).get();
      if (hostDoc.exists) {
        const hostUserData = hostDoc.data();
        hostName = hostUserData?.displayName || `${hostUserData?.firstName} ${hostUserData?.lastName}` || hostName;
        hostProfilePicture = hostUserData?.profilePictureUrl;
      }
    } catch (err) {
      logger.warn(`Could not fetch host details for event ${eventId}:`, err);
    }

    // Enrich with user's RSVP status
    let userRsvpStatus: EventInvitation["status"] | undefined = undefined;
    let userHasPlusOne: boolean | undefined = undefined;
    try {
      const rsvpDoc = await db.collection("events").doc(eventId).collection("rsvps").doc(uid).get();
      if (rsvpDoc.exists) {
        const rsvpData = rsvpDoc.data() as EventInvitation;
        userRsvpStatus = rsvpData.status;
        userHasPlusOne = rsvpData.plusOne;
      }
    } catch (err) {
      logger.warn(`Could not fetch RSVP status for user ${uid} on event ${eventId}:`, err);
    }
    const enrichedData: EnrichedEventData = {
      ...eventData,
      hostName,
      hostProfilePicture,
      isHost: eventData.hostId === uid,
      userRsvpStatus,
      userHasPlusOne,
    };
    return {event: enrichedData};
  }, "getEventDetails"),
);

export const updateEvent = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withAuth(async (request) => {
    const uid = request.auth?.uid || "";

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.updateEvent,
      uid
    );

    const {eventId, ...updates} = validatedData as Partial<EventData> & {eventId: string};

    await ensureEventAccess(eventId, uid, "edit"); // Ensures user is host

    // Additional custom validations for updates
    if (updates.eventDate && !validateDateFormat(updates.eventDate)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid event date format. Use YYYY-MM-DD.");
    }

    if (updates.endDate && !validateDateFormat(updates.endDate)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid end date format. Use YYYY-MM-DD.");
    }

    if (updates.startTime && !validateTimeFormat(updates.startTime)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid start time format. Use HH:mm.");
    }

    if (updates.endTime && !validateTimeFormat(updates.endTime)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid end time format. Use HH:mm.");
    }

    if (updates.timezone && !validateTimezone(updates.timezone)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid timezone format.");
    }

    if (updates.location) {
      validateLocationCoords(updates.location);
      if (!updates.location.address || updates.location.address.trim().length === 0) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Location address must not be empty.");
      }
    }

    const eventRef = db.collection("events").doc(eventId);

    // Get current event data to compare changes
    const currentEventDoc = await eventRef.get();
    const currentEventData = currentEventDoc.data() as EventData;

    const updatePayload: Partial<EventData> = {
      ...updates,
      updatedAt: Timestamp.now(),
    };
    // Explicitly remove coverPhotoUrls if client sends it, as it should be generated on fetch
    delete updatePayload.coverPhotoUrls;
    // Client should send coverPhotoStoragePaths if they change

    await eventRef.update(updatePayload);
    logger.info(`Event ${eventId} updated by ${uid}.`, {updates: Object.keys(updates)});

    // Send SMS notifications for significant changes
    const significantChanges = ["eventDate", "startTime", "location", "isVirtual"];
    const hasSignificantChange = significantChanges.some((field) =>
      updates[field as keyof EventData] !== undefined &&
      updates[field as keyof EventData] !== currentEventData[field as keyof EventData]
    );

    if (hasSignificantChange) {
      try {
        const {getTwilioService} = await import("./services/twilioService");
        const twilioService = getTwilioService();

        // Get all RSVPed users
        const rsvpsSnapshot = await db.collection("events").doc(eventId)
          .collection("rsvps")
          .where("status", "in", ["accepted", "maybe"])
          .get();

        if (!rsvpsSnapshot.empty) {
          const userIds = rsvpsSnapshot.docs.map((doc) => doc.data().userId);

          // Get users with SMS enabled
          const usersSnapshot = await db.collection("users")
            .where("__name__", "in", userIds)
            .get();

          // Build change summary
          let changeText = "Event updated: ";
          const changes: string[] = [];

          if (updates.eventDate && updates.eventDate !== currentEventData.eventDate) {
            const newDate = new Date(updates.eventDate);
            changes.push(`new date ${newDate.toLocaleDateString("en-US", {month: "short", day: "numeric"})}`);
          }
          if (updates.startTime && updates.startTime !== currentEventData.startTime) {
            changes.push(`new time ${updates.startTime}`);
          }
          if (updates.location && currentEventData.location && updates.location.address !== currentEventData.location.address) {
            changes.push("location changed");
          }
          if (updates.isVirtual !== undefined && updates.isVirtual !== currentEventData.isVirtual) {
            changes.push(updates.isVirtual ? "now virtual" : "now in-person");
          }

          changeText += changes.join(", ");
          const eventLink = `https://mydynastyapp.com/events/${eventId}`;

          // Send SMS to each user with SMS enabled
          const smsPromises = usersSnapshot.docs.map(async (userDoc) => {
            const userData = userDoc.data();
            if (userData.phoneNumber && userData.smsPreferences?.enabled && userData.smsPreferences?.eventUpdates) {
              try {
                await twilioService.sendSms(
                  {
                    to: userData.phoneNumber,
                    body: `"${currentEventData.title}" - ${changeText}. Details: ${eventLink}`,
                  },
                  uid,
                  "event_update",
                  {
                    eventId: eventId,
                    recipientId: userDoc.id,
                  }
                );
                logger.info(`Sent event update SMS to user ${userDoc.id}`);
              } catch (smsError) {
                logger.error(`Failed to send SMS to user ${userDoc.id}:`, smsError);
              }
            }
          });

          await Promise.allSettled(smsPromises);
        }
      } catch (error) {
        // Log error but don't fail the update
        logger.error("Failed to send event update SMS notifications:", error);
      }
    }

    return {success: true, eventId};
  }, "updateEvent", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  }),
);

export const deleteEvent = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withAuth(async (request) => {
    const uid = request.auth?.uid || "";
    const {eventId} = request.data;
    if (!eventId || typeof eventId !== "string") {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Event ID is required.");
    }

    const eventData = await ensureEventAccess(eventId, uid, "admin"); // Ensures user is host (or admin if role exists)
    const eventRef = db.collection("events").doc(eventId); // eventRef needed for subcollections

    // 1. Delete RSVPs subcollection
    const rsvpsQuery = eventRef.collection("rsvps");
    const rsvpsDeletedCount = await commitDeletionsInBatches(db, rsvpsQuery);
    logger.info(`Deleted ${rsvpsDeletedCount} RSVPs for event ${eventId}.`);

    // 2. Delete Comments subcollection
    const commentsQuery = eventRef.collection("comments");
    const commentsDeletedCount = await commitDeletionsInBatches(db, commentsQuery);
    logger.info(`Deleted ${commentsDeletedCount} comments for event ${eventId}.`);

    // 3. Delete cover photos from GCS
    if (eventData.coverPhotoStoragePaths && eventData.coverPhotoStoragePaths.length > 0) {
      const bucket = storage.bucket();
      const gcsDeletePromises = eventData.coverPhotoStoragePaths.map((path) =>
        bucket.file(path).delete().then(() => {
          logger.info(`Deleted cover photo ${path} from GCS for event ${eventId}.`);
        }).catch((err:any) => {
          logger.error(`Failed to delete cover photo ${path} from GCS for event ${eventId}:`, err.message);
          // Log error but continue, as Firestore deletion is more critical
          // Do not throw here to allow other deletions to proceed
        })
      );
      await Promise.all(gcsDeletePromises);
      logger.info(`Attempted deletion for ${eventData.coverPhotoStoragePaths.length} GCS cover photos for event ${eventId}.`);
    }

    // 4. Delete the event document itself
    await eventRef.delete();
    logger.info(`Event document ${eventId} successfully deleted by ${uid}.`);

    return {success: true, eventId};
  }, "deleteEvent", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.delete,
  }),
);

// MARK: - RSVP and Attendance Functions

export const rsvpToEvent = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const uid = request.auth?.uid || "";

    const {eventId, status, plusOne, plusOneName} = request.data as {
      eventId: string;
      status: EventInvitation["status"];
      plusOne?: boolean;
      plusOneName?: string;
    };

    if (!eventId || !status) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Event ID and RSVP status are required.");
    }
    if (!["pending", "accepted", "declined", "maybe"].includes(status)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid RSVP status provided.");
    }

    const eventData = await ensureEventAccess(eventId, uid, "view"); // Check if user can view/interact

    if (!eventData.requireRsvp) {
      logger.info(`Event ${eventId} does not require RSVP. User ${uid} attempted to RSVP with status ${status}.`);
      // Depending on desired behavior, could return success or a specific message.
      // For now, let it proceed as an explicit RSVP might still be tracked.
    }

    // Check RSVP deadline if it exists
    if (eventData.rsvpDeadline) {
      try {
        const deadlineDate = new Date(eventData.rsvpDeadline);
        if (new Date() > deadlineDate) {
          throw createError(ErrorCode.ABORTED, "The RSVP deadline for this event has passed.");
        }
      } catch (dateError) {
        logger.error(`Invalid RSVP deadline format for event ${eventId}: ${eventData.rsvpDeadline}`, dateError);
        // Decide if this should block RSVP or just log. For now, log and proceed.
      }
    }

    if (plusOne && !eventData.allowGuestPlusOne) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Bringing a plus one is not allowed for this event.");
    }

    const rsvpRef = db.collection("events").doc(eventId).collection("rsvps").doc(uid);

    const rsvpData: Partial<EventInvitation> = {
      eventId,
      userId: uid,
      status,
      plusOne: plusOne ?? false,
      plusOneName: plusOne ? (plusOneName || null) : null,
      respondedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Check if RSVP already exists to set createdAt appropriately
    const existingRsvp = await rsvpRef.get();
    if (!existingRsvp.exists) {
      rsvpData.createdAt = Timestamp.now();
    }

    await rsvpRef.set(rsvpData, {merge: true});
    logger.info(`User ${uid} RSVPed to event ${eventId} with status: ${status}. Plus one: ${rsvpData.plusOne}`);

    // Send SMS confirmation if user has SMS enabled
    if (status === "accepted" || status === "declined") {
      try {
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();

        if (userData?.phoneNumber && userData?.smsPreferences?.enabled && userData?.smsPreferences?.rsvpConfirmations) {
          const {getTwilioService} = await import("./services/twilioService");
          const twilioService = getTwilioService();

          const eventDate = new Date(eventData.eventDate);
          const dateString = eventDate.toLocaleDateString("en-US", {month: "short", day: "numeric"});

          let smsBody = "";
          if (status === "accepted") {
            smsBody = `You're confirmed for "${eventData.title}" on ${dateString}`;
            if (eventData.startTime) {
              smsBody += ` at ${eventData.startTime}`;
            }
            if (plusOne) {
              smsBody += " (+1 guest)";
            }
            smsBody += ". See you there!";
          } else {
            smsBody = `You've declined "${eventData.title}" on ${dateString}. We'll miss you!`;
          }

          await twilioService.sendSms(
            {
              to: userData.phoneNumber,
              body: smsBody,
            },
            uid,
            "rsvp_confirmation",
            {
              eventId: eventId,
              rsvpStatus: status,
            }
          );
          logger.info(`Sent RSVP confirmation SMS to user ${uid}`);
        }
      } catch (smsError) {
        // Log error but don't fail the RSVP
        logger.error(`Failed to send RSVP confirmation SMS to user ${uid}:`, smsError);
      }
    }

    return {success: true, eventId, rsvpStatus: status, plusOne: rsvpData.plusOne};
  }, "rsvpToEvent", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  }),
);

export const getEventAttendees = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }
    const {eventId} = request.data;
    if (!eventId || typeof eventId !== "string") {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Event ID is required.");
    }

    const eventData = await ensureEventAccess(eventId, uid, "view");

    if (!eventData.showGuestList && eventData.hostId !== uid) {
      // If guest list is private and user is not the host, check if they are an admin/have special permission
      // For now, only host can see if showGuestList is false
      throw createError(ErrorCode.PERMISSION_DENIED, "You do not have permission to view the guest list for this event.");
    }

    const rsvpsSnapshot = await db.collection("events").doc(eventId).collection("rsvps").get();
    const attendees: Attendee[] = [];
    if (rsvpsSnapshot.empty) {
      return {attendees};
    }

    const userIds = rsvpsSnapshot.docs.map((doc) => (doc.data() as EventInvitation).userId);
    const usersSnapshot = await db.collection("users").where(admin.firestore.FieldPath.documentId(), "in", userIds).get();
    const usersDataMap = new Map<string, {displayName?: string, profilePictureUrl?: string}>();
    usersSnapshot.forEach((userDoc) => {
      const userData = userDoc.data();
      usersDataMap.set(userDoc.id, {
        displayName: userData.displayName || `${userData.firstName} ${userData.lastName}`.trim() || "Unnamed User",
        profilePictureUrl: userData.profilePictureUrl,
      });
    });

    rsvpsSnapshot.forEach((doc) => {
      const rsvp = doc.data() as EventInvitation;
      const userInfo = usersDataMap.get(rsvp.userId);
      attendees.push({
        ...rsvp,
        id: doc.id,
        userName: userInfo?.displayName,
        userProfilePicture: userInfo?.profilePictureUrl,
      });
    });

    return {attendees};
  }, "getEventAttendees"),
);

// MARK: - Comment Functions

export const addCommentToEvent = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const uid = request.auth?.uid || "";

    const {eventId, text, parentId} = request.data as {
      eventId: string;
      text: string;
      parentId?: string;
    };

    if (!eventId || !text || text.trim() === "") {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Event ID and comment text are required.");
    }

    await ensureEventAccess(eventId, uid, "view"); // Ensure user can at least view to comment

    const commentRef = db.collection("events").doc(eventId).collection("comments").doc();
    const commentId = commentRef.id;

    // Fetch user details for denormalization
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();

    const newComment: EventComment = {
      id: commentId,
      eventId,
      userId: uid,
      userName: userData?.displayName || `${userData?.firstName} ${userData?.lastName}`.trim() || "Anonymous",
      userProfilePicture: userData?.profilePictureUrl,
      text: text.trim(),
      parentId: parentId || null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await commentRef.set(newComment);
    logger.info(`User ${uid} added comment ${commentId} to event ${eventId}.`);

    // Optionally, could update a commentsCount on the event document itself using a transaction or FieldValue.increment(1)

    return {success: true, commentId, comment: newComment};
  }, "addCommentToEvent", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  }),
);

export const getEventComments = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const {
      eventId,
      limit = 50,
      lastCommentId,
      includeThreads = true,
    } = request.data as {
      eventId: string;
      limit?: number;
      lastCommentId?: string;
      includeThreads?: boolean;
    };

    if (!eventId || typeof eventId !== "string") {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Event ID is required.");
    }

    await ensureEventAccess(eventId, uid, "view");

    let query = db.collection("events").doc(eventId).collection("comments")
      .orderBy("createdAt", "asc") as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

    if (lastCommentId) {
      const lastDoc = await db.collection("events").doc(eventId).collection("comments").doc(lastCommentId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    query = query.limit(limit);
    const commentsSnapshot = await query.get();

    const comments: EventComment[] = commentsSnapshot.docs.map((doc) => {
      const data = doc.data() as EventComment;
      return {
        ...data,
        id: doc.id,
      };
    });

    let result: any = {comments};

    // Organize into threads if requested
    if (includeThreads) {
      const threadedComments = organizeCommentsIntoThreads(comments);
      result = {
        comments: threadedComments,
        isThreaded: true,
      };
    }

    // Pagination info
    const hasMore = commentsSnapshot.docs.length === limit;
    let newLastCommentId: string | undefined = undefined;

    if (comments.length > 0) {
      newLastCommentId = comments[comments.length - 1].id;
    }

    return {
      ...result,
      hasMore,
      lastCommentId: newLastCommentId,
      totalCount: comments.length,
    };
  }, "getEventComments"),
);

/**
 * Deletes an event comment and cascades deletion to all child comments.
 * When a comment is deleted, all replies to that comment are also automatically deleted
 * to maintain data integrity and prevent orphaned comments.
 */
export const deleteEventComment = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const uid = request.auth?.uid || "";
    const {eventId, commentId} = request.data;
    if (!eventId || typeof eventId !== "string" || !commentId || typeof commentId !== "string") {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Event ID and Comment ID are required.");
    }

    const eventData = await ensureEventAccess(eventId, uid, "view");
    const commentRef = db.collection("events").doc(eventId).collection("comments").doc(commentId);
    const commentDoc = await commentRef.get();

    if (!commentDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, `Comment ${commentId} not found on event ${eventId}.`);
    }

    const commentData = commentDoc.data() as EventComment;

    // Check permission: User must be comment author OR event host
    if (commentData.userId !== uid && eventData.hostId !== uid) {
      throw createError(ErrorCode.PERMISSION_DENIED, "You do not have permission to delete this comment.");
    }

    // Handle cascade deletion of child comments
    const cascadeDeletedCount = await handleEventCommentCascadeDeletion(db, eventId, commentId);

    if (cascadeDeletedCount > 0) {
      logger.info(`Cascade deletion removed ${cascadeDeletedCount} child comments for parent comment ${commentId} in event ${eventId}`);
    }

    // Delete the parent comment
    await commentRef.delete();

    const totalDeleted = 1 + cascadeDeletedCount;
    logger.info(`User ${uid} deleted comment ${commentId} and ${cascadeDeletedCount} child comments from event ${eventId}. Total deleted: ${totalDeleted}`);

    // Optionally, decrement commentsCount on the event document by total deleted
    // You may want to implement this based on your event comment counting strategy

    return {success: true, eventId, commentId, totalDeleted};
  }, "deleteEventComment", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.delete,
  }),
);

// MARK: - Event Listing Functions

const PAGINATION_LIMIT = 20;

// Note: enrichEventList function has been removed in favor of enrichEventListOptimized
// which provides better performance through batch fetching

/**
 * Fetches raw event documents based on a query, limit, and optional cursor values.
 */
async function fetchRawEventsPage(
  baseQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>,
  limit: number,
  orderByField: string, // e.g., "eventDate"
  orderByDirection: "asc" | "desc" = "asc",
  secondaryOrderByField: string = "id", // Tie-breaker
  secondaryOrderByDirection: "asc" | "desc" = "asc",
  startAfterValues?: [string | Timestamp, string], // [primaryFieldValue, secondaryFieldValue]
): Promise<{docs: FirebaseFirestore.QueryDocumentSnapshot<EventData>[], rawEvents: EventData[]}> {
  let query = baseQuery.orderBy(orderByField, orderByDirection).orderBy(secondaryOrderByField, secondaryOrderByDirection);

  if (startAfterValues && startAfterValues.length === 2) {
    query = query.startAfter(...startAfterValues);
  }
  query = query.limit(limit);

  const snapshot = await query.get();
  const docs = snapshot.docs as FirebaseFirestore.QueryDocumentSnapshot<EventData>[];
  const rawEvents = docs.map((doc) => ({id: doc.id, ...doc.data()} as EventData));
  return {docs, rawEvents};
}

export const getUpcomingEventsForUser = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const {
      limit = PAGINATION_LIMIT,
      lastEventDate, // Expected as YYYY-MM-DD string
      lastEventId, // For tie-breaking
    } = request.data as { limit?: number; lastEventDate?: string; lastEventId?: string };

    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    const userFamilyTreeId = userData?.familyTreeId;

    const nowString = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const queries: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>[] = [];

    // Base date filter: if lastEventDate is provided, start from there, otherwise from now.
    // For "upcoming", we always want events >= now, but if paginating, also >= lastEventDate.
    // The effectiveStartDate will be the later of nowString or lastEventDate.
    const effectiveStartDate = lastEventDate && lastEventDate > nowString ? lastEventDate : nowString;

    // Query for events hosted by the user
    queries.push(db.collection("events")
      .where("hostId", "==", uid)
      .where("eventDate", ">=", effectiveStartDate));

    // Query for events user is explicitly invited to
    queries.push(db.collection("events")
      .where("invitedMemberIds", "array-contains", uid)
      .where("eventDate", ">=", effectiveStartDate));

    // Query for public events
    queries.push(db.collection("events")
      .where("privacy", "==", "public")
      .where("eventDate", ">=", effectiveStartDate));

    // Query for family_tree events
    if (userFamilyTreeId) {
      queries.push(db.collection("events")
        .where("privacy", "==", "family_tree")
        .where("familyTreeId", "==", userFamilyTreeId)
        .where("eventDate", ">=", effectiveStartDate));
    }

    // Fetch a bit more than limit from each query to ensure we have enough after merging and filtering
    const fetchLimitPerQuery = limit + 10; // Fetch a buffer

    const allRawEvents: EventData[] = [];

    for (const baseQuery of queries) {
      const startValues: [string, string] | undefined = (lastEventDate && lastEventId && effectiveStartDate === lastEventDate) ?
        [lastEventDate, lastEventId] :
        undefined;

      // If lastEventDate is in the future compared to effectiveStartDate (now),
      // we need to use that as the primary value for startAfter.
      // If lastEventDate is effectiveStartDate (i.e., we are on the same day as the cursor),
      // then we use both lastEventDate and lastEventId for startAfter.
      // Otherwise, if lastEventDate is older than now (or not provided),
      // we don't use startAfter with specific values, relying on the >= effectiveStartDate.
      // The fetchRawEventsPage handles orderBy and startAfter logic internally.
      // The key is that `eventDate` is string "YYYY-MM-DD", `id` is string.
      const {rawEvents: categoryEvents} = await fetchRawEventsPage(
        baseQuery,
        fetchLimitPerQuery,
        "eventDate",
        "asc",
        "id", // Use 'id' as the secondary sort key
        "asc",
        startValues
      );
      allRawEvents.push(...categoryEvents);
    }

    // Deduplicate events by ID
    const uniqueEventsMap = new Map<string, EventData>();
    allRawEvents.forEach((event) => {
      if (event.id && !uniqueEventsMap.has(event.id)) {
        uniqueEventsMap.set(event.id, event);
      }
    });

    const sortedUniqueEvents = Array.from(uniqueEventsMap.values());

    // Sort all merged events: primary by eventDate (asc), secondary by id (asc)
    sortedUniqueEvents.sort((a, b) => {
      if (a.eventDate < b.eventDate) return -1;
      if (a.eventDate > b.eventDate) return 1;
      // If eventDates are the same, sort by id
      if (a.id! < b.id!) return -1; // id should always exist here
      if (a.id! > b.id!) return 1;
      return 0;
    });

    // Filter out events that are strictly before or at the (lastEventDate, lastEventId) cursor,
    // if cursor was for a date matching effectiveStartDate.
    // If effectiveStartDate was ahead of lastEventDate, this filtering is naturally handled by the query's date range.
    let finalEventsForPage: EventData[];
    if (lastEventDate && lastEventId && lastEventDate === effectiveStartDate) {
      finalEventsForPage = sortedUniqueEvents.filter((event) => {
        if (event.eventDate > lastEventDate) return true;
        if (event.eventDate === lastEventDate) {
          return event.id! > lastEventId; // id should exist
        }
        return false;
      });
    } else {
      // If no cursor, or cursor was for an older date (already handled by effectiveStartDate),
      // all sortedUniqueEvents are candidates.
      finalEventsForPage = sortedUniqueEvents;
    }

    // Take the actual page size
    const pageEventsData = finalEventsForPage.slice(0, limit);

    // Enrich only the events for the current page
    const enrichedPageEvents = await enrichEventListOptimized(pageEventsData, uid);

    let newLastEventDate: string | undefined = undefined;
    let newLastEventId: string | undefined = undefined;
    const hasMore = finalEventsForPage.length > limit;

    if (enrichedPageEvents.length > 0) {
      const lastEventOfPage = enrichedPageEvents[enrichedPageEvents.length - 1];
      newLastEventDate = lastEventOfPage.eventDate;
      newLastEventId = lastEventOfPage.id;
    }

    return {
      events: enrichedPageEvents,
      lastEventDate: newLastEventDate,
      lastEventId: newLastEventId,
      hasMore,
    };
  }, "getUpcomingEventsForUser"),
);

// MARK: - Missing Core Functions

export const getPastEventsForUser = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const {
      limit = PAGINATION_LIMIT,
      lastEventDate, // Expected as YYYY-MM-DD string
      lastEventId, // For tie-breaking
    } = request.data as { limit?: number; lastEventDate?: string; lastEventId?: string };

    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    const userFamilyTreeId = userData?.familyTreeId;

    const nowString = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const queries: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>[] = [];

    // For past events, we want events < now, but if paginating, also <= lastEventDate
    const effectiveEndDate = lastEventDate && lastEventDate < nowString ? lastEventDate : nowString;

    // Query for events hosted by the user
    queries.push(db.collection("events")
      .where("hostId", "==", uid)
      .where("eventDate", "<", effectiveEndDate));

    // Query for events user is explicitly invited to
    queries.push(db.collection("events")
      .where("invitedMemberIds", "array-contains", uid)
      .where("eventDate", "<", effectiveEndDate));

    // Query for public events
    queries.push(db.collection("events")
      .where("privacy", "==", "public")
      .where("eventDate", "<", effectiveEndDate));

    // Query for family_tree events
    if (userFamilyTreeId) {
      queries.push(db.collection("events")
        .where("privacy", "==", "family_tree")
        .where("familyTreeId", "==", userFamilyTreeId)
        .where("eventDate", "<", effectiveEndDate));
    }

    const fetchLimitPerQuery = limit + 10;
    const allRawEvents: EventData[] = [];

    for (const baseQuery of queries) {
      const startValues: [string, string] | undefined = (lastEventDate && lastEventId && effectiveEndDate === lastEventDate) ?
        [lastEventDate, lastEventId] :
        undefined;

      const {rawEvents: categoryEvents} = await fetchRawEventsPage(
        baseQuery,
        fetchLimitPerQuery,
        "eventDate",
        "desc", // Descending for past events (most recent first)
        "id",
        "desc",
        startValues
      );
      allRawEvents.push(...categoryEvents);
    }

    // Deduplicate and sort
    const uniqueEventsMap = new Map<string, EventData>();
    allRawEvents.forEach((event) => {
      if (event.id && !uniqueEventsMap.has(event.id)) {
        uniqueEventsMap.set(event.id, event);
      }
    });

    const sortedUniqueEvents = Array.from(uniqueEventsMap.values());
    sortedUniqueEvents.sort((a, b) => {
      if (a.eventDate > b.eventDate) return -1; // Descending
      if (a.eventDate < b.eventDate) return 1;
      if (a.id! > b.id!) return -1;
      if (a.id! < b.id!) return 1;
      return 0;
    });

    // Apply pagination filtering
    let finalEventsForPage: EventData[];
    if (lastEventDate && lastEventId && lastEventDate === effectiveEndDate) {
      finalEventsForPage = sortedUniqueEvents.filter((event) => {
        if (event.eventDate < lastEventDate) return true;
        if (event.eventDate === lastEventDate) {
          return event.id! < lastEventId;
        }
        return false;
      });
    } else {
      finalEventsForPage = sortedUniqueEvents;
    }

    const pageEventsData = finalEventsForPage.slice(0, limit);
    const enrichedPageEvents = await enrichEventListOptimized(pageEventsData, uid);

    let newLastEventDate: string | undefined = undefined;
    let newLastEventId: string | undefined = undefined;
    const hasMore = finalEventsForPage.length > limit;

    if (enrichedPageEvents.length > 0) {
      const lastEventOfPage = enrichedPageEvents[enrichedPageEvents.length - 1];
      newLastEventDate = lastEventOfPage.eventDate;
      newLastEventId = lastEventOfPage.id;
    }

    return {
      events: enrichedPageEvents,
      lastEventDate: newLastEventDate,
      lastEventId: newLastEventId,
      hasMore,
    };
  }, "getPastEventsForUser"),
);

export const getHostedEvents = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const {
      limit = PAGINATION_LIMIT,
      lastEventDate,
      lastEventId,
      includeUpcoming = true,
      includePast = true,
    } = request.data as {
      limit?: number;
      lastEventDate?: string;
      lastEventId?: string;
      includeUpcoming?: boolean;
      includePast?: boolean;
    };

    if (!includeUpcoming && !includePast) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Must include either upcoming or past events.");
    }

    const nowString = new Date().toISOString().split("T")[0];
    let query = db.collection("events").where("hostId", "==", uid);

    // Apply date filtering based on what's requested
    if (includeUpcoming && !includePast) {
      const effectiveStartDate = lastEventDate && lastEventDate > nowString ? lastEventDate : nowString;
      query = query.where("eventDate", ">=", effectiveStartDate);
    } else if (includePast && !includeUpcoming) {
      const effectiveEndDate = lastEventDate && lastEventDate < nowString ? lastEventDate : nowString;
      query = query.where("eventDate", "<", effectiveEndDate);
    }
    // If both are true, no date filter (get all events)

    const startValues: [string, string] | undefined = (lastEventDate && lastEventId) ?
      [lastEventDate, lastEventId] :
      undefined;

    const orderDirection = includePast && !includeUpcoming ? "desc" : "asc";
    const {rawEvents} = await fetchRawEventsPage(
      query,
      limit,
      "eventDate",
      orderDirection,
      "id",
      orderDirection,
      startValues
    );

    const enrichedEvents = await enrichEventListOptimized(rawEvents, uid);

    let newLastEventDate: string | undefined = undefined;
    let newLastEventId: string | undefined = undefined;
    const hasMore = rawEvents.length === limit;

    if (enrichedEvents.length > 0) {
      const lastEventOfPage = enrichedEvents[enrichedEvents.length - 1];
      newLastEventDate = lastEventOfPage.eventDate;
      newLastEventId = lastEventOfPage.id;
    }

    return {
      events: enrichedEvents,
      lastEventDate: newLastEventDate,
      lastEventId: newLastEventId,
      hasMore,
    };
  }, "getHostedEvents"),
);

export const searchEvents = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const {
      query: searchQuery,
      limit = PAGINATION_LIMIT,
      startDate,
      endDate,
      location,
      privacy,
      lastEventDate,
      lastEventId,
    } = request.data as {
      query?: string;
      limit?: number;
      startDate?: string;
      endDate?: string;
      location?: {lat: number; lng: number; radiusKm?: number};
      privacy?: "public" | "family_tree" | "invite_only";
      lastEventDate?: string;
      lastEventId?: string;
    };

    // Validate inputs
    if (startDate && !validateDateFormat(startDate)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid start date format. Use YYYY-MM-DD.");
    }
    if (endDate && !validateDateFormat(endDate)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid end date format. Use YYYY-MM-DD.");
    }

    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    const userFamilyTreeId = userData?.familyTreeId;

    let baseQuery = db.collection("events") as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

    // Apply privacy filter
    if (privacy) {
      baseQuery = baseQuery.where("privacy", "==", privacy);
      if (privacy === "family_tree" && userFamilyTreeId) {
        baseQuery = baseQuery.where("familyTreeId", "==", userFamilyTreeId);
      }
    }

    // Apply date range filters
    if (startDate) {
      baseQuery = baseQuery.where("eventDate", ">=", startDate);
    }
    if (endDate) {
      baseQuery = baseQuery.where("eventDate", "<=", endDate);
    }

    const startValues: [string, string] | undefined = (lastEventDate && lastEventId) ?
      [lastEventDate, lastEventId] :
      undefined;

    const {rawEvents} = await fetchRawEventsPage(
      baseQuery,
      limit * 2, // Fetch more for text filtering
      "eventDate",
      "asc",
      "id",
      "asc",
      startValues
    );

    // Filter by text search if provided
    let filteredEvents = rawEvents;
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.toLowerCase().trim();
      filteredEvents = rawEvents.filter((event) => {
        return (
          event.title?.toLowerCase().includes(searchTerm) ||
          event.description?.toLowerCase().includes(searchTerm) ||
          event.location?.address?.toLowerCase().includes(searchTerm)
        );
      });
    }

    // Filter by location if provided
    if (location && location.lat && location.lng) {
      const radiusKm = location.radiusKm || 50; // Default 50km radius
      filteredEvents = filteredEvents.filter((event) => {
        if (!event.location) return false;
        const distance = calculateDistance(
          location.lat,
          location.lng,
          event.location.lat,
          event.location.lng
        );
        return distance <= radiusKm;
      });
    }

    // Apply final limit
    const pageEvents = filteredEvents.slice(0, limit);
    const enrichedEvents = await enrichEventListOptimized(pageEvents, uid);

    let newLastEventDate: string | undefined = undefined;
    let newLastEventId: string | undefined = undefined;
    const hasMore = filteredEvents.length > limit;

    if (enrichedEvents.length > 0) {
      const lastEventOfPage = enrichedEvents[enrichedEvents.length - 1];
      newLastEventDate = lastEventOfPage.eventDate;
      newLastEventId = lastEventOfPage.id;
    }

    return {
      events: enrichedEvents,
      lastEventDate: newLastEventDate,
      lastEventId: newLastEventId,
      hasMore,
      totalFound: filteredEvents.length,
    };
  }, "searchEvents"),
);

/**
 * Calculate distance between two coordinates using Haversine formula.
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// MARK: - Event Invitation System

export const sendEventInvitations = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withAuth(async (request) => {
    const uid = request.auth?.uid || "";

    const {eventId, userIds, message} = request.data as {
      eventId: string;
      userIds: string[];
      message?: string;
    };

    if (!eventId || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Event ID and user IDs array are required.");
    }

    if (userIds.length > 50) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Cannot invite more than 50 users at once.");
    }

    // Ensure user has permission to invite to this event
    const eventData = await ensureEventAccess(eventId, uid, "edit");

    // Validate that all userIds exist
    const userBatches = [];
    for (let i = 0; i < userIds.length; i += 10) {
      userBatches.push(userIds.slice(i, i + 10));
    }

    const validUserIds = new Set<string>();
    for (const batch of userBatches) {
      const usersSnapshot = await db.collection("users")
        .where(admin.firestore.FieldPath.documentId(), "in", batch)
        .get();
      usersSnapshot.forEach((doc) => validUserIds.add(doc.id));
    }

    const invalidUserIds = userIds.filter((id) => !validUserIds.has(id));
    if (invalidUserIds.length > 0) {
      throw createError(ErrorCode.INVALID_ARGUMENT, `Invalid user IDs: ${invalidUserIds.join(", ")}`);
    }

    // Check existing invitations to avoid duplicates
    const existingInvitations = new Set<string>();
    const invitationPromises = userIds.map(async (userId) => {
      const inviteDoc = await db.collection("events").doc(eventId).collection("rsvps").doc(userId).get();
      if (inviteDoc.exists) {
        existingInvitations.add(userId);
      }
    });
    await Promise.all(invitationPromises);

    const newInvitees = userIds.filter((id) => !existingInvitations.has(id));

    if (newInvitees.length === 0) {
      return {
        success: true,
        message: "All users were already invited to this event.",
        alreadyInvited: userIds.length,
        newInvitations: 0,
      };
    }

    // Create invitation records
    const batch = db.batch();
    const now = Timestamp.now();

    newInvitees.forEach((userId) => {
      const inviteRef = db.collection("events").doc(eventId).collection("rsvps").doc(userId);
      const inviteData: EventInvitation = {
        eventId,
        userId,
        status: "pending",
        plusOne: false,
        createdAt: now,
        updatedAt: now,
      };
      batch.set(inviteRef, inviteData);
    });

    // Update event's invitedMemberIds
    const eventRef = db.collection("events").doc(eventId);
    batch.update(eventRef, {
      invitedMemberIds: FieldValue.arrayUnion(...newInvitees),
      updatedAt: now,
    });

    await batch.commit();

    logger.info(`User ${uid} sent ${newInvitees.length} invitations for event ${eventId}`);

    // TODO: Send push notifications or emails to invited users
    // This would integrate with your notification service

    return {
      success: true,
      eventId,
      newInvitations: newInvitees.length,
      alreadyInvited: existingInvitations.size,
      message: message || `You've been invited to ${eventData.title}`,
    };
  }, "sendEventInvitations", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  }),
);

export const getEventInvitations = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const {
      status,
      limit = PAGINATION_LIMIT,
      lastInvitationId,
    } = request.data as {
      status?: "pending" | "accepted" | "declined" | "maybe";
      limit?: number;
      lastInvitationId?: string;
    };

    // Get all events where user is invited
    let query = db.collectionGroup("rsvps")
      .where("userId", "==", uid) as FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

    if (status) {
      query = query.where("status", "==", status);
    }

    query = query.orderBy("createdAt", "desc").limit(limit);

    if (lastInvitationId) {
      // For collection group queries, we need to find the document differently
      const lastDocSnapshot = await query.limit(1).get();
      if (!lastDocSnapshot.empty) {
        const lastDoc = lastDocSnapshot.docs.find((doc) => doc.id === lastInvitationId);
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }
      }
    }

    const invitationsSnapshot = await query.get();
    const invitations: EventInvitationWithUser[] = [];

    if (invitationsSnapshot.empty) {
      return {invitations, hasMore: false};
    }

    // Get event details for each invitation
    const eventIds = [...new Set(invitationsSnapshot.docs.map((doc) => doc.data().eventId))];
    const eventDataMap = new Map<string, EventData>();

    const eventBatches = [];
    for (let i = 0; i < eventIds.length; i += 10) {
      eventBatches.push(eventIds.slice(i, i + 10));
    }

    for (const batch of eventBatches) {
      const eventsSnapshot = await db.collection("events")
        .where(admin.firestore.FieldPath.documentId(), "in", batch)
        .get();
      eventsSnapshot.forEach((doc) => {
        eventDataMap.set(doc.id, {id: doc.id, ...doc.data()} as EventData);
      });
    }

    // Get host details
    const hostIds = [...new Set(Array.from(eventDataMap.values()).map((event) => event.hostId))];
    const hostDataMap = new Map<string, any>();

    const hostBatches = [];
    for (let i = 0; i < hostIds.length; i += 10) {
      hostBatches.push(hostIds.slice(i, i + 10));
    }

    for (const batch of hostBatches) {
      const hostsSnapshot = await db.collection("users")
        .where(admin.firestore.FieldPath.documentId(), "in", batch)
        .get();
      hostsSnapshot.forEach((doc) => {
        const userData = doc.data();
        hostDataMap.set(doc.id, {
          displayName: userData?.displayName || `${userData?.firstName} ${userData?.lastName}`.trim() || "Unknown Host",
          profilePictureUrl: userData?.profilePictureUrl,
          email: userData?.email,
        });
      });
    }

    // Enrich invitations with event and host data
    invitationsSnapshot.forEach((doc) => {
      const inviteData = doc.data() as EventInvitation;
      const eventData = eventDataMap.get(inviteData.eventId);
      const hostData = hostDataMap.get(eventData?.hostId || "");

      const enrichedInvitation: EventInvitationWithUser = {
        ...inviteData,
        id: doc.id,
        userName: hostData?.displayName,
        userProfilePicture: hostData?.profilePictureUrl,
        userEmail: hostData?.email,
      };

      // Add event details to the invitation object for convenience
      if (eventData) {
        (enrichedInvitation as any).event = eventData;
      }

      invitations.push(enrichedInvitation);
    });

    const hasMore = invitationsSnapshot.docs.length === limit;
    let newLastInvitationId: string | undefined = undefined;

    if (invitations.length > 0) {
      newLastInvitationId = invitations[invitations.length - 1].id;
    }

    return {
      invitations,
      hasMore,
      lastInvitationId: newLastInvitationId,
    };
  }, "getEventInvitations"),
);

export const respondToInvitation = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const uid = request.auth?.uid || "";

    const {eventId, status, plusOne, plusOneName} = request.data as {
      eventId: string;
      status: "accepted" | "declined" | "maybe";
      plusOne?: boolean;
      plusOneName?: string;
    };

    if (!eventId || !status) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Event ID and status are required.");
    }

    if (!["accepted", "declined", "maybe"].includes(status)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid status. Must be accepted, declined, or maybe.");
    }

    // Check if invitation exists
    const inviteRef = db.collection("events").doc(eventId).collection("rsvps").doc(uid);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Invitation not found for this event.");
    }

    const eventData = await ensureEventAccess(eventId, uid, "view");

    // Validate plus one if provided
    if (plusOne && !eventData.allowGuestPlusOne) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Plus ones are not allowed for this event.");
    }

    // Check RSVP deadline
    if (eventData.rsvpDeadline) {
      try {
        const deadlineDate = new Date(eventData.rsvpDeadline);
        if (new Date() > deadlineDate) {
          throw createError(ErrorCode.ABORTED, "The RSVP deadline for this event has passed.");
        }
      } catch (dateError) {
        logger.warn(`Invalid RSVP deadline format for event ${eventId}: ${eventData.rsvpDeadline}`, dateError);
      }
    }

    // Update the invitation
    const updateData: Partial<EventInvitation> = {
      status,
      plusOne: plusOne || false,
      plusOneName: plusOne ? (plusOneName || null) : null,
      respondedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await inviteRef.update(updateData);

    logger.info(`User ${uid} responded to event ${eventId} invitation with status: ${status}`);

    return {
      success: true,
      eventId,
      status,
      plusOne: updateData.plusOne,
      plusOneName: updateData.plusOneName,
    };
  }, "respondToInvitation", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  }),
);

// MARK: - Web API Functions

/**
 * Get all events for the web application
 * This combines upcoming, past, and hosted events for the user
 */
export const getEventsApi = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const {limit = 100} = request.data as { limit?: number };

    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    const userFamilyTreeId = userData?.familyTreeId;

    // Collect all queries without date filtering
    const queries: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>[] = [];

    // Query for events hosted by the user
    queries.push(db.collection("events").where("hostId", "==", uid));

    // Query for events user is explicitly invited to
    queries.push(db.collection("events").where("invitedMemberIds", "array-contains", uid));

    // Query for public events
    queries.push(db.collection("events").where("privacy", "==", "public"));

    // Query for family_tree events
    if (userFamilyTreeId) {
      queries.push(db.collection("events")
        .where("privacy", "==", "family_tree")
        .where("familyTreeId", "==", userFamilyTreeId));
    }

    const allRawEvents: EventData[] = [];

    // Execute all queries
    for (const baseQuery of queries) {
      try {
        const snapshot = await baseQuery.limit(limit).get();
        const events = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as EventData));
        allRawEvents.push(...events);
      } catch (queryError) {
        logger.warn("Error executing events query:", queryError);
        // Continue with other queries even if one fails
      }
    }

    // Deduplicate events by ID
    const uniqueEventsMap = new Map<string, EventData>();
    allRawEvents.forEach((event) => {
      if (event.id && !uniqueEventsMap.has(event.id)) {
        uniqueEventsMap.set(event.id, event);
      }
    });

    const uniqueEvents = Array.from(uniqueEventsMap.values());

    // Sort by event date (upcoming first, then past)
    uniqueEvents.sort((a, b) => {
      const dateA = new Date(a.eventDate).getTime();
      const dateB = new Date(b.eventDate).getTime();
      return dateB - dateA; // Most recent first
    });

    // Enrich events with host details and RSVP status
    const enrichedEvents = await enrichEventListOptimized(uniqueEvents, uid);

    logger.info(`Returning ${enrichedEvents.length} events for user ${uid}`);

    return {events: enrichedEvents};
  }, "getEventsApi"),
);

/**
 * Get details for a specific event (web API)
 * This is a wrapper for the existing getEventDetails function
 */
export const getEventDetailsApi = getEventDetails;

/**
 * Update RSVP status for an event (web API)
 * Maps the web API format to the existing rsvpToEvent function
 */
export const updateEventRsvpApi = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const uid = request.auth?.uid || "";

    const {eventId, status} = request.data as {
      eventId: string;
      status: "yes" | "maybe" | "no";
    };

    if (!eventId || !status) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Event ID and status are required.");
    }

    // Map web status to internal status
    const mappedStatus = status === "yes" ? "accepted" : status === "no" ? "declined" : "maybe";

    // Reuse the logic from rsvpToEvent
    const eventData = await ensureEventAccess(eventId, uid, "view");

    if (!eventData.requireRsvp) {
      logger.info(`Event ${eventId} does not require RSVP. User ${uid} attempted to RSVP with status ${status}.`);
    }

    // Check RSVP deadline if it exists
    if (eventData.rsvpDeadline) {
      try {
        const deadlineDate = new Date(eventData.rsvpDeadline);
        if (new Date() > deadlineDate) {
          throw createError(ErrorCode.ABORTED, "The RSVP deadline for this event has passed.");
        }
      } catch (dateError) {
        logger.error(`Invalid RSVP deadline format for event ${eventId}: ${eventData.rsvpDeadline}`, dateError);
      }
    }

    const rsvpRef = db.collection("events").doc(eventId).collection("rsvps").doc(uid);

    const rsvpData: Partial<EventInvitation> = {
      eventId,
      userId: uid,
      status: mappedStatus as EventInvitation["status"],
      plusOne: false,
      plusOneName: null,
      respondedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Check if RSVP already exists to set createdAt appropriately
    const existingRsvp = await rsvpRef.get();
    if (!existingRsvp.exists) {
      rsvpData.createdAt = Timestamp.now();
    }

    await rsvpRef.set(rsvpData, {merge: true});
    logger.info(`User ${uid} RSVPed to event ${eventId} with status: ${mappedStatus}`);

    return {success: true};
  }, "updateEventRsvpApi", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  }),
);

/**
 * Delete an event (web API)
 * This is a wrapper for the existing deleteEvent function
 */
export const deleteEventApi = deleteEvent;

/**
 * Get events for the feed page
 * Returns upcoming events for the user's family tree
 */
export const getEventsForFeedApi = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.MEDIUM,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const {userId, familyTreeId} = request.data as { userId: string; familyTreeId: string };

    if (!userId || !familyTreeId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "User ID and family tree ID are required.");
    }

    const nowString = new Date().toISOString().split("T")[0];
    const queries: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>[] = [];

    // Get upcoming events only for the feed
    // Query for events in the family tree
    queries.push(db.collection("events")
      .where("privacy", "==", "family_tree")
      .where("familyTreeId", "==", familyTreeId)
      .where("eventDate", ">=", nowString));

    // Query for public events
    queries.push(db.collection("events")
      .where("privacy", "==", "public")
      .where("eventDate", ">=", nowString));

    // Query for events user is explicitly invited to
    queries.push(db.collection("events")
      .where("invitedMemberIds", "array-contains", userId)
      .where("eventDate", ">=", nowString));

    const allRawEvents: EventData[] = [];
    const fetchLimit = 20; // Limit for feed

    for (const baseQuery of queries) {
      try {
        const snapshot = await baseQuery.limit(fetchLimit).get();
        const events = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as EventData));
        allRawEvents.push(...events);
      } catch (queryError) {
        logger.warn("Error executing feed events query:", queryError);
      }
    }

    // Deduplicate events by ID
    const uniqueEventsMap = new Map<string, EventData>();
    allRawEvents.forEach((event) => {
      if (event.id && !uniqueEventsMap.has(event.id)) {
        uniqueEventsMap.set(event.id, event);
      }
    });

    const uniqueEvents = Array.from(uniqueEventsMap.values());

    // Sort by event date (soonest first)
    uniqueEvents.sort((a, b) => {
      const dateA = new Date(a.eventDate).getTime();
      const dateB = new Date(b.eventDate).getTime();
      return dateA - dateB; // Soonest first for feed
    });

    // Take only the first 10 events for the feed
    const feedEvents = uniqueEvents.slice(0, 10);

    // Enrich events with host details and RSVP status
    const enrichedEvents = await enrichEventListOptimized(feedEvents, userId);

    logger.info(`Returning ${enrichedEvents.length} events for feed`);

    return {events: enrichedEvents};
  }, "getEventsForFeedApi"),
);

// MARK: - Cover Photo Management

export const getEventCoverPhotoUploadUrl = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const {eventId, fileName, mimeType} = request.data as {
      eventId: string;
      fileName: string;
      mimeType: string;
    };

    if (!eventId || !fileName || !mimeType) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "eventId, fileName, and mimeType are required.");
    }

    // Ensure user has permission to edit the event to add photos
    await ensureEventAccess(eventId, uid, "edit");

    // Sanitize fileName if necessary (e.g., remove special characters, ensure unique enough)
    const sanitizedFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "")}`;
    const storagePath = `events/${eventId}/covers/${sanitizedFileName}`;

    const fiveMinutesInSeconds = 5 * 60;
    const expires = Date.now() + fiveMinutesInSeconds * 1000;

    const [signedUrl] = await storage
      .bucket()
      .file(storagePath)
      .getSignedUrl({
        version: "v4",
        action: "write",
        expires,
        contentType: mimeType,
      });

    return {signedUrl, storagePath};
  }, "getEventCoverPhotoUploadUrl"),
);

export const completeEventCoverPhotoUpload = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const uid = request.auth?.uid || "";

    const {eventId, storagePath} = request.data as {
      eventId: string;
      storagePath: string;
    };

    if (!eventId || !storagePath) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "eventId and storagePath are required.");
    }

    // Ensure user has permission to edit the event
    await ensureEventAccess(eventId, uid, "edit");
    const eventRef = db.collection("events").doc(eventId);

    // Add the new storagePath to the array
    await eventRef.update({
      coverPhotoStoragePaths: FieldValue.arrayUnion(storagePath),
      updatedAt: Timestamp.now(),
    });

    logger.info(`Cover photo ${storagePath} added to event ${eventId} by user ${uid}.`);
    return {success: true, eventId, storagePath};
  }, "completeEventCoverPhotoUpload", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  }),
);
