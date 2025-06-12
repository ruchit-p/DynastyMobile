# GitHub Secrets Setup Guide for Dynasty Mobile

This document lists all the GitHub secrets that need to be configured for the Dynasty Mobile project's CI/CD pipelines.

## Recent Migration Updates

**Important**: This guide reflects recent service migrations:

- **Email Service**: Migrated from SendGrid to AWS SES (January 2025)
- **Storage Service**: Migrated from Cloudflare R2 to Backblaze B2 (January 2025)  
- **Device Fingerprinting**: Removed FingerprintJS dependency - now uses native device properties (January 2025)

If you have existing secrets from previous services, they can be removed from your GitHub repository settings.

## Repository Secrets Required

### 1. Firebase Configuration

#### Production Firebase Secrets
- `PROD_FIREBASE_API_KEY` - Firebase API key for production
- `PROD_FIREBASE_AUTH_DOMAIN` - Firebase Auth domain (e.g., dynasty-prod.firebaseapp.com)
- `PROD_FIREBASE_PROJECT_ID` - Firebase project ID for production
- `PROD_FIREBASE_STORAGE_BUCKET` - Firebase storage bucket (e.g., dynasty-prod.appspot.com)
- `PROD_FIREBASE_MESSAGING_SENDER_ID` - Firebase messaging sender ID
- `PROD_FIREBASE_APP_ID` - Firebase app ID
- `PROD_FIREBASE_CONFIG` - Complete Firebase config JSON
- `FIREBASE_TOKEN` - Firebase CI token for deployments (run `firebase login:ci`)

#### Staging Firebase Secrets
- `STAGING_FIREBASE_API_KEY` - Firebase API key for staging
- `STAGING_FIREBASE_AUTH_DOMAIN` - Firebase Auth domain for staging
- `STAGING_FIREBASE_PROJECT_ID` - Firebase project ID for staging
- `STAGING_FIREBASE_STORAGE_BUCKET` - Firebase storage bucket for staging
- `STAGING_FIREBASE_MESSAGING_SENDER_ID` - Firebase messaging sender ID for staging
- `STAGING_FIREBASE_APP_ID` - Firebase app ID for staging

### 2. Firebase Functions Secrets

#### Core Security Keys (Production)
- `PROD_JWT_SECRET_KEY` - JWT signing key (256-bit)
- `PROD_ENCRYPTION_MASTER_KEY` - Master encryption key (256-bit)
- `PROD_SESSION_SECRET` - Session management secret (256-bit)
- `PROD_API_KEY_SALT` - API key hashing salt (128-bit)
- `PROD_WEBHOOK_SECRET` - Webhook validation secret (256-bit)
- `PROD_DB_ENCRYPTION_KEY` - Database encryption key (256-bit)

#### Core Security Keys (Staging)
- `STAGING_JWT_SECRET_KEY` - JWT signing key for staging
- `STAGING_ENCRYPTION_MASTER_KEY` - Master encryption key for staging
- `STAGING_SESSION_SECRET` - Session management secret for staging
- `STAGING_API_KEY_SALT` - API key hashing salt for staging
- `STAGING_WEBHOOK_SECRET` - Webhook validation secret for staging
- `STAGING_DB_ENCRYPTION_KEY` - Database encryption key for staging

### 3. External Service APIs

#### AWS SES (Email Service)
- `PROD_SES_CONFIG` - AWS SES configuration JSON for production
- `STAGING_SES_CONFIG` - AWS SES configuration JSON for staging
- `SES_REGION` - AWS region for SES (e.g., us-east-1)
- `SES_FROM_EMAIL` - Verified sender email (e.g., noreply@mydynastyapp.com)
- `SES_FROM_NAME` - Email sender display name (e.g., Dynasty)

#### Backblaze B2 (Storage)
- `PROD_B2_APPLICATION_KEY_ID` - B2 application key ID for production
- `PROD_B2_APPLICATION_KEY` - B2 application key for production
- `PROD_B2_BUCKET_ID` - B2 bucket ID for production
- `STAGING_B2_APPLICATION_KEY_ID` - B2 application key ID for staging
- `STAGING_B2_APPLICATION_KEY` - B2 application key for staging
- `STAGING_B2_BUCKET_ID` - B2 bucket ID for staging

#### Twilio (SMS Service)
- `PROD_TWILIO_ACCOUNT_SID` - Twilio account SID for production
- `PROD_TWILIO_AUTH_TOKEN` - Twilio auth token for production
- `PROD_TWILIO_PHONE_NUMBER` - Twilio phone number for production
- `STAGING_TWILIO_ACCOUNT_SID` - Twilio account SID for staging
- `STAGING_TWILIO_AUTH_TOKEN` - Twilio auth token for staging
- `STAGING_TWILIO_PHONE_NUMBER` - Twilio phone number for staging

