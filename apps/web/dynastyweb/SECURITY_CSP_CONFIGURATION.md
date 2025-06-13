# Security CSP Configuration for Firebase Functions

## Overview
This document outlines the secure Content Security Policy (CSP) configuration for Firebase Functions connections, replacing the previous overly permissive wildcard `*.cloudfunctions.net` with environment-specific allowlists.

## Security Issues Addressed

### Previous Configuration (INSECURE)
```javascript
"connect-src ... https://*.cloudfunctions.net ..."
```
**Risk**: Allowed connections to ANY Firebase project globally, creating potential attack vectors.

### Current Configuration (SECURE)
Environment-specific function URLs based on project IDs and regions.

## Environment Configuration

### Production
- **Project ID**: `dynasty-prod` (to be configured)
- **Region**: `us-central1`
- **Functions URL**: `https://us-central1-dynasty-prod.cloudfunctions.net`
- **Domain**: `mydynastyapp.com`

### Staging  
- **Project ID**: `dynasty-dev-1b042`
- **Region**: `us-central1`
- **Functions URL**: `https://us-central1-dynasty-dev-1b042.cloudfunctions.net`
- **Domain**: `dynastytest.com`

### Development
- **Project ID**: `dynasty-eba63`
- **Region**: `us-central1`
- **Functions URL**: `https://us-central1-dynasty-eba63.cloudfunctions.net`
- **Local Emulator**: `http://127.0.0.1:5001`

## Implementation Details

### Files Modified
1. `/apps/web/dynastyweb/next.config.js` - Production and vault-specific CSP headers
2. `/apps/web/dynastyweb/middleware.ts` - Runtime CSP configuration  
3. `/apps/firebase/.firebaserc` - Firebase project aliases

### CSP Directives Updated
```javascript
// Production (middleware.ts)
"connect-src 'self' ... https://us-central1-dynasty-prod.cloudfunctions.net ..."

// Development (next.config.js)  
"connect-src 'self' ... https://us-central1-dynasty-eba63.cloudfunctions.net https://us-central1-dynasty-dev-1b042.cloudfunctions.net ..."
```

## Production Setup Required

### 1. Firebase Project Configuration
The production Firebase project `dynasty-prod` needs to be created and configured:

```bash
# Create production project (Firebase Console)
# Update GitHub secrets with production project details:
# - PROD_FIREBASE_PROJECT_ID=dynasty-prod
# - PROD_FIREBASE_AUTH_DOMAIN=dynasty-prod.firebaseapp.com
# - PROD_FIREBASE_STORAGE_BUCKET=dynasty-prod.appspot.com
```

### 2. Environment Variables
Update production environment variables to use the correct project ID.

### 3. Deployment Verification
Test that all Firebase Functions work correctly with the new CSP restrictions.

## Security Benefits

1. **Restricted Attack Surface**: Only allows connections to Dynasty-owned Firebase projects
2. **Environment Isolation**: Different projects for dev/staging/production
3. **No Wildcard Exposure**: Eliminates risk of malicious project redirection
4. **Granular Control**: Easy to add/remove specific project access

## Monitoring & Maintenance

### CSP Violation Monitoring
Monitor for CSP violations that might indicate:
- Unauthorized function call attempts
- Missing project URLs in allowlist
- Need for new environment configurations

### Regular Security Review
- Quarterly review of allowed Firebase Functions URLs
- Verification that only active projects are in CSP allowlist
- Update CSP when projects are decommissioned

## Validation Commands

```bash
# Test development functions
curl -X POST https://dynasty-eba63-us-central1.cloudfunctions.net/healthCheck

# Test staging functions  
curl -X POST https://dynasty-dev-1b042-us-central1.cloudfunctions.net/healthCheck

# Test production functions (when configured)
curl -X POST https://dynasty-prod-us-central1.cloudfunctions.net/healthCheck
```

## Rollback Plan

If issues occur, temporarily allow the broader domain while fixing:

```javascript
// Emergency fallback (USE ONLY IF NECESSARY)
"connect-src 'self' ... https://*-us-central1.cloudfunctions.net ..."
```

**Note**: This is still more secure than `*.cloudfunctions.net` but should be temporary.