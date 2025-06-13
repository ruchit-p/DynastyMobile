# Backblaze B2 Environment Variables

This document outlines all environment variables required for Backblaze B2 storage integration in the Dynasty application.

## Overview

Dynasty supports multi-provider storage with Backblaze B2 as the primary option for cost-effective, scalable file storage. B2 integration uses the S3-compatible API through AWS SDK.

## Required Environment Variables

### Core B2 Configuration

#### `B2_CONFIG` (Secret)
JSON configuration containing B2 credentials.

**Format:**
```json
{
  "keyId": "your-b2-key-id",
  "applicationKey": "your-b2-application-key", 
  "bucketName": "your-bucket-name",
  "bucketId": "your-bucket-id"
}
```

**Environments:**
- `STAGING_B2_CONFIG` (staging)
- `PROD_B2_CONFIG` (production)
- `TEST_B2_CONFIG` (testing)

#### `B2_BASE_BUCKET` (Secret)
Default bucket name for file storage.

**Examples:**
- Staging: `dynastytest`
- Production: `dynastyprod`
- Testing: `dynastylocal`

### Optional B2 Configuration

#### `B2_ENDPOINT` (Variable)
B2 S3-compatible API endpoint.

**Default:** `https://s3.us-west-004.backblazeb2.com`
**Environments:** All

#### `B2_REGION` (Variable)
B2 region for API calls.

**Default:** `us-west-004`
**Environments:** All

#### `B2_DOWNLOAD_URL` (Variable)
Custom download URL for B2 files (optional).

**Format:** `https://f004.backblazeb2.com/file/bucket-name`
**Use case:** Custom domain or CDN integration

### Migration Configuration

#### `ENABLE_B2_MIGRATION` (Variable)
Enable gradual migration from other storage providers to B2.

**Values:** `true` | `false`
**Default:** `false`
**Environments:** staging, production

#### `B2_MIGRATION_PERCENTAGE` (Variable)
Percentage of new uploads to route to B2.

**Range:** `0-100`
**Default:** `0`
**Environments:** staging, production

#### `STORAGE_PROVIDER` (Variable)
Primary storage provider.

**Values:** `firebase` | `r2` | `b2`
**Default:** `firebase`
**Environments:** All

### Testing Configuration

#### `ENABLE_B2_TESTS` (Variable)
Enable B2-related tests in CI/CD.

**Values:** `true` | `false`
**Default:** `true`
**Environments:** All

## GitHub Actions Configuration

### Secrets (Encrypted)

Set these as GitHub repository or environment secrets:

```bash
# Staging Environment
STAGING_B2_CONFIG
STAGING_B2_BASE_BUCKET

# Production Environment  
PROD_B2_CONFIG
PROD_B2_BASE_BUCKET

# Testing Environment
TEST_B2_CONFIG
TEST_B2_BASE_BUCKET
```

### Variables (Public)

Set these as GitHub repository or environment variables:

```bash
# Staging Environment
STAGING_B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
STAGING_B2_REGION=us-west-004
STAGING_ENABLE_B2_MIGRATION=false
STAGING_B2_MIGRATION_PERCENTAGE=0
STAGING_STORAGE_PROVIDER=firebase

# Production Environment
PROD_B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
PROD_B2_REGION=us-west-004
PROD_ENABLE_B2_MIGRATION=false
PROD_B2_MIGRATION_PERCENTAGE=0
PROD_STORAGE_PROVIDER=firebase

# Repository Variables
ENABLE_B2_TESTS=true
```

## Local Development

For local development, create a `.env.local` file:

```bash
# B2 Configuration
B2_CONFIG={"keyId":"your-key","applicationKey":"your-key","bucketName":"dynastylocal"}
B2_BASE_BUCKET=dynastylocal
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004

# Storage Configuration
STORAGE_PROVIDER=firebase
ENABLE_B2_MIGRATION=false
B2_MIGRATION_PERCENTAGE=0
ENABLE_B2_TESTS=true

# Emulator Configuration
FUNCTIONS_EMULATOR=true
```

## Firebase Functions Configuration

B2 configuration is deployed using Firebase Secrets Manager:

```bash
# Deploy B2 configuration
cd apps/firebase/functions
./scripts/deploy-b2-production.sh
```

This sets:
- `B2_CONFIG` as Firebase Secret
- `B2_BASE_BUCKET` as Firebase Secret
- Environment configuration as Firebase Config

## Vercel Configuration

For the web application, no B2-specific environment variables are needed in Vercel as the web app communicates with Firebase Functions for storage operations.

## Security Best Practices

### 1. Credential Management
- Store B2 credentials as encrypted secrets only
- Never commit credentials to version control
- Use separate credentials for staging and production
- Rotate credentials regularly (every 90 days)

### 2. Bucket Configuration
- Use separate buckets for each environment
- Configure bucket-level access policies
- Enable versioning for critical data
- Set up lifecycle rules for cost optimization

### 3. Access Control
- Use application keys with minimal required permissions
- Monitor B2 access logs regularly
- Set up alerting for unusual access patterns
- Use CORS policies to restrict web access

### 4. Cost Management
- Monitor B2 usage through Backblaze dashboard
- Set up billing alerts
- Implement lifecycle policies
- Consider using B2 storage classes appropriately

## Deployment Scripts

Use the provided scripts for environment setup:

```bash
# Set up GitHub secrets
./scripts/setup-b2-github-secrets.sh

# Deploy B2 configuration to Firebase
cd apps/firebase/functions
./scripts/deploy-b2-production.sh

# Test B2 deployment
gh workflow run b2-deployment-test.yml
```

## Monitoring and Debugging

### B2 Monitoring Dashboard
The Dynasty web app includes a B2 monitoring dashboard at `/admin/b2-monitoring` that shows:
- Upload/download success rates
- Performance metrics
- Error tracking
- Migration progress
- Cost analysis

### Logs and Debugging
- Firebase Functions logs show B2 operations
- Use `ENABLE_B2_TESTS=true` for detailed testing
- Monitor Backblaze B2 dashboard for API usage
- Check GitHub Actions logs for deployment issues

## Migration Strategy

### Phase 1: Setup (Current)
- Deploy B2 configuration
- Set `STORAGE_PROVIDER=firebase`
- Set `ENABLE_B2_MIGRATION=false`

### Phase 2: Testing
- Set `ENABLE_B2_TESTS=true`
- Run B2 deployment tests
- Verify connectivity and operations

### Phase 3: Gradual Migration
- Set `ENABLE_B2_MIGRATION=true`
- Start with `B2_MIGRATION_PERCENTAGE=5`
- Gradually increase percentage
- Monitor performance and costs

### Phase 4: Full Migration
- Set `B2_MIGRATION_PERCENTAGE=100`
- Update `STORAGE_PROVIDER=b2`
- Migrate existing files
- Disable fallback providers

## Troubleshooting

### Common Issues

1. **Invalid B2 Configuration**
   - Verify JSON format in `B2_CONFIG`
   - Check key permissions in B2 dashboard
   - Ensure bucket exists and is accessible

2. **Connection Errors**
   - Verify endpoint URL
   - Check region configuration
   - Test network connectivity

3. **Upload Failures**
   - Check file size limits
   - Verify CORS configuration
   - Monitor B2 rate limits

4. **Migration Issues**
   - Check migration percentage
   - Verify fallback providers
   - Monitor error logs

### Support Resources
- [Backblaze B2 Documentation](https://www.backblaze.com/b2/docs/)
- [AWS SDK S3 Client Documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
- Dynasty B2 Monitoring Dashboard
- Firebase Functions logs