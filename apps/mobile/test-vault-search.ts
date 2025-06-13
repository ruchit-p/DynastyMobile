/**
 * Test script for Vault Search functionality
 * Run with: npx ts-node test-vault-search.ts
 */

import { VaultService } from './src/services/VaultService';
import * as FileSystem from 'expo-file-system';
import { logger } from './src/services/LoggingService';

async function testVaultSearch() {
  console.log('=== Testing Vault Search Functionality ===\n');
  
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
    
    // 3. Upload test files with different names
    console.log('3. Uploading test files...');
    const testFiles = [
      { name: 'Family Reunion 2023.jpg', content: 'Test image content 1' },
      { name: 'Family Tree Document.pdf', content: 'Test document content' },
      { name: 'Birthday Party Video.mp4', content: 'Test video content' },
      { name: 'Grandma Recipe Collection.txt', content: 'Test text content' },
      { name: 'Wedding Photos Album.zip', content: 'Test archive content' }
    ];
    
    const uploadedFiles = [];
    
    for (const file of testFiles) {
      const filePath = `${FileSystem.cacheDirectory}${file.name}`;
      await FileSystem.writeAsStringAsync(filePath, file.content);
      
      console.log(`Uploading ${file.name}...`);
      const uploadResult = await vaultService.uploadFile(
        filePath,
        file.name,
        'application/octet-stream',
        null // root folder
      );
      
      uploadedFiles.push(uploadResult);
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    }
    
    console.log('All test files uploaded!\n');
    
    // Wait a bit for search indexes to be created
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Test search functionality
    console.log('4. Testing search queries...\n');
    
    // Test exact match
    console.log('Test 1: Exact match search for "Family"');
    const searchResults1 = await vaultService.searchItems({
      query: 'Family'
    });
    console.log(`Found ${searchResults1.length} results:`);
    searchResults1.forEach(item => console.log(`  - ${item.name}`));
    
    // Test partial match
    console.log('\nTest 2: Partial match search for "photo"');
    const searchResults2 = await vaultService.searchItems({
      query: 'photo'
    });
    console.log(`Found ${searchResults2.length} results:`);
    searchResults2.forEach(item => console.log(`  - ${item.name}`));
    
    // Test case insensitive
    console.log('\nTest 3: Case insensitive search for "WEDDING"');
    const searchResults3 = await vaultService.searchItems({
      query: 'WEDDING'
    });
    console.log(`Found ${searchResults3.length} results:`);
    searchResults3.forEach(item => console.log(`  - ${item.name}`));
    
    // Test fuzzy search (n-grams)
    console.log('\nTest 4: Fuzzy search for "recip" (partial word)');
    const searchResults4 = await vaultService.searchItems({
      query: 'recip'
    });
    console.log(`Found ${searchResults4.length} results:`);
    searchResults4.forEach(item => console.log(`  - ${item.name}`));
    
    // 5. Test rename functionality
    console.log('\n5. Testing rename and search index update...');
    const fileToRename = uploadedFiles[0];
    const newName = 'Summer Vacation 2023.jpg';
    console.log(`Renaming "${fileToRename.name}" to "${newName}"`);
    
    await vaultService.renameItem(fileToRename.id, newName);
    
    // Wait for index update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Search for new name
    console.log('Searching for "Summer Vacation"...');
    const searchResults5 = await vaultService.searchItems({
      query: 'Summer Vacation'
    });
    console.log(`Found ${searchResults5.length} results:`);
    searchResults5.forEach(item => console.log(`  - ${item.name}`));
    
    // 6. Test search statistics
    console.log('\n6. Getting search statistics...');
    const searchStats = await vaultService.getSearchStats();
    console.log('Search Statistics:');
    console.log(`  - Total indexed files: ${searchStats.totalIndexedFiles}`);
    console.log(`  - Index size: ${searchStats.indexSize} bytes`);
    console.log(`  - Last updated: ${searchStats.lastUpdated}`);
    
    // 7. Test deletion and index cleanup
    console.log('\n7. Testing delete and search index cleanup...');
    const fileToDelete = uploadedFiles[1];
    console.log(`Deleting "${fileToDelete.name}"`);
    
    await vaultService.deleteItem(fileToDelete.id);
    
    // Wait for index cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Search should not find deleted file
    console.log('Searching for "Tree Document"...');
    const searchResults6 = await vaultService.searchItems({
      query: 'Tree Document'
    });
    console.log(`Found ${searchResults6.length} results (should be 0)`);
    
    // Cleanup remaining files
    console.log('\n8. Cleaning up...');
    for (const file of uploadedFiles) {
      if (file.id !== fileToDelete.id) {
        try {
          await vaultService.deleteItem(file.id);
        } catch (error) {
          // File might already be deleted
        }
      }
    }
    
    console.log('\n=== Search test completed successfully! ===');
    
  } catch (error) {
    console.error('\n=== Search test failed! ===');
    console.error(error);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testVaultSearch().catch(console.error);
}

export { testVaultSearch };