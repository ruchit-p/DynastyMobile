# libsignal Firebase Schema Changes

This document outlines all Firebase Firestore schema changes required for the libsignal integration. It includes new collections, modified documents, security rules, and migration strategies.

## Overview

The libsignal integration requires significant changes to support:
- Device-specific keys and sessions
- Prekey distribution
- Signal Protocol metadata
- Group sender keys
- Multi-device support

## New Collections

### 1. `users/{userId}/devices`
Stores device-specific Signal Protocol keys and metadata.

```typescript
interface DeviceDocument {
  // Device Identification
  deviceId: number;                    // Signal Protocol device ID (registration ID)
  deviceName?: string;                  // User-friendly device name
  deviceType: 'ios' | 'android' | 'web';
  
  // Signal Protocol Keys
  identityKey: string;                  // Base64 encoded public identity key
  signedPreKey: {
    keyId: number;
    publicKey: string;                  // Base64 encoded
    signature: string;                  // Base64 encoded
    timestamp: number;                  // When key was created
  };
  
  // One-time PreKeys
  preKeys: Array<{
    keyId: number;
    publicKey: string;                  // Base64 encoded
  }>;
  
  // Metadata
  registrationId: number;               // Unique device registration ID
  createdAt: Timestamp;
  lastSeenAt: Timestamp;
  lastPreKeyRefresh: Timestamp;
  capabilities: {
    signalProtocol: boolean;
    version: string;                    // 'signal_v1'
  };
}
```

### 2. `signalSessions/{sessionId}`
Stores encrypted session state for backup/sync (optional).

```typescript
interface SessionDocument {
  sessionId: string;                    // {userId1}_{deviceId1}_{userId2}_{deviceId2}
  participants: {
    user1: { userId: string; deviceId: number };
    user2: { userId: string; deviceId: number };
  };
  
  // Encrypted session state (device-specific encryption)
  encryptedState?: string;              // For session backup
  
  // Metadata
  established: Timestamp;
  lastActivity: Timestamp;
  messageCount: number;
  
  // Security
  verified: boolean;                    // Safety number verified
  trustedIdentity: string;              // Last known identity key
}
```

### 3. `groups/{groupId}/senderKeys`
Stores group sender key metadata.

```typescript
interface SenderKeyDocument {
  groupId: string;
  memberId: string;                     // {userId}.{deviceId}
  
  // Sender key info (public data only)
  keyId: string;
  epoch: number;                        // Key rotation epoch
  addedAt: Timestamp;
  addedBy: string;                      // Who added this member
  
  // State
  active: boolean;
  revokedAt?: Timestamp;
  revokedBy?: string;
}
```

## Modified Collections

### 1. `users/{userId}` (Updated)
Add Signal Protocol capabilities and defaults.

```typescript
interface UserDocument {
  // Existing fields...
  
  // Signal Protocol additions
  signalProtocol?: {
    enabled: boolean;
    primaryDeviceId?: number;           // Default device for this user
    deviceCount: number;
    migratedAt?: Timestamp;
  };
  
  capabilities: {
    // Existing...
    signalProtocol: boolean;
    protocolVersion: string;            // 'signal_v1' or 'legacy'
  };
}
```

### 2. `messages/{messageId}` (Updated)
Support for Signal Protocol encrypted messages.

```typescript
interface MessageDocument {
  // Existing fields...
  
  // Protocol version
  protocolVersion: 'signal_v1' | 'legacy';
  
  // Signal Protocol specific
  signalMetadata?: {
    senderDeviceId: number;
    messageType: number;                // CiphertextMessage type
    
    // Per-recipient device encryption
    recipients: {
      [userId: string]: {
        [deviceId: string]: {
          encryptedPayload: string;     // Base64 encoded
          ephemeralKey?: string;        // For initial messages
        }
      }
    };
  };
  
  // Legacy encryption (for compatibility)
  encryptedPayloads?: {
    [recipientId: string]: EncryptedPayload;
  };
}
```

### 3. `groups/{groupId}` (Updated)
Add Signal Protocol group encryption support.

```typescript
interface GroupDocument {
  // Existing fields...
  
  // Signal Protocol additions
  encryption: {
    type: 'signal_group_v1' | 'legacy';
    senderKeyRotation: {
      epoch: number;
      rotatedAt: Timestamp;
      reason?: string;
    };
  };
  
  // Member devices (for sender key distribution)
  memberDevices: {
    [userId: string]: number[];         // Array of device IDs
  };
}
```

### 4. `groups/{groupId}/messages` (Updated)
Support for Signal Protocol group messages.

```typescript
interface GroupMessageDocument {
  // Existing fields...
  
  // Signal Protocol group encryption
  protocolVersion: 'signal_group_v1' | 'legacy';
  
  signalGroupMetadata?: {
    senderKeyId: string;
    epoch: number;
    encryptedContent: string;           // Group encrypted payload
    senderMemberId: string;             // {userId}.{deviceId}
  };
}
```

## New Firestore Indexes

