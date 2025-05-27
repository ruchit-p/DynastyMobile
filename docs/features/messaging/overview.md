# Messaging System Overview

Dynasty's messaging system provides secure, real-time communication between family members with end-to-end encryption and comprehensive features.

## Architecture

### Core Components

1. **Client Layer**
   - Message composition and encryption
   - Real-time updates via Firestore listeners
   - Offline queue management
   - Media handling

2. **Firebase Infrastructure**
   - Firestore for message storage
   - Cloud Functions for processing
   - FCM for push notifications
   - Storage for encrypted media

3. **Security Layer**
   - End-to-end encryption (E2EE)
   - Key management
   - Message authentication
   - Forward secrecy

## Features

### Message Types
- **Text Messages** - Plain text with emoji support
- **Voice Messages** - Encrypted audio recordings
- **Photo/Video** - Encrypted media sharing
- **File Attachments** - Documents and other files
- **System Messages** - Join/leave notifications

### Real-time Features
- **Typing Indicators** - See when others are typing
- **Read Receipts** - Message delivery and read status
- **Online Presence** - Active user indicators
- **Push Notifications** - Instant message alerts

### Group Messaging
- Create family group chats
- Add/remove members
- Admin permissions
- Shared media galleries

## Technical Implementation

### Message Flow
```
User A → Encrypt → Firestore → FCM Push → User B → Decrypt → Display
```

### Database Schema
```typescript
interface Message {
  id: string;
  chatId: string;
  senderId: string;
  
  // Encrypted content
  encryptedContent: string;
  encryptedKey: string;
  nonce: string;
  
  // Metadata
  type: 'text' | 'voice' | 'image' | 'video' | 'file' | 'system';
  timestamp: Timestamp;
  editedAt?: Timestamp;
  deletedAt?: Timestamp;
  
  // Status
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  deliveredTo: string[];
  readBy: string[];
  
  // Media
  mediaUrl?: string;
  thumbnailUrl?: string;
  duration?: number; // for voice/video
  
  // Reactions
  reactions: Record<string, string[]>;
}
```

### Encryption Details
- **Algorithm**: AES-256-GCM
- **Key Exchange**: X25519
- **Message Signing**: Ed25519
- **Forward Secrecy**: Double Ratchet protocol

See [Encryption Documentation](../../security/encryption.md) for detailed implementation.

## Performance Optimizations

### Message List
- Virtual scrolling with FlashList
- Pagination (50 messages per page)
- Image thumbnail generation
- Lazy media loading

### Caching Strategy
- Recent messages in memory
- Encrypted cache in SQLite
- Media cache with TTL
- Automatic cleanup

### Network Optimization
- Message batching
- Compression for text
- Resumable uploads
- Background sync

## Offline Support

### Queue Management
```typescript
// Messages are queued when offline
await MessageQueue.add({
  tempId: generateTempId(),
  message: encryptedMessage,
  retryCount: 0,
  timestamp: Date.now()
});

// Automatic retry when online
NetworkMonitor.on('online', () => {
  MessageQueue.processAll();
});
```

### Sync Strategy
1. Store messages locally when offline
2. Queue for sending when online
3. Merge conflicts automatically
4. Update UI optimistically

## Security Features

### End-to-End Encryption
- Messages encrypted on device
- Keys never leave device
- Server can't read messages
- Secure key backup available

### Privacy Controls
- Block/unblock users
- Delete messages
- Message expiration
- Screenshot protection (mobile)

### Audit Trail
- Message edit history
- Deletion logs
- Access logs
- Security events

## Integration Points

### Push Notifications
```typescript
// FCM integration
await NotificationService.send({
  to: recipientTokens,
  notification: {
    title: 'New Message',
    body: 'You have a new message'
  },
  data: {
    type: 'message',
    chatId: message.chatId,
    messageId: message.id
  }
});
```

### Media Processing
- Automatic image compression
- Video transcoding
- Thumbnail generation
- EXIF data removal

### Search Functionality
- Local message search
- Encrypted index
- Media search by type
- Date range filters

## Best Practices

### Development
1. Always encrypt before sending
2. Validate message size limits
3. Handle network failures gracefully
4. Implement proper error recovery
5. Test offline scenarios

### UI/UX
1. Show message status clearly
2. Provide retry options
3. Indicate encryption status
4. Handle long messages properly
5. Optimize for different screens

### Performance
1. Limit initial message load
2. Implement virtual scrolling
3. Cache encrypted messages
4. Compress media appropriately
5. Clean up old data

## Troubleshooting

### Common Issues

**Messages not sending**
- Check network connectivity
- Verify encryption keys
- Check message size
- Review error logs

**Slow performance**
- Clear message cache
- Check database indexes
- Review memory usage
- Optimize media loading

**Encryption errors**
- Verify key pair
- Check key synchronization
- Review encryption logs
- Test key backup

## Related Documentation
- [Message Schema](./schema.md) - Database structure
- [Encryption](./encryption.md) - E2EE implementation
- [API Reference](../../api-reference/messaging.md) - Backend APIs