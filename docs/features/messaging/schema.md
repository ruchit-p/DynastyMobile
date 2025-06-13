# Messaging Database Schema

This document details the database structure for Dynasty's messaging system.

## Collections Overview

```
firestore/
├── chats/
│   └── {chatId}/
│       ├── messages/
│       │   └── {messageId}
│       └── metadata
├── users/
│   └── {userId}/
│       └── chats/
│           └── {chatId}
└── chat_keys/
    └── {chatId}/
        └── {userId}
```

## Detailed Schemas

### Chat Collection
```typescript
interface Chat {
  id: string;
  type: 'direct' | 'group' | 'family';
  name?: string; // For group chats
  description?: string;
  avatarUrl?: string;
  
  // Members
  members: string[]; // User IDs
  admins: string[]; // Admin user IDs
  creator: string;
  
  // Settings
  settings: {
    muteNotifications: boolean;
    allowGuestAccess: boolean;
    messageExpiration?: number; // Hours
    mediaAutoDownload: boolean;
  };
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessageAt?: Timestamp;
  
  // Last message preview (unencrypted metadata only)
  lastMessage?: {
    senderId: string;
    type: MessageType;
    timestamp: Timestamp;
  };
  
  // Encryption
  encryptionEnabled: boolean;
  keyRotationSchedule?: number; // Days
  
  // Status
  isActive: boolean;
  isArchived: boolean;
  deletedAt?: Timestamp;
}
```

### Message Subcollection
```typescript
interface Message {
  id: string;
  chatId: string;
  
  // Sender
  senderId: string;
  senderName: string; // Cached for performance
  senderAvatar?: string; // Cached
  
  // Content (encrypted)
  encryptedContent: string; // Base64 encoded
  encryptedKey: string; // Per-recipient keys
  nonce: string; // Unique per message
  signature: string; // Ed25519 signature
  
  // Message type and metadata
  type: 'text' | 'voice' | 'image' | 'video' | 'file' | 'location' | 'system';
  mimeType?: string; // For files
  fileName?: string; // Original filename
  fileSize?: number; // In bytes
  
  // Media references
  mediaRef?: {
    url: string; // Encrypted media URL
    thumbnailUrl?: string; // Encrypted thumbnail
    duration?: number; // Audio/video duration in seconds
    dimensions?: {
      width: number;
      height: number;
    };
  };
  
  // Voice message
  voiceNote?: {
    duration: number; // Seconds
    waveform?: number[]; // Audio visualization data
  };
  
  // Location sharing
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    address?: string;
  };
  
  // Timestamps
  timestamp: Timestamp;
  editedAt?: Timestamp;
  deletedAt?: Timestamp;
  expiresAt?: Timestamp; // For disappearing messages
  
  // Delivery and read status
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  deliveredTo: {
    [userId: string]: Timestamp;
  };
  readBy: {
    [userId: string]: Timestamp;
  };
  
  // Reactions
  reactions: {
    [emoji: string]: string[]; // User IDs who reacted
  };
  
  // Thread
  replyTo?: {
    messageId: string;
    senderId: string;
    preview: string; // First 100 chars
  };
  
  // Edit history
  editHistory?: Array<{
    content: string; // Encrypted
    editedAt: Timestamp;
    editedBy: string;
  }>;
  
  // Error handling
  error?: {
    code: string;
    message: string;
    timestamp: Timestamp;
  };
  
  // Sync
  syncStatus: 'pending' | 'synced' | 'conflict';
  deviceId: string; // Device that created the message
  version: number; // For conflict resolution
}
```