```javascript
// firestore.indexes.json additions
{
  "indexes": [
    {
      "collectionGroup": "devices",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "lastSeenAt", "order": "DESCENDING" },
        { "fieldPath": "capabilities.signalProtocol", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "messages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "protocolVersion", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "senderKeys",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "active", "order": "ASCENDING" },
        { "fieldPath": "epoch", "order": "DESCENDING" }
      ]
    }
  ]
}
```

## Security Rules Updates

```javascript
// firestore.rules additions
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Device management rules
    match /users/{userId}/devices/{deviceId} {
      // Users can read any device's public keys
      allow read: if request.auth != null;
      
      // Only device owner can write
      allow write: if request.auth != null 
        && request.auth.uid == userId
        && isValidDeviceData(request.resource.data);
        
      // Validate device data
      function isValidDeviceData(data) {
        return data.keys().hasAll(['deviceId', 'identityKey', 'signedPreKey', 'registrationId'])
          && data.deviceId is int
          && data.identityKey is string
          && data.signedPreKey.keys().hasAll(['keyId', 'publicKey', 'signature'])
          && data.registrationId is int
          && data.preKeys is list
          && data.preKeys.size() <= 100;  // Limit prekeys
      }
    }
    
    // Signal sessions (if using backup)
    match /signalSessions/{sessionId} {
      // Only session participants can access
      allow read, write: if request.auth != null
        && (request.auth.uid == resource.data.participants.user1.userId
            || request.auth.uid == resource.data.participants.user2.userId);
    }
    
    // Group sender keys
    match /groups/{groupId}/senderKeys/{keyId} {
      // Group members can read
      allow read: if request.auth != null
        && request.auth.uid in get(/databases/$(database)/documents/groups/$(groupId)).data.members;
      
      // Only group admins can write
      allow write: if request.auth != null
        && request.auth.uid in get(/databases/$(database)/documents/groups/$(groupId)).data.admins
        && isValidSenderKey(request.resource.data);
        
      function isValidSenderKey(data) {
        return data.keys().hasAll(['groupId', 'memberId', 'keyId', 'epoch'])
          && data.epoch is int
          && data.active is bool;
      }
    }
    
    // Updated message rules for Signal Protocol
    match /messages/{messageId} {
      allow read: if request.auth != null
        && (request.auth.uid == resource.data.senderId
            || request.auth.uid in resource.data.signalMetadata.recipients.keys());
            
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.senderId
        && isValidSignalMessage(request.resource.data);
        
      function isValidSignalMessage(data) {
        return (data.protocolVersion == 'signal_v1' 
                && data.signalMetadata != null
                && data.signalMetadata.senderDeviceId is int)
            || (data.protocolVersion == 'legacy'
                && data.encryptedPayloads != null);
      }
    }
  }
}
```

## Migration Strategy

### Phase 1: Schema Addition (No Breaking Changes)
1. Deploy new collections and fields
2. Update security rules
3. Deploy new indexes
4. No impact on existing functionality

### Phase 2: Dual-Write Period
```typescript
// Example migration code
async function migrateUserToSignal(userId: string) {
  const batch = firestore.batch();
  
  // 1. Generate Signal Protocol identity
  const identity = await generateIdentity();
  const deviceId = await generateRegistrationId();
  
  // 2. Create device document
  const deviceRef = firestore
    .collection('users')
    .doc(userId)
    .collection('devices')
    .doc(deviceId.toString());
    
  batch.set(deviceRef, {
    deviceId,
    deviceType: getPlatform(),
    identityKey: identity.publicKey,
    signedPreKey: await generateSignedPreKey(identity),
    preKeys: await generatePreKeys(100),
    registrationId: deviceId,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    capabilities: {
      signalProtocol: true,
      version: 'signal_v1'
    }
  });
  
  // 3. Update user document
  const userRef = firestore.collection('users').doc(userId);
  batch.update(userRef, {
    'signalProtocol.enabled': true,
    'signalProtocol.primaryDeviceId': deviceId,
    'signalProtocol.deviceCount': 1,
    'signalProtocol.migratedAt': serverTimestamp(),
    'capabilities.signalProtocol': true,
    'capabilities.protocolVersion': 'signal_v1'
  });
  
  await batch.commit();
}
```

### Phase 3: Message Format Migration
```typescript
// Support both formats during transition
async function sendMessage(chatId: string, content: string, recipients: string[]) {
  const message = {
    chatId,
    senderId: currentUser.uid,
    timestamp: serverTimestamp(),
    content: null, // Never store plaintext
  };
  
  // Check recipient capabilities
  const recipientCaps = await getRecipientCapabilities(recipients);
  
  if (recipientCaps.every(r => r.signalProtocol)) {
    // Use Signal Protocol
    message.protocolVersion = 'signal_v1';
    message.signalMetadata = await encryptForSignalRecipients(content, recipients);
  } else {
    // Use legacy or mixed mode
    message.protocolVersion = 'legacy';
    message.encryptedPayloads = await encryptLegacy(content, recipients);
    
    // Also encrypt for Signal recipients
    const signalRecipients = recipientCaps.filter(r => r.signalProtocol);
    if (signalRecipients.length > 0) {
      message.signalMetadata = await encryptForSignalRecipients(
        content, 
        signalRecipients.map(r => r.userId)
      );
    }
  }
  
  await firestore.collection('messages').add(message);
}
```

