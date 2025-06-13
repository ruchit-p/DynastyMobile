/**
 * Test script for vault sharing functionality
 */

import { VaultService } from './src/services/VaultService';
import { logger } from './src/services/LoggingService';

async function testVaultSharing() {
  console.log('🧪 Testing Vault Sharing Integration...\n');
  
  const vaultService = VaultService.getInstance();
  
  try {
    // Initialize vault service
    await vaultService.initialize();
    console.log('✅ Vault service initialized');
    
    // Mock users for testing
    const ownerUserId = 'test-owner-123';
    const recipientUserId = 'test-recipient-456';
    
    // Setup vault for owner
    console.log('\n📋 Setting up vault for owner...');
    const setupResult = await vaultService.setupVault(ownerUserId, {
      requireBiometric: false,
      enableKeyRotation: false,
      rotationIntervalDays: 30
    });
    
    if (!setupResult.success) {
      throw new Error('Failed to setup vault');
    }
    console.log('✅ Vault setup completed');
    
    // Mock file data
    const mockFileId = 'test-file-123';
    const mockFile = {
      id: mockFileId,
      userId: ownerUserId,
      name: 'test-document.pdf',
      type: 'file' as const,
      parentId: null,
      path: '/test-document.pdf',
      size: 1024 * 100, // 100KB
      fileType: 'document' as const,
      mimeType: 'application/pdf',
      isEncrypted: true,
      encryptionMetadata: {
        version: '1.0',
        headerUrl: 'https://example.com/header',
        chunkUrls: ['https://example.com/chunk1'],
        chunkCount: 1,
        encryptedSize: 1024 * 110
      },
      createdAt: { toDate: () => new Date() },
      updatedAt: { toDate: () => new Date() }
    };
    
    console.log('\n🔐 Testing file sharing...');
    
    // Test 1: Share file
    console.log('1. Sharing file with recipient...');
    const shareResult = await vaultService.shareVaultFile(
      mockFileId,
      [recipientUserId],
      { read: true, write: false },
      {
        expiryDays: 7,
        message: 'Please review this document'
      }
    );
    
    console.log(`✅ Share result: ${shareResult.successful} successful, ${shareResult.failed} failed`);
    
    // Test 2: Get shares for file
    console.log('\n2. Getting shares for file...');
    const fileShares = await vaultService.getFileShares(mockFileId);
    console.log(`✅ Found ${fileShares.length} shares for file`);
    
    if (fileShares.length > 0) {
      console.log('   Share details:', {
        shareId: fileShares[0].id,
        recipient: fileShares[0].recipientId,
        status: fileShares[0].status,
        permissions: fileShares[0].permissions
      });
    }
    
    // Test 3: Get shared files (as owner)
    console.log('\n3. Getting files shared by me...');
    const sharedByMe = await vaultService.getSharedFiles('shared-by-me');
    console.log(`✅ Found ${sharedByMe.length} files shared by me`);
    
    // Test 4: Get sharing statistics
    console.log('\n4. Getting sharing statistics...');
    const stats = await vaultService.getSharingStats();
    console.log('✅ Sharing stats:', stats);
    
    // Test 5: Check file access
    console.log('\n5. Checking file access...');
    const hasAccess = await vaultService.hasFileAccess(mockFileId, 'read');
    console.log(`✅ Owner has read access: ${hasAccess}`);
    
    // Test 6: Get items with shared
    console.log('\n6. Getting vault items including shared...');
    const allItems = await vaultService.getItemsWithShared();
    console.log(`✅ Found ${allItems.length} total items (owned + shared)`);
    
    // Test 7: Revoke share (if any exist)
    if (fileShares.length > 0) {
      console.log('\n7. Revoking share...');
      await vaultService.revokeSharedFile(fileShares[0].id);
      console.log('✅ Share revoked successfully');
    }
    
    console.log('\n✅ All sharing tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    logger.error('Sharing test error:', error);
  } finally {
    // Clean up
    vaultService.lockVault();
    console.log('\n🔒 Vault locked');
  }
}

// Helper to simulate recipient accepting share
async function simulateAcceptShare() {
  console.log('\n📥 Simulating share acceptance (recipient side)...');
  
  const vaultService = VaultService.getInstance();
  const recipientUserId = 'test-recipient-456';
  
  try {
    // Setup vault for recipient
    const setupResult = await vaultService.setupVault(recipientUserId, {
      requireBiometric: false,
      enableKeyRotation: false,
      rotationIntervalDays: 30
    });
    
    if (!setupResult.success) {
      throw new Error('Failed to setup recipient vault');
    }
    
    // Get shared files
    const sharedWithMe = await vaultService.getSharedFiles('shared-with-me');
    console.log(`Found ${sharedWithMe.length} pending shares`);
    
    if (sharedWithMe.length > 0) {
      const share = sharedWithMe[0];
      console.log('Accepting share:', share.id);
      
      const acceptResult = await vaultService.acceptSharedFile(share.id);
      console.log('Accept result:', acceptResult);
    }
    
  } catch (error) {
    console.error('Accept share error:', error);
  }
}

// Run tests
console.log('Dynasty Vault Sharing Test Suite');
console.log('================================\n');

testVaultSharing().then(() => {
  console.log('\n✅ Test suite completed');
}).catch(error => {
  console.error('\n❌ Test suite failed:', error);
});