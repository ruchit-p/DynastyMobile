# libsignal Implementation Examples

This document provides concrete implementation examples for integrating libsignal into the Dynasty app's React Native codebase.

## 1. React Native Bridge Implementation

### 1.1 TurboModule Definition
```typescript
// src/services/encryption/libsignal/specs/NativeLibsignal.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Identity Key Management
  generateIdentityKeyPair(): Promise<{
    publicKey: string;
    privateKey: string;
  }>;
  
  generateRegistrationId(): Promise<number>;
  
  // PreKey Management
  generatePreKeys(start: number, count: number): Promise<Array<{
    id: number;
    publicKey: string;
    privateKey: string;
  }>>;
  
  generateSignedPreKey(
    identityPrivateKey: string,
    keyId: number
  ): Promise<{
    id: number;
    publicKey: string;
    privateKey: string;
    signature: string;
    timestamp: number;
  }>;
  
  // Session Management
  processPreKeyBundle(
    registrationId: number,
    deviceId: number,
    preKeyId: number | null,
    preKey: string | null,
    signedPreKeyId: number,
    signedPreKey: string,
    signedPreKeySignature: string,
    identityKey: string,
    recipientId: string
  ): Promise<void>;
  
  // Encryption/Decryption
  encryptMessage(
    recipientId: string,
    deviceId: number,
    message: string
  ): Promise<{
    type: number;
    body: string;
  }>;
  
  decryptMessage(
    senderId: string,
    deviceId: number,
    messageType: number,
    body: string
  ): Promise<string>;
  
  // Group Operations
  createSenderKeyDistributionMessage(
    groupId: string
  ): Promise<string>;
  
  processSenderKeyDistributionMessage(
    senderId: string,
    groupId: string,
    distributionMessage: string
  ): Promise<void>;
  
  groupEncrypt(
    groupId: string,
    message: string
  ): Promise<string>;
  
  groupDecrypt(
    senderId: string,
    groupId: string,
    ciphertext: string
  ): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Libsignal');
```

### 1.2 iOS Native Module
```objective-c
// ios/Libsignal.h
#import <React/RCTBridgeModule.h>

@interface Libsignal : NSObject <RCTBridgeModule>
@end
```

```objective-c
// ios/Libsignal.mm
#import "Libsignal.h"
#import <React/RCTBridge+Private.h>
#import <ReactCommon/RCTTurboModule.h>
#import <jsi/jsi.h>
#import <SignalProtocol/SignalProtocol.h>

@interface Libsignal () <RCTTurboModule>
@property (nonatomic, strong) SignalProtocolStore *store;
@end

@implementation Libsignal

RCT_EXPORT_MODULE()

- (instancetype)init {
    if (self = [super init]) {
        self.store = [[SignalProtocolStore alloc] init];
    }
    return self;
}

RCT_EXPORT_METHOD(generateIdentityKeyPair:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        ECKeyPair *keyPair = [Curve25519 generateKeyPair];
        
        NSDictionary *result = @{
            @"publicKey": [keyPair.publicKey base64EncodedString],
            @"privateKey": [keyPair.privateKey base64EncodedString]
        };
        
        resolve(result);
    } @catch (NSException *exception) {
        reject(@"KEY_GENERATION_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(encryptMessage:(NSString *)recipientId
                  deviceId:(NSInteger)deviceId
                  message:(NSString *)message
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        SignalAddress *address = [[SignalAddress alloc] initWithName:recipientId 
                                                             deviceId:deviceId];
        SessionCipher *cipher = [[SessionCipher alloc] initWithSessionStore:self.store
                                                                    address:address];
        
        NSData *plaintext = [message dataUsingEncoding:NSUTF8StringEncoding];
        CiphertextMessage *ciphertext = [cipher encryptMessage:plaintext];
        
        NSDictionary *result = @{
            @"type": @(ciphertext.type),
            @"body": [[ciphertext serialize] base64EncodedString]
        };
        
        resolve(result);
    } @catch (NSException *exception) {
        reject(@"ENCRYPTION_ERROR", exception.reason, nil);
    }
}

@end
```

