import { getFirebaseFunctions } from './firebase';
import { httpsCallable } from '@react-native-firebase/functions';
import { errorHandler, ErrorSeverity } from './ErrorHandlingService';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { toDate, formatDate, formatTimeAgo } from './dateUtils';

/**
 * Types and interfaces for event operations
 */

/**
 * Standard event location interface
 */
export interface EventLocation {
  address: string;
  lat: number;
  lng: number;
}

/**
 * Time settings for a specific day in a multi-day event
 */
export interface EventDaySpecificTime {
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
}

/**
 * Core event data interface
 */
export interface Event {
  id: string;
  hostId: string;
  title: string;
  description?: string;
  eventDate: string; // YYYY-MM-DD (start date)
  endDate?: string | null; // YYYY-MM-DD (end date for multi-day)
  startTime?: string | null; // HH:mm format
  endTime?: string | null; // HH:mm format
  timezone?: string | null; // e.g., "America/New_York"
  daySpecificTimes?: Record<string, EventDaySpecificTime> | null; // Key is YYYY-MM-DD
  location?: EventLocation | null;
  isVirtual: boolean;
  virtualLink?: string | null;
  coverPhotoStoragePaths?: string[]; // Storage paths in GCS
  coverPhotoUrls?: string[]; // URLs for client consumption
  privacy: "public" | "family_tree" | "invite_only";
  allowGuestPlusOne: boolean;
  showGuestList: boolean;
  requireRsvp: boolean;
  rsvpDeadline?: string | null; // YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DD
  dresscode?: string | null;
  whatToBring?: string | null;
  additionalInfo?: string | null;
  invitedMemberIds?: string[]; // User IDs explicitly invited
  familyTreeId?: string | null; // If privacy is 'family_tree'
  createdAt?: { seconds: number; nanoseconds: number }; // Firestore Timestamp
  updatedAt?: { seconds: number; nanoseconds: number }; // Firestore Timestamp
}

/**
 * Extended event data with host information and user-specific data
 */
export interface EventDetails extends Event {
  host?: {
    id: string;
    name: string;
    avatar?: string;
  };
  attendees?: {
    id: string;
    name: string;
    avatar?: string;
    status: string;
    plusOne?: boolean;
    plusOneName?: string;
  }[];
  userStatus?: "pending" | "accepted" | "declined" | "maybe";
  userHasPlusOne?: boolean;
  isHost?: boolean;
  comments?: EventComment[];
}

/**
 * Event comment data structure
 */
export interface EventComment {
  id: string;
  eventId: string;
  userId: string;
  text: string;
  parentId?: string | null; // For threaded comments
  timestamp: { seconds: number; nanoseconds: number } | Date | string;
  user: {
    id: string;
    name: string;
    avatar?: string;
  };
}

/**
 * RSVP status for events
 */
export type RsvpStatus = "pending" | "accepted" | "declined" | "maybe";

/**
 * Create a new event
 * @returns The new event ID
 */
export const createEventMobile = async (eventData: {
  title: string;
  description?: string;
  eventDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  location?: EventLocation;
  isVirtual: boolean;
  virtualLink?: string;
  privacy: "public" | "family_tree" | "invite_only";
  allowGuestPlusOne: boolean;
  showGuestList: boolean;
  requireRsvp: boolean;
  rsvpDeadline?: string;
  dresscode?: string;
  whatToBring?: string;
  additionalInfo?: string;
  invitedMemberIds?: string[];
  familyTreeId?: string;
  coverPhotoStoragePaths?: string[];
}): Promise<string> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'createEvent');
    const res = await functionRef(eventData);
    
    const data = res.data as { eventId: string };
    return data.eventId;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Event Creation Error',
      metadata: {
        action: 'createEvent',
        title: eventData.title,
        eventDate: eventData.eventDate
      }
    });
    throw error;
  }
};

/**
 * Fetch full details for a specific event
 */
