# Staging Environment Setup Guide

This guide explains how to set up a complete staging environment for Dynasty's Firebase Functions with separate secrets and configuration.

## Overview

The staging environment allows you to:
- Test new features before production deployment
- Use separate API keys and secrets from production
- Perform integration testing with external services

## Quick Setup

```bash
cd apps/firebase/functions

# 1. Generate staging secrets
./scripts/generate-staging-secrets.sh

# 2. Edit .env.staging with your staging API keys

# 3. Deploy to staging
./scripts/deploy-staging-secrets.sh

# 4. Verify configuration
./scripts/verify-staging-config.sh

# 5. Deploy functions
firebase deploy --only functions --project your-staging-project
```

## Staging vs Production

### Key Differences

| Aspect | Production | Staging |
|--------|------------|---------|
| **Security Keys** | Unique 256-bit keys | Different 256-bit keys |
| **SendGrid** | Production API key | Test/Staging API key |
| **Frontend URL** | https://mydynastyapp.com | https://dynastytest.com |
| **R2 Bucket** | dynastyprod | dynastydev |
| **Environment** | production | staging |

### Security Isolation

- **Separate Secrets**: Staging uses completely different security keys
- **API Key Isolation**: External services should use staging-specific keys
- **Data Separation**: Different databases and storage buckets
- **Access Control**: Staging should have restricted access

## Detailed Setup Steps

### 1. Generate Staging Secrets

```bash
./scripts/generate-staging-secrets.sh
```

This generates:
- JWT Secret Key (256-bit)
- Encryption Master Key (256-bit)
- Session Secret (256-bit)
- API Salt (128-bit)
- Webhook Secret (256-bit)
- Database Encryption Key (256-bit)

### 2. Configure External Services

Edit `.env.staging` to add your staging-specific API keys:

#### SendGrid (Email)
```bash
# Get a test API key from SendGrid
SENDGRID_CONFIG={"apiKey":"SG.staging-key-here","fromEmail":"staging-noreply@mydynastyapp.com","templates":{"verification":"d-xxx","passwordReset":"d-yyy","invite":"d-zzz"}}
```

#### FingerprintJS (Device Security)
```bash
# Use a staging/development key
FINGERPRINT_API_KEY=your-staging-fingerprint-key
```

#### Google Places API
```bash
# Can use same key with staging URL restrictions
GOOGLE_PLACES_API_KEY=your-staging-places-key
```

#### Cloudflare R2 (Storage)
```bash
# Create a separate staging bucket
R2_CONFIG={"accountId":"xxx","accessKeyId":"yyy","secretAccessKey":"zzz"}
R2_BASE_BUCKET=dynastydev
```

### 3. Deploy Configuration

```bash
# Optional: Set staging project
export FIREBASE_STAGING_PROJECT=dynasty-staging

# Deploy secrets
./scripts/deploy-staging-secrets.sh
```

### 4. Verify Deployment

```bash
./scripts/verify-staging-config.sh
```

Expected output:
```
✅ CONFIGURED: JWT Secret Key
✅ CONFIGURED: Encryption Master Key
✅ CONFIGURED: Session Secret
✅ CONFIGURED: Webhook Secret
✅ CONFIGURED: Database Encryption Key
✅ CONFIGURED: API Key Salt
```

### 5. Deploy Functions

```bash
# Deploy all functions
firebase deploy --only functions --project dynasty-staging

# Or deploy specific functions
firebase deploy --only functions:auth-handleSignUp --project dynasty-staging
```

## Testing in Staging


1. **Web Testing**:
   ```javascript
   // Staging frontend should point to staging functions
   const STAGING_API = 'https://us-central1-dynasty-staging.cloudfunctions.net';
   ```

2. **Mobile Testing**:
   ```javascript
   // Ensure User-Agent contains "ReactNative" or "Expo"
   ```

### External Service Testing

1. **SendGrid**: Use test email addresses
2. **FingerprintJS**: Monitor staging dashboard
3. **R2 Storage**: Check staging bucket
4. **Google Places**: Test with staging domain

## Best Practices

### 1. Environment Separation

- **Never mix secrets** between staging and production
- **Use different API keys** for external services
- **Separate databases** for staging data
- **Different storage buckets** for files

### 2. Access Control

- Limit staging access to development team
- Use Firebase Auth rules to restrict staging
- Monitor staging logs for unusual activity
- Regular security audits

### 3. Data Management

- Use test data in staging
- Regular data cleanup
- No real user data in staging
- Automated test data generation

### 4. Deployment Pipeline

```
Development → Staging → Production
    ↓           ↓          ↓
Local Tests  Integration  Live Users
```

## Troubleshooting

### Common Issues

1. **Missing Configuration**:
   ```bash
   # Check what's configured
   firebase functions:config:get --project dynasty-staging
   ```

2. **Wrong Environment**:
   ```bash
   # Verify env.node_env is "staging"
   firebase functions:config:get env --project dynasty-staging
   ```

3. **API Key Issues**:
   - Ensure staging-specific keys are used
   - Check API key permissions
   - Verify domain restrictions

### Debug Commands

```bash
# View staging logs
firebase functions:log --project dynasty-staging

# Test specific function
firebase functions:shell --project dynasty-staging

# Check deployment status
firebase deploy:list --project dynasty-staging
```

## Security Checklist

- [ ] Generated unique staging secrets
- [ ] Using staging-specific API keys
- [ ] Frontend points to staging backend
- [ ] Authentication flows working
- [ ] Rate limiting configured
- [ ] Monitoring enabled
- [ ] Access restricted to dev team
- [ ] No production data in staging

## Migration to Production

When ready to promote staging to production:

1. **Do NOT copy secrets** - Production has its own
2. **Test thoroughly** in staging first
3. **Document any configuration changes**
4. **Follow production deployment checklist**
5. **Monitor after deployment**

## Summary

The staging environment provides a safe space to test new features and configurations before production deployment. Key benefits:

- **Isolated Testing**: Separate from production
- **Security Testing**: Validate authentication and encryption flows
- **Integration Testing**: Test external services
- **Performance Testing**: Load test without affecting users
- **Safe Experimentation**: Try new features risk-free

Remember: **Staging is your safety net before production!**