# Production Environment Variables for Dynasty Web

This document lists all required environment variables for production deployment on Vercel.

## Critical Environment Variables

### 1. Firebase Configuration (Required)
These are needed to connect to your Firebase project:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id  # Optional, for analytics
NEXT_PUBLIC_ENVIRONMENT=production
```

### 2. Rate Limiting with Upstash (Highly Recommended)
Without these, rate limiting will be disabled:

```bash
UPSTASH_REDIS_REST_URL=https://your-redis-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-token
```

### 3. Sentry Error Monitoring (Required)
Already configured in the project, but verify these are set:

```bash
SENTRY_AUTH_TOKEN=your-sentry-auth-token
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
SENTRY_ORG=mydynastyapp
SENTRY_PROJECT=dynasty
```

### 4. Google Maps API (Required for Location Features)
```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

### 5. FingerprintJS (Required for Security)
```bash
NEXT_PUBLIC_FINGERPRINT_API_KEY=your-fingerprint-api-key
NEXT_PUBLIC_FINGERPRINT_SUBDOMAIN=your-subdomain
```

### 6. Cookie Consent (Optional)
```bash
NEXT_PUBLIC_COOKIE_CONSENT_ENABLED=true
```

## Setting Up Environment Variables in Vercel

1. **Go to your Vercel project dashboard**
2. **Navigate to Settings → Environment Variables**
3. **Add each variable for Production environment**

### Quick Setup Script
You can use this script to set multiple variables at once using Vercel CLI:

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Set environment variables
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN production
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production
vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET production
vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID production
vercel env add NEXT_PUBLIC_FIREBASE_APP_ID production
vercel env add NEXT_PUBLIC_ENVIRONMENT production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel env add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY production
vercel env add NEXT_PUBLIC_FINGERPRINT_API_KEY production
vercel env add NEXT_PUBLIC_FINGERPRINT_SUBDOMAIN production
```

## Getting Required Values

### Firebase Configuration
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click on Project Settings (gear icon)
4. Under "Your apps", find your web app
5. Copy the configuration values

### Upstash Redis (for Rate Limiting)
1. Sign up at [Upstash](https://upstash.com)
2. Create a new Redis database
3. Select "Global" for best performance
4. Copy the REST URL and token from the dashboard

### Sentry
1. Go to [Sentry](https://sentry.io)
2. Create a new project or use existing
3. Get the DSN from Project Settings → Client Keys
4. Generate an auth token from Settings → Auth Tokens

### Google Maps API
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable Maps JavaScript API
3. Create an API key
4. Restrict the key to your domain (mydynastyapp.com)

### FingerprintJS
1. Sign up at [FingerprintJS](https://fingerprint.com)
2. Create a new subscription
3. Get your API key and subdomain

## Verification Checklist

Before deploying to production, ensure:

- [ ] All Firebase environment variables are set
- [ ] Upstash Redis is configured (or accept no rate limiting)
- [ ] Sentry DSN is configured
- [ ] Google Maps API key is set and restricted
- [ ] FingerprintJS is configured
- [ ] NEXT_PUBLIC_ENVIRONMENT is set to "production"

## Local Testing

Create a `.env.local` file in the web app directory to test locally:

```bash
# Copy .env.example to .env.local
cp .env.example .env.local

# Edit .env.local with your values
```

## Security Notes

1. **Never commit `.env.local` or any file with real credentials**
2. **Use Vercel's environment variables for production**
3. **Restrict API keys to your domain when possible**
4. **Rotate credentials regularly**
5. **Use separate Firebase projects for development and production**

## Troubleshooting

### Rate Limiting Not Working
- Verify UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set
- Check Upstash dashboard for connection logs
- Rate limiting is disabled in development mode

### Firebase Connection Issues
- Verify all Firebase config values match your project
- Check Firebase project permissions
- Ensure authentication methods are enabled in Firebase

### CSP Errors in Console
- The middleware automatically handles CSP headers
- Check browser console for specific CSP violations
- Production CSP is stricter than development