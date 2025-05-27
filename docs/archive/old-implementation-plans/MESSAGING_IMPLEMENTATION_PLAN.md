# Dynasty Mobile - Messaging Implementation Plan

## Overview
This document outlines the implementation plan for completing the messaging/chat functionality in Dynasty Mobile. The encryption infrastructure is already built, but the UI needs to be connected to Firebase and several features need implementation.

## Current State
- ✅ Complete E2E encryption system (Double Ratchet, group encryption, key rotation)
- ✅ Well-designed chat UI components
- ✅ Firebase functions for encryption
- ❌ No real chat data integration
- ❌ Messages not persisted
- ❌ Sync services incomplete

## Implementation Phases

### Phase 1: Connect Chat UI to Firebase (Week 1-2)
**Priority: HIGH** - This blocks all other features

#### 1.1 Firebase Integration for Chat List
```typescript
// Update chat.tsx to load real chats
const loadChats = async () => {
  try {
    const db = getFirebaseDb();
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageTime', 'desc')
    );
    
    const snapshot = await getDocs(chatsQuery);
    const chatList = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    setChats(chatList);
  } catch (error) {
    handleError(error);
  }
};
```

#### 1.2 Real-time Chat Updates
- Set up Firestore listeners for chat list updates
- Update last message and unread counts in real-time
- Handle participant information loading

#### 1.3 Message Loading in Chat Detail
- Load message history from Firestore
- Implement pagination for large conversations
- Set up real-time message listeners

### Phase 2: Implement Message Persistence & Sync (Week 2-3)
**Priority: HIGH** - Critical for offline support

#### 2.1 Complete MessageSyncService Implementation
```typescript
// Key methods to implement:
- syncMessages(): Download and decrypt new messages
- syncEncryptionKeys(): Sync encryption keys for all participants
- processMessageQueue(): Send queued messages when online
- handleConflicts(): Resolve message ordering conflicts
```

#### 2.2 SQLite Integration
- Store messages in local database
- Implement message caching strategy
- Handle encrypted content storage
- Create indexes for search performance

#### 2.3 Offline Message Queue
- Queue messages when offline
- Retry failed messages with exponential backoff
- Update UI optimistically
- Sync when connection restored

### Phase 3: Add Core Messaging Features (Week 3-4)
**Priority: MEDIUM** - Essential for good UX

#### 3.1 Read Receipts & Delivery Status
```typescript
// Update message model
interface Message {
  id: string;
  content: string;
  deliveredTo: string[]; // User IDs
  readBy: string[]; // User IDs
  status: 'sending' | 'sent' | 'delivered' | 'read';
}
```
- Update UI to show double checkmarks
- Implement read receipt sending
- Handle group chat read receipts

#### 3.2 Typing Indicators
- Implement typing status in Firestore
- Debounce typing updates
- Show typing indicators in chat header
- Handle multiple users typing in groups

#### 3.3 Message Actions
- Long press menu for messages
- Copy message text
- Delete messages (for me/everyone)
- Edit messages within time limit
- Reply to specific messages

#### 3.4 Voice Messages
- Integrate existing audio recorder
- Encrypt audio files
- Show waveform visualization
- Implement playback controls

### Phase 4: Implement Push Notifications (Week 4-5)
**Priority: MEDIUM** - Important for engagement

#### 4.1 FCM Setup
```typescript
// Firebase function for sending notifications
export const sendMessageNotification = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const message = snapshot.data();
    const chat = await getChat(context.params.chatId);
    
    // Send to all participants except sender
    const tokens = await getParticipantTokens(chat.participants, message.senderId);
    
    await admin.messaging().sendMulticast({
      tokens,
      notification: {
        title: message.senderName,
        body: message.type === 'text' ? message.content : '📎 Attachment',
      },
      data: {
        chatId: context.params.chatId,
        messageId: context.params.messageId,
      },
    });
  });
```

#### 4.2 Notification Handling
- Handle notification taps to open specific chat
- Update badge counts
- Implement notification grouping
- Add notification preferences per chat

### Phase 5: Add Advanced Features (Week 5-6)
**Priority: LOW** - Nice to have enhancements

#### 5.1 Message Search
```typescript
// Implement search across all messages
const searchMessages = async (query: string) => {
  // Search in local SQLite database
  const results = await db.searchMessages(query);
  
  // Decrypt and filter results
  return results.filter(msg => 
    decryptedContent(msg).toLowerCase().includes(query.toLowerCase())
  );
};
```

#### 5.2 Chat Management
- Chat info screen with participants
- Add/remove group participants
- Change group name/photo
- Mute notifications
- Clear chat history
- Leave/delete chat

#### 5.3 Media Gallery
- Show all media shared in chat
- Grid view for photos/videos
- Download all media option
- Search by date

#### 5.4 Message Reactions
- Add emoji reactions to messages
- Show reaction picker
- Update reaction counts
- Handle encrypted reaction data

## Technical Considerations

### 1. Performance Optimization
- Use FlashList for message lists
- Implement message virtualization
- Lazy load participant information
- Cache decrypted messages in memory

### 2. Security Best Practices
- Never store decrypted content in database
- Clear decrypted cache on app background
- Implement message retention policies
- Add option to delete messages after read

### 3. Error Handling
- Graceful degradation when offline
- Retry mechanisms for failed operations
- User-friendly error messages
- Comprehensive error logging

### 4. Testing Strategy
- Unit tests for encryption/decryption
- Integration tests for sync logic
- E2E tests for critical flows
- Performance testing with large chats

## Database Schema Updates

### Firestore Collections
```typescript
// chats/{chatId}
{
  participants: string[]; // User IDs
  participantKeys: { [userId: string]: PublicKey };
  lastMessage: {
    content: string; // Encrypted
    senderId: string;
    timestamp: Timestamp;
    type: 'text' | 'image' | 'video' | 'voice' | 'file';
  };
  lastMessageTime: Timestamp;
  chatType: 'direct' | 'group';
  groupInfo?: {
    name: string;
    photo: string;
    admins: string[];
  };
}

// chats/{chatId}/messages/{messageId}
{
  content: string; // Encrypted
  senderId: string;
  timestamp: Timestamp;
  type: 'text' | 'image' | 'video' | 'voice' | 'file';
  mediaUrl?: string; // Encrypted media URL
  replyTo?: string; // Message ID
  editedAt?: Timestamp;
  deletedAt?: Timestamp;
  deliveredTo: string[];
  readBy: string[];
  reactions?: { [emoji: string]: string[] }; // emoji -> userIds
}
```

### SQLite Tables
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  chatId TEXT NOT NULL,
  content TEXT NOT NULL, -- Encrypted
  senderId TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  mediaUrl TEXT,
  status TEXT,
  localId TEXT, -- For offline messages
  FOREIGN KEY (chatId) REFERENCES chats(id)
);

CREATE INDEX idx_messages_chat_timestamp ON messages(chatId, timestamp);
CREATE INDEX idx_messages_search ON messages(content); -- For encrypted search
```

## Success Metrics
- All chats load from Firebase within 2 seconds
- Messages sync across devices within 5 seconds
- Offline messages queue and send when online
- 99.9% message delivery success rate
- Push notifications arrive within 3 seconds
- Search returns results in under 1 second

## Next Steps
1. Start with Phase 1.1 - Connect chat list to Firebase
2. Set up development test data in Firestore
3. Implement basic message loading
4. Add real-time listeners
5. Test with multiple devices

This plan provides a structured approach to implementing the remaining messaging features while leveraging the excellent encryption infrastructure already in place.