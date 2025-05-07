import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {onCall} from "firebase-functions/v2/https";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {logger} from "firebase-functions";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {EventInvitation} from "./events";
import {getStorage} from "firebase-admin/storage";

const db = getFirestore();
const bucket = getStorage().bucket();

// Define interface for invitation status
interface InvitationStatus {
  status: "pending" | "yes" | "no" | "maybe";
  plusOne?: boolean;
}

// Define event interface specifically for the enrichment process
interface EventWithUserStatus {
  id: string;
  hostId: string;
  title: string;
  eventDate: string;
  isCreator: boolean;
  userStatus: string | InvitationStatus;
  // Add other event properties as needed
}

// Use the imported EventInvitation type for attendees data
interface AttendeeData extends Omit<EventInvitation, "updatedAt" | "createdAt"> {
  // Additional properties specific to this context, if any
}

// Define interface for event data
interface EventData {
  id: string;
  title: string;
  eventDate: string;
  startTime?: string;
  endTime?: string;
  location?: {
    address: string;
    lat: number;
    lng: number;
  } | null;
  virtualLink?: string | null;
  isVirtual: boolean;
  description?: string;
  dresscode?: string | null;
  whatToBring?: string | null;
  additionalInfo?: string | null;
  privacy: string;
  allowGuestPlusOne: boolean;
  showGuestList: boolean;
  requireRsvp: boolean;
  rsvpDeadline?: string | null;
  hostId: string;
  invitedMembers: string[];
  coverPhotoUrls?: string[];
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
  timezone?: string;
}

/**
 * Generate signed URLs for event cover photos
 * This ensures that all image links are accessible
 */
async function regenerateSignedUrls(photoUrls?: string[]): Promise<string[]> {
  if (!photoUrls || !Array.isArray(photoUrls) || photoUrls.length === 0) {
    return [];
  }

  const isLocalEmulator = process.env.FUNCTIONS_EMULATOR === "true";

  const urlPromises = photoUrls.map(async (photoUrl) => {
    // Skip processing if already a signed URL
    if (photoUrl.includes("token=")) {
      return photoUrl;
    }

    // Skip if not a Google Storage URL
    if (!photoUrl.includes("storage.googleapis.com")) {
      return photoUrl;
    }

    // Extract the path from the URL
    // eslint-disable-next-line
    const match = photoUrl.match(/storage\.googleapis\.com\/[^\/]+\/(.+)/);
    if (!match || !match[1]) {
      return photoUrl; // Can't parse, return as is
    }

    const filePath = match[1];

    if (isLocalEmulator) {
      // For local development, add alt=media parameter
      // This lets browser fetch without authentication in development
      if (photoUrl.includes("?")) {
        return `${photoUrl}&alt=media`;
      } else {
        return `${photoUrl}?alt=media`;
      }
    } else {
      // In production, generate proper signed URLs
      try {
        const file = bucket.file(filePath);

        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
          logger.warn(`File does not exist: ${filePath}`);
          return photoUrl; // File doesn't exist, return original URL
        }

        // Generate a new signed URL
        const [signedUrl] = await file.getSignedUrl({
          action: "read",
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // URL valid for 7 days
        });
        return signedUrl;
      } catch (error) {
        logger.error("Error generating signed URL:", error);

        // Fallback to alt=media if signing fails
        if (photoUrl.includes("?")) {
          return `${photoUrl}&alt=media`;
        } else {
          return `${photoUrl}?alt=media`;
        }
      }
    }
  });

  return Promise.all(urlPromises);
}

/**
 * Get all events accessible to the current user
 */
