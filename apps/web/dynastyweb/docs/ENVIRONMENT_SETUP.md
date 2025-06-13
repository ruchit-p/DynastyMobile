# Firebase Environment Setup Guide

## Overview
This document outlines the setup and usage of development and production environments for the Dynasty web application. The system uses Firebase Emulators for local development and real Firebase services for production.

## Table of Contents
- [Environment Configuration](#environment-configuration)
- [Development Environment](#development-environment)
- [Production Environment](#production-environment)
- [Firebase Emulators](#firebase-emulators)
- [Available Scripts](#available-scripts)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Environment Configuration

### Development (.env.development)
```env
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
# Firebase Development Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your-dev-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-dev-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=dynasty-eba63
# ... additional configuration
```

### Production (.env.production)
```env
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false
# Firebase Production Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your-prod-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-prod-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=dynasty-eba63
# ... additional configuration
```

### Vercel KV Configuration
```env
# Vercel KV Store (for caching)
KV_URL=your-kv-url
KV_REST_API_URL=your-kv-rest-api-url
KV_REST_API_TOKEN=your-kv-rest-api-token
KV_REST_API_READ_ONLY_TOKEN=your-kv-rest-api-read-only-token

# Admin API Key (for cache invalidation)
ADMIN_API_KEY=your-secure-admin-key
```

## Development Environment

### Setup
1. Create a local environment file:
   ```bash
   cp .env.development .env.local
   ```

2. Update `.env.local` with your Firebase development configuration

3. Start the development environment:
   ```bash
   npm run dev:emulator
   ```

### Features
- Local Firebase emulators for:
  - Authentication (Port: 9099)
  - Firestore (Port: 8080)
  - Storage (Port: 9199)
  - Functions (Port: 5001)
- Automatic data persistence between sessions
- Hot reloading with Next.js development server
- Emulator UI available at http://127.0.0.1:4000

## Production Environment

### Setup
1. Ensure `.env.production` is configured with production Firebase credentials
2. Build the application:
   ```bash
   npm run build
   ```
3. Start the production server:
   ```bash
   npm run start
   ```

### Features
- Connects to real Firebase services
- Production-optimized build
- No emulator connections
- Analytics enabled

## Firebase Emulators

### Available Emulators
- **Authentication**: User authentication and management
  - Port: 9099
  - URL: http://127.0.0.1:9099

- **Firestore**: Database emulation
  - Port: 8080
  - URL: http://127.0.0.1:8080

- **Storage**: File storage emulation
  - Port: 9199
  - URL: http://127.0.0.1:9199

- **Functions**: Cloud Functions emulation
  - Port: 5001
  - URL: http://127.0.0.1:5001

### Data Persistence
- Emulator data is automatically saved to `./emulator-data/`
- Data is imported on startup and exported on shutdown
- Manual export available via `npm run emulator:export`

## Available Scripts

### Development
- `npm run dev`: Start Next.js development server
- `npm run dev:emulator`: Start emulators and development server
- `npm run emulator:start`: Start emulators only
- `npm run emulator:export`: Export emulator data

### Production
- `npm run build`: Create production build
- `npm run start`: Start production server
- `npm run lint`: Run linting checks

## Best Practices

### Version Control
- Add `.env.local`, `.env.development`, and `.env.production` to `.gitignore`
- Maintain an `.env.example` file in version control
- Never commit actual Firebase credentials

### Development Workflow
1. Always use emulators for local development
2. Export emulator data regularly
3. Test thoroughly in emulators before deploying
4. Use different Firebase projects for development and production

### Security
- Keep production credentials secure
- Don't share development credentials unnecessarily
- Regularly rotate API keys
- Use appropriate Firebase security rules

## Troubleshooting

### Common Issues

1. **Emulators Won't Start**
   ```bash
   # Check if ports are in use
   lsof -i :9099  # Auth
   lsof -i :8080  # Firestore
   lsof -i :9199  # Storage
   lsof -i :5001  # Functions
   ```

2. **Firebase Connection Issues**
   - Verify environment variables are set correctly
   - Check console for connection errors
   - Ensure emulators are running (for development)

3. **Data Persistence Issues**
   - Check write permissions for `./emulator-data/`
   - Verify emulator shutdown was clean
   - Try clearing emulator data and starting fresh

### Debug Mode
Enable debug logging in Firebase by adding to your code:
```javascript
if (process.env.NODE_ENV === 'development') {
  console.log('Firebase Config:', firebaseConfig);
  console.log('Emulator Mode:', process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR);
}
```

## Firebase Configuration

### Service Integration
The application automatically connects to the appropriate Firebase services based on the environment:

```typescript
// src/lib/firebase.ts
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
```

### Analytics
Analytics is only enabled in production and when supported by the browser:
```typescript
let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}
```

## Vercel KV Optimizations

### Overview
The application implements Vercel KV caching to reduce Firebase calls by up to 90%, improving performance and reducing costs.

### Cached Endpoints

1. **Authentication Check** (`/api/auth/check`)
   - Caches ID token validation for 5 minutes
   - Reduces Firebase Auth verification calls
   - Automatic session validation every 5 minutes

2. **Public Feed Preview** (`/api/public/feed-preview`)
   - Caches public content for 5 minutes
   - Supports pagination caching
   - Serves stale cache on errors

3. **App Configuration** (`/api/config`)
   - Caches app configuration for 1 hour
   - Includes feature flags, limits, and settings
   - Admin endpoint for manual cache refresh

### Setup Instructions

1. **Create Vercel KV Store**
   ```bash
   # In your Vercel dashboard:
   # 1. Go to Storage tab
   # 2. Create new KV store
   # 3. Copy environment variables
   ```

2. **Add Environment Variables**
   Add the following to your Vercel project or `.env.local`:
   ```env
   KV_URL=<your-kv-url>
   KV_REST_API_URL=<your-kv-rest-api-url>
   KV_REST_API_TOKEN=<your-kv-rest-api-token>
   KV_REST_API_READ_ONLY_TOKEN=<your-kv-rest-api-read-only-token>
   ```

3. **Generate Admin API Key**
   ```bash
   # Generate secure random key
   openssl rand -base64 32
   ```
   Add to environment:
   ```env
   ADMIN_API_KEY=<generated-key>
   ```

### Cache Monitoring

Monitor cache performance in your application:
- Check browser console for cache hit/miss logs
- Monitor Vercel KV dashboard for usage
- Track Firebase usage reduction in Firebase Console

### Cost Optimization

Expected savings with caching:
- **Auth Checks**: 90% reduction in Firebase Auth calls
- **Public Content**: 95% reduction for repeat visitors
- **Configuration**: 99% reduction (hourly cache)

Example monthly savings:
- Before: 200M reads = $720/month
- After: 20M reads = $72/month
- **Savings: $648/month (90% reduction)** 