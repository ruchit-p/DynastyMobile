# Vault Encryption Testing Guide

This guide provides comprehensive instructions for testing the vault encryption implementation across different environments.

## Table of Contents
1. [Unit Testing](#unit-testing)
2. [Integration Testing](#integration-testing)
3. [Manual Testing](#manual-testing)
4. [Security Testing](#security-testing)
5. [Performance Testing](#performance-testing)
6. [Test Data Setup](#test-data-setup)

## Unit Testing

### Running Unit Tests

```bash
cd apps/firebase/functions
npm test -- vault-encryption.test.ts
```

### Test Coverage Areas

1. **Input Sanitization**
   - File name sanitization (XSS, path traversal)
   - MIME type validation
   - File size limits
   - Folder name validation

2. **Vault Operations**
   - File upload with encryption
   - Folder creation
   - File sharing
   - File deletion and recovery

3. **Security Features**
   - Rate limiting
   - Admin-only functions
   - Audit logging
   - Security incident reporting

### Writing Additional Tests

```typescript
// Example: Testing file encryption metadata
it('should store encryption metadata correctly', async () => {
  const result = await addVaultFile({
    fileName: 'encrypted.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    encryptedSize: 1280,
    encryptionMetadata: {
      algorithm: 'xchacha20-poly1305',
      keyDerivation: 'pbkdf2',
      iterations: 100000,
      salt: 'base64-encoded-salt',
    }
  });
  
  const item = await getVaultItem(result.itemId);
  expect(item.encryptionMetadata.algorithm).toBe('xchacha20-poly1305');
  expect(item.encryptionMetadata.iterations).toBe(100000);
});
```

## Integration Testing

### Firebase Emulator Setup

1. **Start Firebase Emulators**
   ```bash
   cd apps/firebase
   firebase emulators:start --only functions,firestore,auth
   ```

2. **Configure Test Environment**
   ```bash
   export FUNCTIONS_EMULATOR=true
   export FIRESTORE_EMULATOR_HOST=localhost:8080
   export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
   ```

3. **Run Integration Tests**
   ```bash
   npm run test:integration
   ```

### Testing with R2 Emulator

1. **Use Miniflare for R2 Emulation**
   ```bash
   npm install -g miniflare
   miniflare --r2 VAULT_BUCKET
   ```

2. **Configure R2 Test Endpoint**
   ```bash
   export R2_ENDPOINT=http://localhost:8787
   export R2_ACCESS_KEY_ID=miniflare-test
   export R2_SECRET_ACCESS_KEY=miniflare-test
   ```

### End-to-End Test Scenarios

```typescript
// Test complete file lifecycle
describe('E2E Vault File Lifecycle', () => {
  it('should handle complete file lifecycle', async () => {
    // 1. Upload encrypted file
    const upload = await addVaultFile({
      fileName: 'test-document.pdf',
      mimeType: 'application/pdf',
      size: 1024 * 1024, // 1MB
    });
    
    // 2. Get download URL
    const download = await getVaultDownloadUrl({
      itemId: upload.itemId
    });
    
    // 3. Share file
    const share = await shareVaultItem({
      itemId: upload.itemId,
      shareWith: ['user-2'],
      permissions: 'read'
    });
    
    // 4. Delete file
    await deleteVaultItem({
      itemId: upload.itemId
    });
    
    // 5. Verify soft delete
    const items = await getVaultItems({
      includeDeleted: true
    });
    
    expect(items.find(i => i.id === upload.itemId).isDeleted).toBe(true);
  });
});
```

## Manual Testing

### Prerequisites

1. **Set up test accounts**
   - Create test user account
   - Create admin test account
   - Create shared user account

2. **Configure secrets**
   ```bash
   # For staging
   ./scripts/setup-vault-secrets.sh staging
   
   # For local testing
   firebase functions:config:set \
     r2.account_id="your-account-id" \
     r2.access_key_id="your-access-key" \
     r2.secret_access_key="your-secret-key" \
     r2.bucket_name="dynasty-vault-test"
   ```

### Test Scenarios Checklist

#### 1. File Upload Tests
- [ ] Upload small file (< 1MB)
- [ ] Upload medium file (10-50MB)
- [ ] Upload large file (50-100MB)
- [ ] Upload file with special characters in name
- [ ] Upload file with dangerous extension (.exe, .js)
- [ ] Attempt upload > 100MB (should fail)
- [ ] Upload multiple files simultaneously

#### 2. File Management Tests
- [ ] Create nested folder structure
- [ ] Rename files and folders
- [ ] Move files between folders
- [ ] Delete and restore files
- [ ] Permanently delete after 30 days
- [ ] Search for files by name

#### 3. Sharing Tests
- [ ] Share file with family member
- [ ] Create public share link
- [ ] Set expiration on share link
- [ ] Revoke sharing access
- [ ] Access shared file as recipient
- [ ] Attempt unauthorized access (should fail)

#### 4. Security Tests
- [ ] Verify rate limiting (rapid uploads)
- [ ] Check audit logs for all operations
- [ ] Test admin security functions
- [ ] Trigger security incident
- [ ] Verify email notifications

### Using Postman/Insomnia

1. **Import Firebase Auth Token**
   ```javascript
   // Pre-request script
   const token = await firebase.auth().currentUser.getIdToken();
   pm.environment.set("firebaseToken", token);
   ```

2. **Test Endpoints**
   ```json
   // Add Vault File
   POST https://us-central1-PROJECT_ID.cloudfunctions.net/addVaultFile
   Authorization: Bearer {{firebaseToken}}
   {
     "fileName": "test.pdf",
     "mimeType": "application/pdf",
     "size": 1024000,
     "encryptedSize": 1024256
   }
   ```

## Security Testing

### Penetration Testing

1. **Path Traversal Attempts**
   ```bash
   # Test various path traversal patterns
   curl -X POST $FUNCTION_URL/addVaultFile \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"fileName": "../../../etc/passwd"}'
   ```

2. **XSS Attempts**
   ```javascript
   // Test XSS in file names
   const xssTests = [
     '<script>alert(1)</script>',
     'javascript:alert(1)',
     '<img src=x onerror=alert(1)>',
     '"><script>alert(1)</script>'
   ];
   ```

3. **SQL Injection Tests**
   ```javascript
   // Test SQL injection in search
   const sqlTests = [
     "'; DROP TABLE vaultItems; --",
     "1' OR '1'='1",
     "admin'--"
   ];
   ```

### Rate Limiting Tests

```javascript
// Test rate limiting
async function testRateLimit() {
  const promises = [];
  
  // Attempt 20 uploads (limit is 10/hour)
  for (let i = 0; i < 20; i++) {
    promises.push(addVaultFile({
      fileName: `test-${i}.pdf`,
      mimeType: 'application/pdf',
      size: 1024
    }));
  }
  
  const results = await Promise.allSettled(promises);
  const failures = results.filter(r => r.status === 'rejected');
  
  // Should have ~10 failures due to rate limiting
  expect(failures.length).toBeGreaterThan(5);
}
```

## Performance Testing

### Load Testing Script

```javascript
// load-test.js
const autocannon = require('autocannon');

const instance = autocannon({
  url: 'https://your-function-url/getVaultItems',
  connections: 10,
  pipelining: 1,
  duration: 30,
  headers: {
    'Authorization': `Bearer ${process.env.TEST_TOKEN}`,
    'Content-Type': 'application/json'
  }
}, console.log);

autocannon.track(instance);
```

### Performance Benchmarks

Target performance metrics:
- **File Upload (< 100MB)**: < 3s p95
- **File Download**: < 2s p95
- **List Operations**: < 500ms p95
- **Search Operations**: < 1s p95
- **Encryption Overhead**: < 200ms

## Test Data Setup

### Create Test Data Script

```typescript
// scripts/create-vault-test-data.ts
import * as admin from 'firebase-admin';

async function createTestData() {
  const userId = 'test-user-123';
  const db = admin.firestore();
  
  // Create folder structure
  const folders = [
    { name: 'Documents', path: '/Documents' },
    { name: 'Photos', path: '/Photos' },
    { name: 'Work', path: '/Documents/Work' }
  ];
  
  // Create test files
  const files = [
    { name: 'resume.pdf', folder: '/Documents', size: 1024000 },
    { name: 'family.jpg', folder: '/Photos', size: 2048000 },
    { name: 'report.docx', folder: '/Documents/Work', size: 512000 }
  ];
  
  // Insert test data
  for (const folder of folders) {
    await db.collection('vaultItems').add({
      userId,
      type: 'folder',
      name: folder.name,
      path: folder.path,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  
  for (const file of files) {
    await db.collection('vaultItems').add({
      userId,
      type: 'file',
      name: file.name,
      path: `${file.folder}/${file.name}`,
      size: file.size,
      encryptedSize: file.size + 256,
      mimeType: getMimeType(file.name),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}
```

### Clean Test Data

```bash
# Clean all vault test data
firebase firestore:delete vaultItems --recursive
firebase firestore:delete vaultAuditLogs --recursive
firebase firestore:delete vaultSecurityIncidents --recursive
```

## Debugging Tips

1. **Enable Verbose Logging**
   ```typescript
   export DEBUG=vault:*
   export LOG_LEVEL=debug
   ```

2. **Monitor Function Logs**
   ```bash
   firebase functions:log --only vault
   ```

3. **Check R2 Bucket Contents**
   ```bash
   wrangler r2 object list dynasty-vault-test
   ```

4. **Verify Encryption**
   ```javascript
   // Verify file is actually encrypted
   const response = await fetch(downloadUrl);
   const buffer = await response.arrayBuffer();
   const view = new Uint8Array(buffer);
   
   // Check for encryption header (first 24 bytes should be nonce)
   console.log('First 32 bytes:', Array.from(view.slice(0, 32)));
   ```

## Common Issues and Solutions

1. **CORS Errors**
   - Verify R2 CORS configuration matches your domain
   - Check Firebase function CORS settings
   - Use correct domain for environment

2. **Rate Limiting False Positives**
   - Clear rate limit cache: `firebase functions:config:unset rate_limit`
   - Check Redis connection if using external rate limiter

3. **Encryption Failures**
   - Verify encryption keys are properly generated
   - Check key derivation parameters match
   - Ensure salt is unique per encryption

4. **File Size Issues**
   - Check both original and encrypted size limits
   - Verify R2 bucket has sufficient space
   - Monitor memory usage for large files

## Continuous Testing

1. **Set up CI/CD Tests**
   ```yaml
   # .github/workflows/vault-tests.yml
   name: Vault Encryption Tests
   on: [push, pull_request]
   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v2
         - name: Install dependencies
           run: cd apps/firebase/functions && npm install
         - name: Run tests
           run: cd apps/firebase/functions && npm test vault
   ```

2. **Schedule Security Scans**
   ```bash
   # Run weekly security audit
   0 0 * * 0 /scripts/vault-security-audit.sh
   ```

3. **Monitor Production Metrics**
   - Set up alerts for encryption failures
   - Track file upload/download success rates
   - Monitor security incident frequency