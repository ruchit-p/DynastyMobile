# Story Creation Flow in Dynasty Mobile

This document explains the story creation process in the Dynasty Mobile app, as visualized in the accompanying mermaid diagrams.

## Overview

The story creation flow in Dynasty Mobile allows users to share memories with their family members through a structured, multi-step process. Stories can include media (photos/videos), text, tagged family members, and location information.

## Story Creation Phases

### 1. Media Selection Phase

The story creation process begins with media selection:

- **Media Source Options**:

  - **Photo Library**: User selects existing photos/videos from their device
  - **Camera**: User captures new photos/videos directly in the app
  - **Text Only**: User creates a story without media attachments

- **Media Processing**:
  - Selected media is processed (resized/compressed) to optimize storage and loading times
  - For multiple media items, they are organized in the order selected
  - Temporary storage is used during the creation process

### 2. Story Information Phase

After media selection, users provide context for their story:

- **Story Details**:

  - **Title**: A descriptive name for the story
  - **Description**: The main content/narrative of the story
  - **Date**: When the event occurred (defaults to current date but can be modified)

- **People Tagging**:

  - Users can tag family members who are part of the story
  - The app fetches available family members from Firestore
  - Tagged people will receive notifications about the story

- **Location Tagging**:
  - Users can add location information to the story
  - Options include manual entry or using current location
  - Location data enhances the context of the memory

### 3. Finalization Phase

The final phase involves reviewing and publishing the story:

- **Preview**:

  - Users see how their story will appear to others
  - All elements (media, text, tags) are displayed in their final form

- **Validation**:

  - The app validates that all required fields are completed
  - Any validation errors are displayed to the user for correction

- **Publishing**:
  - Media files are uploaded to Firebase Storage
  - Story data is stored in Firestore
  - Notifications are sent to tagged family members
  - The family feed is updated to include the new story

## Data Flow

1. **Temporary Storage During Creation**:

   - A local Story Data Store maintains the state during the creation process
   - Each step updates this store with new information

2. **Firebase Integration**:

   - **Firebase Storage**: Handles media file storage
   - **Firebase Firestore**: Stores story metadata and relationships
   - **Authentication**: Identifies the story creator

3. **Post-Publication**:
   - Story appears in the family feed
   - Notifications are sent to tagged family members
   - Story becomes available for comments and reactions

## Story Document Structure

When published, a story document in Firestore typically includes:

```javascript
{
  id: "story123",
  title: "Family Picnic",
  description: "Our weekend getaway to the mountains",
  mediaUrls: ["https://storage.url/image1.jpg", "https://storage.url/image2.jpg"],
  authorId: "user123",
  familyTreeId: "family456",
  taggedPeople: ["user789", "user101"],
  location: {
    name: "Mountain View Park",
    coordinates: {
      latitude: 37.123,
      longitude: -122.456
    }
  },
  eventDate: Timestamp(2023, 5, 15),
  createdAt: Timestamp(2023, 5, 20),
  updatedAt: Timestamp(2023, 5, 20),
  visibility: "family", // or "public", "private"
  commentCount: 0,
  reactionCount: 0
}
```

## Error Handling

The story creation flow includes error handling at multiple points:

1. **Media Selection Errors**:

   - Permission denials (camera/photo library access)
   - File size limitations
   - Unsupported file formats

2. **Validation Errors**:

   - Missing required fields (title, etc.)
   - Content policy violations

3. **Upload Errors**:
   - Network connectivity issues
   - Storage quota limitations
   - Authentication failures

## User Experience Considerations

- **Progress Preservation**: If the app is closed during creation, progress is saved
- **Offline Support**: Story creation can begin offline, with publishing queued for when connectivity returns
- **Accessibility**: The flow supports screen readers and other accessibility features
- **Feedback**: Users receive visual feedback at each step of the process

## Security and Privacy

- **Content Validation**: Stories are validated for appropriate content
- **Access Control**: Stories are only visible to authorized family members
- **Data Protection**: Media is securely stored with appropriate access controls
- **User Consent**: Tagged users can request removal from stories
