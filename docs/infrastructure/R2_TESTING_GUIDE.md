# Cloudflare R2 Testing Guide

## Overview
This guide walks you through testing the R2 integration with Dynasty Mobile.

## Prerequisites

1. **R2 Bucket Created**: ✅ You've already created `dynastydev` bucket
2. **Environment Variables**: Add these to your Firebase Functions `.env` file:

```bash
# R2 Configuration
R2_ACCOUNT_ID=c6889114b3f2b097475be8a5c7628cd0
R2_ACCESS_KEY_ID=cdb99385ea7cf192465c18504e48e83b
R2_SECRET_ACCESS_KEY=d1425674db3dd6a7610b752594c1c02019493d20e4541cfa630e11e953f79367
R2_ENDPOINT=https://c6889114b3f2b097475be8a5c7628cd0.r2.cloudflarestorage.com
R2_BASE_BUCKET=dynasty

# Enable R2 features
ENABLE_R2_MIGRATION=true
ENABLE_R2_TESTS=true
STORAGE_PROVIDER=r2  # Set to 'firebase' to use Firebase Storage
```

## Step 1: Install Dependencies

```bash
cd apps/firebase/functions
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Step 2: Deploy Test Functions

Deploy the functions with R2 support:

```bash
# Deploy only the test functions first
firebase deploy --only functions:testR2Integration,functions:testR2FileUpload

# Or deploy all functions
npm run deploy
```

## Step 3: Test R2 Integration

### Test 1: Basic Integration Test

This test verifies configuration and URL generation:

```javascript
// In your mobile or web app, call:
const result = await firebase.functions().httpsCallable('testR2Integration')();
console.log(result.data);
```

Expected response:
```json
{
  "success": true,
  "message": "All R2 integration tests passed successfully!",
  "results": {
    "uploadUrlTest": { "success": true, "url": "https://..." },
    "downloadUrlTest": { "success": true, "url": "https://..." },
    "bucketTest": { "success": true, "bucket": "dynastydev" },
    "configTest": { "success": true, "config": {...} }
  }
}
```

### Test 2: File Upload Test

This test performs an actual file upload and verification:

```javascript
// Test with custom content
const result = await firebase.functions().httpsCallable('testR2FileUpload')({
  testContent: "Hello R2! This is a test from Dynasty Mobile."
});
console.log(result.data);
```

Expected response:
```json
{
  "success": true,
  "message": "R2 file upload test completed successfully!",
  "details": {
    "bucket": "dynastydev",
    "key": "vault/[userId]/root/[timestamp]_test-upload.txt",
    "uploadSuccess": true,
    "downloadSuccess": true,
    "contentVerified": true
  }
}
```

## Step 4: Test Vault Integration

### Deploy R2-enabled Vault Functions

```bash
# Deploy the R2 vault functions
firebase deploy --only functions:getVaultUploadSignedUrlR2,functions:getVaultDownloadUrlR2
```

### Test Vault Upload with R2

```javascript
// In your app, switch to R2 vault upload
const result = await firebase.functions().httpsCallable('getVaultUploadSignedUrlR2')({
  fileName: 'test-document.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024 * 100, // 100KB
  parentId: null
});

const { signedUrl, bucket, storagePath } = result.data;
console.log('Upload URL:', signedUrl);
console.log('Bucket:', bucket); // Should be "dynastydev"
console.log('Storage Path:', storagePath); // Should be "vault/[userId]/root/[timestamp]_test-document.pdf"
```

## Step 5: Verify in R2 Dashboard

1. Go to your [Cloudflare R2 Dashboard](https://dash.cloudflare.com/)
2. Navigate to R2 > Object Storage > dynastydev
3. You should see the test files in the appropriate folders:
   - `vault/[userId]/root/` - Test vault files
   - `test/` - Test upload files

## Step 6: Test Migration (Optional)

If you have existing Firebase Storage files to migrate:

```javascript
// Run migration in batches
const result = await firebase.functions().httpsCallable('migrateVaultItemsToR2')({
  batchSize: 5,  // Start with small batches
  startAfter: null  // Or provide last processed doc ID
});
console.log('Migration result:', result.data);
```

## Troubleshooting

### Common Issues

1. **403 Forbidden Error**
   - Check that your Access Key has read/write permissions
   - Verify the bucket name matches exactly

2. **SignatureDoesNotMatch Error**
   - Ensure your Secret Access Key is correct
   - Check that the region is set to "auto"

3. **NetworkingError**
   - Verify the endpoint URL is correct
   - Check if you're behind a firewall that blocks R2

### Debug Mode

Enable detailed logging in your functions:

```javascript
// In r2Service.ts constructor
console.log('R2 Config:', {
  endpoint: this.config.endpoint,
  accountId: this.config.accountId,
  hasAccessKey: !!this.config.accessKeyId,
  hasSecretKey: !!this.config.secretAccessKey
});
```

## Next Steps

Once testing is successful:

1. **Update Mobile App**: Integrate `R2UploadService` in your React Native app
2. **Update Web App**: Modify `VaultService` to use R2
3. **Gradual Rollout**: Use feature flags to control rollout percentage
4. **Monitor Performance**: Compare R2 vs Firebase Storage metrics
5. **Complete Migration**: Run full migration once confident

## Performance Benchmarks

Track these metrics during testing:

- Upload speed (MB/s)
- Download speed (MB/s)
- URL generation time (ms)
- End-to-end upload time (ms)
- Cost per GB stored
- Cost per GB transferred

## Security Checklist

- [ ] Access keys are stored securely in environment variables
- [ ] Signed URLs have appropriate expiration times
- [ ] Bucket has proper CORS configuration if needed
- [ ] No sensitive data in bucket/key names
- [ ] Audit logs are enabled for compliance