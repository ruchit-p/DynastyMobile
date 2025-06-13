/**
 * Test script for Vault Streaming functionality
 * Run with: npx ts-node test-vault-streaming.ts
 */

import { VaultService } from './src/services/VaultService';
import * as FileSystem from 'expo-file-system';
import { logger } from './src/services/LoggingService';

async function testVaultStreaming() {
  console.log('=== Testing Vault Streaming Functionality ===\n');
  
  const vaultService = VaultService.getInstance();
  
  try {
    // 1. Initialize vault
    console.log('1. Initializing vault...');
    await vaultService.initialize();
    
    // 2. Setup vault (simulate user setup)
    console.log('2. Setting up vault...');
    const userId = 'test_user_123';
    const setupResult = await vaultService.setupVault(userId, {
      useBiometric: false,
      usePassphrase: true,
      passphrase: 'test-passphrase-123'
    });
    
    if (!setupResult.success) {
      throw new Error('Vault setup failed');
    }
    
    // 3. Create a large test file (15MB to trigger streaming)
    console.log('3. Creating test file (15MB)...');
    const testFilePath = `${FileSystem.cacheDirectory}test_large_file.bin`;
    
    // Create 15MB of random-like data
    const chunkSize = 1024 * 1024; // 1MB
    let fileContent = '';
    for (let i = 0; i < 15; i++) {
      // Create 1MB chunks of repeating pattern
      const chunk = 'A'.repeat(chunkSize);
      fileContent += chunk;
    }
    
    await FileSystem.writeAsStringAsync(testFilePath, fileContent);
    const fileInfo = await FileSystem.getInfoAsync(testFilePath);
    console.log(`Created test file: ${testFilePath} (${fileInfo.size} bytes)`);
    
    // 4. Upload file (should use streaming for > 10MB)
    console.log('4. Uploading file with streaming encryption...');
    const uploadResult = await vaultService.uploadFile(
      testFilePath,
      'test_large_file.bin',
      'application/octet-stream',
      null, // root folder
      {
        onProgress: (progress) => {
          process.stdout.write(`\rUpload progress: ${progress}%`);
        }
      }
    );
    console.log('\nUpload complete!');
    console.log(`File ID: ${uploadResult.id}`);
    console.log(`Encryption version: ${uploadResult.encryptionMetadata?.version}`);
    console.log(`Streaming mode: ${uploadResult.encryptionMetadata?.streamingMode}`);
    
    // 5. Download file (should use streaming decryption)
    console.log('\n5. Downloading file with streaming decryption...');
    const downloadPath = await vaultService.downloadFile(uploadResult, {
      saveToDevice: false,
      onProgress: (progress) => {
        process.stdout.write(`\rDownload progress: ${progress}%`);
      }
    });
    console.log('\nDownload complete!');
    console.log(`Downloaded to: ${downloadPath}`);
    
    // 6. Verify file integrity
    console.log('\n6. Verifying file integrity...');
    const downloadedInfo = await FileSystem.getInfoAsync(downloadPath);
    console.log(`Original size: ${fileInfo.size} bytes`);
    console.log(`Downloaded size: ${downloadedInfo.size} bytes`);
    console.log(`Integrity check: ${fileInfo.size === downloadedInfo.size ? 'PASSED' : 'FAILED'}`);
    
    // Cleanup
    console.log('\n7. Cleaning up...');
    await FileSystem.deleteAsync(testFilePath, { idempotent: true });
    await FileSystem.deleteAsync(downloadPath, { idempotent: true });
    
    console.log('\n=== Test completed successfully! ===');
    
  } catch (error) {
    console.error('\n=== Test failed! ===');
    console.error(error);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testVaultStreaming().catch(console.error);
}

export { testVaultStreaming };