### 1.3 Android Native Module
```java
// android/src/main/java/com/dynastymobile/libsignal/LibsignalModule.java
package com.dynastymobile.libsignal;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.Arguments;

import org.signal.libsignal.protocol.*;
import org.signal.libsignal.protocol.state.*;
import org.signal.libsignal.protocol.groups.*;
import org.signal.libsignal.protocol.message.*;

import android.util.Base64;

public class LibsignalModule extends ReactContextBaseJavaModule {
    private final SignalProtocolStore store;
    
    public LibsignalModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.store = new InMemorySignalProtocolStore();
    }
    
    @Override
    public String getName() {
        return "Libsignal";
    }
    
    @ReactMethod
    public void generateIdentityKeyPair(Promise promise) {
        try {
            IdentityKeyPair keyPair = IdentityKeyPair.generate();
            
            WritableMap result = Arguments.createMap();
            result.putString("publicKey", 
                Base64.encodeToString(keyPair.getPublicKey().serialize(), Base64.NO_WRAP));
            result.putString("privateKey", 
                Base64.encodeToString(keyPair.getPrivateKey().serialize(), Base64.NO_WRAP));
            
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("KEY_GENERATION_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void encryptMessage(String recipientId, int deviceId, String message, Promise promise) {
        try {
            SignalProtocolAddress address = new SignalProtocolAddress(recipientId, deviceId);
            SessionCipher cipher = new SessionCipher(store, address);
            
            CiphertextMessage ciphertext = cipher.encrypt(message.getBytes());
            
            WritableMap result = Arguments.createMap();
            result.putInt("type", ciphertext.getType());
            result.putString("body", Base64.encodeToString(ciphertext.serialize(), Base64.NO_WRAP));
            
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("ENCRYPTION_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void processPreKeyBundle(
        int registrationId,
        int deviceId,
        Integer preKeyId,
        String preKey,
        int signedPreKeyId,
        String signedPreKey,
        String signedPreKeySignature,
        String identityKey,
        String recipientId,
        Promise promise
    ) {
        try {
            PreKeyBundle bundle = new PreKeyBundle(
                registrationId,
                deviceId,
                preKeyId,
                preKey != null ? Base64.decode(preKey, Base64.NO_WRAP) : null,
                signedPreKeyId,
                Base64.decode(signedPreKey, Base64.NO_WRAP),
                Base64.decode(signedPreKeySignature, Base64.NO_WRAP),
                Base64.decode(identityKey, Base64.NO_WRAP)
            );
            
            SignalProtocolAddress address = new SignalProtocolAddress(recipientId, deviceId);
            SessionBuilder builder = new SessionBuilder(store, address);
            builder.process(bundle);
            
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("SESSION_ERROR", e.getMessage());
        }
    }
}
```

## 2. JavaScript/TypeScript API

