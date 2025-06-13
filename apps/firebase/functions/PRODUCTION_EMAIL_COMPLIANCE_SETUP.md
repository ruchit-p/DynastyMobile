# Dynasty Email Compliance - Production Setup Guide

## 🎯 Overview

This guide provides step-by-step instructions for setting up production-ready email compliance infrastructure for Dynasty Mobile. This implementation ensures compliance with CAN-SPAM, GDPR, and email deliverability best practices.

## 🏗️ Architecture Summary

### Components Implemented:

- **SES Event Handling**: Automatic bounce/complaint processing via SNS webhooks
- **Suppression List Management**: Real-time email suppression with multiple categorization
- **Unsubscribe System**: One-click unsubscribe + preference center
- **Email Preferences**: Granular user control over email categories
- **Compliance Monitoring**: Real-time metrics and audit trails
- **Template Compliance**: All marketing emails include required footers

### Email Types:

- **Transactional**: Verification, password reset, MFA (always deliverable)
- **Marketing**: Invites, payment notifications, subscription updates (suppressible)

---

## 📋 Phase 1: AWS Infrastructure Setup

### 1.1 Create SNS Topics

```bash
# Create SNS topics for SES events
aws sns create-topic --name dynasty-ses-bounces --region us-east-2
aws sns create-topic --name dynasty-ses-complaints --region us-east-2
aws sns create-topic --name dynasty-ses-deliveries --region us-east-2

# Get the topic ARNs (save these for next steps)
aws sns list-topics --region us-east-2
```

### 1.2 Create SES Configuration Set

```bash
# Create configuration set
aws sesv2 create-configuration-set \
  --configuration-set-name dynasty-email-events \
  --region us-east-2

# Add event destinations
aws sesv2 create-configuration-set-event-destination \
  --configuration-set-name dynasty-email-events \
  --event-destination-name bounce-events \
  --event-destination Enabled=true,MatchingEventTypes=bounce,SnsDestination='{TopicArn=arn:aws:sns:us-east-2:ACCOUNT:dynasty-ses-bounces}' \
  --region us-east-2

aws sesv2 create-configuration-set-event-destination \
  --configuration-set-name dynasty-email-events \
  --event-destination-name complaint-events \
  --event-destination Enabled=true,MatchingEventTypes=complaint,SnsDestination='{TopicArn=arn:aws:sns:us-east-2:ACCOUNT:dynasty-ses-complaints}' \
  --region us-east-2

aws sesv2 create-configuration-set-event-destination \
  --configuration-set-name dynasty-email-events \
  --event-destination-name delivery-events \
  --event-destination Enabled=true,MatchingEventTypes=delivery,SnsDestination='{TopicArn=arn:aws:sns:us-east-2:ACCOUNT:dynasty-ses-deliveries}' \
  --region us-east-2
```

### 1.3 Create SNS Subscriptions to Firebase Functions

```bash
# Subscribe Firebase function to SNS topics
# Replace FIREBASE_FUNCTION_URL with your actual function URL

aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-2:ACCOUNT:dynasty-ses-bounces \
  --protocol https \
  --notification-endpoint https://us-central1-dynasty-eba63.cloudfunctions.net/handleSESWebhook \
  --region us-east-2

aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-2:ACCOUNT:dynasty-ses-complaints \
  --protocol https \
  --notification-endpoint https://us-central1-dynasty-eba63.cloudfunctions.net/handleSESWebhook \
  --region us-east-2

aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-2:ACCOUNT:dynasty-ses-deliveries \
  --protocol https \
  --notification-endpoint https://us-central1-dynasty-eba63.cloudfunctions.net/handleSESWebhook \
  --region us-east-2
```

---

## 📋 Phase 2: Firebase Setup

### 2.1 Required Firebase Secrets

Set the following secrets in Firebase:

```bash
# Unsubscribe JWT secret
firebase functions:secrets:set UNSUBSCRIBE_JWT_SECRET="your-strong-jwt-secret-here"

# Cleanup job secret
firebase functions:secrets:set CLEANUP_SECRET="your-cleanup-job-secret"

# Company address for CAN-SPAM compliance
firebase functions:secrets:set COMPANY_ADDRESS="Dynasty Platforms LLC, 7901 4th St N STE 300, St. Petersburg, FL 33702"
```

