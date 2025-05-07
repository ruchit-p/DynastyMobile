# Firebase In-App Notifications Implementation Guide

This guide explains how to integrate Firebase Cloud Messaging (FCM) into your Dynasty web application for push notifications with both foreground and background notification support. This implementation keeps all business logic on the server side (Firebase Functions) rather than the client side.

## Implementation Status

✅ **Completed:**
- Server-side Firebase Functions for notifications
  - Event-triggered notifications (likes, comments, etc.)
  - User device token management
  - Notification creation and delivery
  - Notification analytics tracking
- Client-side notification utilities
  - Messaging initialization
  - Token registration
  - Foreground notification handling
- NotificationContext for global state management
  - Real-time notification updates
  - Unread count tracking
- NotificationBell component in the navbar
  - Badge for unread notifications
  - Dropdown menu with recent notifications
  - Mark as read functionality
- Notifications page for viewing all notifications
  - Filtering options (All/Unread)
  - Delete functionality
  - Mark all as read capability
- Notification settings in account settings
  - Toggle for push notifications
  - Toggle for email notifications
  - Controls for different notification types
- Service worker for handling background notifications
  - Click handling to navigate to the appropriate page
  - Rich notification display

## Architecture Overview

The notification system consists of:

1. **Firebase Functions (Server-side)**:
   - Handle notification creation, delivery, and management
   - Trigger notifications based on events (e.g., likes, comments)
   - Schedule notifications (e.g., event reminders)
   - Manage device tokens and user preferences

2. **Web Client**:
   - Register device tokens for push notifications
   - Display real-time notifications via NotificationContext
   - Provide UI for notification management and settings
   - Track notification interactions (viewed, clicked, dismissed)

3. **Service Worker**:
   - Handle background notifications when app is not in focus
   - Process notification clicks with deep linking
   - Display rich notifications with Dynasty branding

## Prerequisites

- Firebase project with Firestore, Authentication, and Cloud Messaging enabled
- Web Push certificates configured in Firebase console
- FCM VAPID key (found in Firebase Console → Project Settings → Cloud Messaging)

## Implementation Steps

### 1. Server-Side Implementation (Firebase Functions)

✅ Implemented in `notifications.ts` with the following components:

#### Types
```typescript
interface NotificationData {
  id?: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  relatedItemId?: string;
  link?: string;
  imageUrl?: string;
  isRead: boolean;
  createdAt?: any;
  updatedAt?: any;
}

type NotificationType =
  | "story:new"
  | "story:liked"
  | "comment:new"
  | "comment:reply"
  | "event:invitation"
  | "event:updated"
  | "event:reminder"
  | "family:invitation"
  | "system:announcement";
```

#### Key Functions

```typescript
// Function to register a device token
export const registerDeviceToken = onCall({...});

// Function to send a notification to a user
export const sendNotification = onCall({...});

// Function to mark notifications as read
export const markNotificationRead = onCall({...});

// Function to get notifications for a user
export const getUserNotifications = onCall({...});

// Firestore triggers that create notifications
export const onStoryLiked = onDocumentCreated({...});
export const onCommentAdded = onDocumentCreated({...});
export const onEventInvitationCreated = onDocumentCreated({...});

// Scheduled function for event reminders
export const sendEventReminders = onSchedule({...});
```

#### Helper Functions

The implementation includes a robust `createAndSendNotification` helper function that:
- Creates a notification document in Firestore
- Retrieves the user's device tokens
- Sends push notifications to all user devices
- Handles error cases and cleans up invalid tokens

### 2. Client-Side Implementation

#### 2.1 Firebase Configuration

✅ Environment configuration includes FCM VAPID key:

```
NEXT_PUBLIC_FIREBASE_VAPID_KEY="your_firebase_vapid_key"
```

#### 2.2 Service Worker for Background Notifications

✅ Implemented `firebase-messaging-sw.js` in the public directory:

```javascript
// Initialize Firebase with the app configuration
firebase.initializeApp({...});

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/dynasty.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click events
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const link = event.notification.data?.link || '/notifications';
  
  // Open the app and navigate to link
  event.waitUntil(clients.openWindow(link));
});
```

#### 2.3 Notification Utility Functions

✅ Implemented in `notificationUtils.ts`:

- **initializeMessaging**: Initializes FCM, requests permission, and registers the service worker
- **registerDeviceToken**: Registers device token with Firebase Functions
- **setupForegroundNotificationHandler**: Handles notifications when the app is in focus
- **logNotificationInteraction**: Tracks notification engagement
- **useNotifications**: Custom React hook for real-time notification management

#### 2.4 Notification Context

✅ Implemented `NotificationContext.tsx` as a global provider that:

- Manages notification state
- Initializes messaging on user login
- Provides notification data to components
- Tracks token registration status
- Offers methods for notification management (mark as read, delete)

#### 2.5 UI Components

✅ Implemented:

- **NotificationBell**: Navbar component with unread badge and dropdown
- **NotificationsPage**: Full-page view with filtering and management options
- **NotificationSettings**: User preferences for notification channels and types

### 3. Database Schema

#### Firestore Collections

1. **notifications**
   - id: string
   - userId: string
   - title: string
   - body: string
   - type: NotificationType
   - relatedItemId?: string
   - link?: string
   - imageUrl?: string
   - isRead: boolean
   - createdAt: timestamp
   - updatedAt: timestamp

2. **userDevices**
   - id: string
   - userId: string
   - token: string
   - platform: 'web' | 'ios' | 'android'
   - createdAt: timestamp
   - lastActive: timestamp

3. **userSettings**
   - id: string (user ID)
   - notifications: {
     - pushEnabled: boolean
     - emailEnabled: boolean
     - newMessageEnabled: boolean
     - friendRequestsEnabled: boolean
     - eventRemindersEnabled: boolean
   }

### 4. Best Practices Implemented

1. **Device Token Management**
   - Automatic cleanup of invalid tokens
   - Deduplication of tokens for the same user
   - Platform-specific handling

2. **Error Handling**
   - Graceful fallback when push notification fails
   - Alternative delivery via in-app notifications
   - Error logging for debugging

3. **User Experience**
   - Non-intrusive permission requests
   - Clear notification preferences
   - Consistent notification design

4. **Performance**
   - Efficient real-time updates
   - Background processing in service worker
   - Optimized Firebase Functions

### 5. Troubleshooting

Common issues and their solutions:

1. **Notifications not showing in background**
   - Ensure service worker is properly registered
   - Check that the VAPID key is correct
   - Verify notification permission is granted

2. **Device token not registering**
   - Check browser support (Safari requires additional setup)
   - Verify proper initialization sequence
   - Check for console errors during registration

3. **Notification clicks not working**
   - Ensure proper configuration of notification data
   - Verify service worker notification click handler
   - Check deep link URIs

4. **Inconsistent behavior across browsers**
   - Chrome, Firefox, and Edge have best support
   - Safari requires special handling on iOS/macOS
   - Some mobile browsers may have limitations