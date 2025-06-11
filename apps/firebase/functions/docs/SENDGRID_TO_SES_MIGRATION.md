# SendGrid to AWS SES Migration Guide

This guide explains how to migrate from SendGrid to AWS SES for email delivery in Dynasty Firebase Functions.

## Overview

The migration is designed to be **backward compatible** and can be done gradually:
- Default behavior remains SendGrid (no breaking changes)
- Switch to SES by setting a single configuration variable
- All existing email functionality is preserved

## Migration Steps

### 1. AWS SES Setup

#### Prerequisites
- AWS account with SES access
- Verified domain or email addresses in SES
- Email templates created in SES (already done)

#### IAM Role Configuration (Production)
For production, create an IAM role with these permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendTemplatedEmail",
        "ses:GetIdentityVerificationAttributes",
        "ses:GetSendStatistics"
      ],
      "Resource": "*"
    }
  ]
}
```

Attach this role to your Firebase Functions service account.

### 2. Environment Configuration

#### Local Development
Set these environment variables in your `.env` file:
```bash
# Choose email provider
EMAIL_PROVIDER=ses  # or "sendgrid" (default)

# SES Configuration (if using SES)
SES_REGION=us-east-1
SES_FROM_EMAIL=noreply@mydynastyapp.com
SES_FROM_NAME=Dynasty App

# Note: Production uses IAM roles - no AWS credentials needed
```

#### Production/Staging
Create Firebase secrets:
```bash
# Set email provider
firebase functions:secrets:set EMAIL_PROVIDER
# Enter: ses

# Set SES configuration (Production with IAM role)
firebase functions:secrets:set SES_CONFIG
# Enter JSON: {"region":"us-east-1","fromEmail":"noreply@mydynastyapp.com","fromName":"Dynasty App","roleArn":"arn:aws:iam::ACCOUNT:role/ROLE_NAME"}
```

### 3. Template Variable Mapping

The system automatically maps variables between SendGrid and SES formats:

| Template | SendGrid Variable | SES Variable | Notes |
|----------|------------------|--------------|-------|
| Email Verification | `userName` | `username` | Auto-mapped |
| Email Verification | `verificationUrl` | `verificationLink` | Auto-mapped |
| Email Verification | - | `expiryTime` | Added as "30 minutes" |
| Email Verification | - | `year` | Added automatically |
| Password Reset | `username` | `username` | No change needed |
| Password Reset | `resetLink` | `resetLink` | No change needed |
| Invite | `acceptLink` | `signUpLink` | Auto-mapped |
| MFA | - | All variables | New functionality |

### 4. Code Changes Required

**No code changes required!** The migration uses a universal email function that automatically routes to the correct provider.

However, if you want to use the new MFA email functionality:

```typescript
import {sendEmailUniversal} from "../config/emailConfig";

// Send MFA code
await sendEmailUniversal({
  to: user.email,
  templateType: "mfa",
  dynamicTemplateData: {
    username: user.displayName,
    code: "123456",
    expiryMinutes: "10",
  },
});
```

### 5. Testing the Migration

#### Step 1: Test in Development
1. Set `EMAIL_PROVIDER=ses` in your `.env`
2. Run the emulator: `npm run dev`
3. Test all email flows:
   - User registration (verification email)
   - Password reset
   - Family invitations
   - MFA (if implemented)

#### Step 2: Test in Staging
1. Deploy to staging with SES enabled
2. Monitor logs for successful email delivery
3. Check SES console for delivery metrics

#### Step 3: Production Rollout
1. Deploy with `EMAIL_PROVIDER=sendgrid` (default)
2. Gradually switch to SES by updating the secret
3. Monitor both Firebase logs and AWS CloudWatch

### 6. Rollback Plan

If issues arise, simply change the EMAIL_PROVIDER back to "sendgrid":

```bash
# Local
EMAIL_PROVIDER=sendgrid

# Production
firebase functions:secrets:set EMAIL_PROVIDER
# Enter: sendgrid
```

## Monitoring and Debugging

### Firebase Logs
Monitor email sending:
```bash
firebase functions:log --only handleSignUp,sendVerificationEmail,initiatePasswordReset
```

### SES Metrics
- Check AWS SES Console for:
  - Sending quota usage
  - Bounce and complaint rates
  - Email delivery status

### Common Issues

1. **Template Not Found Error**
   - Ensure all SES templates are created in the correct region
   - Template names must match: `verify-email`, `password-reset`, `invite`, `mfa`

2. **Email Not Verified Error**
   - In SES sandbox mode, recipient emails must be verified
   - Move to production mode or verify test email addresses

3. **Sending Quota Exceeded**
   - Check SES sending limits in AWS console
   - Request limit increase if needed

## Cost Comparison

| Provider | Cost Structure | Estimated Monthly Cost (10k emails) |
|----------|---------------|-------------------------------------|
| SendGrid | $19.95/month for 40k emails | $19.95 |
| AWS SES | $0.10 per 1,000 emails | $1.00 |

## Benefits of SES

1. **Cost Savings**: ~95% reduction in email costs
2. **Better Integration**: Native AWS service integration
3. **Higher Limits**: Better scaling capabilities
4. **Detailed Metrics**: CloudWatch integration
5. **Regional Presence**: Multiple region support

## Next Steps

After successful migration:
1. Remove SendGrid dependencies (after confidence period)
2. Implement SES event notifications (bounces, complaints)
3. Set up CloudWatch alarms for email metrics
4. Consider using SES configuration sets for better tracking