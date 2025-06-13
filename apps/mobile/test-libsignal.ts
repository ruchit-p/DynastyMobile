#!/usr/bin/env npx ts-node

/**
 * Test script for native libsignal implementation
 * Run with: npx ts-node test-libsignal.ts
 */

import { NativeModules } from 'react-native';

// Mock React Native environment for testing
if (!NativeModules.Libsignal) {
  console.log('❌ Libsignal native module not found. Make sure the app is built and running.');
  process.exit(1);
}

const Libsignal = NativeModules.Libsignal;

async function testLibsignal() {
  console.log('🔐 Testing Native Libsignal Implementation\n');

  try {
    // Test 1: Generate identity key pair
    console.log('1️⃣ Generating identity key pair...');
    const identityKeyPair = await Libsignal.generateIdentityKeyPair();
    console.log('✅ Identity key pair generated');
    console.log(`   Public key: ${identityKeyPair.publicKey.substring(0, 32)}...`);
    console.log(`   Private key: ${identityKeyPair.privateKey.substring(0, 32)}...`);

    // Test 2: Generate registration ID
    console.log('\n2️⃣ Generating registration ID...');
    const registrationId = await Libsignal.generateRegistrationId();
    console.log(`✅ Registration ID: ${registrationId}`);

    // Test 3: Generate pre-keys
    console.log('\n3️⃣ Generating pre-keys...');
    const preKeys = await Libsignal.generatePreKeys(1, 10);
    console.log(`✅ Generated ${preKeys.length} pre-keys`);
    console.log(`   First pre-key ID: ${preKeys[0].id}`);

    // Test 4: Generate signed pre-key
    console.log('\n4️⃣ Generating signed pre-key...');
    const signedPreKey = await Libsignal.generateSignedPreKey(
      identityKeyPair.privateKey,
      1
    );
    console.log('✅ Signed pre-key generated');
    console.log(`   ID: ${signedPreKey.id}`);
    console.log(`   Signature: ${signedPreKey.signature.substring(0, 32)}...`);

    // Test 5: Create a session (Alice and Bob)
    console.log('\n5️⃣ Creating session between Alice and Bob...');
    
    // Bob's keys
    const bobIdentity = await Libsignal.generateIdentityKeyPair();
    const bobRegId = await Libsignal.generateRegistrationId();
    const bobPreKeys = await Libsignal.generatePreKeys(1, 1);
    const bobSignedPreKey = await Libsignal.generateSignedPreKey(bobIdentity.privateKey, 1);

    // Alice creates session with Bob's bundle
    const bobBundle = {
      identityKey: bobIdentity.publicKey,
      registrationId: bobRegId,
      deviceId: 1,
      preKeyId: bobPreKeys[0].id,
      preKeyPublic: bobPreKeys[0].publicKey,
      signedPreKeyId: bobSignedPreKey.id,
      signedPreKeyPublic: bobSignedPreKey.publicKey,
      signedPreKeySignature: bobSignedPreKey.signature
    };

    await Libsignal.createSession(
      { name: 'bob@example.com', deviceId: 1 },
      bobBundle
    );
    console.log('✅ Session created');

    // Test 6: Encrypt a message
    console.log('\n6️⃣ Encrypting message...');
    const plaintext = 'Hello from Alice! 🔐';
    const encrypted = await Libsignal.encryptMessage(
      plaintext,
      { name: 'bob@example.com', deviceId: 1 },
      Date.now()
    );
    console.log('✅ Message encrypted');
    console.log(`   Type: ${encrypted.type}`);
    console.log(`   Body: ${encrypted.body.substring(0, 32)}...`);

    // Test 7: Generate safety number
    console.log('\n7️⃣ Generating safety number...');
    const safetyNumber = await Libsignal.generateSafetyNumber(
      identityKeyPair.publicKey,
      bobIdentity.publicKey,
      'alice@example.com',
      'bob@example.com'
    );
    console.log('✅ Safety number generated');
    console.log(`   Number: ${safetyNumber.numberString}`);

    // Test 8: Clear all data
    console.log('\n8️⃣ Clearing all data...');
    await Libsignal.clearAllData();
    console.log('✅ All data cleared');

    console.log('\n🎉 All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testLibsignal();