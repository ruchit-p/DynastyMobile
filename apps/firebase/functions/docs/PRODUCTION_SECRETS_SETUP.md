# Production Secrets Setup Guide

This guide walks through setting up all production secrets for Dynasty's Firebase Functions.

## Overview

Dynasty requires several types of secrets for secure production operation:
- **Core Security**: JWT tokens, encryption keys
- **External Services**: AWS SES, Twilio, Backblaze B2
- **Environment Config**: URLs, API endpoints, feature flags

## Quick Start

1. **Generate Secrets**:
   ```bash
   cd apps/firebase/functions
   ./scripts/generate-all-secrets.sh
   ```

2. **Configure External Services**:
   ```bash
   # Copy template and fill in external service keys
   cp .env.production.template .env.production
   # Edit .env.production with your API keys
   ```

3. **Deploy to Firebase**:
   ```bash
   ./scripts/deploy-production-secrets.sh
   ```

4. **Verify Configuration**:
   ```bash
   ./scripts/verify-production-config.sh
   ```

5. **Deploy Functions**:
   ```bash
   ./scripts/gradual-rollout-deploy.sh
   ```

## Generated Secrets

### Core Security Keys (Auto-generated)

| Secret | Purpose | Size | Auto-Generated |
|--------|---------|------|----------------|
| `JWT_SECRET_KEY` | JWT token signing | 256-bit | ✅ |
| `ENCRYPTION_KEY` | Data encryption | 256-bit | ✅ |
| `SESSION_SECRET_KEY` | Session management | 256-bit | ✅ |
| `WEBHOOK_SECRET_KEY` | Webhook validation | 256-bit | ✅ |
| `DATABASE_SECRET_KEY` | Database encryption | 256-bit | ✅ |
| `API_SALT` | API key hashing | 128-bit | ✅ |

### External Service Keys (Manual Configuration Required)

| Service | Keys Required | Purpose |
|---------|---------------|---------|
| **AWS SES** | `SES_CONFIG` (with IAM role ARN) | Email delivery |
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | SMS delivery |
| **Backblaze B2** | `B2_CONFIG` | File storage |

## External Service Setup

### AWS SES Configuration

1. **Set up IAM Role** with SES permissions (see CLAUDE.md for details)
2. **Configure Domain Authentication**:
   - Verify your domain in AWS SES
   - Set up SPF, DKIM, and DMARC records
   - Move out of sandbox mode for production

3. **Update Configuration**:
   ```bash
   # Set Firebase secret
   firebase functions:secrets:set SES_CONFIG
   # Enter JSON: {"region":"us-east-2","fromEmail":"noreply@mydynastyapp.com","fromName":"Dynasty App","roleArn":"arn:aws:iam::ACCOUNT:role/ROLE_NAME"}
   ```

### Twilio Configuration

1. **Create Twilio Account**: https://www.twilio.com/
2. **Get Account SID and Auth Token**:
   - Find in Twilio Console Dashboard
   - Account SID (starts with AC...)
   - Auth Token (hidden by default)

3. **Purchase Phone Number**:
   - Go to Phone Numbers → Manage → Buy a number
   - Choose number with SMS capabilities
   - Note the phone number (format: +1234567890)

4. **Update Configuration**:
   ```bash
   # In .env.production
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your-auth-token-here
   TWILIO_PHONE_NUMBER=+1234567890
   ```

### Backblaze B2 Configuration

1. **Create Backblaze Account**: https://www.backblaze.com/b2/
2. **Create B2 Bucket**:
   - Go to B2 Cloud Storage
   - Create a new bucket
   - Note bucket name and bucket ID

3. **Generate Application Key**:
   - Go to App Keys
   - Create Application Key with read/write permissions
   - Note Application Key ID and Application Key

4. **Update Configuration**:
   ```bash
   # Set Firebase secret
   firebase functions:secrets:set B2_CONFIG
   # Enter JSON: {"applicationKeyId":"your-key-id","applicationKey":"your-key","bucketId":"your-bucket-id","bucketName":"dynastyprod"}
   ```