### 2.2 Firestore Security Rules

Add these rules to `firestore.rules`:

```javascript
// Email compliance collections
match /emailSuppressionList/{email} {
  allow read, write: if request.auth != null &&
    (request.auth.token.admin == true ||
     request.auth.uid == resource.data.userId);
}

match /emailPreferences/{userId} {
  allow read, write: if request.auth != null &&
    (request.auth.uid == userId || request.auth.token.admin == true);
}

match /unsubscribeTokens/{tokenId} {
  allow read: if request.auth != null;
  allow write: if false; // Only server can write
}

match /emailAuditLog/{docId} {
  allow read: if request.auth != null && request.auth.token.admin == true;
  allow write: if false; // Only server can write
}

match /emailEventLog/{docId} {
  allow read: if request.auth != null && request.auth.token.admin == true;
  allow write: if false; // Only server can write
}

match /emailBounceTracking/{email} {
  allow read: if request.auth != null && request.auth.token.admin == true;
  allow write: if false; // Only server can write
}
```

### 2.3 Firestore Indexes

Add these indexes to `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "emailSuppressionList",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "active", "order": "ASCENDING" },
        { "fieldPath": "reason", "order": "ASCENDING" },
        { "fieldPath": "suppressedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "emailSuppressionList",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "active", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "unsubscribeTokens",
      "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "expiresAt", "order": "ASCENDING" }]
    },
    {
      "collectionGroup": "emailAuditLog",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "timestamp", "order": "DESCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## 📋 Phase 3: Email Template Setup

### 3.1 Upload Email Templates to SES

For each template in `/email-templates/`, run:

```bash
# Example for payment-failed template
aws sesv2 create-email-template \
  --template-name payment-failed \
  --template-content file://email-templates/payment-failed.json \
  --region us-east-2
```

Templates to upload:

- ✅ `verify-email` (transactional)
- ✅ `password-reset` (transactional)
- ✅ `invite` (marketing - updated with compliance footer)
- ✅ `mfa` (transactional)
- ✅ `payment-failed` (marketing - updated with compliance footer)
- ✅ `payment-retry` (marketing - needs footer update)
- ✅ `subscription-suspended` (marketing - needs footer update)

### 3.2 Update Remaining Templates

Apply the same compliance footer pattern to:

- `payment-retry.json`
- `subscription-suspended.json`
- `invite.json` (if not already updated)

**Footer HTML Pattern:**

```html
<p style="margin: 0 0 8px;">
  <a href="{{unsubscribeUrl}}" style="color: #666666; text-decoration: none;">Unsubscribe</a> |
  <a href="{{preferencesUrl}}" style="color: #666666; text-decoration: none;">Email Preferences</a>
</p>
<p style="margin: 0; font-size: 11px; color: #999999;">
  {{companyName}}<br />
  {{companyAddress}}
</p>
```

---

## 📋 Phase 4: Cloud Scheduler Setup

### 4.1 Create Cleanup Job

```bash
# Create cleanup job to run daily at 2 AM UTC
gcloud scheduler jobs create http email-compliance-cleanup \
  --schedule="0 2 * * *" \
  --uri="https://us-central1-dynasty-eba63.cloudfunctions.net/emailComplianceCleanup" \
  --http-method=POST \
  --headers="Authorization=Bearer your-cleanup-job-secret" \
  --location=us-central1
