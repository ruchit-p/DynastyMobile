# Firebase Emulator Fix Summary

## Problem
The Firebase emulator was failing to start with the error:
```
TypeError: Cannot read properties of undefined (reading 'CHAT')
    at Object.<anonymous> (/Users/ruchitpatel/Documents/DynastyMobile/apps/firebase/functions/lib/encryption.js:213:55)
```

## Root Cause
The `ResourceType` and `Permission` enums were being used in `encryption.ts` but were not exported from the `middleware/auth.ts` file.

## Solution Applied

1. **Added missing enums to `middleware/auth.ts`**:
   ```typescript
   export enum ResourceType {
     EVENT = "event",
     STORY = "story",
     FAMILY_TREE = "family_tree",
     VAULT = "vault",
     USER = "user",
     COMMENT = "comment",
     NOTIFICATION = "notification",
     CHAT = "chat",
   }

   export enum Permission {
     READ = "read",
     WRITE = "write",
     DELETE = "delete",
     ADMIN = "admin",
   }
   ```

2. **Fixed scheduled functions**:
   - Changed from v1 syntax (`functionsV1.pubsub.schedule`) to v2 syntax
   - Updated imports to use `onSchedule` from `firebase-functions/v2/scheduler`
   - Fixed the scheduled function declarations

## Changes Made

1. `/apps/firebase/functions/src/middleware/auth.ts`:
   - Added `ResourceType` enum with CHAT value
   - Added `Permission` enum

2. `/apps/firebase/functions/src/encryption.ts`:
   - Updated imports to use v2 scheduler
   - Changed scheduled functions to use `onSchedule` syntax

3. `/apps/mobile/app/(screens)/chat.tsx`:
   - Fixed duplicate `handleSend` function declaration

## Verification
The compiled JavaScript now correctly includes:
- `auth_1.ResourceType.CHAT` references
- Proper enum definitions in middleware

## Running the Emulator
```bash
cd apps/firebase
npm run emulator:start
```

The original "Cannot read properties of undefined (reading 'CHAT')" error has been resolved.