## Security Best Practices

### Secret Management

1. **Never Commit Secrets**:
   ```bash
   # .env.production is in .gitignore
   # Always use environment variables
   ```

2. **Rotate Secrets Regularly**:
   ```bash
   # Recommended rotation schedule
   # Core secrets: Every 90 days
   # External API keys: Follow service recommendations
   ```

3. **Use Least Privilege**:
   - SendGrid: Mail Send permissions only
   - Twilio: SMS permissions only  
   - FingerprintJS: Server API access only
   - R2: Bucket-specific access only

### Deployment Security

1. **Verify Before Deploy**:
   ```bash
   ./scripts/verify-production-config.sh
   ```

2. **Gradual Rollout**:
   ```bash
   # Deploy functions one by one with health checks
   ./scripts/gradual-rollout-deploy.sh
   ```

3. **Monitor After Deploy**:
   ```bash
   # Check function logs
   firebase functions:log --lines 50
   
   # Monitor error rates
   # Check Firebase Console → Functions → Health
   ```


### Enabled Functions


|----------|--------|----------------|
| `handleSignUp` | authentication.ts | ✅ |
| `updateUserPassword` | password-management.ts | ✅ |
| `initiatePasswordReset` | password-management.ts | ✅ |
| `handleAccountDeletion` | user-management.ts | ✅ |
| `updateUserProfile` | user-management.ts | ✅ |

### Rate Limiting

Each protected function has rate limiting configured:

- **Authentication**: 10 requests per minute per IP
- **Password Reset**: 5 requests per hour per IP
- **Account Deletion**: 3 requests per day per IP
- **Profile Updates**: 20 requests per hour per IP

### Mobile App Exemption

- React Native apps automatically detected
- Expo apps automatically detected
- Custom mobile User-Agent patterns supported

## Troubleshooting

### Common Issues

1. **Configuration Not Found**:
   ```bash
   # Ensure secrets are deployed
   firebase functions:config:get
   
   # Redeploy if empty
   ./scripts/deploy-production-secrets.sh
   ```

2. **Function Deployment Fails**:
   ```bash
   # Check TypeScript build
   npm run build
   
   # Check function logs
   firebase functions:log --only auth-handleSignUp
   ```

   ```bash
   
   # Check if mobile app exemption is working
   # Ensure User-Agent contains "ReactNative" or "Expo"
   ```

4. **External Service Integration Fails**:
   ```bash
   # Test API keys manually
   # SendGrid: https://docs.sendgrid.com/api-reference/mail-send/mail-send
   # Twilio: https://www.twilio.com/docs/usage/api
   # FingerprintJS: https://dev.fingerprint.com/docs
   # R2: https://developers.cloudflare.com/r2/api/
   ```

### Getting Help

1. **Check Function Logs**:
   ```bash
   firebase functions:log --lines 100
   ```

2. **Verify Configuration**:
   ```bash
   ./scripts/verify-production-config.sh
   ```

3. **Test Individual Functions**:
   ```bash
   # Deploy single function for testing
   firebase deploy --only functions:auth-handleSignUp
   ```

4. **Security Issues**:
   - Review security configuration
   - Verify rate limiting is working
   - Monitor for suspicious activity

## Production Checklist

- [ ] All core security secrets generated and deployed
- [ ] External service API keys configured and tested
- [ ] Rate limiting configured and tested
- [ ] Function health checks passing
- [ ] Mobile app exemption working correctly
- [ ] Monitoring and alerting configured
- [ ] Security audit completed
- [ ] Documentation updated
- [ ] Team trained on secret management

## Success Criteria

✅ **Configuration Complete**: All required secrets deployed to Firebase Functions
✅ **External Services Working**: Email, SMS, fingerprinting, file storage operational  
✅ **Rate Limiting Active**: Request limits enforced per function
✅ **Monitoring Ready**: Health checks and logging configured
✅ **Security Hardened**: All production security measures in place