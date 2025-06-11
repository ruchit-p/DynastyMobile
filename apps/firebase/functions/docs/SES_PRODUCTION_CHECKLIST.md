# AWS SES Production Readiness Checklist

## Pre-Production Requirements

### ✅ AWS Account Setup
- [ ] AWS account with SES enabled
- [ ] SES moved out of sandbox mode (for production)
- [ ] Domain verified in SES
- [ ] DKIM records configured for domain
- [ ] SPF records configured for domain

### ✅ Email Templates
All templates created in SES with correct names:
- [ ] `verify-email` - Email verification template
- [ ] `password-reset` - Password reset template
- [ ] `invite` - Family invitation template
- [ ] `mfa` - Multi-factor authentication template

### ✅ IAM Configuration (Production Authentication)
- [ ] IAM role created with SES permissions (e.g., `AmazonConnectEmailSESAccessRole`)
- [ ] Trust policy configured to allow Firebase service account assumption
- [ ] Role ARN added to Firebase `SES_CONFIG` secret
- [ ] Minimal permissions granted (principle of least privilege)
- [ ] NO AWS credentials stored in Firebase secrets (IAM role only)

Required IAM Policy:
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

### ✅ Firebase Configuration
- [ ] `EMAIL_PROVIDER` secret set to "ses"
- [ ] `SES_CONFIG` secret configured with correct values
- [ ] Functions updated to include SES secrets
- [ ] SendGrid kept as fallback option

## Security Considerations

### 🔒 Authentication
- ✅ No hardcoded credentials in code
- ✅ AWS credentials only in development environment
- ✅ Production uses IAM roles (no credentials)
- ✅ Secrets managed through Firebase Secret Manager

### 🔒 Email Security
- ✅ Input validation on all email addresses
- ✅ Rate limiting implemented on email endpoints
- ✅ Template variables sanitized to prevent injection
- ✅ URLs in emails use environment-specific base URLs

### 🔒 Error Handling
- ✅ Specific SES errors handled gracefully
- ✅ User-friendly error messages returned
- ✅ Detailed errors logged for debugging
- ✅ No sensitive information in error responses

## Testing Checklist

### 🧪 Unit Tests
- [ ] SES service initialization tests
- [ ] Template variable mapping tests
- [ ] Error handling tests
- [ ] Configuration loading tests

### 🧪 Integration Tests
Run the test script: `npx ts-node src/test/testSESIntegration.ts`
- [ ] Configuration loads correctly
- [ ] SES service initializes
- [ ] Email verification status check works
- [ ] Test email sends successfully

### 🧪 End-to-End Tests
Test each email flow:
- [ ] User registration → Verification email received
- [ ] Password reset → Reset email received
- [ ] Family invitation → Invite email received
- [ ] MFA (if implemented) → Code email received

## Monitoring Setup

### 📊 AWS CloudWatch
- [ ] SES sending metrics dashboard created
- [ ] Bounce rate alarm configured (> 5%)
- [ ] Complaint rate alarm configured (> 0.1%)
- [ ] Send quota usage alarm configured (> 80%)

### 📊 Firebase Monitoring
- [ ] Function execution logs reviewed
- [ ] Error rate monitoring enabled
- [ ] Email send success/failure metrics tracked
- [ ] Performance metrics baselined

## Deployment Process

### 🚀 Staging Deployment
1. [ ] Deploy to staging with `EMAIL_PROVIDER=ses`
2. [ ] Run all email flows in staging
3. [ ] Monitor logs for 24 hours
4. [ ] Verify email delivery rates

### 🚀 Production Deployment
1. [ ] Create rollback plan
2. [ ] Deploy during low-traffic period
3. [ ] Monitor real-time logs
4. [ ] Verify first 100 emails sent successfully
5. [ ] Monitor for 48 hours post-deployment

## Post-Deployment

### 📈 Performance Validation
- [ ] Email delivery time < 5 seconds
- [ ] Bounce rate < 5%
- [ ] Complaint rate < 0.1%
- [ ] No increase in function errors

### 💰 Cost Validation
- [ ] SES costs aligned with estimates
- [ ] No unexpected charges
- [ ] Cost alerts configured

## Rollback Plan

If issues occur, rollback by:
1. Set `EMAIL_PROVIDER=sendgrid` in Firebase secrets
2. Redeploy functions
3. Verify SendGrid is working
4. Investigate SES issues offline

## Long-term Maintenance

### 📅 Monthly Tasks
- [ ] Review SES sending statistics
- [ ] Check bounce/complaint rates
- [ ] Update email templates if needed
- [ ] Review costs vs SendGrid

### 📅 Quarterly Tasks
- [ ] Security audit of IAM permissions
- [ ] Review and update rate limits
- [ ] Test disaster recovery procedures
- [ ] Update documentation

## Support Contacts

- **AWS Support**: Via AWS Console
- **Firebase Support**: firebase-support@google.com
- **Internal Team**: Document your team contacts here

## Success Metrics

Track these KPIs post-migration:
- Email delivery rate: Target > 95%
- Email open rate: Should match or exceed SendGrid
- Cost reduction: Target 90% reduction
- Function performance: No degradation
- User complaints: Should not increase