export const getEventsApi = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {auth} = request;

  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access events"
    );
  }

  try {
    logger.info(`Fetching events for user ${auth.uid}`, {userId: auth.uid});

    // Get events where user is host
    const hostEventsSnapshot = await db.collection("events")
      .where("hostId", "==", auth.uid)
      .get();

    // Get event invitations for the user
    const invitationsSnapshot = await db.collection("eventInvitations")
      .where("memberId", "==", auth.uid)
      .get();

    // Get all event IDs the user is invited to
    const invitedEventIds = invitationsSnapshot.docs.map((doc) => doc.data().eventId);

    // Get events the user is invited to
    const invitedEventsSnapshots = await Promise.all(
      invitedEventIds.map(async (eventId) => {
        return db.collection("events").doc(eventId).get();
      })
    );

    // Create a map of invitation status by event ID
    const invitationStatusMap: Record<string, InvitationStatus> = {};
    invitationsSnapshot.forEach((doc) => {
      const data = doc.data();
      invitationStatusMap[data.eventId] = data.rsvpStatus;
    });

    // Process host events
    const hostEvents: EventWithUserStatus[] = hostEventsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        isCreator: true,
        userStatus: "going",
      } as EventWithUserStatus;
    });

    // Process invited events
    const invitedEvents: EventWithUserStatus[] = invitedEventsSnapshots
      .filter((doc) => doc.exists)
      .map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          isCreator: false,
          userStatus: invitationStatusMap[doc.id] || "pending",
        } as EventWithUserStatus;
      });

    // Combine all events
    const allEvents: EventWithUserStatus[] = [...hostEvents, ...invitedEvents];

    // Enrich events with additional user data
    const enrichedEvents = await Promise.all(
      allEvents.map(async (event) => {
        // Get host information
        const hostUser = await db.collection("users").doc(event.hostId).get();
        const hostData = hostUser.exists ? hostUser.data() : null;

        // Get attendees information
        const attendeesSnapshot = await db.collection("eventInvitations")
          .where("eventId", "==", event.id)
          .get();

        const attendeePromises = attendeesSnapshot.docs.map(async (doc) => {
          const attendeeData = doc.data() as AttendeeData;
          const userDoc = await db.collection("users").doc(attendeeData.memberId).get();
          const userData = userDoc.exists ? userDoc.data() : null;

          return {
            id: attendeeData.memberId,
            name: userData?.displayName || "Unknown User",
            avatar: userData?.profilePicture || null,
            status: attendeeData.rsvpStatus,
          };
        });

        const attendees = await Promise.all(attendeePromises);

        // Return enriched event data
        return {
          ...event,
          host: {
            id: event.hostId,
            name: hostData?.displayName || "Unknown Host",
            avatar: hostData?.profilePicture || null,
          },
          attendees,
        };
      })
    );

    return {events: enrichedEvents};
  } catch (error) {
    logger.error("Error fetching events:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to fetch events",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

/**
 * Get specific event details
 */
export const getEventDetailsApi = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {auth, data} = request;

  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access event details"
    );
  }

  if (!data.eventId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Event ID is required"
    );
  }

  try {
    logger.info(`Fetching event details for ${data.eventId}`, {
      userId: auth.uid,
      eventId: data.eventId,
    });

    // Get event document
    const eventDoc = await db.collection("events").doc(data.eventId).get();

    if (!eventDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Event not found"
      );
    }

    const eventData = eventDoc.data();

    // Check if eventData exists
    if (!eventData) {
      throw new functions.https.HttpsError(
        "internal",
        "Event data is corrupted"
      );
    }

    // Regenerate signed URLs for cover photos
    if (eventData.coverPhotoUrls && Array.isArray(eventData.coverPhotoUrls)) {
      eventData.coverPhotoUrls = await regenerateSignedUrls(eventData.coverPhotoUrls);

      // Log regenerated URLs for debugging
      logger.info(`Regenerated signed URLs for event ${data.eventId}`, {
        eventId: data.eventId,
        urlCount: eventData.coverPhotoUrls.length,
      });
    }

    // Check if user has access
    const isCreator = eventData.hostId === auth.uid;

    if (!isCreator) {
      // Check if user is invited
      const invitationSnapshot = await db.collection("eventInvitations")
        .where("eventId", "==", data.eventId)
        .where("memberId", "==", auth.uid)
        .limit(1)
        .get();

      const isInvited = !invitationSnapshot.empty;

      if (!isInvited && eventData.privacy !== "family") {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You do not have access to this event"
        );
      }
    }

    // Get user's RSVP status
    let userStatus = isCreator ? "going" : "pending";

    if (!isCreator) {
      const invitationSnapshot = await db.collection("eventInvitations")
        .where("eventId", "==", data.eventId)
        .where("memberId", "==", auth.uid)
        .limit(1)
        .get();

      if (!invitationSnapshot.empty) {
        const invitationData = invitationSnapshot.docs[0].data();
        userStatus = invitationData.rsvpStatus;
      }
    }

    // Get host information
    const hostUser = await db.collection("users").doc(eventData.hostId).get();
    const hostData = hostUser.exists ? hostUser.data() : null;

    // Get attendees information
    const attendeesSnapshot = await db.collection("eventInvitations")
      .where("eventId", "==", data.eventId)
      .get();

    const attendeePromises = attendeesSnapshot.docs.map(async (doc) => {
      const attendeeData = doc.data() as AttendeeData;
      const userDoc = await db.collection("users").doc(attendeeData.memberId).get();
      const userData = userDoc.exists ? userDoc.data() : null;

      return {
        id: attendeeData.memberId,
        name: userData?.displayName || "Unknown User",
        avatar: userData?.profilePicture || null,
        status: attendeeData.rsvpStatus,
      };
    });

    const attendees = await Promise.all(attendeePromises);

    // Get comments
    const commentsSnapshot = await db.collection("eventComments")
      .where("eventId", "==", data.eventId)
      .orderBy("createdAt", "desc")
      .get();

    const commentPromises = commentsSnapshot.docs.map(async (doc) => {
      const commentData = doc.data();
      const userDoc = await db.collection("users").doc(commentData.userId).get();
      const userData = userDoc.exists ? userDoc.data() : null;

      return {
        id: doc.id,
        text: commentData.text,
        timestamp: commentData.createdAt,
        user: {
          id: commentData.userId,
          name: userData?.displayName || "Unknown User",
          avatar: userData?.profilePicture || null,
        },
      };
    });

    const comments = await Promise.all(commentPromises);

    // Return enriched event data
    return {
      event: {
        ...eventData,
        id: eventDoc.id,
        timezone: eventData.timezone || "America/New_York",
        host: {
          id: eventData.hostId,
          name: hostData?.displayName || "Unknown Host",
          avatar: hostData?.profilePicture || null,
        },
        attendees,
        comments,
        userStatus,
        isCreator,
      },
    };
  } catch (error) {
    logger.error(`Error fetching event details for ${data.eventId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to fetch event details",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

/**
 * Update RSVP status for an event
 */
export const updateEventRsvpApi = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {auth, data} = request;

  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to update RSVP status"
    );
  }

  if (!data.eventId || !data.status) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Event ID and status are required"
    );
  }

  // Validate status
  const validStatuses = ["yes", "maybe", "no"];
  if (!validStatuses.includes(data.status)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid status. Must be one of: yes, maybe, no"
    );
  }

  try {
    logger.info(`Updating RSVP status for event ${data.eventId}`, {
      userId: auth.uid,
      eventId: data.eventId,
      status: data.status,
    });

    // Get event document
    const eventDoc = await db.collection("events").doc(data.eventId).get();

    if (!eventDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Event not found"
      );
    }

    const eventData = eventDoc.data();

    // Check if eventData exists
    if (!eventData) {
      throw new functions.https.HttpsError(
        "not-found",
        "Event data not found"
      );
    }

    // Prevent host from changing their RSVP status
    if (eventData.hostId === auth.uid) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Event host cannot change their RSVP status"
      );
    }

    // Get the invitation document
    const invitationsSnapshot = await db.collection("eventInvitations")
      .where("eventId", "==", data.eventId)
      .where("memberId", "==", auth.uid)
      .limit(1)
      .get();

    if (invitationsSnapshot.empty) {
      throw new functions.https.HttpsError(
        "not-found",
        "You are not invited to this event"
      );
    }

    const invitationDoc = invitationsSnapshot.docs[0];

    // Update the invitation status
    await invitationDoc.ref.update({
      rsvpStatus: data.status,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {success: true};
  } catch (error) {
    logger.error(`Error updating RSVP status for event ${data.eventId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to update RSVP status",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

/**
 * Add a comment to an event
 */
export const addEventCommentApi = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {auth, data} = request;

  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to comment on an event"
    );
  }

  if (!data.eventId || !data.text) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Event ID and comment text are required"
    );
  }

  try {
    logger.info(`Adding comment to event ${data.eventId}`, {
      userId: auth.uid,
      eventId: data.eventId,
    });

    // Get event document
    const eventDoc = await db.collection("events").doc(data.eventId).get();

    if (!eventDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Event not found"
      );
    }

    const eventData = eventDoc.data();

    // Check if eventData exists
    if (!eventData) {
      throw new functions.https.HttpsError(
        "not-found",
        "Event data not found"
      );
    }

    // Check if user has access
    const isCreator = eventData.hostId === auth.uid;

    if (!isCreator) {
      // Check if user is invited
      const invitationSnapshot = await db.collection("eventInvitations")
        .where("eventId", "==", data.eventId)
        .where("memberId", "==", auth.uid)
        .limit(1)
        .get();

      const isInvited = !invitationSnapshot.empty;

      if (!isInvited && eventData.privacy !== "family") {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You do not have access to this event"
        );
      }
    }

    // Create comment document
    const commentRef = db.collection("eventComments").doc();
    await commentRef.set({
      eventId: data.eventId,
      userId: auth.uid,
      text: data.text,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {success: true, commentId: commentRef.id};
  } catch (error) {
    logger.error(`Error adding comment to event ${data.eventId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to add comment",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

/**
 * Delete an event
 */
export const deleteEventApi = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {auth, data} = request;

  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to delete an event"
    );
  }

  if (!data.eventId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Event ID is required"
    );
  }

  try {
    logger.info(`Deleting event ${data.eventId}`, {
      userId: auth.uid,
      eventId: data.eventId,
    });

    // Get event document
    const eventDoc = await db.collection("events").doc(data.eventId).get();

    if (!eventDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Event not found"
      );
    }

    const eventData = eventDoc.data();

    // Check if eventData exists
    if (!eventData) {
      throw new functions.https.HttpsError(
        "not-found",
        "Event data not found"
      );
    }

    // Check if user is the event creator
    if (eventData.hostId !== auth.uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the event creator can delete this event"
      );
    }

    // Delete invitations
    const invitationsSnapshot = await db.collection("eventInvitations")
      .where("eventId", "==", data.eventId)
      .get();

    const invitationBatch = db.batch();
    invitationsSnapshot.docs.forEach((doc) => {
      invitationBatch.delete(doc.ref);
    });
    await invitationBatch.commit();

    // Delete comments
    const commentsSnapshot = await db.collection("eventComments")
      .where("eventId", "==", data.eventId)
      .get();

    const commentBatch = db.batch();
    commentsSnapshot.docs.forEach((doc) => {
      commentBatch.delete(doc.ref);
    });
    await commentBatch.commit();

    // Delete event
    await db.collection("events").doc(data.eventId).delete();

    return {success: true};
  } catch (error) {
    logger.error(`Error deleting event ${data.eventId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to delete event",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

/**
 * Get events for the feed
 */
export const getEventsForFeedApi = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {auth} = request;

  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access the feed"
    );
  }

  try {
    logger.info(`Fetching events for feed for user ${auth.uid}`, {userId: auth.uid});

    // Get events where user is host
    const hostEventsSnapshot = await db.collection("events")
      .where("hostId", "==", auth.uid)
      .get();

    // Get event invitations for the user
    const invitationsSnapshot = await db.collection("eventInvitations")
      .where("memberId", "==", auth.uid)
      .get();

    // Get all event IDs the user is invited to
    const invitedEventIds = invitationsSnapshot.docs.map((doc) => doc.data().eventId);

    // Get events the user is invited to
    const invitedEventsSnapshots = await Promise.all(
      invitedEventIds.map(async (eventId) => {
        return db.collection("events").doc(eventId).get();
      })
    );

    // Create a map of invitation status by event ID
    const invitationStatusMap: Record<string, InvitationStatus> = {};
    invitationsSnapshot.forEach((doc) => {
      const data = doc.data();
      invitationStatusMap[data.eventId] = data.rsvpStatus;
    });

    // Process host events with explicit typing
    const hostEvents = hostEventsSnapshot.docs.map((doc) => {
      const eventData = doc.data() as EventData;
      return {
        ...eventData,
        id: doc.id,
        isCreator: true,
        userStatus: "going",
        hostId: eventData.hostId || auth.uid, // Ensure hostId is always set
      };
    });

    // Process invited events with explicit typing
    const invitedEvents = invitedEventsSnapshots
      .filter((doc) => doc.exists)
      .map((doc) => {
        const eventData = doc.data() as EventData;
        return {
          ...eventData,
          id: doc.id,
          isCreator: false,
          userStatus: invitationStatusMap[doc.id] || "pending",
          hostId: eventData.hostId, // Preserve the hostId
        };
      });

    // Combine all events with a clear type
    const allEvents = [...hostEvents, ...invitedEvents] as Array<EventData & {
      id: string;
      isCreator: boolean;
      userStatus: string | InvitationStatus;
      hostId: string;
    }>;

    // Enrich events with additional user data
    const enrichedEvents = await Promise.all(
      allEvents.map(async (event) => {
        // Get host information
        const hostUser = await db.collection("users").doc(event.hostId).get();
        const hostData = hostUser.exists ? hostUser.data() : null;

        // Get attendees information
        const attendeesSnapshot = await db.collection("eventInvitations")
          .where("eventId", "==", event.id)
          .get();

        const attendeePromises = attendeesSnapshot.docs.map(async (doc) => {
          const attendeeData = doc.data() as AttendeeData;
          const userDoc = await db.collection("users").doc(attendeeData.memberId).get();
          const userData = userDoc.exists ? userDoc.data() : null;

          return {
            id: attendeeData.memberId,
            name: userData?.displayName || "Unknown User",
            avatar: userData?.profilePicture || null,
            status: attendeeData.rsvpStatus,
          };
        });

        const attendees = await Promise.all(attendeePromises);

        // Return enriched event data
        return {
          ...event,
          host: {
            id: event.hostId,
            name: hostData?.displayName || "Unknown Host",
            avatar: hostData?.profilePicture || null,
          },
          attendees,
        };
      })
    );

    // Filter and sort events for the feed
    // For feed, we typically want upcoming events or events in the near past
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const feedEvents = enrichedEvents.filter((event) => {
      const eventDate = new Date(event.eventDate);
      return eventDate >= thirtyDaysAgo;
    });

    return {events: feedEvents};
  } catch (error) {
    logger.error("Error fetching events for feed:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to fetch events for feed",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

