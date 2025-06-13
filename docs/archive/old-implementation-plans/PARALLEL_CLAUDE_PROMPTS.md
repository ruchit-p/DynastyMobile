# Dynasty Mobile - Parallel Development Prompts for Claude Code

## Overview
The messaging foundation is now complete. The chat list loads from Firebase, real-time listeners are set up, and basic navigation works. Now we can parallelize the remaining work across multiple Claude Code instances.

## Track A: Sync & Persistence (Backend Developer)

### Prompt for Claude Code Instance A:
```
I need you to implement the message sync and persistence layer for Dynasty Mobile's messaging feature. The basic chat UI is already connected to Firebase.

Context:
- The app uses React Native with Firebase
- E2E encryption is already implemented (ChatEncryptionService, E2EEService)
- Chat list loads from Firebase and shows encrypted messages
- SQLite database schema is defined in `/apps/mobile/src/database/schema.ts`

Your tasks:
1. Complete the MessageSyncService implementation at `/apps/mobile/src/services/MessageSyncService.ts`
   - Implement `syncMessages()` to download and decrypt messages
   - Implement `syncEncryptionKeys()` for participant keys
   - Implement `processMessageQueue()` for offline messages
   - Add conflict resolution logic

2. Integrate SQLite for offline message storage:
   - Store encrypted messages in local database
   - Implement caching strategy with TTL
   - Create indexes for search performance
   - Handle encrypted content storage

3. Build offline message queue:
   - Queue messages when offline
   - Retry with exponential backoff
   - Update UI optimistically
   - Sync when connection restored

Key files to work with:
- `/apps/mobile/src/services/MessageSyncService.ts`
- `/apps/mobile/src/database/SyncDatabase.ts`
- `/apps/mobile/src/database/schema.ts`
- `/apps/mobile/src/services/encryption/ChatEncryptionService.ts`

Test your implementation by:
- Sending messages while offline
- Verifying they sync when online
- Checking messages persist across app restarts
```

## Track B: UI Features (Frontend Developer)

### Prompt for Claude Code Instance B:
```
I need you to implement UI features for Dynasty Mobile's messaging system. The chat screens are already connected to Firebase with basic functionality.

Context:
- Chat list and chat detail screens work with Firebase
- Messages are encrypted/decrypted automatically
- FlashList is used for performance
- Design system is in `/apps/mobile/constants/`

Your tasks:
1. Message Status Indicators:
   - Add sent/delivered/read checkmarks to messages
   - Show double checkmarks for read receipts
   - Handle group chat read receipts
   - Update the Message interface and UI

2. Message Actions Menu:
   - Add long press gesture to messages
   - Create action sheet with: Copy, Delete, Edit, Reply
   - Implement copy to clipboard
   - Add delete functionality (for me/everyone)
   - Time-based edit limits (5 minutes)

3. Voice Messages:
   - Integrate existing AudioRecorder from recordAudio.tsx
   - Add voice message UI in chat
   - Show waveform visualization
   - Implement playback controls
   - Encrypt audio before sending

4. Media Gallery:
   - Create grid view for all media in chat
   - Group by date
   - Add download all functionality
   - Integrate with existing MediaGallery component

Key files to work with:
- `/apps/mobile/app/(screens)/chatDetail.tsx`
- `/apps/mobile/app/(screens)/recordAudio.tsx`
- `/apps/mobile/components/ui/MediaGallery.tsx`
- `/apps/mobile/hooks/useEncryptedMediaUpload.ts`

Use the design system for consistent styling and follow existing patterns.
```

## Track C: Backend Services (Backend Developer 2)

### Prompt for Claude Code Instance C:
```
I need you to implement backend services for Dynasty Mobile's messaging feature. The basic chat functionality is working with Firebase.

Context:
- Firebase Functions are in `/apps/firebase/functions/src/`
- Authentication middleware is already set up
- Encryption functions exist in `encryption.ts`
- Push notification setup exists in `notifications.ts`

Your tasks:
1. Push Notifications for Messages:
   - Create function to send notifications on new messages
   - Don't notify sender or muted chats
   - Include sender name and message preview
   - Handle group chat notifications
   - Update `/apps/firebase/functions/src/notifications.ts`

2. Typing Indicators:
   - Add Firestore collection for typing status
   - Create Cloud Function to auto-expire after 10s
   - Add debouncing logic
   - Handle multiple users typing in groups

3. Search Implementation:
   - Create search function for encrypted messages
   - Implement secure indexing strategy
   - Add pagination for results
   - Return decrypted previews

4. Chat Management APIs:
   - Add/remove group participants
   - Update group name/photo
   - Leave/delete chat functions
   - Mute/unmute preferences

Key files to work with:
- `/apps/firebase/functions/src/notifications.ts`
- `/apps/firebase/functions/src/encryption.ts`
- Create new: `/apps/firebase/functions/src/messaging.ts`
- Update Firestore rules for new collections

Follow the existing error handling patterns using the middleware.
```

## Track D: Advanced Features (Senior Developer)

### Prompt for Claude Code Instance D:
```
I need you to implement advanced features for Dynasty Mobile's messaging system after the core features are ready.

Context:
- Basic messaging works with E2E encryption
- UI components use FlashList for performance
- Design system provides consistent styling
- SQLite is used for local storage

Your tasks:
1. Message Reactions:
   - Add emoji picker UI (use react-native-emoji-selector)
   - Store reactions in Firestore
   - Show reaction counts on messages
   - Animate reaction additions
   - Handle encrypted reaction data

2. Chat Info Screen:
   - Create new screen at `/(screens)/chatInfo.tsx`
   - Show participant list with online status
   - Display shared media gallery
   - Add chat settings (mute, notifications)
   - Group management (add/remove members, change photo)

3. Performance Optimization:
   - Implement message virtualization for large chats
   - Add LRU cache for decrypted messages
   - Lazy load participant information
   - Optimize re-renders with React.memo
   - Add performance monitoring

Key files to create/modify:
- Create: `/apps/mobile/app/(screens)/chatInfo.tsx`
- Modify: `/apps/mobile/components/ui/FlashList.tsx`
- Create: `/apps/mobile/src/services/MessageCacheService.ts`
- Update chat components for reactions

Focus on performance and smooth animations.
```

## Coordination Notes

All instances should:
1. Follow existing code patterns and error handling
2. Use the established design system
3. Write TypeScript with proper types
4. Test their features thoroughly
5. Document any new APIs or services

Dependencies:
- Track B can start immediately
- Track C can start immediately  
- Track A is critical for offline support
- Track D depends on Track B completion

Expected timeline:
- Tracks A, B, C: 2-3 days concurrent development
- Track D: Start after B completes
- Integration testing: 1 day
- Total: 4-5 days with 4 parallel instances