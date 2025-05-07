import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {onCall, onRequest} from "firebase-functions/v2/https";
import {corsOptions} from "./api";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {logger} from "firebase-functions";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

const db = getFirestore();
const storage = getStorage();
const bucket = storage.bucket();

// MARK: - Types

interface EventData {
  title: string;
  eventDate: string;
  endDate?: string | null;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  daySpecificTimes?: {
    [date: string]: {
      startTime: string;
      endTime: string;
    };
  } | null;
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
}

// Interface for event invitations
export interface EventInvitation {
  id: string;
  eventId: string;
  memberId: string;
  rsvpStatus: "pending" | "yes" | "no" | "maybe";
  plusOne?: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// MARK: - Helper Functions

/**
 * Validates if a user has access to view an event
 */
async function canAccessEvent(eventId: string, userId: string): Promise<boolean> {
  // Get event document
  const eventDoc = await db.collection("events").doc(eventId).get();
  if (!eventDoc.exists) {
    return false;
  }

  const eventData = eventDoc.data() as EventData & { id: string };

  // Host can always access
  if (eventData.hostId === userId) {
    return true;
  }

  // If public, anyone can access
  if (eventData.privacy === "family") {
    return true;
  }

  // If private, check if user is invited
  const invitations = await db.collection("eventInvitations")
    .where("eventId", "==", eventId)
    .where("memberId", "==", userId)
    .limit(1)
    .get();

  return !invitations.empty;
}

/**
 * Process cover photos for an event
 */
async function processCoverPhotos(
  coverPhotos: string[],
  eventId: string
): Promise<string[]> {
  if (!coverPhotos || !Array.isArray(coverPhotos) || coverPhotos.length === 0) {
    return [];
  }

  const isLocalEmulator = process.env.FUNCTIONS_EMULATOR === "true";

  // Handle image upload if base64 data is provided
  const uploadPromises = coverPhotos.map(async (photoData: string, index: number) => {
    if (photoData.startsWith("data:image")) {
      const fileData = photoData.split(",")[1];
      const buffer = Buffer.from(fileData, "base64");
      const fileName = `events/${eventId}/cover_${index}_${Date.now()}.jpg`;
      const file = bucket.file(fileName);

      await file.save(buffer, {
        metadata: {
          contentType: "image/jpeg",
        },
      });

      if (isLocalEmulator) {
        // In local development, return public URL with alt=media
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}?alt=media`;
        return publicUrl;
      } else {
        // In production, generate a signed URL
        try {
          // Generate a signed URL that grants read access for a limited time
          const [signedUrl] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // URL valid for 7 days
          });

          // Return the signed URL
          return signedUrl;
        } catch (error) {
          logger.error("Error generating signed URL:", error);
          // Fallback to public URL with alt=media if signing fails
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}?alt=media`;
          return publicUrl;
        }
      }
    } else {
      // Already a URL
      if (photoData.includes("token=")) {
        // Already a signed URL, return as is
        return photoData;
      } else if (!photoData.includes("storage.googleapis.com")) {
        // Not a Google Storage URL, return as is
        return photoData;
      } else {
        // Google Storage URL that needs updating
        // In local development, add alt=media parameter
        if (isLocalEmulator) {
          if (photoData.includes("?")) {
            return `${photoData}&alt=media`;
          } else {
            return `${photoData}?alt=media`;
          }
        } else {
          // In production, regenerate signed URL
          try {
            // Extract the path from the URL
            // eslint-disable-next-line
            const match = photoData.match(/storage\.googleapis\.com\/[^\/]+\/(.+)/);
            if (match && match[1]) {
              const filePath = match[1];
              const file = bucket.file(filePath);

              // Generate a new signed URL
              const [signedUrl] = await file.getSignedUrl({
                action: "read",
                expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // URL valid for 7 days
              });
              return signedUrl;
            } else {
              return photoData; // Unable to parse, return as is
            }
          } catch (error) {
            logger.error("Error regenerating signed URL:", error);
            // Fallback to alt=media if signing fails
            if (photoData.includes("?")) {
              return `${photoData}&alt=media`;
            } else {
              return `${photoData}?alt=media`;
            }
          }
        }
      }
    }
  });

  return await Promise.all(uploadPromises);
}

