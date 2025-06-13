/**
 * Test file to understand libsodium streaming API
 */

import Sodium from 'react-native-libsodium';

export async function testStreaming() {
  await Sodium.ready;
  
  console.log('Testing crypto_secretstream API...');
  
  // Check available functions
  console.log('crypto_secretstream_xchacha20poly1305_init_push:', typeof Sodium.crypto_secretstream_xchacha20poly1305_init_push);
  console.log('crypto_secretstream_xchacha20poly1305_push:', typeof Sodium.crypto_secretstream_xchacha20poly1305_push);
  console.log('crypto_secretstream_xchacha20poly1305_init_pull:', typeof Sodium.crypto_secretstream_xchacha20poly1305_init_pull);
  console.log('crypto_secretstream_xchacha20poly1305_pull:', typeof Sodium.crypto_secretstream_xchacha20poly1305_pull);
  
  // Test encryption
  const key = Sodium.crypto_secretstream_xchacha20poly1305_keygen();
  console.log('Key generated:', key.length, 'bytes');
  
  // Try init_push
  try {
    const result = Sodium.crypto_secretstream_xchacha20poly1305_init_push(key);
    console.log('init_push result:', result);
    console.log('result type:', typeof result);
    console.log('result keys:', Object.keys(result));
  } catch (error) {
    console.error('init_push error:', error);
  }
  
  // Test with sample data
  const message = Sodium.from_string('Hello, World!');
  const tag = Sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
  
  console.log('Message:', message);
  console.log('Tag:', tag);
}