### 2.1 High-Level Service API
```typescript
// src/services/encryption/libsignal/LibsignalService.ts
import NativeLibsignal from './specs/NativeLibsignal';
import { SignalProtocolStore } from './stores/SignalProtocolStore';
import { KeyDistributionService } from './services/KeyDistributionService';
import { getFirebaseAuth } from '../../lib/firebase';

export class LibsignalService {
  private static instance: LibsignalService;
  private store: SignalProtocolStore;
  private keyDistribution: KeyDistributionService;
  private initialized = false;
  
  private constructor() {
    this.store = new SignalProtocolStore();
    this.keyDistribution = new KeyDistributionService(this.store);
  }
  
  static getInstance(): LibsignalService {
    if (!LibsignalService.instance) {
      LibsignalService.instance = new LibsignalService();
    }
    return LibsignalService.instance;
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    const userId = getFirebaseAuth().currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');
    
    try {
      // Check if we have an identity
      const hasIdentity = await this.store.hasIdentity();
      
      if (!hasIdentity) {
        // Generate new identity
        const identityKeyPair = await NativeLibsignal.generateIdentityKeyPair();
        const registrationId = await NativeLibsignal.generateRegistrationId();
        
        // Store identity
        await this.store.storeIdentityKeyPair(identityKeyPair);
        await this.store.storeLocalRegistrationId(registrationId);
        
        // Generate and publish prekeys
        await this.generateAndPublishKeys();
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize libsignal:', error);
      throw error;
    }
  }
  
  async sendMessage(recipientId: string, message: string): Promise<void> {
    await this.ensureInitialized();
    
    // Get recipient's devices
    const devices = await this.keyDistribution.getRecipientDevices(recipientId);
    
    // Encrypt for each device
    const encryptedMessages = await Promise.all(
      devices.map(async (device) => {
        // Ensure session exists
        await this.ensureSession(recipientId, device.id);
        
        // Encrypt message
        const encrypted = await NativeLibsignal.encryptMessage(
          recipientId,
          device.id,
          message
        );
        
        return {
          deviceId: device.id,
          ...encrypted
        };
      })
    );
    
    // Send via Firebase
    await this.sendEncryptedMessages(recipientId, encryptedMessages);
  }
  
  async receiveMessage(
    senderId: string,
    deviceId: number,
    encryptedMessage: { type: number; body: string }
  ): Promise<string> {
    await this.ensureInitialized();
    
    try {
      return await NativeLibsignal.decryptMessage(
        senderId,
        deviceId,
        encryptedMessage.type,
        encryptedMessage.body
      );
    } catch (error) {
      console.error('Decryption failed:', error);
      
      // Handle specific errors
      if (error.message.includes('No session')) {
        // Try to establish session and retry
        await this.establishSession(senderId, deviceId);
        
        return await NativeLibsignal.decryptMessage(
          senderId,
          deviceId,
          encryptedMessage.type,
          encryptedMessage.body
        );
      }
      
      throw error;
    }
  }
  
  private async ensureSession(recipientId: string, deviceId: number): Promise<void> {
    const hasSession = await this.store.hasSession(recipientId, deviceId);
    
    if (!hasSession) {
      await this.establishSession(recipientId, deviceId);
    }
  }
  
  private async establishSession(recipientId: string, deviceId: number): Promise<void> {
    // Fetch prekey bundle
    const bundle = await this.keyDistribution.fetchPreKeyBundle(recipientId, deviceId);
    
    // Process bundle
    await NativeLibsignal.processPreKeyBundle(
      bundle.registrationId,
      bundle.deviceId,
      bundle.preKeyId,
      bundle.preKey,
      bundle.signedPreKeyId,
      bundle.signedPreKey,
      bundle.signedPreKeySignature,
      bundle.identityKey,
      recipientId
    );
    
    // Mark session as established
    await this.store.markSessionEstablished(recipientId, deviceId);
  }
}
```