export const getEventDetailsMobile = async (eventId: string): Promise<EventDetails | null> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getEventDetails');
    const res = await functionRef({ eventId });
    
    const data = res.data as { event: EventDetails };
    return data.event || null;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Event Details Error',
      metadata: {
        action: 'getEventDetails',
        eventId
      }
    });
    throw error;
  }
};

/**
 * Update an existing event
 */
export const updateEventMobile = async (
  eventId: string,
  updates: Partial<Event>
): Promise<boolean> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'updateEvent');
    const res = await functionRef({ eventId, ...updates });
    
    const data = res.data as { success: boolean };
    return data.success;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Event Update Error',
      metadata: {
        action: 'updateEvent',
        eventId,
        updateFields: Object.keys(updates)
      }
    });
    throw error;
  }
};

/**
 * Delete an event (only works if user is the host)
 */
export const deleteEventMobile = async (eventId: string): Promise<boolean> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'deleteEvent');
    const res = await functionRef({ eventId });
    
    const data = res.data as { success: boolean };
    return data.success;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Event Deletion Error',
      metadata: {
        action: 'deleteEvent',
        eventId
      }
    });
    throw error;
  }
};

/**
 * RSVP to an event
 */
export const rsvpToEventMobile = async (
  eventId: string,
  status: RsvpStatus,
  plusOne: boolean = false,
  plusOneName?: string
): Promise<boolean> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'rsvpToEvent');
    const res = await functionRef({
      eventId,
      status,
      plusOne,
      plusOneName
    });
    
    const data = res.data as { success: boolean };
    return data.success;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'RSVP Error',
      metadata: {
        action: 'rsvpToEvent',
        eventId,
        status,
        plusOne
      }
    });
    throw error;
  }
};

/**
 * Get the attendees for an event
 */
export const getEventAttendeesMobile = async (eventId: string): Promise<EventDetails['attendees'][0][]> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getEventAttendees');
    const res = await functionRef({ eventId });
    
    const data = res.data as { attendees: EventDetails['attendees'][0][] };
    return data.attendees || [];
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Attendees Error',
      metadata: {
        action: 'getEventAttendees',
        eventId
      }
    });
    throw error;
  }
};

/**
 * Add a comment to an event
 */
export const addCommentToEventMobile = async (
  eventId: string,
  text: string,
  parentId?: string
): Promise<EventComment | null> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'addCommentToEvent');
    const res = await functionRef({
      eventId,
      text,
      parentId
    });
    
    const data = res.data as { success: boolean; comment: EventComment };
    return data.comment || null;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Comment Error',
      metadata: {
        action: 'addCommentToEvent',
        eventId,
        textLength: text.length,
        hasParent: !!parentId
      }
    });
    throw error;
  }
};

/**
 * Get comments for an event
 */
export const getEventCommentsMobile = async (eventId: string): Promise<EventComment[]> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getEventComments');
    const res = await functionRef({ eventId });
    
    const data = res.data as { comments: EventComment[] };
    return data.comments || [];
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.WARNING,
      title: 'Comments Error',
      metadata: {
        action: 'getEventComments',
        eventId
      }
    });
    return [];
  }
};

/**
 * Delete a comment from an event
 */
export const deleteEventCommentMobile = async (
  eventId: string,
  commentId: string
): Promise<boolean> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'deleteEventComment');
    const res = await functionRef({ eventId, commentId });
    
    const data = res.data as { success: boolean };
    return data.success;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Delete Comment Error',
      metadata: {
        action: 'deleteEventComment',
        eventId,
        commentId
      }
    });
    throw error;
  }
};

/**
 * Get upcoming events for the current user
 */
export const getUpcomingEventsMobile = async (
  limit?: number,
  lastEventDate?: string,
  lastEventId?: string
): Promise<{
  events: EventDetails[];
  lastEventDate?: string;
  lastEventId?: string;
  hasMore: boolean;
}> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getUpcomingEventsForUser');
    const res = await functionRef({ limit, lastEventDate, lastEventId });
    
    const data = res.data as {
      events: EventDetails[];
      lastEventDate?: string;
      lastEventId?: string;
      hasMore: boolean;
    };
    
    return {
      events: data.events || [],
      lastEventDate: data.lastEventDate,
      lastEventId: data.lastEventId,
      hasMore: data.hasMore || false
    };
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Upcoming Events Error',
      metadata: {
        action: 'getUpcomingEventsForUser',
        limit,
        hasLastEventDate: !!lastEventDate
      }
    });
    return { events: [], hasMore: false };
  }
};