### User Chat Metadata
```typescript
interface UserChatMetadata {
  chatId: string;
  userId: string;
  
  // Display
  displayName?: string; // Custom chat name
  isPinned: boolean;
  customAvatar?: string;
  
  // Notifications
  isMuted: boolean;
  muteUntil?: Timestamp;
  notificationSound?: string;
  
  // Unread tracking
  unreadCount: number;
  lastReadMessageId?: string;
  lastReadAt?: Timestamp;
  
  // Mentions
  mentionCount: number;
  lastMentionAt?: Timestamp;
  
  // User state
  isTyping: boolean;
  typingStartedAt?: Timestamp;
  lastSeenAt?: Timestamp;
  
  // Archive
  isArchived: boolean;
  archivedAt?: Timestamp;
  
  // Joined/left
  joinedAt: Timestamp;
  leftAt?: Timestamp;
  removedBy?: string;
  
  // Encryption keys
  publicKey: string;
  keyVersion: number;
  lastKeyRotation?: Timestamp;
  
  // Draft
  draft?: {
    text: string;
    updatedAt: Timestamp;
  };
  
  // Settings
  autoDeleteMessages?: number; // Hours
  showReadReceipts: boolean;
  showOnlineStatus: boolean;
}
```

### Chat Keys Collection
```typescript
interface ChatKey {
  chatId: string;
  userId: string;
  
  // Encrypted group key
  encryptedGroupKey: string; // Encrypted with user's public key
  keyVersion: number;
  
  // Permissions
  canDecrypt: boolean;
  canInvite: boolean;
  isAdmin: boolean;
  
  // Timestamps
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  rotatedAt?: Timestamp;
}
```

## Indexes

### Firestore Composite Indexes
```javascript
// chats collection
{
  collectionId: 'chats',
  fields: [
    { fieldPath: 'members', mode: 'ARRAY_CONTAINS' },
    { fieldPath: 'lastMessageAt', mode: 'DESCENDING' }
  ]
}

// messages subcollection
{
  collectionGroup: 'messages',
  fields: [
    { fieldPath: 'chatId', mode: 'ASCENDING' },
    { fieldPath: 'timestamp', mode: 'DESCENDING' }
  ]
}

// User chat metadata
{
  collectionId: 'users/{userId}/chats',
  fields: [
    { fieldPath: 'isPinned', mode: 'DESCENDING' },
    { fieldPath: 'lastMessageAt', mode: 'DESCENDING' }
  ]
}
```

## Security Rules

### Chat Access
```javascript
// Only members can read/write to chat
match /chats/{chatId} {
  allow read: if request.auth.uid in resource.data.members;
  allow write: if request.auth.uid in resource.data.members
    && request.auth.uid in resource.data.admins;
}

// Messages can be read by chat members
match /chats/{chatId}/messages/{messageId} {
  allow read: if request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.members;
  allow create: if request.auth.uid == request.resource.data.senderId
    && request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.members;
  allow update: if request.auth.uid == resource.data.senderId
    && request.auth.uid == request.resource.data.senderId;
}
```

## Data Flow

### Sending a Message
1. Client encrypts message content
2. Generate unique message ID
3. Create message document
4. Update chat's lastMessage
5. Increment unread counts
6. Trigger FCM notifications

### Reading Messages
1. Query messages with pagination
2. Decrypt content client-side
3. Update read receipts
4. Reset unread count
5. Update lastReadAt

### Message Sync
1. Check local version
2. Fetch remote changes
3. Resolve conflicts by timestamp
4. Update local cache
5. Mark as synced

## Performance Considerations

### Pagination
- Load 50 messages initially
- Infinite scroll with 25 per page
- Cache last 200 messages
- Preload next page

### Realtime Updates
- Subscribe to chat messages
- Limit listeners to visible chats
- Batch UI updates
- Debounce typing indicators

### Optimization
- Index frequently queried fields
- Denormalize for read performance
- Use subcollections for scale
- Implement sharding for large chats

## Migration & Versioning

### Schema Version
Current version: 2.0

### Migration Strategy
1. Add new fields with defaults
2. Background migration job
3. Update clients gradually
4. Remove deprecated fields

### Backwards Compatibility
- Support last 2 schema versions
- Graceful degradation
- Version detection in clients
- Automatic migration prompts