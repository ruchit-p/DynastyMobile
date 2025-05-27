# Firebase Functions Environment Variables Checklist

## Required Secrets (Firebase Secret Manager)

These must be set using Firebase CLI or Console:

### 1. **SENDGRID_CONFIG** (Required)
```json
{
  "apiKey": "SG.xxxxxxxxxxxx",
  "fromEmail": "noreply@mydynastyapp.com",
  "fromName": "Dynasty App",
  "templates": {
    "verification": "d-xxxxxx",
    "passwordReset": "d-xxxxxx",
    "invite": "d-xxxxxx"
  }
}
```

### 2. **FRONTEND_URL** (Required)
- Production: `https://mydynastyapp.com`
- Development: `http://localhost:3000`

### 3. **FINGERPRINT_SERVER_API_KEY** (Required)
- Your FingerprintJS Pro Server API key

### 4. **R2_CONFIG** (Required for R2 Storage)
```json
{
  "accountId": "your_cloudflare_account_id",
  "accessKeyId": "your_r2_access_key",
  "secretAccessKey": "your_r2_secret_key"
}
```

### 5. **GOOGLE_PLACES_API_KEY** (Required)
- Your Google Places API key

## Environment Variables (.env files)

### Production Environment Variables

```bash
# Node Environment
NODE_ENV=production

# R2 Storage Configuration
R2_BASE_BUCKET=dynasty
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
STORAGE_PROVIDER=r2  # or 'firebase' for Firebase Storage
ENABLE_R2_MIGRATION=true
R2_MIGRATION_PERCENTAGE=100  # 0-100

# CDN Configuration
CDN_BASE_URL=https://cdn.mydynastyapp.com
ENABLE_CDN=true

# CORS Configuration
ALLOWED_ORIGINS=https://mydynastyapp.com,https://www.mydynastyapp.com,https://app.mydynastyapp.com

# Feature Flags
ENABLE_R2_TESTS=false
```

## How to Set Secrets

### Using Firebase CLI:
```bash
# Set individual secrets
firebase functions:secrets:set SENDGRID_CONFIG
firebase functions:secrets:set FRONTEND_URL
firebase functions:secrets:set FINGERPRINT_SERVER_API_KEY
firebase functions:secrets:set R2_CONFIG
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

1. **SENDGRID_CONFIG** replaces the old individual SendGrid secrets (SENDGRID_APIKEY, SENDGRID_FROMEMAIL, etc.)
2. **R2_CONFIG** bundles all R2 credentials for security
3. Environment variables in .env files are for non-sensitive configuration
4. Secrets in Firebase Secret Manager are for sensitive data like API keys
5. The `CSRF_SECRET_KEY` mentioned in the example is not currently used in the code

## Migration Notes

The code in `familyTree.ts` still uses old individual SendGrid secrets. This should be updated to use the bundled `SENDGRID_CONFIG`.