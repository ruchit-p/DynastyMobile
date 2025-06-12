# Dynasty Stripe Integration - Technical Documentation

## Overview

This documentation covers the complete technical implementation of Dynasty's Stripe integration, including subscription management, monitoring, analytics, and compliance features.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [API Endpoints](#api-endpoints)
3. [Webhook Event Reference](#webhook-event-reference)
4. [Monitoring & Analytics](#monitoring--analytics)
5. [Storage Calculations](#storage-calculations)
6. [Email Compliance](#email-compliance)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Deployment Procedures](#deployment-procedures)
9. [Security Considerations](#security-considerations)

---

## Architecture Overview

### System Components

The Dynasty Stripe integration consists of several interconnected services:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web/Mobile    │    │   Firebase      │    │     Stripe      │
│   Frontend      │◄──►│   Functions     │◄──►│    Webhooks     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Firestore     │
                    │   Database      │
                    └─────────────────┘
```

### Core Services

- **Subscription Analytics Service**: Business metrics and KPI tracking
- **Technical Monitoring Service**: System health and performance monitoring
- **Alerting Service**: Real-time alerts and notifications
- **Conversion Tracking Service**: User journey and funnel analysis
- **Business Dashboard Service**: Data visualization and reporting
- **Email Compliance Service**: Unsubscribe and preference management

---

## API Endpoints

### Subscription Management

#### `createSubscription`

**Type**: Callable Function  
**Authentication**: Required (verified user)  
**Rate Limit**: 5 requests/hour per user

**Request**:

```typescript
{
  planId: string;
  tier?: 'individual' | 'family';
  interval: 'month' | 'year';
  paymentMethodId?: string;
  metadata?: Record<string, any>;
}
```

**Response**:

```typescript
{
  success: boolean;
  subscriptionId?: string;
  clientSecret?: string;
  error?: string;
}
```

#### `updateSubscription`

**Type**: Callable Function  
**Authentication**: Required (verified user)  
**Rate Limit**: 10 requests/hour per user

**Request**:

```typescript
{
  subscriptionId: string;
  action: 'upgrade' | 'downgrade' | 'cancel' | 'reactivate';
  newPlanId?: string;
  newTier?: string;
  immediateChange?: boolean;
}
```

#### `getSubscriptionStatus`

**Type**: Callable Function  
**Authentication**: Required (basic auth)  
**Rate Limit**: 100 requests/hour per user

**Response**:

```typescript
{
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  planId: string;
  tier: string;
  interval: 'month' | 'year';
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  storageUsed: number;
  storageLimit: number;
}
```

### Analytics & Monitoring

#### `getSubscriptionAnalytics`

**Type**: Callable Function  
**Authentication**: Required (admin)  
**Rate Limit**: 50 requests/hour per admin

**Request**:

```typescript
{
  startDate: string; // ISO date
  endDate: string;   // ISO date
  metrics?: string[]; // Optional metric filters
}
```

**Response**: [SubscriptionMetrics Interface](#subscription-metrics)

#### `getTechnicalHealth`

**Type**: Callable Function  
**Authentication**: Required (admin)  
**Rate Limit**: 100 requests/hour per admin

**Response**: [TechnicalHealthMetrics Interface](#technical-health-metrics)

#### `getConversionFunnel`

**Type**: Callable Function  
**Authentication**: Required (admin)  
**Rate Limit**: 20 requests/hour per admin

**Response**: [ConversionFunnel Interface](#conversion-funnel)

### Email Compliance

#### `handleUnsubscribe`

**Type**: HTTP Request Function  
**Methods**: GET (preference center), POST (unsubscribe action)  
**Authentication**: Token-based  
**Rate Limit**: 30 requests/5 minutes per IP

**GET Parameters**:

```
?token=<unsubscribe_token>
```

**POST Body**:

```typescript
{
  token: string;
  action: 'unsubscribe-all' | 'update-preferences';
  categories?: string[];
  preferences?: Record<string, boolean>;
}
```

#### `oneClickUnsubscribe`

**Type**: HTTP Request Function  
**Method**: POST only  
**Authentication**: Token + email validation  
**Rate Limit**: 10 requests/5 minutes per IP

**Parameters**:

```
?email=<user_email>&token=<unsubscribe_token>
```

---

## Webhook Event Reference

### Stripe Webhook Events

Dynasty processes the following Stripe webhook events:

#### `customer.subscription.created`

- **Triggers**: New subscription activation
- **Processing**: Creates user subscription record, sends welcome email
- **Monitoring**: Tracked in subscription analytics

#### `customer.subscription.updated`

- **Triggers**: Plan changes, billing cycle updates
- **Processing**: Updates user subscription status, recalculates storage
- **Monitoring**: Tracked as upgrade/downgrade event

#### `customer.subscription.deleted`

- **Triggers**: Subscription cancellation
- **Processing**: Marks subscription as canceled, schedules data retention
- **Monitoring**: Tracked in churn analytics

#### `invoice.payment_succeeded`

- **Triggers**: Successful payment processing
- **Processing**: Updates payment history, extends subscription period
- **Monitoring**: Tracked in revenue analytics

#### `invoice.payment_failed`

- **Triggers**: Failed payment attempts
- **Processing**: Sends payment failure notification, updates retry schedule
- **Monitoring**: Triggers high-priority alert if failure rate > 20%

#### `customer.subscription.trial_will_end`

- **Triggers**: 3 days before trial expiration
- **Processing**: Sends trial ending notification
- **Monitoring**: Tracked in trial conversion analytics

### Webhook Security

All webhooks are verified using Stripe's signature validation:

```typescript
const sig = request.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
```

### Webhook Monitoring

Webhook performance is automatically tracked:

- Processing time (alert threshold: 5 seconds)
- Success/failure rates (alert threshold: 5% failure)
- Retry attempts and timeout handling

---

## Monitoring & Analytics

### Subscription Metrics

The `SubscriptionAnalyticsService` tracks comprehensive business metrics:

#### Core Metrics

- **Monthly Recurring Revenue (MRR)**: Normalized monthly revenue
- **Annual Recurring Revenue (ARR)**: MRR × 12
- **Average Revenue Per User (ARPU)**: MRR / total active users
- **Customer Lifetime Value (CLV)**: ARPU / churn rate

#### Growth Metrics

- **Net Revenue Retention**: Revenue expansion vs. contraction
- **Gross Revenue Retention**: Revenue retention excluding expansion
- **Monthly Growth Rate**: Month-over-month growth percentage
- **Churn Rate**: Percentage of customers lost per month
- **Reactivation Rate**: Percentage of churned customers who return

#### Plan Distribution

```typescript
planDistribution: Record<
  string,
  {
    count: number;
    revenue: number;
    percentage: number;
  }
>;
```

#### Family Plan Metrics

- Total family plans
- Average members per plan
- Family plan revenue
- Member utilization rate

### Technical Health Metrics

The `TechnicalMonitoringService` tracks system performance:

#### Webhook Performance

- Total webhooks processed
- Success rate (target: >95%)
- Average processing time (target: <5s)
- Timeout rate (target: <1%)
- Error breakdown by type

#### API Performance

- Total API requests
- Error rate (target: <5%)
- Average response time (target: <2s)
- P95/P99 response times
- Status code breakdown

#### Storage Calculation Performance

- Total calculations performed
- Average calculation time (target: <10s)
- Error rate (target: <2%)
- Largest calculations by user

### Alerting System

The `AlertingService` provides real-time monitoring with configurable thresholds:

#### Default Alert Rules

**Business Alerts**:

- High Churn Rate: >5% monthly churn
- Revenue Drop: >10% MRR decrease
- Low Conversion Rate: <2% checkout conversion

**Technical Alerts**:

- Webhook Failures: >5% failure rate
- Slow API Response: P95 >2 seconds
- High Error Rate: >5% API errors
- Storage Calculation Timeout: >10 seconds

**Security Alerts**:

- Unusual Payment Failures: >20% failure rate
- Suspicious Signup Activity: >200% of normal rate

#### Alert Channels

- Email notifications
- Slack integration
- Webhook callbacks
- SMS alerts (configurable)

#### Escalation Rules

Alerts can be configured with escalation paths:

```typescript
escalationRules: [
  {
    afterMinutes: 15,
    channels: ['email', 'slack'],
    severity: 'high',
  },
];
```

---

## Storage Calculations

### Storage Tiers

Dynasty implements usage-based billing with storage calculations:

#### Plan Limits

- **Individual Plan**: 1GB base storage
- **Family Plan**: 5GB base storage
- **Add-on Storage**: $2/month per additional GB

### Storage Calculation Process

#### 1. User Storage Calculation

```typescript
interface UserStorageCalculation {
  userId: string;
  totalBytes: number;
  fileBreakdown: {
    photos: number;
    videos: number;
    documents: number;
    audio: number;
  };
  calculatedAt: Date;
}
```

#### 2. Family Storage Aggregation

For family plans, storage is calculated across all family members:

```typescript
const familyStorage = members.reduce((total, member) => {
  return total + member.storageUsed;
}, 0);
```

#### 3. Overage Billing

```typescript
const overageGB = Math.max(0, Math.ceil((totalBytes - planLimit) / (1024 * 1024 * 1024)));
const overageCharge = overageGB * OVERAGE_RATE_PER_GB;
```

### Storage Monitoring

Storage calculations are monitored for:

- Calculation time (alert if >10 seconds)
- Accuracy validation
- Error handling for corrupt files
- Automatic recalculation on file changes

---

## Email Compliance

### Unsubscribe Management

Dynasty implements comprehensive email compliance following CAN-SPAM and GDPR requirements:

#### Unsubscribe Token Generation

```typescript
const token = await generateUnsubscribeToken(
  userEmail,
  userId,
  'marketing' // context
);
```

#### Preference Categories

- **Marketing Emails**: Product updates, newsletters
- **Family Updates**: Family member notifications, tree changes
- **Event Invitations**: Family event notifications
- **Billing & Account**: Required security and payment notifications

#### One-Click Unsubscribe (RFC 8058)

Implemented for marketing emails:

```
List-Unsubscribe: <https://functions.mydynastyapp.com/oneClickUnsubscribe?email=user@example.com&token=abc123>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

### Suppression Lists

Email suppression is managed through the `EmailSuppressionService`:

#### Suppression Types

- **Unsubscribed**: User explicitly unsubscribed
- **Bounced**: Email bounced (hard bounce)
- **Complained**: User marked as spam
- **Manual**: Admin-added suppression

#### Automatic Suppression

- Hard bounces: Immediate suppression
- Soft bounces: Suppression after 3 consecutive bounces
- Complaints: Immediate suppression with severity tracking

---

## Troubleshooting Guide

### Common Issues

#### 1. Webhook Processing Failures

**Symptoms**: High webhook failure rate, missing subscription updates

**Diagnosis**:

```bash
# Check webhook logs
gcloud functions logs read stripeWebhooks --limit=50

# Check webhook performance metrics
curl -X POST "https://functions.mydynastyapp.com/getTechnicalHealth" \
  -H "Authorization: Bearer $TOKEN"
```

**Resolution**:

1. Verify webhook endpoint is accessible
2. Check Stripe webhook signature validation
3. Review processing timeout (increase if needed)
4. Validate Firestore write permissions

#### 2. Subscription Status Sync Issues

**Symptoms**: User subscription status doesn't match Stripe

**Diagnosis**:

```typescript
// Compare local vs Stripe subscription
const localSub = await getSubscriptionStatus({ userId });
const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
```

**Resolution**:

1. Manually sync subscription from Stripe
2. Check webhook delivery status in Stripe dashboard
3. Verify webhook event processing logs
4. Run subscription reconciliation job

#### 3. Storage Calculation Timeouts

**Symptoms**: Storage calculations failing, users unable to upload

**Diagnosis**:

```typescript
// Check storage calculation metrics
const metrics = await technicalMonitoringService.generateTechnicalHealthReport(startDate, endDate);
console.log(metrics.storageMetrics);
```

**Resolution**:

1. Optimize storage calculation queries
2. Implement batch processing for large accounts
3. Add calculation result caching
4. Scale Cloud Function memory allocation

#### 4. Alert Fatigue

**Symptoms**: Too many alerts, important alerts missed

**Resolution**:

1. Review alert thresholds and adjust sensitivity
2. Implement alert grouping and deduplication
3. Configure appropriate cooldown periods
4. Set up escalation rules for critical alerts

### Performance Optimization

#### Database Queries

- Use composite indexes for Firestore queries
- Implement query result caching
- Batch read/write operations where possible

#### Cloud Function Optimization

- Increase memory allocation for data-intensive operations
- Use connection pooling for external API calls
- Implement request caching for frequent operations

#### Monitoring Efficiency

- Aggregate metrics in scheduled functions
- Use batch processing for historical analytics
- Implement data retention policies

---

## Deployment Procedures

### Prerequisites

1. **Firebase CLI**: Version 11.0+ installed
2. **Node.js**: Version 18+ installed
3. **Access**: Firebase project admin access
4. **Secrets**: All required secrets configured

### Environment Configuration

#### Required Secrets

```bash
# Core Stripe configuration
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET

# Email service configuration
firebase functions:secrets:set EMAIL_PROVIDER="ses"
firebase functions:secrets:set SES_CONFIG

# Frontend URL configuration
firebase functions:secrets:set FRONTEND_URL

# Storage configuration
firebase functions:secrets:set B2_CONFIG

# Cleanup authentication
firebase functions:secrets:set CLEANUP_SECRET
```

#### Environment Variables

```bash
# Set in .env file for local development
STRIPE_PUBLISHABLE_KEY=pk_test_...
FRONTEND_PORT=3000
```

### Deployment Steps

#### 1. Pre-deployment Checks

```bash
# Run tests
npm test

# Lint code
npm run lint

# Build TypeScript
npm run build

# Validate secrets
npm run validate-secrets
```

#### 2. Deploy Functions

```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:stripeWebhooks

# Deploy with custom region
firebase deploy --only functions --project dynasty-prod
```

#### 3. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

#### 4. Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

#### 5. Post-deployment Verification

```bash
# Verify webhook endpoint
curl -X POST "https://functions.mydynastyapp.com/stripeWebhooks" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check function health
firebase functions:log --only stripeWebhooks --limit 10

# Verify alerts are configured
npm run verify-alert-rules
```

### Rollback Procedures

#### Emergency Rollback

```bash
# Rollback to previous version
firebase functions:delete stripeWebhooks
firebase deploy --only functions:stripeWebhooks

# Disable webhook processing (emergency)
firebase functions:config:set webhook.enabled=false
firebase deploy --only functions
```

#### Gradual Rollback

1. Deploy canary version with traffic splitting
2. Monitor error rates and performance
3. Gradually increase traffic to new version
4. Complete rollback if issues persist

### Monitoring Deployment

#### Health Checks

- Webhook processing success rate >95%
- API response time <2 seconds
- Error rate <1%
- Alert rules functioning correctly

#### Verification Checklist

- [ ] All webhook events processing correctly
- [ ] Subscription creation/updates working
- [ ] Email notifications sending
- [ ] Storage calculations functioning
- [ ] Analytics data updating
- [ ] Alerts triggering appropriately

---

## Security Considerations

### Data Protection

#### Encryption

- All data encrypted in transit (TLS 1.3)
- Firestore encryption at rest
- Stripe tokenization for payment data

#### Access Control

- Firebase Authentication required for all endpoints
- Role-based access control for admin functions
- IP-based rate limiting for public endpoints

### Compliance

#### PCI DSS

- No storage of payment card data
- Stripe handles all payment processing
- Secure token exchange only

#### GDPR/CCPA

- User data deletion upon request
- Email preference management
- Data processing audit logs

#### CAN-SPAM

- Unsubscribe links in all marketing emails
- One-click unsubscribe implementation
- Suppression list management

### Security Monitoring

#### Threat Detection

- Unusual API access patterns
- High failure rates indicating attacks
- Anomalous subscription creation patterns

#### Incident Response

- Automated security alerts
- Admin notification system
- Emergency access controls

---

## Support and Maintenance

### Monitoring Dashboards

Access monitoring dashboards at:

- **Business Metrics**: `https://dashboard.mydynastyapp.com/business`
- **Technical Health**: `https://dashboard.mydynastyapp.com/technical`
- **Alert Status**: `https://dashboard.mydynastyapp.com/alerts`

### Log Analysis

#### Structured Logging

All services use structured logging with consistent format:

```typescript
logger.info('Operation completed', {
  operation: 'subscription_creation',
  userId: 'user123',
  subscriptionId: 'sub_abc',
  duration: 1250,
  success: true,
});
```

#### Log Aggregation

Logs are aggregated in Cloud Logging with custom queries:

```sql
resource.type="cloud_function"
resource.labels.function_name="stripeWebhooks"
severity>=ERROR
timestamp>="2024-01-01"
```

### Maintenance Tasks

#### Daily Tasks

- Review alert status and resolution
- Monitor key business metrics
- Check webhook processing health

#### Weekly Tasks

- Analyze conversion funnel trends
- Review storage usage patterns
- Update alert thresholds if needed

#### Monthly Tasks

- Generate comprehensive analytics reports
- Review and optimize performance
- Update documentation and procedures

---

_Last Updated: January 2025_  
_Version: 1.0_  
_Maintained by: Dynasty Engineering Team_
