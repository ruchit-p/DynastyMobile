import { useEffect, useState } from 'react';
import { View, Text, Button, ScrollView, StyleSheet, Alert } from 'react-native';
import { signalProtocol } from '../src/services/signal';
import type { PreKeyBundle } from '../src/specs/NativeLibsignal';

/**
 * Test component for Signal Protocol implementation
 * This component tests all the major functionality of the native module
 */
export function SignalProtocolTest() {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  
  const log = (message: string) => {
    console.log(`[SignalTest] ${message}`);
    setTestResults(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };
  
  const runTests = async () => {
    setIsRunning(true);
    setTestResults([]);
    
    try {
      // Test 1: Initialize Signal Protocol
      log('Test 1: Initializing Signal Protocol...');
      await signalProtocol.initialize();
      log('✅ Signal Protocol initialized successfully');
      
      // Test 2: Get identity key pair
      log('Test 2: Getting identity key pair...');
      const identity = await signalProtocol.getIdentityKeyPair();
      if (identity) {
        log(`✅ Identity key pair found: ${identity.publicKey.substring(0, 20)}...`);
      } else {
        log('❌ No identity key pair found');
        return;
      }
      
      // Test 3: Get registration ID
      log('Test 3: Getting registration ID...');
      const regId = await signalProtocol.getLocalRegistrationId();
      log(`✅ Registration ID: ${regId}`);
      
      // Test 4: Generate pre-keys
      log('Test 4: Generating pre-keys...');
      const preKeys = await signalProtocol.generateAndUploadPreKeys(100, 10);
      log(`✅ Generated ${preKeys.length} pre-keys`);
      
      // Test 5: Generate signed pre-key
      log('Test 5: Generating signed pre-key...');
      const signedPreKey = await signalProtocol.generateAndUploadSignedPreKey(2);
      log(`✅ Generated signed pre-key with ID: ${signedPreKey.id}`);
      
      // Test 6: Simulate message exchange between two users
      log('Test 6: Simulating message exchange...');
      
      // Create a mock pre-key bundle for "Bob"
      const bobBundle: PreKeyBundle = {
        registrationId: 12345,
        deviceId: 1,
        identityKey: identity.publicKey, // In real scenario, this would be Bob's key
        signedPreKeyId: signedPreKey.id,
        signedPreKey: signedPreKey.publicKey,
        signedPreKeySignature: signedPreKey.signature,
        preKeyId: preKeys[0].id,
        preKey: preKeys[0].publicKey
      };
      
      // Create session with "Bob"
      log('Creating session with Bob...');
      await signalProtocol.createSession('bob@example.com', 1, bobBundle);
      log('✅ Session created successfully');
      
      // Check if session exists
      const hasSession = await signalProtocol.hasSession('bob@example.com', 1);
      log(`✅ Has session with Bob: ${hasSession}`);
      
      // Encrypt a message
      log('Encrypting message...');
      const plaintext = 'Hello, this is a secret message!';
      const encrypted = await signalProtocol.encryptMessage(
        'bob@example.com',
        1,
        plaintext
      );
      log(`✅ Message encrypted. Type: ${encrypted.type}, Body length: ${encrypted.body.length}`);
      
      // In a real scenario, Bob would decrypt this message
      // For testing, we'll just verify the encryption worked
      
      // Test 7: Group messaging
      log('Test 7: Testing group messaging...');
      const groupId = 'test-group-123';
      
      // Create group session
      const distributionMessage = await signalProtocol.createGroupSession(groupId);
      log(`✅ Created group session. Distribution ID: ${distributionMessage.distributionId}`);
      
      // Encrypt group message
      const groupMessage = await signalProtocol.encryptGroupMessage(
        groupId,
        'Hello group!'
      );
      log(`✅ Group message encrypted. Length: ${groupMessage.ciphertext.length}`);
      
      // Test 8: Safety number generation
      log('Test 8: Generating safety number...');
      const safetyNumber = await signalProtocol.generateSafetyNumber(
        'bob@example.com',
        identity.publicKey // In real scenario, this would be Bob's identity key
      );
      log(`✅ Safety number: ${safetyNumber.numberString}`);
      
      log('🎉 All tests completed successfully!');
      
    } catch (error) {
      log(`❌ Test failed: ${error}`);
      console.error('Test error:', error);
    } finally {
      setIsRunning(false);
    }
  };
  
  const clearData = async () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all encryption keys and sessions. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await signalProtocol.clearAllData();
              log('✅ All data cleared');
              setTestResults([]);
            } catch (error) {
              log(`❌ Failed to clear data: ${error}`);
            }
          }
        }
      ]
    );
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Signal Protocol Test</Text>
      
      <View style={styles.buttonContainer}>
        <Button
          title="Run Tests"
          onPress={runTests}
          disabled={isRunning}
        />
        <Button
          title="Clear All Data"
          onPress={clearData}
          disabled={isRunning}
          color="red"
        />
      </View>
      
      <ScrollView style={styles.logContainer}>
        {testResults.map((result, index) => (
          <Text key={index} style={styles.logText}>
            {result}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  logText: {
    fontSize: 12,
    marginBottom: 5,
    fontFamily: 'monospace',
  },
});
