# Dynasty Chat Database Schema

## Firestore Collections

### 1. `chats/{chatId}`
Main chat collection storing chat metadata.

```typescript
interface Chat {
  id: string;                    // Unique chat ID
  type: 'direct' | 'group';      // Chat type
  name?: string | null;          // Group name (null for direct chats)
  participants: string[];        // Array of user IDs
  createdAt: Timestamp;          // Creation timestamp
  createdBy: string;             // Creator user ID
  lastMessage?: {               // Latest message preview
    content: string;             // Encrypted content
    senderId: string;            // Sender user ID
    timestamp: Timestamp;        // Message timestamp
    type: 'text' | 'image' | 'video' | 'voice' | 'file';
  };
  lastMessageAt: Timestamp;      // Last activity timestamp
  encryptionEnabled: boolean;    // Always true for Dynasty
  messageCount: number;          // Total message count
  groupInfo?: {                 // Group-specific info
    photo?: string;              // Group photo URL
    description?: string;        // Group description
    admins: string[];           // Admin user IDs
  };
}
```

### 2. `chats/{chatId}/messages/{messageId}`
Messages subcollection for each chat.

```typescript
interface Message {
  id: string;                    // Unique message ID
  content: string;               // Encrypted message content
  senderId: string;              // Sender user ID
  timestamp: Timestamp;          // Message timestamp
  type: 'text' | 'image' | 'video' | 'voice' | 'file';
  mediaUrl?: string;            // Encrypted media URL (if applicable)
  mediaMetadata?: {             // Media information
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    duration?: number;          // For audio/video
    thumbnailUrl?: string;      // For video
  };
  replyTo?: string;             // Message ID being replied to
  editedAt?: Timestamp;         // Edit timestamp
  deletedAt?: Timestamp;        // Soft delete timestamp
  deletedFor?: string[];        // User IDs who deleted this message
  deliveredTo: string[];        // User IDs who received the message
  readBy: string[];            // User IDs who read the message
  reactions?: {                // Emoji reactions
    [emoji: string]: string[]   // emoji -> array of user IDs
  };
  encryptionKeys?: {           // Per-message encryption keys (group chats)
    [userId: string]: string    // userId -> encrypted key for that user
  };
}
```

### 3. `users/{userId}/chats/{chatId}`
User's chat references for quick access.

```typescript
interface UserChat {
  chatId: string;               // Reference to main chat
  joinedAt: Timestamp;          // When user joined
  lastRead: Timestamp;          // Last read message timestamp
  lastReadMessageId?: string;   // Last read message ID
  unreadCount: number;          // Unread message count
  muted: boolean;              // Notification muted
  mutedUntil?: Timestamp;      // Temporary mute
  archived: boolean;           // Chat archived
  pinned: boolean;            // Chat pinned to top
  draft?: string;             // Unsent message draft
}
```

### 4. `users/{userId}/typingStatus/{chatId}`
Real-time typing indicators.

```typescript
interface TypingStatus {
  isTyping: boolean;
  lastTypingAt: Timestamp;
  expiresAt: Timestamp;       // Auto-cleanup after 10 seconds
}
```

## Security Rules Summary
- Users can only read chats they're participants in
- Messages can only be created by participants
- Messages are immutable (no updates allowed)
- Chat creation only through Cloud Functions
- Typing status auto-expires after 10 seconds

## Indexes Required
```
Collection: chats
- participants (array-contains) + lastMessageAt (desc)

Collection: messages
- chatId + timestamp (desc)
- chatId + senderId + timestamp (desc)
```

## Test Data Setup
For development, create test chats with:
1. Direct chat between two test users
2. Group chat with 3-5 participants
3. Mix of message types (text, images, etc.)
4. Various read/delivery states