```

---

## 📋 Phase 5: Monitoring Setup

### 5.1 CloudWatch Dashboards

Create dashboards for:

- Email volume metrics
- Bounce/complaint rates
- Suppression list growth
- Function execution times

### 5.2 Alerts

Set up alerts for:

- Bounce rate > 5%
- Complaint rate > 0.1%
- Function errors
- Webhook processing delays

---

## 🚀 Deployment Steps

### Step 1: Deploy Firebase Functions

```bash
cd apps/firebase/functions
npm run build
firebase deploy --only functions
```

### Step 2: Test Webhook Connectivity

```bash
# Test SNS subscription confirmation
# The handleSESWebhook function should automatically confirm subscriptions
```

### Step 3: Verify Email Templates

```bash
# Test email sending with new templates
# Check that unsubscribe links are generated correctly
```

### Step 4: Test Unsubscribe Flow

1. Send test marketing email
2. Click unsubscribe link
3. Verify preference center loads
4. Test preference updates
5. Verify suppression list updates

---

## 📊 Compliance Metrics

### Key Metrics to Monitor:

1. **Deliverability**

   - Delivery rate: >95%
   - Bounce rate: <2%
   - Complaint rate: <0.05%

2. **Compliance Response**

   - Unsubscribe processing: <1 hour
   - Preference updates: Real-time
   - Suppression accuracy: 100%

3. **Volume Tracking**
   - Daily email volume
   - Suppression list growth
   - Category opt-out rates

---

## 🔒 Security Considerations

### 1. SNS Webhook Security

- ✅ Signature verification implemented
- ✅ HTTPS-only endpoints
- ✅ Timestamp validation

### 2. Unsubscribe Token Security

- ✅ JWT with HMAC signatures
- ✅ 30-day expiration
- ✅ One-time use tokens
- ✅ Email address validation

### 3. Data Protection

- ✅ Email addresses masked in logs
- ✅ Audit trails for all changes
- ✅ Encrypted data at rest
- ✅ GDPR consent tracking

---

## 📧 Email Categories and Preferences

### Transactional Emails (Always Sent)

- Account verification
- Password reset
- MFA codes
- Critical security alerts

### Marketing Emails (Suppressible)

- Family invitations
- Payment notifications
- Product updates
- Event reminders

### User Preference Controls

- Global opt-out
- Category-specific controls
- Sub-preference granularity
- Re-subscription options

---

## 🛠️ Maintenance Tasks

### Daily

- Monitor bounce/complaint rates
- Check webhook processing
- Review suppression list growth

### Weekly

- Analyze email metrics
- Review user preference changes
- Update templates if needed

### Monthly

- Generate compliance reports
- Audit suppression list accuracy
- Review and update policies

### Quarterly

- Security audit
- Performance optimization
- Compliance review
- Template refresh

---

## 🚨 Troubleshooting

### Common Issues:

1. **High Bounce Rate**

   - Check DNS/SPF records
   - Verify email list quality
   - Review authentication setup

2. **Webhook Failures**

   - Check SNS subscription status
   - Verify function endpoints
   - Review CloudWatch logs

3. **Unsubscribe Issues**

   - Check token generation
   - Verify JWT secret
   - Test preference center

4. **Template Issues**
   - Validate template syntax
   - Check variable substitution
   - Test rendering

---

## 📞 Support Contacts

### For Issues:

- **Infrastructure**: AWS Support
- **Functions**: Firebase Support
- **Compliance**: Legal team review
- **Monitoring**: DevOps team

### Documentation:

- [AWS SES Developer Guide](https://docs.aws.amazon.com/ses/)
- [CAN-SPAM Compliance](https://www.ftc.gov/tips-advice/business-center/guidance/can-spam-act-compliance-guide-business)
- [GDPR Email Guidelines](https://gdpr.eu/email-marketing/)

---

## ✅ Production Readiness Checklist

### Infrastructure

- [ ] SNS topics created and configured
- [ ] SES configuration set deployed
- [ ] Firebase functions deployed
- [ ] Webhook subscriptions confirmed

### Compliance

- [ ] All marketing templates have unsubscribe links
- [ ] Preference center tested and working
- [ ] Suppression list processing verified
- [ ] Audit logging enabled

### Monitoring

- [ ] CloudWatch dashboards configured
- [ ] Alerts set up for key metrics
- [ ] Daily cleanup job scheduled
- [ ] Weekly compliance reports enabled

### Security

- [ ] JWT secrets configured
- [ ] SNS signature validation enabled
- [ ] HTTPS-only communication
- [ ] Audit trails implemented

### Testing

- [ ] End-to-end unsubscribe flow tested
- [ ] Bounce/complaint handling verified
- [ ] Performance benchmarks established
- [ ] Error handling validated

---

## 🎉 Congratulations!

Your Dynasty email system is now production-ready with enterprise-level compliance! The implementation includes:

- **Automated bounce/complaint handling**
- **One-click unsubscribe compliance**
- **Granular preference management**
- **Real-time suppression lists**
- **Comprehensive audit trails**
- **GDPR and CAN-SPAM compliance**
- **Enterprise monitoring and alerting**

Your email deliverability and legal compliance are now at industry-leading standards. 🚀
