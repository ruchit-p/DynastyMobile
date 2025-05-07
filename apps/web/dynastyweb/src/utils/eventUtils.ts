import { functions } from "@/lib/firebase"
import { httpsCallable } from "firebase/functions"
import { Timestamp } from "firebase/firestore"
import { createEvents, EventAttributes } from 'ics'

// Event types for the application
export type EventType = 
  | 'story:liked' 
  | 'story:unliked' 
  | 'comment:added' 
  | 'comment:liked';

// Event data structure
export interface EventLocation {
  address: string;
  lat: number;
  lng: number;
}

// Add a new interface for story like events
export interface LikeEventData extends Partial<EventData> {
  storyId: string;
  liked: boolean;
}

export interface EventData {
  id: string;
  title: string;
  eventDate: string; // Start date
  endDate?: string; // End date for multi-day events
  startTime?: string;
  endTime?: string;
  timezone?: string; // Timezone for the event
  daySpecificTimes?: {
    [date: string]: {
      startTime: string;
      endTime: string;
    };
  };
  location?: EventLocation | null;
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
  category?: string; // Added to match the data structure we need
  createdAt?: Timestamp | Date | string; // Proper type
  updatedAt?: Timestamp | Date | string; // Proper type
  host?: {
    id: string;
    name: string;
    avatar?: string;
  };
  attendees?: Array<{
    id: string;
    name: string;
    avatar?: string;
    status: string;
  }>;
  userStatus?: string;
  isCreator?: boolean;
  storyId?: string; // Added for story-related events
  comments?: Array<{
    id: string;
    text: string;
    timestamp: Timestamp | Date | string; // Properly typed
    user: {
      id: string;
      name: string;
      avatar?: string;
    };
  }>;
}

// Event callback function type
type EventCallback<T = unknown> = (data: T) => void;

// Event manager for pub/sub pattern
class EventManager {
  private listeners: Map<EventType, Set<EventCallback<unknown>>> = new Map();

