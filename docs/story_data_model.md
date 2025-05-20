# Story Data Model in Dynasty Mobile

This document outlines the data model for stories in the Dynasty Mobile app, including Firestore document structure, relationships, and Firebase Storage organization.

## Firestore Document Structure

### Story Document

```typescript
interface Story {
  // Core Fields
  id: string; // Unique identifier (Firestore document ID)
  title: string; // Story title
  description: string; // Story description/content
  authorId: string; // User ID of the story creator
  familyTreeId: string; // ID of the family tree this story belongs to

  // Media
  mediaUrls: string[]; // Array of URLs to media files in Firebase Storage
  mediaTypes: ("image" | "video")[]; // Type of each media file
  coverImageUrl?: string; // URL to the cover image (if different from first media)

  // Metadata
  eventDate: Timestamp; // When the story event occurred
  createdAt: Timestamp; // When the story was created
  updatedAt: Timestamp; // When the story was last updated

  // Tags and References
  taggedPeople: string[]; // Array of user IDs who are tagged in the story
  location?: {
    // Optional location data
    name: string; // Location name
    coordinates: {
      // Geographic coordinates
      latitude: number;
      longitude: number;
    };
    placeId?: string; // Reference to a place ID (e.g., Google Places)
  };

  // Privacy and Status
  visibility: "family" | "public" | "private"; // Who can see this story
  status: "published" | "draft" | "archived"; // Story status

  // Engagement Metrics
  viewCount: number; // Number of views
  commentCount: number; // Number of comments
  reactionCount: number; // Number of reactions

  // Additional Metadata
  tags?: string[]; // Custom tags for the story
  categories?: string[]; // Categories the story belongs to
  isHighlighted?: boolean; // Whether the story is highlighted in the family history
  isPinned?: boolean; // Whether the story is pinned to the top of the feed
}
```

### Comment Document

```typescript
interface Comment {
  id: string; // Unique identifier
  storyId: string; // Reference to the story
  authorId: string; // User who wrote the comment
  text: string; // Comment content
  createdAt: Timestamp; // When the comment was created
  updatedAt: Timestamp; // When the comment was last updated
  parentCommentId?: string; // For replies to comments (optional)
  mentions?: string[]; // User IDs mentioned in the comment
  isEdited: boolean; // Whether the comment has been edited
}
```

### Reaction Document

```typescript
interface Reaction {
  id: string; // Unique identifier
  storyId: string; // Reference to the story
  userId: string; // User who reacted
  type: "like" | "love" | "laugh" | "sad" | "wow"; // Reaction type
  createdAt: Timestamp; // When the reaction was created
}
```

## Firebase Storage Structure

Stories media files are organized in Firebase Storage using the following structure:

```
/stories/{familyTreeId}/{storyId}/{mediaId}.{extension}
```

For example:

```
/stories/family123/story456/image1.jpg
/stories/family123/story456/image2.jpg
/stories/family123/story456/video1.mp4
```

### Thumbnail Generation

For each uploaded image and video, the system automatically generates thumbnails:

```
/stories/{familyTreeId}/{storyId}/thumbnails/{mediaId}_thumb.jpg
```

## Collection Structure in Firestore

The stories and related data are organized in Firestore collections:

```
/stories                   // Main stories collection
/comments                  // All comments across stories
/reactions                 // All reactions across stories
/users/{userId}/stories    // User-specific story references
/familyTrees/{treeId}/stories // Family-specific story references
```

## Indexing Strategy

To support efficient queries, the following indexes are maintained:

1. Stories by family tree and creation date (for the family feed)
2. Stories by author and creation date (for user profile)
3. Stories by tagged people (for "stories I'm in")
4. Stories by location (for location-based browsing)
5. Comments by story ID and creation date (for story comment threads)

## Access Control

Access to stories is controlled through Firebase Security Rules:

```
// Example security rule for stories
match /stories/{storyId} {
  allow read: if
    // Public stories can be read by anyone
    resource.data.visibility == 'public' ||
    // Family stories can be read by family members
    (resource.data.visibility == 'family' &&
     exists(/databases/$(database)/documents/familyTrees/$(resource.data.familyTreeId)/memberUserIds/$(request.auth.uid))) ||
    // Private stories can only be read by the author
    (resource.data.visibility == 'private' &&
     resource.data.authorId == request.auth.uid);

  allow create: if
    // User must be authenticated
    request.auth != null &&
    // User must be a member of the family tree
    exists(/databases/$(database)/documents/familyTrees/$(request.resource.data.familyTreeId)/memberUserIds/$(request.auth.uid)) &&
    // Author ID must match the authenticated user
    request.resource.data.authorId == request.auth.uid;

  allow update, delete: if
    // Only the author can update or delete
    resource.data.authorId == request.auth.uid ||
    // Family admins can also update or delete
    exists(/databases/$(database)/documents/familyTrees/$(resource.data.familyTreeId)/adminUserIds/$(request.auth.uid));
}
```

## Data Validation

Client and server-side validation ensures:

1. Required fields are present
2. Media URLs point to valid Firebase Storage locations
3. Referenced users exist and are members of the family tree
4. Dates are valid and within acceptable ranges
5. Text content meets length and content policy requirements

## Relationships with Other Entities

Stories are related to several other entities in the system:

1. **Users**: Authors and tagged people
2. **Family Trees**: Stories belong to a specific family tree
3. **History Books**: Stories can be included in curated history books
4. **Timeline Events**: Stories can represent events on a family timeline
5. **Places**: Stories can be associated with specific locations