/**
 * Process a base64 image ensuring it doesn't exceed size limits
 * @param base64Data The base64 image data to process
 * @param imageIndex The index of the image (for logging)
 * @param eventId The event ID (for logging and file path)
 * @param userId The user ID (for metadata)
 * @returns A promise resolving to the public URL or null on failure
 */
async function processBase64Image(
  base64Data: string,
  imageIndex: number,
  eventId: string,
  userId: string
): Promise<string | null> {
  try {
    // Extract MIME type and base64 data
    const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      logger.error(`Invalid base64 image format for event ${eventId} at index ${imageIndex}`);
      return null;
    }

    const contentType = matches[1];
    const base64Content = matches[2];

    // Check size limits - Firebase Functions has a 10MB limit on invocations
    // We should keep images below 5MB to be safe with multiple images
    const bufferSize = Buffer.byteLength(base64Content, "base64");
    const sizeInMB = bufferSize / (1024 * 1024);

    if (sizeInMB > 5) {
      logger.warn(`Image ${imageIndex} for event ${eventId} is ${sizeInMB.toFixed(2)}MB, which is large. Consider optimizing.`);
      // We could implement image resizing here if needed
    }

    const buffer = Buffer.from(base64Content, "base64");

    // Generate a unique filename with appropriate extension
    const extension = contentType.split("/")[1] || "jpg";
    const fileName = `events/${eventId}/cover_${imageIndex}_${Date.now()}.${extension}`;
    const file = bucket.file(fileName);

    // Upload to Firebase Storage
    await file.save(buffer, {
      metadata: {
        contentType,
        metadata: {
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    logger.info(`Successfully uploaded image ${imageIndex} for event ${eventId}, size: ${sizeInMB.toFixed(2)}MB`);
    return publicUrl;
  } catch (error) {
    logger.error(`Error processing image ${imageIndex} for event ${eventId}:`, error);
    return null;
  }
}

// MARK: - Callable Functions

/**
 * Creates a new event with invitations
 */
export const createEvent = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {auth, data} = request;

  // Check if the user is authenticated
  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to create events"
    );
  }

  try {
    logger.info(`Creating event by user ${auth.uid}`, {userId: auth.uid});

    // Validate required fields
    if (!data.title || !data.eventDate || !data.hostId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required fields: title, eventDate, or hostId"
      );
    }

    // Verify user has permission to create event
    if (data.hostId !== auth.uid) {
      logger.warn(`User ${auth.uid} attempted to create event for ${data.hostId}`, {
        userId: auth.uid,
        targetHostId: data.hostId,
      });

      throw new functions.https.HttpsError(
        "permission-denied",
        "User is not authorized to create events for this host"
      );
    }

    // Create event in Firestore
    const eventRef = db.collection("events").doc();

    // Process cover photos if they exist
    let coverPhotoUrls: string[] = [];
    if (data.coverPhotos && Array.isArray(data.coverPhotos)) {
      coverPhotoUrls = await processCoverPhotos(data.coverPhotos, eventRef.id);
    }

    // Handle day-specific times for multi-day events
    let daySpecificTimes: { [key: string]: { startTime: string; endTime: string } } | null = null;
    if (data.daySpecificTimes) {
      daySpecificTimes = data.daySpecificTimes;
    } else if (data.endDate && data.endDate !== data.eventDate) {
      // If it's a multi-day event but no specific times provided,
      // create a consistent time schedule for all days
      daySpecificTimes = {};

      // Parse start and end dates
      const startDate = new Date(data.eventDate);
      const endDate = new Date(data.endDate);

      // Loop through each day and set the same time
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateString = d.toISOString().split("T")[0]; // YYYY-MM-DD format
        daySpecificTimes[dateString] = {
          startTime: data.startTime || "",
          endTime: data.endTime || "",
        };
      }
    }

    // Create event document with properly typed data
    const eventData: EventData = {
      title: data.title,
      eventDate: data.eventDate,
      endDate: data.endDate || null,
      startTime: data.startTime,
      endTime: data.endTime,
      timezone: data.timezone,
      daySpecificTimes: daySpecificTimes,
      location: data.location,
      virtualLink: data.virtualLink,
      isVirtual: data.isVirtual,
      description: data.description,
      dresscode: data.dresscode,
      whatToBring: data.whatToBring,
      additionalInfo: data.additionalInfo,
      privacy: data.privacy,
      allowGuestPlusOne: data.allowGuestPlusOne,
      showGuestList: data.showGuestList,
      requireRsvp: data.requireRsvp,
      rsvpDeadline: data.rsvpDeadline,
      hostId: data.hostId,
      invitedMembers: data.invitedMembers || [],
    };

    const event = {
      ...eventData,
      coverPhotoUrls,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      id: eventRef.id,
    };

    await eventRef.set(event);
    logger.info(`Event created: ${eventRef.id}`, {userId: auth.uid, eventId: eventRef.id});

    // Create event invitations for all invited members
    if (Array.isArray(data.invitedMembers) && data.invitedMembers.length > 0) {
      const invitationBatch = db.batch();
      data.invitedMembers.forEach((memberId: string) => {
        const invitationRef = db.collection("eventInvitations").doc();
        invitationBatch.set(invitationRef, {
          eventId: eventRef.id,
          memberId,
          rsvpStatus: "pending",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          id: invitationRef.id,
        });
      });

      await invitationBatch.commit();
      logger.info(`Created ${data.invitedMembers.length} event invitations`, {
        userId: auth.uid,
        eventId: eventRef.id,
      });
    }

    return {
      success: true,
      message: "Event created successfully",
      eventId: eventRef.id,
      event,
    };
  } catch (error) {
    logger.error("Error creating event:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to create event",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

/**
 * Get details for a specific event
 */
export const getEventDetails = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  const {auth, data} = request;

  // Check if the user is authenticated
  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to view event details"
    );
  }

  try {
    const eventId = data.eventId;
    if (!eventId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Event ID is required"
      );
    }

    // Check if user has permission to view
    const hasAccess = await canAccessEvent(eventId, auth.uid);
    if (!hasAccess) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You do not have permission to view this event"
      );
    }

    // Get event document
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (!eventDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Event not found"
      );
    }

    const eventData = eventDoc.data();

    // Get event invitations
    const invitationsSnapshot = await db.collection("eventInvitations")
      .where("eventId", "==", eventId)
      .get();

    const invitations = invitationsSnapshot.docs.map((doc) => doc.data());

    return {
      success: true,
      event: eventData,
      invitations,
    };
  } catch (error) {
    logger.error("Error getting event details:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to get event details",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

/**
 * Update an existing event
 */
export const updateEvent = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {auth, data} = request;

  // Check if the user is authenticated
  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to update events"
    );
  }

  try {
    const eventId = data.eventId;
    if (!eventId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Event ID is required"
      );
    }

    // Validate that eventData exists
    if (!data.eventData || typeof data.eventData !== "object") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Event data is required and must be an object"
      );
    }

    // Type assertion for eventData to help TypeScript
    const eventDataFromRequest = data.eventData as Partial<EventData>;

    // Log the incoming request data for debugging
    logger.info(`Updating event: ${eventId}`, {
      userId: auth.uid,
      hasInvitedMembers: !!eventDataFromRequest.invitedMembers,
      hasDaySpecificTimes: !!eventDataFromRequest.daySpecificTimes,
      updatedFields: Object.keys(eventDataFromRequest),
    });

    // Get event document to check permissions
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (!eventDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Event not found"
      );
    }

    const eventData = eventDoc.data();

    // Check if user has permission to update the event
    if (eventData?.hostId !== auth.uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the event host can update this event"
      );
    }

    // Process new cover photos if provided
    let coverPhotoUrls: string[] = eventData?.coverPhotoUrls || [];
    if (eventDataFromRequest.coverPhotoUrls && Array.isArray(eventDataFromRequest.coverPhotoUrls)) {
      try {
        // Check if there are any base64 encoded images to handle
        const hasBase64Images = eventDataFromRequest.coverPhotoUrls.some((url: string) =>
          typeof url === "string" && url.startsWith("data:image"));

        if (hasBase64Images) {
          logger.info(`Processing ${eventDataFromRequest.coverPhotoUrls.length} cover photos for event ${eventId}`);

          // Process each photo - upload base64 images, keep existing URLs
          const processedUrls = await Promise.all(
            eventDataFromRequest.coverPhotoUrls.map(async (photoUrl: string, index: number) => {
              if (typeof photoUrl === "string" && photoUrl.startsWith("data:image")) {
                return await processBase64Image(photoUrl, index, eventId, auth.uid);
              }

              // Return existing URL if not a base64 image
              return photoUrl;
            })
          );

          // Filter out any null values from failed uploads
          coverPhotoUrls = processedUrls.filter((url): url is string => url !== null);
          logger.info(`Finished processing cover photos for event ${eventId}. Final count: ${coverPhotoUrls.length}`);
        } else {
          // No base64 images, just use the provided URLs
          coverPhotoUrls = eventDataFromRequest.coverPhotoUrls;
        }
      } catch (error) {
        logger.error(`Error processing cover photos for event ${eventId}:`, error);
        // Fallback to existing cover photos if there's an error processing new ones
      }
    }

    // Update fields
    const updateData: Partial<EventData> = {
      title: eventDataFromRequest.title,
      eventDate: eventDataFromRequest.eventDate,
      endDate: eventDataFromRequest.endDate,
      startTime: eventDataFromRequest.startTime,
      endTime: eventDataFromRequest.endTime,
      timezone: eventDataFromRequest.timezone,
      daySpecificTimes: eventDataFromRequest.daySpecificTimes,
      location: eventDataFromRequest.location,
      virtualLink: eventDataFromRequest.virtualLink,
      isVirtual: eventDataFromRequest.isVirtual,
      description: eventDataFromRequest.description,
      dresscode: eventDataFromRequest.dresscode,
      whatToBring: eventDataFromRequest.whatToBring,
      additionalInfo: eventDataFromRequest.additionalInfo,
      privacy: eventDataFromRequest.privacy,
      allowGuestPlusOne: eventDataFromRequest.allowGuestPlusOne,
      showGuestList: eventDataFromRequest.showGuestList,
      requireRsvp: eventDataFromRequest.requireRsvp,
      rsvpDeadline: eventDataFromRequest.rsvpDeadline,
    };

    // Filter out undefined values
    const filteredUpdateData = Object.fromEntries(
      Object.entries(updateData).filter((entry) => entry[1] !== undefined)
    );

    // Update event in Firestore
    await db.collection("events").doc(eventId).update({
      ...filteredUpdateData,
      // Explicitly include timezone to ensure it's updated
      timezone: eventDataFromRequest.timezone || eventData.timezone || "America/New_York",
      coverPhotoUrls,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Log success for debugging
    logger.info(`Successfully updated event: ${eventId}`, {
      userId: auth.uid,
      updatedFields: Object.keys(filteredUpdateData),
      hasDaySpecificTimes: !!filteredUpdateData.daySpecificTimes,
    });

    // Update invitations if invitedMembers field is provided
    if (eventDataFromRequest.invitedMembers && Array.isArray(eventDataFromRequest.invitedMembers)) {
      // Get current invitations
      const invitationsSnapshot = await db.collection("eventInvitations")
        .where("eventId", "==", eventId)
        .get();

      const currentInvitations = new Map();
      invitationsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        currentInvitations.set(data.memberId, doc.id);
      });

      // Determine which invitations to add or remove
      const invitationBatch = db.batch();

      // Remove invitations for members no longer invited
      currentInvitations.forEach((docId, memberId) => {
        if (!eventDataFromRequest.invitedMembers?.includes(memberId)) {
          invitationBatch.delete(db.collection("eventInvitations").doc(docId));
        }
      });

      // Add invitations for newly invited members
      eventDataFromRequest.invitedMembers.forEach((memberId: string) => {
        if (!currentInvitations.has(memberId)) {
          const invitationRef = db.collection("eventInvitations").doc();
          invitationBatch.set(invitationRef, {
            eventId,
            memberId,
            rsvpStatus: "pending",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            id: invitationRef.id,
          });
        }
      });

      await invitationBatch.commit();
    }

    return {
      success: true,
      message: "Event updated successfully",
      eventId,
    };
  } catch (error) {
    logger.error("Error updating event:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to update event",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

/**
 * Delete an event
 */
export const deleteEvent = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {auth, data} = request;

  // Check if the user is authenticated
  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to delete events"
    );
  }

  try {
    const eventId = data.eventId;
    if (!eventId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Event ID is required"
      );
    }

    // Get event document to check permissions
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (!eventDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Event not found"
      );
    }

    const eventData = eventDoc.data();

    // Check if user has permission to delete the event
    if (eventData?.hostId !== auth.uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the event host can delete this event"
      );
    }

    // Delete event cover photos from storage
    if (eventData?.coverPhotoUrls && Array.isArray(eventData.coverPhotoUrls)) {
      const deletePromises = eventData.coverPhotoUrls.map(async (url) => {
        try {
          // Extract filename from URL
          const matches = url.match(/events\/(.+?)\/cover_/);
          if (matches) {
            const fileName = url.split("/").slice(-1)[0];
            const file = bucket.file(`events/${eventId}/${fileName}`);
            await file.delete();
          }
        } catch (err) {
          logger.error("Error deleting file:", err);
          // Continue even if file deletion fails
        }
      });

      await Promise.all(deletePromises);
    }

    // Delete all event invitations
    const invitationsSnapshot = await db.collection("eventInvitations")
      .where("eventId", "==", eventId)
      .get();

    const deleteBatch = db.batch();
    invitationsSnapshot.docs.forEach((doc) => {
      deleteBatch.delete(doc.ref);
    });

    // Delete the event
    deleteBatch.delete(db.collection("events").doc(eventId));

    await deleteBatch.commit();

    return {
      success: true,
      message: "Event deleted successfully",
    };
  } catch (error) {
    logger.error("Error deleting event:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to delete event",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

/**
 * List events for the current user
 */
export const listEvents = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  const {auth, data} = request;

  // Check if the user is authenticated
  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to list events"
    );
  }

  try {
    // Get query parameters
    const limit = data.limit || 10;
    const offset = data.offset || 0;
    const userId = auth.uid;

    // Get events where user is host or invited
    const invitationsSnapshot = await db.collection("eventInvitations")
      .where("memberId", "==", userId)
      .get();

    const invitedEventIds = invitationsSnapshot.docs.map((doc) => doc.data().eventId);

    const events: FirebaseFirestore.DocumentData[] = [];

    // Get events where user is host
    const hostedEventsSnapshot = await db.collection("events")
      .where("hostId", "==", userId)
      .orderBy("eventDate", "desc")
      .get();

    hostedEventsSnapshot.docs.forEach((doc) => {
      events.push(doc.data());
    });

    // Get events where user is invited
    if (invitedEventIds.length > 0) {
      // Firestore can only query up to 10 items in an IN clause
      // So we need to split the invitedEventIds into chunks
      const chunks = [];
      for (let i = 0; i < invitedEventIds.length; i += 10) {
        chunks.push(invitedEventIds.slice(i, i + 10));
      }

      const invitedEventsPromises = chunks.map((chunk) => {
        return db.collection("events")
          .where("id", "in", chunk)
          .orderBy("eventDate", "desc")
          .get();
      });

      const invitedEventsSnapshots = await Promise.all(invitedEventsPromises);

      invitedEventsSnapshots.forEach((snapshot) => {
        snapshot.docs.forEach((doc) => {
          const eventData = doc.data();
          // Only include events that are not private or where the user is invited
          if (eventData.privacy !== "private" || invitedEventIds.includes(eventData.id)) {
            events.push(eventData);
          }
        });
      });
    }

    // Sort events by eventDate
    events.sort((a, b) => {
      const dateA = new Date(a.eventDate);
      const dateB = new Date(b.eventDate);
      return dateB.getTime() - dateA.getTime(); // Most recent first
    });

    // Apply pagination
    const paginatedEvents = events.slice(offset, offset + limit);

    return {
      success: true,
      events: paginatedEvents,
      total: events.length,
    };
  } catch (error) {
    logger.error("Error listing events:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to list events",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

/**
 * RSVP to an event
 */
export const rsvpToEvent = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  const {auth, data} = request;

  // Check if the user is authenticated
  if (!auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to RSVP to an event"
    );
  }

  try {
    const eventId = data.eventId;
    const rsvpStatus = data.rsvpStatus;
    const plusOne = data.plusOne === true;

    if (!eventId || !rsvpStatus) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Event ID and RSVP status are required"
      );
    }

    if (!["yes", "no", "maybe"].includes(rsvpStatus)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid RSVP status. Must be yes, no, or maybe"
      );
    }

    // Find invitation for this user and event
    const invitationsSnapshot = await db.collection("eventInvitations")
      .where("eventId", "==", eventId)
      .where("memberId", "==", auth.uid)
      .limit(1)
      .get();

    if (invitationsSnapshot.empty) {
      throw new functions.https.HttpsError(
        "not-found",
        "Invitation not found for this user and event"
      );
    }

    const invitationDoc = invitationsSnapshot.docs[0];

    // Update invitation with RSVP status
    await invitationDoc.ref.update({
      rsvpStatus,
      plusOne,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: "RSVP updated successfully",
    };
  } catch (error) {
    logger.error("Error updating RSVP:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to update RSVP",
      error instanceof Error ? {message: error.message} : undefined
    );
  }
});

