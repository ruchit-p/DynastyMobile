# Firebase Functions Environment Variables Checklist

## Required Secrets (Firebase Secret Manager)

These must be set using Firebase CLI or Console:

### 1. **EMAIL_PROVIDER** (Required)
- Set to: `ses` (AWS SES is the only supported provider)

### 2. **SES_CONFIG** (Required)
```json
{
  "region": "us-east-1",
  "fromEmail": "noreply@mydynastyapp.com",
  "fromName": "Dynasty App",
  "replyToEmail": "support@mydynastyapp.com"
}
```

### 3. **FRONTEND_URL** (Required)
- Production: `https://mydynastyapp.com`
- Staging: `https://dynastytest.com`
- Development: `http://localhost:3000`

### 4. **B2_CONFIG** (Required for Backblaze B2 Storage)
```json
{
  "applicationKeyId": "your_b2_application_key_id",
  "applicationKey": "your_b2_application_key",
  "bucketId": "your_default_bucket_id",
  "bucketName": "dynastyprod"
}
```

### 5. **GOOGLE_PLACES_API_KEY** (Required)
- Your Google Places API key

## Environment Variables (.env files)

### Production Environment Variables

```bash
# Node Environment
NODE_ENV=production

# B2 Storage Configuration
B2_BASE_BUCKET=dynasty
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
STORAGE_PROVIDER=b2  # or 'firebase' for Firebase Storage
ENABLE_B2_MIGRATION=true
B2_MIGRATION_PERCENTAGE=100  # 0-100

# CDN Configuration
CDN_BASE_URL=https://cdn.mydynastyapp.com
ENABLE_CDN=true

# CORS Configuration
ALLOWED_ORIGINS=https://mydynastyapp.com,https://www.mydynastyapp.com,https://app.mydynastyapp.com,https://dynastytest.com,https://www.dynastytest.com

# Feature Flags
ENABLE_B2_TESTS=false
```

## How to Set Secrets

### Using Firebase CLI:
```bash
# Set individual secrets
firebase functions:secrets:set EMAIL_PROVIDER
firebase functions:secrets:set SES_CONFIG
firebase functions:secrets:set FRONTEND_URL
firebase functions:secrets:set B2_CONFIG
firebase functions:secrets:set GOOGLE_PLACES_API_KEY

# View all secrets
firebase functions:secrets:list

# Access in specific environments
firebase functions:secrets:set FRONTEND_URL --project production
```

### Using Firebase Console:
1. Go to Firebase Console > Functions
2. Click on "Secret Manager" or "Configuration"
3. Add each secret with its value

## Current Status Check

Run this command to see which secrets are already configured:
```bash
firebase functions:secrets:list
```

## Notes

1. **EMAIL_PROVIDER** must be set to "ses" - SendGrid is no longer supported
2. **SES_CONFIG** contains AWS SES configuration (IAM role used in production)
3. **B2_CONFIG** bundles all Backblaze B2 credentials for security
4. Environment variables in .env files are for non-sensitive configuration
5. Secrets in Firebase Secret Manager are for sensitive data like API keys
6. FingerprintJS has been completely removed - no API key needed

## Deprecated Services

- **SendGrid**: Migrated to AWS SES (January 2025)
- **FingerprintJS**: Removed completely (January 2025)
- **Cloudflare R2**: Transitioning to Backblaze B2 (January 2025)