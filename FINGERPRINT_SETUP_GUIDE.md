# FingerprintJS API Key Setup Guide

This guide explains how to properly configure FingerprintJS API keys across all three platforms in the Dynasty app.

## Overview

FingerprintJS Pro is used for device fingerprinting and trust scoring across:

- **Firebase Functions** (Backend) - Server API Key
- **Mobile App** (React Native) - Public API Key
- **Web App** (Next.js) - Public API Key

## Current Configuration Status

### ✅ Firebase Functions - Properly Configured

- Uses `FINGERPRINT_SERVER_API_KEY` in Firebase Secret Manager
- Configured via: `apps/firebase/functions/scripts/setup-fingerprint-secrets.sh`

### ✅ GitHub CI/CD - Secrets Available

- `PROD_FINGERPRINT_API_KEY` - Production public API key
- `STAGING_FINGERPRINT_API_KEY` - Staging public API key
- Now properly passed to builds in workflows

### ✅ Deployment Workflows - Fixed

- Web app builds now receive FingerprintJS environment variables
- Mobile app builds now receive FingerprintJS environment variables

### ⚠️ Local Development - Needs Setup

- Requires manual `.env` file creation for local development

## Setup Instructions

### 1. Get FingerprintJS Pro API Keys

1. Sign up at [FingerprintJS Pro](https://fingerprintjs.com)
2. Create a new application
3. Note your:
   - **Public API Key** (for client-side apps)
   - **Server API Key** (for backend verification)

### 2. Configure Firebase Functions (Already Done)

The server API key is already configured in Firebase Secret Manager:

```bash
cd apps/firebase/functions
./scripts/setup-fingerprint-secrets.sh
```

### 3. Configure Local Development

#### Mobile App Setup

```bash
cd apps/mobile
cp .env.example .env
```

Edit `.env` and add your FingerprintJS public API key:

```env
EXPO_PUBLIC_FINGERPRINT_API_KEY=your-actual-public-api-key
EXPO_PUBLIC_FINGERPRINT_ENDPOINT=https://api.fpjs.io
EXPO_PUBLIC_FINGERPRINT_REGION=global
```

#### Web App Setup

```bash
cd apps/web/dynastyweb
cp .env.example .env.local
```

Edit `.env.local` and add your FingerprintJS public API key:

```env
NEXT_PUBLIC_FINGERPRINT_API_KEY=your-actual-public-api-key
NEXT_PUBLIC_FINGERPRINT_ENDPOINT=https://api.fpjs.io
NEXT_PUBLIC_FINGERPRINT_REGION=global
```

### 4. Verify Configuration

#### Test Mobile App

```bash
cd apps/mobile
npm start
# Check console for "FingerprintService: Initialized successfully"
```

#### Test Web App

```bash
cd apps/web/dynastyweb
npm run dev
# Check browser console for FingerprintJS initialization
```

#### Test Firebase Functions

```bash
cd apps/firebase/functions
npm test
# Should pass device fingerprinting tests
```

## Environment Variables Reference

### Mobile App (`apps/mobile/.env`)

```env
EXPO_PUBLIC_FINGERPRINT_API_KEY=pk_test_...
EXPO_PUBLIC_FINGERPRINT_ENDPOINT=https://api.fpjs.io
EXPO_PUBLIC_FINGERPRINT_REGION=global
```

### Web App (`apps/web/dynastyweb/.env.local`)

```env
NEXT_PUBLIC_FINGERPRINT_API_KEY=pk_test_...
NEXT_PUBLIC_FINGERPRINT_ENDPOINT=https://api.fpjs.io
NEXT_PUBLIC_FINGERPRINT_REGION=global
```

### Firebase Functions (Secret Manager)

```
FINGERPRINT_SERVER_API_KEY=sk_test_...
```

### GitHub Secrets (CI/CD)

```
PROD_FINGERPRINT_API_KEY=pk_prod_...
STAGING_FINGERPRINT_API_KEY=pk_test_...
```

## Troubleshooting

### "FingerprintJS API key not configured"

- Check that environment variables are set correctly
- Verify API key format (should start with `pk_`)
- Ensure no extra spaces or quotes in the key

### "Failed to initialize FingerprintJS"

- Check network connectivity
- Verify API key is valid and active
- Check FingerprintJS dashboard for usage limits

### Local Development Not Working

- Ensure `.env` files exist and are not in `.gitignore`
- Restart development server after adding environment variables
- Check that variable names match exactly (case-sensitive)

### Production Builds Failing

- Verify GitHub secrets are set correctly
- Check workflow logs for environment variable issues
- Ensure secret names match workflow references

## Security Notes

1. **Never commit API keys to git**
2. **Use different keys for staging/production**
3. **Rotate keys regularly**
4. **Monitor usage in FingerprintJS dashboard**
5. **Set up domain restrictions in FingerprintJS console**

## Testing Device Fingerprinting

### Mobile App

- Navigate to Settings → Trusted Devices
- Should show current device with trust score
- Check device fingerprint in logs

### Web App

- Visit `/test-fingerprint` (if available)
- Check browser console for fingerprint data
- Test device trust scoring

### Backend

- Check Firebase Functions logs
- Verify device verification calls
- Monitor trust score calculations

## Support

For issues with FingerprintJS configuration:

1. Check this guide first
2. Review error messages in console/logs
3. Verify API keys in FingerprintJS dashboard
4. Test with minimal configuration first
