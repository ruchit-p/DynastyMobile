# Deprecated Services

> Last Updated: June 2025

This document tracks services that have been removed or replaced in the Dynasty codebase.

## 🚫 Removed Services

### FingerprintJS (Removed: January 2025)

**What it was:** Device fingerprinting library for identifying unique devices and browsers.

**Why removed:** 
- Privacy concerns with device fingerprinting
- Native device identification methods are sufficient
- Reduced dependency overhead and costs

**What replaced it:**
- Native device properties (`Device.brand`, `Device.modelName`) for mobile
- Browser-based identification for web
- Cryptographic fingerprints for E2EE remain unchanged

**Removed packages:**
- `@fingerprintjs/fingerprintjs`
- `@fingerprintjs/fingerprintjs-pro-react`
- `@fingerprintjs/fingerprintjs-pro-react-native`
- `@fingerprintjs/fingerprintjs-pro-server-api`

**Files removed:**
- `FingerprintService.ts`
- `EnhancedFingerprintService.ts`
- `FingerprintProvider.tsx`

### SendGrid (Removed: January 2025)

**What it was:** Email delivery service for transactional emails.

**Why removed:**
- Higher costs compared to AWS SES
- Limited integration with AWS infrastructure
- AWS SES provides better deliverability in our regions

**What replaced it:** AWS SES (Simple Email Service)

**Removed packages:**
- `@sendgrid/mail`

**Deprecated files:**
- `sendgridConfig.deprecated.ts`
- All SendGrid-specific email templates

**Migration notes:**
- All email functions now use `sendEmailUniversal`
- Email templates automatically converted to SES format
- MFA email support added (not available in SendGrid)

### Twilio SMS (Removed: January 2025)

**What it was:** SMS delivery service for notifications and authentication.

**Why removed:**
- Migrated to AWS End User Messaging (Pinpoint SMS Voice v2)
- Better integration with existing AWS infrastructure
- More reliable delivery with 10-digit long codes
- Cost optimization

**What replaced it:** AWS End User Messaging

**Removed packages:**
- `twilio`

**Migration notes:**
- All SMS functions now use AWS SDK
- Enhanced security with SNS webhook validation
- Improved error handling and delivery tracking

## 📋 Configuration Updates Required

When removing deprecated services, update these files:

1. **Environment Variables:**
   - Remove from `.env.example` files
   - Remove from GitHub Secrets
   - Remove from Firebase Secret Manager

2. **Documentation:**
   - Update setup guides
   - Update deployment checklists
   - Update API documentation

3. **Dependencies:**
   - Remove from `package.json`
   - Run `npm install` or `yarn install` to update lock files
   - Check for any transitive dependencies

## 🔍 How to Check for Deprecated Code

```bash
# Search for FingerprintJS references
grep -r "fingerprint" --include="*.ts" --include="*.tsx" --include="*.js"

# Search for SendGrid references
grep -r "sendgrid" --include="*.ts" --include="*.tsx" --include="*.js"

# Search for Twilio references
grep -r "twilio" --include="*.ts" --include="*.tsx" --include="*.js"
```

## ⚠️ Important Notes

1. **Do not restore deprecated services** unless absolutely necessary
2. **Update all documentation** when removing services
3. **Test thoroughly** after removing dependencies
4. **Keep this file updated** when deprecating new services

## 🌟 Current Services

### Active Third-Party Services
- **Email**: AWS SES
- **SMS**: AWS End User Messaging (Pinpoint SMS Voice v2)
- **Storage**: Cloudflare R2
- **Payments**: Stripe
- **Authentication**: Firebase Auth
- **Database**: Firebase Firestore
- **Hosting**: Vercel (Web), Firebase Hosting

---

For questions about deprecated services, consult the migration guides in `/docs/migration/` or contact the development team.