### 2.2 Integration with ChatEncryptionService
```typescript
// src/services/encryption/ChatEncryptionService.ts
// Add libsignal integration

import { LibsignalService } from './libsignal/LibsignalService';
import { FeatureFlagService } from '../FeatureFlagService';

export class ChatEncryptionService {
  private libsignal?: LibsignalService;
  
  async initialize(): Promise<void> {
    // Check if libsignal is enabled for this user
    const isEnabled = await FeatureFlagService.isEnabled('libsignal_encryption');
    
    if (isEnabled) {
      this.libsignal = LibsignalService.getInstance();
      await this.libsignal.initialize();
    }
  }
  
  async sendTextMessage(chatId: string, text: string): Promise<void> {
    try {
      // ... existing validation code ...
      
      // Get chat participants
      const chat = chatDoc.data() as Chat;
      const recipients = chat.participants.filter(id => id !== this.currentUserId);
      
      // Use libsignal if available
      if (this.libsignal) {
        await this.sendWithLibsignal(chatId, text, recipients);
      } else {
        await this.sendWithLegacyEncryption(chatId, text, recipients);
      }
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  }
  
  private async sendWithLibsignal(
    chatId: string,
    text: string,
    recipients: string[]
  ): Promise<void> {
    // Create message metadata
    const metadata = {
      chatId,
      timestamp: Date.now(),
      senderId: this.currentUserId,
      messageId: this.db.collection('messages').doc().id
    };
    
    // Encrypt for each recipient
    const encryptedPayloads: any[] = [];
    
    for (const recipientId of recipients) {
      try {
        const devices = await this.libsignal!.getRecipientDevices(recipientId);
        
        for (const device of devices) {
          const encrypted = await this.libsignal!.encryptMessage(
            recipientId,
            device.id,
            JSON.stringify({ text, metadata })
          );
          
          encryptedPayloads.push({
            recipientId,
            deviceId: device.id,
            protocolVersion: 'signal_v1',
            encrypted
          });
        }
      } catch (error) {
        logger.error(`Failed to encrypt for ${recipientId}:`, error);
      }
    }
    
    // Store encrypted messages
    await this.storeEncryptedMessages(metadata.messageId, encryptedPayloads);
  }
  
  async decryptMessage(message: any): Promise<any> {
    if (message.protocolVersion === 'signal_v1' && this.libsignal) {
      return await this.decryptWithLibsignal(message);
    } else {
      return await this.decryptWithLegacyEncryption(message);
    }
  }
  
  private async decryptWithLibsignal(message: any): Promise<any> {
    const decrypted = await this.libsignal!.receiveMessage(
      message.senderId,
      message.deviceId,
      message.encrypted
    );
    
    return JSON.parse(decrypted);
  }
}
```

## 3. Group Messaging Implementation

### 3.1 Group Encryption Service
```typescript
// src/services/encryption/libsignal/GroupEncryptionService.ts
import NativeLibsignal from './specs/NativeLibsignal';
import { getFirebaseDb, getFirebaseAuth } from '../../lib/firebase';

export class GroupEncryptionService {
  private db = getFirebaseDb();
  private currentUserId = getFirebaseAuth().currentUser?.uid!;
  
  async createGroup(groupId: string, name: string, memberIds: string[]): Promise<void> {
    // Create sender key distribution message
    const distributionMessage = await NativeLibsignal.createSenderKeyDistributionMessage(groupId);
    
    // Create group document
    await this.db.collection('groups').doc(groupId).set({
      id: groupId,
      name,
      members: memberIds,
      createdBy: this.currentUserId,
      createdAt: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
      encryptionVersion: 'signal_group_v1'
    });
    
    // Send distribution message to all members
    await this.distributeGroupKey(groupId, memberIds, distributionMessage);
  }
  
  private async distributeGroupKey(
    groupId: string,
    memberIds: string[],
    distributionMessage: string
  ): Promise<void> {
    const libsignal = LibsignalService.getInstance();
    
    // Send to each member via 1-on-1 encrypted channel
    await Promise.all(
      memberIds
        .filter(id => id !== this.currentUserId)
        .map(async (memberId) => {
          const message = {
            type: 'sender_key_distribution',
            groupId,
            distribution: distributionMessage
          };
          
          await libsignal.sendMessage(memberId, JSON.stringify(message));
        })
    );
  }
  
  async processGroupKeyDistribution(
    senderId: string,
    groupId: string,
    distributionMessage: string
  ): Promise<void> {
    await NativeLibsignal.processSenderKeyDistributionMessage(
      senderId,
      groupId,
      distributionMessage
    );
  }
  
  async sendGroupMessage(groupId: string, text: string): Promise<void> {
    // Encrypt message
    const encrypted = await NativeLibsignal.groupEncrypt(
      groupId,
      JSON.stringify({
        text,
        senderId: this.currentUserId,
        timestamp: Date.now()
      })
    );
    
    // Store in Firebase
    await this.db
      .collection('groups')
      .doc(groupId)
      .collection('messages')
      .add({
        senderId: this.currentUserId,
        encrypted,
        timestamp: FirebaseFirestoreTypes.FieldValue.serverTimestamp(),
        type: 'signal_group_encrypted'
      });
  }
  
  async receiveGroupMessage(
    groupId: string,
    senderId: string,
    encrypted: string
  ): Promise<any> {
    const decrypted = await NativeLibsignal.groupDecrypt(
      senderId,
      groupId,
      encrypted
    );
    
    return JSON.parse(decrypted);
  }
}
```