// MARK: - HTTP API Endpoints

// Create a new event (HTTP API)
export const createEventHttp = onRequest({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request, response) => {
  const corsHandler = corsOptions();
  corsHandler(request, response, async () => {
    try {
      // Check auth header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return response.status(401).json({error: "Unauthorized"});
      }

      const idToken = authHeader.split("Bearer ")[1];
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (error) {
        return response.status(401).json({error: "Invalid authentication token"});
      }

      const uid = decodedToken.uid;

      if (request.method !== "POST") {
        return response.status(405).json({error: "Method not allowed"});
      }

      const eventData = request.body;

      // Validate required fields
      if (!eventData.title || !eventData.eventDate || !eventData.hostId) {
        return response.status(400).json({error: "Missing required fields: title, eventDate, or hostId"});
      }

      // Verify user has permission to create event
      if (eventData.hostId !== uid) {
        return response.status(403).json({error: "User is not authorized to create events for this host"});
      }

      // Create event in Firestore
      const eventRef = db.collection("events").doc();

      // Process cover photos if they exist
      let coverPhotoUrls: string[] = [];
      if (request.body.coverPhotos && Array.isArray(request.body.coverPhotos)) {
        coverPhotoUrls = await processCoverPhotos(request.body.coverPhotos, eventRef.id);
      }

      // Create event document
      const event = {
        ...eventData,
        coverPhotoUrls,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        id: eventRef.id,
      };

      await eventRef.set(event);

      // Create event invitations for all invited members
      const invitationBatch = db.batch();
      eventData.invitedMembers.forEach((memberId: string) => {
        const invitationRef = db.collection("eventInvitations").doc();
        invitationBatch.set(invitationRef, {
          eventId: eventRef.id,
          memberId,
          rsvpStatus: "pending",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          id: invitationRef.id,
        });
      });

      await invitationBatch.commit();

      return response.status(201).json({
        message: "Event created successfully",
        eventId: eventRef.id,
        event,
      });
    } catch (error) {
      logger.error("Error creating event:", error);
      return response.status(500).json({error: "Failed to create event"});
    }
  });
});