/**
 * Get a signed URL for uploading an event cover photo
 */
export const getEventCoverPhotoUploadUrlMobile = async (
  eventId: string,
  fileName: string,
  mimeType: string
): Promise<{ signedUrl: string; storagePath: string }> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'getEventCoverPhotoUploadUrl');
    const res = await functionRef({ eventId, fileName, mimeType });
    
    const data = res.data as { signedUrl: string; storagePath: string };
    return {
      signedUrl: data.signedUrl,
      storagePath: data.storagePath
    };
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Photo Upload URL Error',
      metadata: {
        action: 'getEventCoverPhotoUploadUrl',
        eventId,
        fileName,
        mimeType
      }
    });
    throw error;
  }
};

/**
 * Complete the upload of an event cover photo
 */
export const completeEventCoverPhotoUploadMobile = async (
  eventId: string,
  storagePath: string
): Promise<boolean> => {
  try {
    const functionsInstance = getFirebaseFunctions();
    const functionRef = httpsCallable(functionsInstance, 'completeEventCoverPhotoUpload');
    const res = await functionRef({ eventId, storagePath });
    
    const data = res.data as { success: boolean };
    return data.success;
  } catch (error) {
    errorHandler.handleFirebaseError(error, {
      severity: ErrorSeverity.ERROR,
      title: 'Complete Photo Upload Error',
      metadata: {
        action: 'completeEventCoverPhotoUpload',
        eventId,
        storagePath
      }
    });
    throw error;
  }
};

/**
 * Helper function to format event date for display
 */
export const formatEventDate = (date: Date | string | { seconds: number; nanoseconds: number }): string => {
  return formatDate(date, 'EEEE, MMMM d, yyyy', 'Invalid date');
};

/**
 * Helper function to format event time for display
 */
export const formatEventTime = (time: string): string => {
  if (!time) return '';
  
  try {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    
    return formatDate(date, 'h:mm a', '');
  } catch (error) {
    errorHandler.handleError(error, {
      severity: ErrorSeverity.INFO,
      title: 'Time Format Error',
      metadata: {
        action: 'formatEventTime',
        time
      },
      showAlert: false
    });
    return '';
  }
};

/**
 * Convert event data to a format suitable for calendars
 */
export const eventToCalendarEvent = (event: Event | EventDetails): {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  notes?: string;
} => {
  // Parse the date
  const startDate = toDate(event.eventDate) || new Date();
  const endDate = event.endDate ? (toDate(event.endDate) || new Date(startDate)) : new Date(startDate);
  
  // Set times if specified
  let allDay = true;
  
  if (event.startTime) {
    allDay = false;
    const [startHours, startMinutes] = event.startTime.split(':').map(Number);
    startDate.setHours(startHours, startMinutes);
  } else {
    // Default to all-day event
    startDate.setHours(0, 0, 0, 0);
  }
  
  if (event.endTime) {
    allDay = false;
    const [endHours, endMinutes] = event.endTime.split(':').map(Number);
    endDate.setHours(endHours, endMinutes);
  } else {
    // End of day for all-day events
    endDate.setHours(23, 59, 59, 999);
  }
  
  // For multi-day events without specific times
  if (event.endDate && !event.startTime && !event.endTime) {
    allDay = true;
  }
  
  let location = '';
  if (event.isVirtual) {
    location = 'Virtual Event';
    if (event.virtualLink) {
      location += ` - ${event.virtualLink}`;
    }
  } else if (event.location?.address) {
    location = event.location.address;
  }
  
  return {
    title: event.title,
    start: startDate,
    end: endDate,
    allDay,
    location,
    notes: event.description
  };
};