### 3.2 Group UI Integration
```typescript
// app/(screens)/chat.tsx
// Update to support Signal Protocol groups

import { GroupEncryptionService } from '../../src/services/encryption/libsignal/GroupEncryptionService';

export default function ChatScreen() {
  const [isSignalEnabled, setIsSignalEnabled] = useState(false);
  const groupService = useRef(new GroupEncryptionService());
  
  useEffect(() => {
    checkSignalProtocol();
  }, []);
  
  const checkSignalProtocol = async () => {
    const enabled = await FeatureFlagService.isEnabled('libsignal_encryption');
    setIsSignalEnabled(enabled);
  };
  
  const handleSendMessage = async (text: string) => {
    if (chatType === 'group' && isSignalEnabled) {
      await groupService.current.sendGroupMessage(chatId, text);
    } else {
      await chatService.sendTextMessage(chatId, text);
    }
  };
  
  const handleReceiveMessage = async (message: any) => {
    if (message.type === 'signal_group_encrypted' && isSignalEnabled) {
      const decrypted = await groupService.current.receiveGroupMessage(
        chatId,
        message.senderId,
        message.encrypted
      );
      
      return {
        ...message,
        text: decrypted.text,
        decrypted: true
      };
    }
    
    return await chatService.decryptMessage(message);
  };
}
```

## 4. Key Management UI

### 4.1 Key Verification Screen
```typescript
// app/(screens)/keyVerification.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Button } from '../../components/ui/Button';
import { LibsignalService } from '../../src/services/encryption/libsignal/LibsignalService';

export default function KeyVerificationScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [safetyNumber, setSafetyNumber] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  useEffect(() => {
    generateSafetyNumber();
  }, [userId]);
  
  const generateSafetyNumber = async () => {
    try {
      const libsignal = LibsignalService.getInstance();
      const number = await libsignal.generateSafetyNumber(userId);
      setSafetyNumber(number);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate safety number');
    } finally {
      setLoading(false);
    }
  };
  
  const verifySafetyNumber = async () => {
    try {
      await LibsignalService.getInstance().markIdentityVerified(userId);
      Alert.alert('Success', 'Identity verified successfully');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to verify identity');
    }
  };
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Verify Safety Number</Text>
      
      <View style={styles.qrContainer}>
        <QRCode
          value={safetyNumber}
          size={200}
        />
      </View>
      
      <Text style={styles.safetyNumber}>{formatSafetyNumber(safetyNumber)}</Text>
      
      <Text style={styles.instructions}>
        Compare this safety number with your contact's screen. 
        If the numbers match, your conversation is secure.
      </Text>
      
      <Button
        title="Mark as Verified"
        onPress={verifySafetyNumber}
        variant="primary"
      />
    </ScrollView>
  );
}

function formatSafetyNumber(number: string): string {
  // Format as blocks of 5 digits
  return number.match(/.{1,5}/g)?.join(' ') || number;
}
```