#### Stripe (Payment Processing)
- `PROD_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key for production
- `PROD_STRIPE_SECRET_KEY` - Stripe secret key for production
- `PROD_STRIPE_WEBHOOK_SECRET` - Stripe webhook secret for production
- `STAGING_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key for staging
- `STAGING_STRIPE_SECRET_KEY` - Stripe secret key for staging
- `STAGING_STRIPE_WEBHOOK_SECRET` - Stripe webhook secret for staging

#### Google Services
- `PROD_GOOGLE_PLACES_API_KEY` - Google Places API key for production
- `STAGING_GOOGLE_PLACES_API_KEY` - Google Places API key for staging

### 4. Deployment Platform Secrets

#### Vercel (Web Deployment)
- `VERCEL_TOKEN` - Vercel deployment token
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID

#### Cloudflare (CDN/DNS)
- `CLOUDFLARE_ZONE_ID` - Cloudflare zone ID for mydynastyapp.com
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with cache purge permissions

#### Sentry (Error Monitoring)
- `SENTRY_AUTH_TOKEN` - Sentry authentication token
- `SENTRY_ORG` - Sentry organization slug
- `SENTRY_PROJECT` - Sentry project slug
- `PROD_SENTRY_DSN` - Sentry DSN for production
- `STAGING_SENTRY_DSN` - Sentry DSN for staging

### 5. Mobile App Secrets

#### EAS Build (Expo)
- `EXPO_TOKEN` - Expo access token for EAS builds
- `EAS_PROJECT_ID` - EAS project ID

#### App Signing (iOS)
- `IOS_DISTRIBUTION_CERTIFICATE` - Base64 encoded .p12 certificate
- `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` - Certificate password
- `IOS_PROVISIONING_PROFILE` - Base64 encoded provisioning profile

#### App Signing (Android)
- `ANDROID_KEYSTORE` - Base64 encoded keystore file
- `ANDROID_KEYSTORE_PASSWORD` - Keystore password
- `ANDROID_KEY_ALIAS` - Key alias
- `ANDROID_KEY_PASSWORD` - Key password

### 6. Environment URLs

- `PROD_FRONTEND_URL` - Production web URL (https://mydynastyapp.com)
- `STAGING_FRONTEND_URL` - Staging web URL (https://dynastytest.com)

## How to Generate Secrets

### 1. Generate Security Keys

Use the provided script to generate all security keys:

```bash
cd apps/firebase/functions
./scripts/generate-all-secrets.sh
```

This will output all the security keys that need to be added to GitHub Secrets.

### 2. Add Secrets to GitHub

1. Go to your repository settings
2. Navigate to Secrets and variables → Actions
3. Click "New repository secret"
4. Add each secret with its corresponding value

### 3. Environment-specific Configuration

Create environment-specific secrets for staging and production:

```bash
# For staging
cp .env.staging.template .env.staging
# Fill in external service keys

# For production
cp .env.production.template .env.production
# Fill in external service keys
```

## Secret Organization Best Practices

1. **Naming Convention**: Use prefixes to organize secrets:
   - `PROD_*` for production-only secrets
   - `STAGING_*` for staging-only secrets
   - No prefix for shared secrets

2. **Security Levels**:
   - **Critical**: Security keys, encryption keys, auth tokens
   - **High**: API keys with write access
   - **Medium**: API keys with read-only access
   - **Low**: Public keys, non-sensitive config

3. **Rotation Schedule**:
   - Security keys: Every 90 days
   - API keys: Follow provider recommendations
   - Certificates: Before expiration

4. **Access Control**:
   - Limit secret access to necessary workflows only
   - Use environment protection rules for production secrets
   - Require approval for production deployments

## Verification Checklist

- [ ] All Firebase configuration secrets added
- [ ] Security keys generated and added
- [ ] AWS SES configured with templates
- [ ] Backblaze B2 credentials configured
- [ ] Twilio SMS service configured
- [ ] Stripe payment processing configured
- [ ] Google Places API configured
- [ ] Vercel deployment token configured
- [ ] Sentry integration configured
- [ ] Mobile app signing credentials added
- [ ] Environment URLs configured
- [ ] GitHub Actions workflows can access secrets
- [ ] Production environment protection enabled
- [ ] Staging environment configured

## Environment-specific Notes

### Production Environment
- Uses manual approval for deployments
- Requires all tests to pass
- Automatic cache purging after deployment
- Health checks after deployment

### Staging Environment
- Automatic deployment on push to `staging` branch
- Runs integration tests
- Uses separate Firebase project
- Separate B2 bucket for isolation

## Secret Security Guidelines

1. **Never commit secrets to the repository**
2. **Use GitHub's secret scanning alerts**
3. **Rotate secrets regularly**
4. **Use least-privilege access for API keys**
5. **Monitor secret usage in GitHub Actions logs**
6. **Document secret purposes and rotation schedules**

## Support

For issues with secret configuration:
1. Check GitHub Actions logs for specific error messages
2. Verify secret names match exactly (case-sensitive)
3. Ensure secrets are available to the workflow environment
4. Test API keys manually before adding to GitHub