  // Subscribe to an event
  public subscribe<T = EventData>(eventType: EventType, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    
    const callbacks = this.listeners.get(eventType)!;
    callbacks.add(callback as EventCallback<unknown>);

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback as EventCallback<unknown>);
      if (callbacks.size === 0) {
        this.listeners.delete(eventType);
      }
    };
  }

  // Publish an event
  public publish<T>(eventType: EventType, data: T): void {
    const callbacks = this.listeners.get(eventType);
    if (!callbacks) return;

    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${eventType}:`, error);
      }
    });
  }
}

// Create a singleton instance
const eventManager = new EventManager();
export default eventManager;

/**
 * Fetch all events accessible to the current user
 */
export async function getAllEvents() {
  try {
    const getEvents = httpsCallable<void, { events: EventData[] }>(
      functions, 
      'getEventsApi'
    );
    
    const result = await getEvents();
    
    if (!result.data || !Array.isArray(result.data.events)) {
      console.error('Invalid events data structure:', result.data);
      return { events: [] };
    }
    
    // Format each event with the current user ID
    const currentUserId = localStorage.getItem('userId') || '';
    const formattedEvents = result.data.events.map(event => formatEventData(event, currentUserId));
    
    return { events: formattedEvents };
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
}

/**
 * Fetch details for a specific event
 */
export async function getEventDetails(eventId: string) {
  try {
    const getEventDetails = httpsCallable<{ eventId: string }, { event: EventData }>(
      functions, 
      'getEventDetailsApi'
    );
    
    const result = await getEventDetails({ eventId });
    
    if (!result.data || !result.data.event) {
      console.error('Invalid event data structure:', result.data);
      throw new Error('Failed to fetch event details');
    }
    
    // Format the event with the current user ID
    const currentUserId = localStorage.getItem('userId') || '';
    const formattedEvent = formatEventData(result.data.event, currentUserId);
    
    return { event: formattedEvent };
  } catch (error) {
    console.error('Error fetching event details:', error);
    throw error;
  }
}

/**
 * Update RSVP status for an event
 */
export async function updateEventRsvp(eventId: string, status: 'yes' | 'maybe' | 'no') {
  try {
    const updateRsvp = httpsCallable<{ eventId: string, status: string }, { success: boolean }>(
      functions, 
      'updateEventRsvpApi'
    );
    
    const result = await updateRsvp({ eventId, status });
    
    return result.data;
  } catch (error) {
    console.error(`Error updating RSVP for event ${eventId}:`, error);
    throw error;
  }
}

// Add this helper function for image validation
/**
 * Validates images before sending to Firebase, checking size and format.
 * @param images Array of image URLs or base64 data
 * @returns Object containing isValid flag and optional error message
 */
export function validateEventImages(images?: string[]): { isValid: boolean; error?: string } {
  if (!images || !images.length) {
    return { isValid: true };
  }

  const MAX_IMAGE_SIZE_MB = 5; // 5MB limit per image
  const MAX_TOTAL_IMAGES = 10; // Maximum number of images per event

  // Check number of images
  if (images.length > MAX_TOTAL_IMAGES) {
    return {
      isValid: false,
      error: `Too many images. Maximum allowed is ${MAX_TOTAL_IMAGES}.`
    };
  }

  // Check size of base64 images
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    if (typeof image === 'string' && image.startsWith('data:image')) {
      // Estimate base64 size - each base64 character represents ~0.75 bytes
      const base64Data = image.split(',')[1];
      if (base64Data) {
        const sizeInBytes = (base64Data.length * 3) / 4;
        const sizeInMB = sizeInBytes / (1024 * 1024);
        
        if (sizeInMB > MAX_IMAGE_SIZE_MB) {
          return {
            isValid: false,
            error: `Image ${i + 1} is too large (${sizeInMB.toFixed(1)}MB). Maximum allowed is ${MAX_IMAGE_SIZE_MB}MB.`
          };
        }
      }
    }
  }

  return { isValid: true };
}

/**
 * Update an existing event
 */
export async function updateEvent(eventId: string, eventData: Partial<EventData>) {
  try {
    // Make sure timezone is explicitly included in the update
    if (!eventData.timezone) {
      console.warn('No timezone provided for event update, using browser timezone');
      eventData.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    
    // Validate images before sending to the server
    if (eventData.coverPhotoUrls) {
      const validationResult = validateEventImages(eventData.coverPhotoUrls);
      if (!validationResult.isValid) {
        throw new Error(validationResult.error);
      }
    }
    
    console.log("[eventUtils] Updating event with data:", { 
      eventId, 
      daySpecificTimes: eventData.daySpecificTimes,
      hasCoverPhotos: eventData.coverPhotoUrls ? eventData.coverPhotoUrls.length : 0
    });
    
    // Create a copy of the data to ensure it's not modified by reference
    const dataToSend = {
      eventId,
      eventData: {
        ...eventData,
        // Ensure timezone is explicitly set in the payload
        timezone: eventData.timezone,
        // Ensure daySpecificTimes is explicitly set in the payload (if available)
        daySpecificTimes: eventData.daySpecificTimes || {},
      }
    };
    
    // Log data being sent, but truncate large values like base64 images
    const logData = JSON.parse(JSON.stringify(dataToSend));
    if (logData.eventData.coverPhotoUrls) {
      logData.eventData.coverPhotoUrls = logData.eventData.coverPhotoUrls.map((url: string) => {
        if (typeof url === 'string' && url.startsWith('data:image')) {
          return `${url.substring(0, 30)}...truncated base64 image...`;
        }
        return url;
      });
    }
    console.log("[eventUtils] Final data being sent to Firebase:", logData);
    
    const updateEventFunc = httpsCallable<{ eventId: string, eventData: Partial<EventData> }, { success: boolean }>(
      functions, 
      'updateEvent'
    );
    
    const result = await updateEventFunc(dataToSend);
    
    return result.data;
  } catch (error) {
    console.error(`Error updating event ${eventId}:`, error);
    throw error;
  }
}

/**
 * Delete an event
 */
export async function deleteEvent(eventId: string) {
  try {
    const deleteEventFunc = httpsCallable<{ eventId: string }, { success: boolean }>(
      functions, 
      'deleteEventApi'
    );
    
    const result = await deleteEventFunc({ eventId });
    
    return result.data;
  } catch (error) {
    console.error(`Error deleting event ${eventId}:`, error);
    throw error;
  }
}

/**
 * Format event data for display
 */
export function formatEventData(event: EventData, currentUserId: string): EventData {
  // Add calculated fields
  const isCreator = event.hostId === currentUserId;
  
  // Default category if not present
  const category = event.category || 'other';
  
  // Check if event has multiple days with different times
  let hasVaryingTimes = false;
  if (event.daySpecificTimes && event.endDate && event.endDate !== event.eventDate) {
    // Get unique times from day-specific times
    const uniqueTimes = new Set();
    Object.values(event.daySpecificTimes).forEach(({ startTime, endTime }) => {
      uniqueTimes.add(`${startTime}-${endTime}`);
    });
    
    // If there's more than one unique time combination, it has varying times
    hasVaryingTimes = uniqueTimes.size > 1;
  }
  
  // Format dates if needed
  const formattedEvent = {
    ...event,
    isCreator,
    category,
    hasVaryingTimes
  };
  
  return formattedEvent;
}

/**
 * Generates an ICS calendar file for an event and triggers download
 * @param event The event data to generate a calendar file for
 */
export const generateEventCalendarFile = (event: EventData) => {
  // Parse the date and time information
  const startDate = new Date(event.eventDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  
  // If we have specific start/end times, set them
  if (event.startTime) {
    const [hours, minutes] = event.startTime.split(':').map(Number);
    startDate.setHours(hours, minutes);
  }
  
  // Determine end time/date
  let calendarEndDate;
  if (endDate) {
    calendarEndDate = new Date(endDate);
    if (event.endTime) {
      const [hours, minutes] = event.endTime.split(':').map(Number);
      calendarEndDate.setHours(hours, minutes);
    } else if (event.startTime) {
      // If we have a start time but no end time, assume 1 hour duration
      const [hours, minutes] = event.startTime.split(':').map(Number);
      calendarEndDate.setHours(hours, minutes + 60);
    }
  } else if (event.endTime) {
    // Single day event with end time
    calendarEndDate = new Date(startDate);
    const [hours, minutes] = event.endTime.split(':').map(Number);
    calendarEndDate.setHours(hours, minutes);
  } else {
    // No end date or time specified, default to 1 hour event
    calendarEndDate = new Date(startDate);
    calendarEndDate.setHours(calendarEndDate.getHours() + 1);
  }
  
  // Format dates as arrays for ics library
  // [year, month, day, hour, minute]
  const formatDateForICS = (date: Date) => [
    date.getFullYear(),
    date.getMonth() + 1, // JS months are 0-indexed
    date.getDate(),
    date.getHours(),
    date.getMinutes()
  ];
  
  const startArray = formatDateForICS(startDate);
  const endArray = formatDateForICS(calendarEndDate);
  
  // Create location string
  let location = event.isVirtual ? 'Virtual Event' : '';
  if (!event.isVirtual && event.location?.address) {
    location = event.location.address;
  }
  
  // Create description with all relevant details
  let description = event.description || '';
  
  // Add virtual link if applicable
  if (event.isVirtual && event.virtualLink) {
    description += `\n\nJoin meeting: ${event.virtualLink}`;
  }
  
  // Add additional details if available
  if (event.dresscode) {
    description += `\n\nDress Code: ${event.dresscode}`;
  }
  
  if (event.whatToBring) {
    description += `\n\nWhat to Bring: ${event.whatToBring}`;
  }
  
  if (event.additionalInfo) {
    description += `\n\nAdditional Information: ${event.additionalInfo}`;
  }
  
  // Prepare event for ICS
  const calendarEvent: EventAttributes = {
    start: startArray as [number, number, number, number, number],
    end: endArray as [number, number, number, number, number],
    title: event.title,
    description,
    location,
    url: event.virtualLink || undefined,
    organizer: event.host ? { name: event.host.name || 'Event Host', email: 'noreply@dynasty.com' } : undefined,
  };
  
  // Generate ICS file content
  return new Promise<string>((resolve, reject) => {
    createEvents([calendarEvent], (error, value) => {
      if (error) {
        console.error('Error generating calendar file:', error);
        reject(error);
      } else {
        resolve(value);
      }
    });
  });
};

/**
 * Creates and downloads an ICS file for an event
 * @param event The event data
 */
export const downloadEventCalendar = async (event: EventData) => {
  try {
    // Generate the ICS file content
    const icsContent = await generateEventCalendarFile(event);
    
    // Create a Blob from the ICS content
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    
    // Create a URL for the Blob
    const url = URL.createObjectURL(blob);
    
    // Create a temporary anchor element to trigger the download
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.title.replace(/\s+/g, '_')}_calendar.ics`;
    document.body.appendChild(link);
    
    // Trigger the download
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download calendar event:', error);
    throw error;
  }
}; 