### 4.2 Encryption Settings
```typescript
// app/(screens)/encryptionSettings.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Switch, Alert } from 'react-native';
import { Screen } from '../../components/ui/Screen';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LibsignalService } from '../../src/services/encryption/libsignal/LibsignalService';
import { FeatureFlagService } from '../../src/services/FeatureFlagService';

export default function EncryptionSettingsScreen() {
  const [signalEnabled, setSignalEnabled] = useState(false);
  const [keyStats, setKeyStats] = useState({
    preKeysRemaining: 0,
    signedPreKeyAge: 0,
    sessionsActive: 0
  });
  
  useEffect(() => {
    loadSettings();
  }, []);
  
  const loadSettings = async () => {
    const enabled = await FeatureFlagService.isEnabled('libsignal_encryption');
    setSignalEnabled(enabled);
    
    if (enabled) {
      const stats = await LibsignalService.getInstance().getKeyStatistics();
      setKeyStats(stats);
    }
  };
  
  const toggleSignalProtocol = async (value: boolean) => {
    try {
      if (value) {
        // Enable Signal Protocol
        await LibsignalService.getInstance().initialize();
        await FeatureFlagService.enable('libsignal_encryption');
      } else {
        // Confirm before disabling
        Alert.alert(
          'Disable Signal Protocol',
          'This will revert to legacy encryption. Are you sure?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Disable',
              style: 'destructive',
              onPress: async () => {
                await FeatureFlagService.disable('libsignal_encryption');
                setSignalEnabled(false);
              }
            }
          ]
        );
        return;
      }
      
      setSignalEnabled(value);
    } catch (error) {
      Alert.alert('Error', 'Failed to change encryption settings');
    }
  };
  
  const rotateKeys = async () => {
    try {
      await LibsignalService.getInstance().rotateSignedPreKey();
      await LibsignalService.getInstance().replenishPreKeys();
      Alert.alert('Success', 'Keys rotated successfully');
      loadSettings();
    } catch (error) {
      Alert.alert('Error', 'Failed to rotate keys');
    }
  };
  
  return (
    <Screen title="Encryption Settings">
      <Card>
        <View style={styles.row}>
          <Text style={styles.label}>Signal Protocol (Beta)</Text>
          <Switch
            value={signalEnabled}
            onValueChange={toggleSignalProtocol}
          />
        </View>
        
        <Text style={styles.description}>
          Enable end-to-end encryption using the Signal Protocol for 
          enhanced security and privacy.
        </Text>
      </Card>
      
      {signalEnabled && (
        <>
          <Card>
            <Text style={styles.sectionTitle}>Key Statistics</Text>
            
            <View style={styles.stat}>
              <Text style={styles.statLabel}>One-time PreKeys Remaining:</Text>
              <Text style={styles.statValue}>{keyStats.preKeysRemaining}</Text>
            </View>
            
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Signed PreKey Age:</Text>
              <Text style={styles.statValue}>
                {Math.floor(keyStats.signedPreKeyAge / (1000 * 60 * 60))} hours
              </Text>
            </View>
            
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Active Sessions:</Text>
              <Text style={styles.statValue}>{keyStats.sessionsActive}</Text>
            </View>
          </Card>
          
          <Card>
            <Text style={styles.sectionTitle}>Key Management</Text>
            
            <Button
              title="Rotate Keys"
              onPress={rotateKeys}
              variant="secondary"
              style={styles.button}
            />
            
            <Button
              title="View Safety Numbers"
              onPress={() => router.push('/safetyNumbers')}
              variant="secondary"
              style={styles.button}
            />
            
            <Button
              title="Clear All Sessions"
              onPress={() => confirmClearSessions()}
              variant="danger"
              style={styles.button}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}
```

## 5. Migration Utilities

### 5.1 Batch Migration Tool
```typescript
// src/services/encryption/libsignal/migration/BatchMigrationTool.ts
export class BatchMigrationTool {
  private batchSize = 100;
  private migrationProgress = new Map<string, number>();
  
  async migrateUsers(userIds: string[]): Promise<{
    successful: string[];
    failed: Array<{ userId: string; error: string }>;
  }> {
    const successful: string[] = [];
    const failed: Array<{ userId: string; error: string }> = [];
    
    // Process in batches
    for (let i = 0; i < userIds.length; i += this.batchSize) {
      const batch = userIds.slice(i, i + this.batchSize);
      
      await Promise.all(
        batch.map(async (userId) => {
          try {
            await this.migrateUser(userId);
            successful.push(userId);
            this.migrationProgress.set(userId, 100);
          } catch (error) {
            failed.push({
              userId,
              error: error.message
            });
            this.migrationProgress.set(userId, -1);
          }
        })
      );
      
      // Report progress
      await this.reportProgress(i + batch.length, userIds.length);
    }
    
    return { successful, failed };
  }
  
  private async migrateUser(userId: string): Promise<void> {
    // Step 1: Initialize Signal Protocol
    this.updateProgress(userId, 20);
    await this.initializeUserIdentity(userId);
    
    // Step 2: Generate and publish keys
    this.updateProgress(userId, 40);
    await this.generateUserKeys(userId);
    
    // Step 3: Migrate existing conversations
    this.updateProgress(userId, 60);
    await this.migrateUserConversations(userId);
    
    // Step 4: Update user capabilities
    this.updateProgress(userId, 80);
    await this.updateUserCapabilities(userId);
    
    // Step 5: Verify migration
    this.updateProgress(userId, 100);
    await this.verifyUserMigration(userId);
  }
}
```

