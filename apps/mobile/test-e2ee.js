// Test file to verify E2EE implementation
import E2EEService from '../src/services/encryption/E2EEService';

async function testE2EE() {
  console.log('🧪 Testing E2EE Implementation...\n');

  try {
    // Test 1: Initialize two users
    console.log('Test 1: Initializing users...');
    const service1 = E2EEService.getInstance();
    await service1.initialize('user1');
    
    // Simulate second user (in real app, this would be on different device)
    const service2 = E2EEService.getInstance();
    await service2.clearAllData(); // Clear to simulate different user
    await service2.initialize('user2');
    
    console.log('✅ Users initialized\n');

    // Test 2: Exchange public keys
    console.log('Test 2: Exchanging public keys...');
    const user1Keys = await service1.getPublicKeyBundle();
    const user2Keys = await service2.getPublicKeyBundle();
    
    if (!user1Keys || !user2Keys) {
      throw new Error('Failed to get public keys');
    }
    
    console.log('✅ Public keys exchanged\n');

    // Test 3: Encrypt and decrypt message
    console.log('Test 3: Testing message encryption...');
    const testMessage = 'Hello, this is a secret message! 🔐';
    
    // User 1 encrypts for User 2
    const encrypted = await service1.encryptMessage(
      testMessage,
      user2Keys.identityKey
    );
    
    console.log('Encrypted message:', {
      content: encrypted.content.substring(0, 20) + '...',
      nonce: encrypted.nonce.substring(0, 20) + '...',
      mac: encrypted.mac.substring(0, 20) + '...'
    });
    
    // User 2 decrypts
    const decrypted = await service2.decryptMessage(encrypted);
    console.log('Decrypted message:', decrypted);
    
    if (decrypted !== testMessage) {
      throw new Error('Decryption failed - messages do not match');
    }
    
    console.log('✅ Encryption/decryption successful\n');

    // Test 4: Performance with caching
    console.log('Test 4: Testing performance with session caching...');
    const startTime = Date.now();
    
    // Send 10 messages
    for (let i = 0; i < 10; i++) {
      const msg = `Message ${i + 1}`;
      const enc = await service1.encryptMessage(msg, user2Keys.identityKey);
      const dec = await service2.decryptMessage(enc);
      if (dec !== msg) throw new Error(`Message ${i + 1} failed`);
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ 10 messages encrypted/decrypted in ${duration}ms`);
    console.log(`Average: ${duration / 10}ms per message\n`);

    // Test 5: Group chat encryption
    console.log('Test 5: Testing group chat encryption...');
    const groupKey = await service1.generateGroupKey();
    const groupMessage = 'Hello group! 👥';
    
    const encryptedGroup = await service1.encryptGroupMessage(
      groupMessage,
      groupKey
    );
    
    const decryptedGroup = await service2.decryptGroupMessage(
      encryptedGroup.encrypted,
      groupKey,
      encryptedGroup.nonce,
      encryptedGroup.tag
    );
    
    if (decryptedGroup !== groupMessage) {
      throw new Error('Group decryption failed');
    }
    
    console.log('✅ Group encryption/decryption successful\n');

    // Show metrics
    console.log('📊 Performance Metrics:');
    const metrics = service1.getMetrics();
    console.log(metrics);

    console.log('\n✅ All tests passed! E2EE is working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
}

// Run tests
testE2EE();