## Cloud Functions Updates

### 1. Prekey Replenishment Function
```typescript
// functions/src/prekeyReplenishment.ts
export const replenishPrekeys = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const devices = await firestore
      .collectionGroup('devices')
      .where('preKeys', 'array-length', '<', 10)
      .get();
      
    const batch = firestore.batch();
    
    for (const device of devices.docs) {
      const newPrekeys = await generatePreKeys(
        device.data().preKeys.length,
        100
      );
      
      batch.update(device.ref, {
        preKeys: FieldValue.arrayUnion(...newPrekeys),
        lastPreKeyRefresh: serverTimestamp()
      });
    }
    
    await batch.commit();
    
    console.log(`Replenished prekeys for ${devices.size} devices`);
  });
```

### 2. Signed Prekey Rotation Function
```typescript
// functions/src/signedPrekeyRotation.ts
export const rotateSignedPrekeys = functions.pubsub
  .schedule('every 48 hours')
  .onRun(async (context) => {
    const cutoff = Date.now() - (48 * 60 * 60 * 1000); // 48 hours
    
    const devices = await firestore
      .collectionGroup('devices')
      .where('signedPreKey.timestamp', '<', cutoff)
      .get();
      
    for (const device of devices.docs) {
      await rotateDeviceSignedPrekey(device.id, device.data());
    }
    
    console.log(`Rotated signed prekeys for ${devices.size} devices`);
  });
```

### 3. Session Cleanup Function
```typescript
// functions/src/sessionCleanup.ts
export const cleanupInactiveSessions = functions.pubsub
  .schedule('every week')
  .onRun(async (context) => {
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days
    
    const sessions = await firestore
      .collection('signalSessions')
      .where('lastActivity', '<', cutoff)
      .get();
      
    const batch = firestore.batch();
    
    sessions.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    console.log(`Cleaned up ${sessions.size} inactive sessions`);
  });
```

## Monitoring & Analytics

### Key Metrics to Track
```typescript
interface SignalProtocolMetrics {
  // Adoption
  totalUsersEnabled: number;
  totalDevices: number;
  averageDevicesPerUser: number;
  
  // Usage
  messagesEncrypted: number;
  messageDeliveryRate: number;
  sessionEstablishmentRate: number;
  
  // Performance
  averageEncryptionTime: number;
  averageDecryptionTime: number;
  prekeyConsumptionRate: number;
  
  // Errors
  encryptionFailures: number;
  decryptionFailures: number;
  sessionFailures: number;
}
```

### Firestore Usage Considerations

1. **Read Operations**
   - Fetching prekey bundles: 1 read per recipient device
   - Checking capabilities: 1 read per recipient
   - Session lookup: 1 read per conversation

2. **Write Operations**
   - Publishing keys: 1 write per device
   - Sending message: 1 write + updates for delivery receipts
   - Prekey consumption: 1 write per consumed prekey

3. **Storage Costs**
   - Device document: ~5KB per device
   - Message with Signal metadata: ~2KB per message
   - Session backup: ~10KB per session

### Optimization Strategies

1. **Batch Operations**
   ```typescript
   // Batch prekey fetches
   async function fetchPreKeyBundles(userIds: string[]) {
     const devices = await firestore
       .collectionGroup('devices')
       .where('userId', 'in', userIds)
       .where('capabilities.signalProtocol', '==', true)
       .get();
       
     return devices.docs.map(doc => ({
       userId: doc.ref.parent.parent!.id,
       bundle: extractPreKeyBundle(doc.data())
     }));
   }
   ```

2. **Caching Strategy**
   ```typescript
   // Cache device capabilities
   const capabilityCache = new Map<string, DeviceCapabilities>();
   
   async function getDeviceCapabilities(userId: string): Promise<DeviceCapabilities> {
     if (capabilityCache.has(userId)) {
       return capabilityCache.get(userId)!;
     }
     
     const caps = await fetchDeviceCapabilities(userId);
     capabilityCache.set(userId, caps);
     
     // Expire after 5 minutes
     setTimeout(() => capabilityCache.delete(userId), 5 * 60 * 1000);
     
     return caps;
   }
   ```

## Rollback Plan

If migration needs to be reverted:

1. **Disable Signal Protocol**
   ```typescript
   await firestore.collection('users').doc(userId).update({
     'signalProtocol.enabled': false,
     'capabilities.protocolVersion': 'legacy'
   });
   ```

2. **Keep Data for Recovery**
   - Don't delete device documents
   - Maintain session data
   - Keep message history

3. **Revert Message Handling**
   - Continue reading both formats
   - Only write legacy format
   - Clear Signal metadata from new messages

This schema design ensures a smooth migration path while maintaining backward compatibility and enabling advanced Signal Protocol features.