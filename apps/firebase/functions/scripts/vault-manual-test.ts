#!/usr/bin/env ts-node

/**
 * Manual testing script for vault encryption functions
 * Run with: npx ts-node scripts/vault-manual-test.ts
 */

import * as admin from 'firebase-admin';
import fetch from 'node-fetch';

// Configuration
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'dynasty-development';
const USE_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const FUNCTIONS_URL = USE_EMULATOR 
  ? `http://localhost:5001/${PROJECT_ID}/us-central1`
  : `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;

// Test user credentials
const TEST_USER_EMAIL = 'vault-test@example.com';
const TEST_USER_PASSWORD = 'testPassword123!';
const ADMIN_USER_EMAIL = 'vault-admin@example.com';
const ADMIN_USER_PASSWORD = 'adminPassword123!';

// Initialize admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  message?: string;
  data?: any;
}

class VaultTester {
  private userToken: string = '';
  private adminToken: string = '';
  private testResults: TestResult[] = [];

  async initialize() {
    console.log('🚀 Initializing Vault Testing...\n');
    
    if (USE_EMULATOR) {
      console.log('📍 Using Firebase Emulators');
      process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
      process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    }

    // Create test users
    await this.createTestUsers();
    
    // Get auth tokens
    await this.authenticateUsers();
  }

  private async createTestUsers() {
    try {
      // Create regular test user
      await admin.auth().createUser({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        emailVerified: true,
      });
      console.log('✅ Created test user:', TEST_USER_EMAIL);
    } catch (error: any) {
      if (error.code !== 'auth/email-already-exists') {
        throw error;
      }
    }

    try {
      // Create admin test user
      const adminUser = await admin.auth().createUser({
        email: ADMIN_USER_EMAIL,
        password: ADMIN_USER_PASSWORD,
        emailVerified: true,
      });
      
      // Add admin role
      await admin.firestore().collection('users').doc(adminUser.uid).set({
        email: ADMIN_USER_EMAIL,
        roles: ['admin'],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      console.log('✅ Created admin user:', ADMIN_USER_EMAIL);
    } catch (error: any) {
      if (error.code !== 'auth/email-already-exists') {
        throw error;
      }
    }
  }

  private async authenticateUsers() {
    // For emulator, we need to use REST API
    if (USE_EMULATOR) {
      const authUrl = 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key';
      
      // Get user token
      const userResponse = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          returnSecureToken: true,
        }),
      });
      const userData = await userResponse.json();
      this.userToken = userData.idToken;
      
      // Get admin token
      const adminResponse = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: ADMIN_USER_EMAIL,
          password: ADMIN_USER_PASSWORD,
          returnSecureToken: true,
        }),
      });
      const adminData = await adminResponse.json();
      this.adminToken = adminData.idToken;
    } else {
      // For production, use custom tokens
      const userRecord = await admin.auth().getUserByEmail(TEST_USER_EMAIL);
      this.userToken = await admin.auth().createCustomToken(userRecord.uid);
      
      const adminRecord = await admin.auth().getUserByEmail(ADMIN_USER_EMAIL);
      this.adminToken = await admin.auth().createCustomToken(adminRecord.uid);
    }
    
    console.log('✅ Authentication successful\n');
  }

  private async callFunction(functionName: string, data: any, useAdminToken = false) {
    const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${useAdminToken ? this.adminToken : this.userToken}`,
      },
      body: JSON.stringify({ data }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error?.message || 'Function call failed');
    }
    
    return result.result;
  }

  private recordResult(test: string, status: 'PASS' | 'FAIL', message?: string, data?: any) {
    this.testResults.push({ test, status, message, data });
    console.log(`${status === 'PASS' ? '✅' : '❌'} ${test}`);
    if (message) console.log(`   ${message}`);
    if (data) console.log(`   Data:`, JSON.stringify(data, null, 2));
    console.log('');
  }

  async runTests() {
    console.log('🧪 Running Vault Encryption Tests\n');
    console.log('=====================================\n');

    // Test 1: Create folder
    await this.testCreateFolder();
    
    // Test 2: Upload file
    await this.testFileUpload();
    
    // Test 3: List vault items
    await this.testListItems();
    
    // Test 4: Test input sanitization
    await this.testInputSanitization();
    
    // Test 5: Test file sharing
    await this.testFileSharing();
    
    // Test 6: Test security monitoring (admin only)
    await this.testSecurityMonitoring();
    
    // Test 7: Test rate limiting
    await this.testRateLimiting();
    
    // Print summary
    this.printSummary();
  }

  private async testCreateFolder() {
    try {
      const result = await this.callFunction('createVaultFolder', {
        folderName: 'Test Documents',
        parentId: null,
      });
      
      this.recordResult(
        'Create Folder',
        'PASS',
        'Successfully created folder',
        { itemId: result.itemId }
      );
    } catch (error: any) {
      this.recordResult('Create Folder', 'FAIL', error.message);
    }
  }

  private async testFileUpload() {
    try {
      const result = await this.callFunction('addVaultFile', {
        fileName: 'test-document.pdf',
        mimeType: 'application/pdf',
        size: 1024 * 1024, // 1MB
        encryptedSize: 1024 * 1024 + 256,
        parentId: null,
        encryptionMetadata: {
          algorithm: 'xchacha20-poly1305',
          keyDerivation: 'pbkdf2',
          iterations: 100000,
        },
      });
      
      this.recordResult(
        'File Upload',
        'PASS',
        'Successfully uploaded encrypted file',
        { itemId: result.itemId, uploadUrl: result.uploadUrl ? 'Generated' : 'Missing' }
      );
    } catch (error: any) {
      this.recordResult('File Upload', 'FAIL', error.message);
    }
  }

  private async testListItems() {
    try {
      const result = await this.callFunction('getVaultItems', {
        parentId: null,
        includeDeleted: false,
      });
      
      this.recordResult(
        'List Vault Items',
        'PASS',
        `Found ${result.items.length} items`,
        { count: result.items.length }
      );
    } catch (error: any) {
      this.recordResult('List Vault Items', 'FAIL', error.message);
    }
  }

  private async testInputSanitization() {
    try {
      // Test dangerous file name
      const result = await this.callFunction('addVaultFile', {
        fileName: '../../../etc/passwd',
        mimeType: 'text/plain',
        size: 1024,
        encryptedSize: 1280,
        parentId: null,
        encryptionMetadata: {
          algorithm: 'xchacha20-poly1305',
          keyDerivation: 'pbkdf2',
          iterations: 100000,
        },
      });
      
      // Get the created item to check sanitization
      const items = await this.callFunction('getVaultItems', {
        parentId: null,
      });
      
      const sanitizedItem = items.items.find((i: any) => i.id === result.itemId);
      
      this.recordResult(
        'Input Sanitization',
        sanitizedItem?.name === 'passwd' ? 'PASS' : 'FAIL',
        `File name sanitized: ${sanitizedItem?.name}`,
        { originalName: '../../../etc/passwd', sanitizedName: sanitizedItem?.name }
      );
    } catch (error: any) {
      this.recordResult('Input Sanitization', 'FAIL', error.message);
    }
  }

  private async testFileSharing() {
    try {
      // First create a file
      const fileResult = await this.callFunction('addVaultFile', {
        fileName: 'share-test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        encryptedSize: 1280,
        parentId: null,
        encryptionMetadata: {
          algorithm: 'xchacha20-poly1305',
          keyDerivation: 'pbkdf2',
          iterations: 100000,
        },
      });
      
      // Create share link
      const shareResult = await this.callFunction('createVaultShareLink', {
        itemId: fileResult.itemId,
        expiresIn: 86400, // 24 hours
        maxDownloads: 10,
      });
      
      this.recordResult(
        'File Sharing',
        'PASS',
        'Successfully created share link',
        { shareId: shareResult.shareId, shareUrl: shareResult.shareUrl ? 'Generated' : 'Missing' }
      );
    } catch (error: any) {
      this.recordResult('File Sharing', 'FAIL', error.message);
    }
  }

  private async testSecurityMonitoring() {
    try {
      // Report a test incident
      await this.callFunction('reportSecurityIncident', {
        type: 'suspicious_access',
        severity: 'medium',
        details: 'Test security incident for verification',
        affectedItemId: 'test-item-123',
      });
      
      // Get monitoring data (admin only)
      const monitoringData = await this.callFunction('getSecurityMonitoringData', {
        timeRange: '24h',
        severity: 'medium',
      }, true); // Use admin token
      
      this.recordResult(
        'Security Monitoring',
        'PASS',
        'Security monitoring functional',
        { incidentCount: monitoringData.incidents.length }
      );
    } catch (error: any) {
      this.recordResult('Security Monitoring', 'FAIL', error.message);
    }
  }

  private async testRateLimiting() {
    try {
      const promises = [];
      const testCount = 15; // Exceed the 10/hour limit
      
      // Attempt multiple uploads rapidly
      for (let i = 0; i < testCount; i++) {
        promises.push(
          this.callFunction('addVaultFile', {
            fileName: `rate-limit-test-${i}.pdf`,
            mimeType: 'application/pdf',
            size: 1024,
            encryptedSize: 1280,
            parentId: null,
            encryptionMetadata: {
              algorithm: 'xchacha20-poly1305',
              keyDerivation: 'pbkdf2',
              iterations: 100000,
            },
          }).catch(err => ({ error: err.message }))
        );
      }
      
      const results = await Promise.all(promises);
      const rateLimited = results.filter(r => 
        r.error && r.error.includes('rate limit')
      ).length;
      
      this.recordResult(
        'Rate Limiting',
        rateLimited > 0 ? 'PASS' : 'FAIL',
        `${rateLimited} requests were rate limited out of ${testCount}`,
        { totalRequests: testCount, rateLimited }
      );
    } catch (error: any) {
      this.recordResult('Rate Limiting', 'FAIL', error.message);
    }
  }

  private printSummary() {
    console.log('\n=====================================');
    console.log('📊 Test Summary\n');
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`  - ${r.test}: ${r.message}`));
    }
    
    console.log('\n✨ Testing Complete!');
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test data...');
    
    try {
      // Delete test users
      const testUser = await admin.auth().getUserByEmail(TEST_USER_EMAIL);
      await admin.auth().deleteUser(testUser.uid);
      
      const adminUser = await admin.auth().getUserByEmail(ADMIN_USER_EMAIL);
      await admin.auth().deleteUser(adminUser.uid);
      
      console.log('✅ Test users deleted');
    } catch (error) {
      console.log('⚠️  Could not clean up test users:', error);
    }
  }
}

// Run tests
async function main() {
  const tester = new VaultTester();
  
  try {
    await tester.initialize();
    await tester.runTests();
  } catch (error) {
    console.error('❌ Test execution failed:', error);
  } finally {
    await tester.cleanup();
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(console.error);
}

export { VaultTester };