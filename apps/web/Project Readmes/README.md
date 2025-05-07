# Media Handling in Dynasty Web Application

This document explains how media (images, videos, and audio) are handled, processed, and stored in the Dynasty web application for both story and event content.

## Table of Contents

1. [Overview](#overview)
2. [Client-Side Media Processing](#client-side-media-processing)
   - [Image Compression](#image-compression)
   - [Video Compression](#video-compression)
   - [Audio Compression](#audio-compression)
3. [Media Upload to Firebase Storage](#media-upload-to-firebase-storage)
4. [Firebase Storage Structure](#firebase-storage-structure)
5. [Security Rules for Media Storage](#security-rules-for-media-storage)
6. [Media Processing in Firebase Cloud Functions](#media-processing-in-firebase-cloud-functions)
7. [Implementation in Components](#implementation-in-components)
   - [Stories](#stories)
   - [Events](#events)
8. [URL Access and Handling](#url-access-and-handling)
9. [Best Practices and Considerations](#best-practices-and-considerations)

## Overview

The Dynasty web application allows users to create rich media stories and events containing text, images, videos, and audio files. This document outlines the standardized approach for handling media across the application, from selection in the UI, through client-side compression, to storage in Firebase, and how it's accessed later.

## Client-Side Media Processing

Before uploading media to Firebase Storage, the application performs client-side compression to:
- Reduce file sizes
- Improve upload and download speeds
- Reduce storage costs
- Ensure consistent quality

### Image Compression

Image compression is handled by the `compressImage` function in `mediaUtils.ts`:

1. Images are resized if their longest dimension exceeds 800px (preserving aspect ratio)
2. Images are converted to JPEG format
3. A 50% quality setting is applied to reduce file size
4. Images already below 800px in their longest dimension are preserved as-is

```javascript
// Key compression parameters
const maxDimension = 800; // Maximum pixel dimension
const jpegQuality = 0.5;  // 50% JPEG quality
```

### Video Compression

Video compression uses the browser's MediaRecorder API:

1. Videos are re-encoded to WebM format using VP9 codec
2. A bitrate of 2.5 Mbps is applied to balance quality and file size
3. Videos larger than 500MB are rejected

```javascript
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'video/webm;codecs=vp9',
  videoBitsPerSecond: 2500000 // 2.5 Mbps
});
```

### Audio Compression

Audio compression utilizes the Web Audio API:

1. Audio is decoded and resampled to 22.05 kHz (reduced from typical 44.1 kHz)
2. Audio is converted to WAV format
3. Audio files larger than 100MB are rejected

## Media Upload to Firebase Storage

Media upload is managed by the `uploadMedia` function in `mediaUtils.ts`, which:

1. Determines the media type (image, video, audio)
2. Applies appropriate compression based on type
3. Generates a unique filename with timestamp and random string
4. Creates a reference to the Firebase Storage location
5. Uploads the file with metadata
6. Provides progress tracking via callbacks
7. Returns the download URL on completion

Example upload path:
```
stories/{contentId}/media/{mediaType}_{timestamp}_{random}.{extension}
```

## Firebase Storage Structure

Media files are organized in Firebase Storage with the following structure:

For stories:
```
/stories/{storyId}/media/{filename}
```

For events:
```
/stories/{eventId}/media/{filename}
```

Where:
- `storyId`/`eventId` is the unique identifier for the content
- `filename` follows the pattern: `{type}_{timestamp}_{random}.{extension}`

This structure ensures:
- Isolation of media per content item
- Unique filenames to prevent collisions
- Easy identification of media types

## Security Rules for Media Storage

Firebase Storage Security Rules control access to media files:

```javascript
// Story and event media (images, videos, audio)
match /stories/{contentId}/{mediaType}/{fileName} {
  // For read access, we can only check basic authentication
  // Detailed permission checks happen in the app code and Firestore rules
  allow read: if isSignedIn();
  
  // For write operations, only allow if the user is authenticated
  // We can't verify the author at upload time since metadata isn't provided
  // The app handles proper verification when creating the document
  allow write: if isSignedIn();
}
```

Key security aspects:
- Only authenticated users can read media
- Only authenticated users can upload media
- Additional permission checks are performed at the application level

## Media Processing in Firebase Cloud Functions

When creating or updating content, the Firebase Cloud Functions:

1. Receive data including media URLs
2. The respective functions (`createStory`, `createEvent`, etc.) process the data and save it to Firestore
3. The document contains media references as URLs
4. No additional image processing is done in the cloud functions for media

Example story data structure with media:

```javascript
{
  title: "Family Vacation",
  authorID: "user123",
  blocks: [
    {
      type: "text",
      data: "Our trip to Hawaii was amazing!",
      localId: "block1"
    },
    {
      type: "image",
      data: "https://storage.googleapis.com/dynasty-eba63.appspot.com/stories/story123/media/image_1638245487123_a7b3c5.jpg",
      localId: "block2"
    },
    {
      type: "video",
      data: "https://storage.googleapis.com/dynasty-eba63.appspot.com/stories/story123/media/video_1638245502456_d8e9f1.webm",
      localId: "block3"
    }
  ],
  // Other story metadata
}
```

Example event data structure with media:

```javascript
{
  title: "Family Reunion",
  hostId: "user123",
  description: "Annual family gathering",
  coverPhotos: [
    "https://storage.googleapis.com/dynasty-eba63.appspot.com/stories/event123/media/image_1638245487123_a7b3c5.jpg",
    "https://storage.googleapis.com/dynasty-eba63.appspot.com/stories/event123/media/image_1638245502456_d8e9f1.jpg"
  ],
  // Other event metadata
}
```

## Implementation in Components

### Stories

The story creation and editing components use the `uploadMedia` function to handle media uploads:

1. When a user adds a media block, they can select files through the `MediaUpload` component
2. The component tracks upload progress and displays it to the user
3. After successful upload, the media URLs are included in the story data
4. Error handling is implemented to show upload failures

### Events

The event creation and editing components follow the same pattern:

1. Users can upload up to 5 photos for an event
2. The components use the same `uploadMedia` function used by stories
3. Upload progress is displayed with progress bars
4. Error states are visually indicated
5. The final URLs are included in the event data

Both implementations use the same standardized approach to ensure consistency across the application.

## URL Access and Handling

Firebase Storage URLs are handled in multiple ways:

1. **Direct URLs**: Standard storage URLs with 'alt=media' parameter for direct access
2. **Signed URLs**: For private content with temporary access tokens
3. **URL Normalization**: The `ensureAccessibleStorageUrl` function ensures all Firebase Storage URLs are correctly formatted for access

```javascript
export const ensureAccessibleStorageUrl = (url: string): string => {
  if (!url) return url;
  
  // If it's not a Storage URL, return as is
  if (!url.includes('storage.googleapis.com') && !url.includes('firebasestorage.googleapis.com')) {
    return url;
  }
  
  // If it's already a signed URL, return as is
  if (url.includes('token=')) {
    return url;
  }
  
  // For non-signed storage URLs, ensure they have alt=media parameter
  if (url.includes('?')) {
    // URL already has parameters
    if (!url.includes('alt=media')) {
      return `${url}&alt=media`;
    }
    return url;
  } else {
    // URL has no parameters yet
    return `${url}?alt=media`;
  }
};
```

## Best Practices and Considerations

1. **Standardized Approach**:
   - The same media handling pattern is used across all components
   - Consistent UX for all media uploads in the application
   - Centralized media utility functions for maintainability

2. **Metadata Management**: 
   - Each upload includes metadata about the uploader, content ID, and media type
   - This helps with audit trails and permissions management

3. **Error Handling**:
   - Comprehensive error handling during compression and upload
   - Progress tracking with callbacks for UI feedback
   - Detailed error messages for debugging

4. **Media Validation**:
   - File type validation
   - File size limits (500MB for video, 100MB for audio)
   - MIME type verification

5. **Storage Efficiency**:
   - All media is compressed on the client side before upload
   - Different compression strategies based on media type
   - Adaptive quality based on input parameters

6. **Accessibility**:
   - Media URLs are properly formatted for direct access
   - Support for both signed and unsigned URLs

This document provides a comprehensive overview of the media handling process in the Dynasty web application, covering both client-side processing and Firebase storage integration for all types of content. 