### 5.2 Rollback Mechanism
```typescript
// src/services/encryption/libsignal/migration/RollbackService.ts
export class RollbackService {
  async rollbackUser(userId: string, reason: string): Promise<void> {
    try {
      // Step 1: Disable Signal Protocol
      await this.disableSignalProtocol(userId);
      
      // Step 2: Clear Signal Protocol data
      await this.clearSignalData(userId);
      
      // Step 3: Restore legacy encryption
      await this.restoreLegacyEncryption(userId);
      
      // Step 4: Log rollback
      await this.logRollback(userId, reason);
      
      // Step 5: Notify user
      await this.notifyUserOfRollback(userId, reason);
    } catch (error) {
      console.error('Rollback failed:', error);
      throw new Error('Critical: Rollback failed, manual intervention required');
    }
  }
  
  private async clearSignalData(userId: string): Promise<void> {
    const store = new SignalProtocolStore();
    
    // Clear all sessions
    await store.clearAllSessions();
    
    // Clear identity
    await store.clearIdentity();
    
    // Clear prekeys
    await store.clearAllPreKeys();
    
    // Clear from Firebase
    await this.clearFirebaseData(userId);
  }
}
```

## 6. Testing Harness

### 6.1 E2E Test Suite
```typescript
// src/__tests__/libsignal/e2e/MessageFlow.test.ts
import { createTestEnvironment, TestUser } from '../TestUtils';

describe('E2E Message Flow', () => {
  let env: TestEnvironment;
  let alice: TestUser;
  let bob: TestUser;
  let charlie: TestUser;
  
  beforeAll(async () => {
    env = await createTestEnvironment();
    alice = await env.createUser('alice');
    bob = await env.createUser('bob');
    charlie = await env.createUser('charlie');
  });
  
  test('1-on-1 messaging', async () => {
    // Alice sends to Bob
    await alice.sendMessage(bob.userId, 'Hello Bob!');
    
    // Bob receives
    const messages = await bob.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('Hello Bob!');
    
    // Bob replies
    await bob.sendMessage(alice.userId, 'Hi Alice!');
    
    // Alice receives
    const aliceMessages = await alice.getMessages();
    expect(aliceMessages).toHaveLength(1);
    expect(aliceMessages[0].text).toBe('Hi Alice!');
  });
  
  test('group messaging', async () => {
    // Alice creates group
    const groupId = await alice.createGroup('Test Group', [
      alice.userId,
      bob.userId,
      charlie.userId
    ]);
    
    // Alice sends group message
    await alice.sendGroupMessage(groupId, 'Hello everyone!');
    
    // All members receive
    const bobMessages = await bob.getGroupMessages(groupId);
    const charlieMessages = await charlie.getGroupMessages(groupId);
    
    expect(bobMessages[0].text).toBe('Hello everyone!');
    expect(charlieMessages[0].text).toBe('Hello everyone!');
  });
  
  test('offline message delivery', async () => {
    // Bob goes offline
    await bob.goOffline();
    
    // Alice sends message
    await alice.sendMessage(bob.userId, 'Offline message');
    
    // Bob comes online
    await bob.goOnline();
    
    // Bob should receive message
    const messages = await bob.getMessages();
    expect(messages.find(m => m.text === 'Offline message')).toBeDefined();
  });
});
```

This implementation guide provides concrete examples for integrating libsignal into the Dynasty app. The examples cover the native bridge, JavaScript API, UI integration, migration tools, and testing infrastructure needed for a successful implementation.