# Dynasty Stripe Subscription Deployment Checklist

## 📋 Pre-Deployment Verification

### 1. Environment Variables & Secrets
- [ ] **STRIPE_SECRET_KEY** set in Firebase secrets
- [ ] **STRIPE_WEBHOOK_SECRET** set in Firebase secrets
- [ ] **STRIPE_PRICE_IDS** configured in Firebase config
- [ ] **NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY** set in web app
- [ ] **UPSTASH_REDIS_REST_URL** set for rate limiting
- [ ] **UPSTASH_REDIS_REST_TOKEN** set for rate limiting

### 2. Stripe Dashboard Configuration
- [ ] Products created (Free, Individual Basic/Premium, Family)
- [ ] Prices created for each product (monthly/yearly)
- [ ] Addon products created (extra storage, priority support, video processing)
- [ ] Webhook endpoint configured: `https://your-domain/api/webhooks/stripe`
- [ ] Webhook events selected:
  - [ ] `customer.subscription.created`
  - [ ] `customer.subscription.updated`
  - [ ] `customer.subscription.deleted`
  - [ ] `invoice.payment_succeeded`
  - [ ] `invoice.payment_failed`
  - [ ] `customer.updated`
  - [ ] `payment_method.attached`
  - [ ] `payment_method.detached`

### 3. Code Review & Testing
- [ ] All unit tests passing
- [ ] Integration tests with Stripe Test Mode completed
- [ ] Security review completed
- [ ] Rate limiting tested
- [ ] Error handling verified
- [ ] Webhook signature validation tested

## 🚀 Deployment Phases

### Phase 1: Backend Infrastructure (Day 1)

```bash
# 1. Initialize migration tracking
firebase functions:shell
> const {SubscriptionMigrationService} = require('./lib/services/subscriptionMigrationService');
> const service = new SubscriptionMigrationService();
> await service.initializeMigration();
> .exit

# 2. Deploy subscription functions (without webhook activation)
firebase deploy --only functions:createCheckoutSession,functions:getSubscriptionStatus,functions:cancelSubscription,functions:updateSubscription,functions:reactivateSubscription,functions:createCustomerPortalSession,functions:getAvailableAddons --project production

# 3. Verify deployment
firebase functions:log --project production
```

### Phase 2: User Data Migration (Day 2-3)

```bash
# 1. Run migration in dry-run mode
npm run migrate:subscription-fields:dry

# 2. Review migration report
# Check logs for any issues

# 3. Execute migration in batches
npm run migrate:subscription-fields:execute -- --batch-size=100

# 4. Verify migration status
firebase functions:shell
> const service = new SubscriptionMigrationService();
> const report = await service.generateMigrationReport();
> console.log(report);
```

### Phase 3: Webhook Activation (Day 4)

```bash
# 1. Deploy webhook handler (inactive)
firebase deploy --only functions:handleStripeWebhook --project production

# 2. Test webhook with Stripe CLI
stripe listen --forward-to https://your-domain/api/webhooks/stripe

# 3. Send test events
stripe trigger payment_intent.succeeded

# 4. Activate webhook in Stripe Dashboard
# Add webhook endpoint URL and signing secret
```

### Phase 4: Frontend Deployment (Day 5)

```bash
# 1. Deploy web app to staging
cd apps/web/dynastyweb
npm run build
vercel --prod=false

# 2. Test all flows in staging
# - Pricing page
# - Checkout flow
# - Subscription management
# - Cancellation flow

# 3. Deploy to production
vercel --prod
```

### Phase 5: Internal Testing (Day 6-7)

- [ ] Create test accounts with different subscription types
- [ ] Test upgrade/downgrade flows
- [ ] Test cancellation and reactivation
- [ ] Test family plan invitations
- [ ] Test addon purchases
- [ ] Test billing portal access
- [ ] Verify email notifications

### Phase 6: Gradual Rollout (Week 2)

```bash
# 1. Enable for 10% of users
firebase functions:shell
> const service = new SubscriptionMigrationService();
> await service.updateRolloutPercentage(10);
> await service.updateMigrationPhase('PARTIAL_ROLLOUT');

# 2. Monitor for 24 hours
# Check error logs, user feedback

# 3. Increase to 25%
> await service.updateRolloutPercentage(25);

# 4. Increase to 50%
> await service.updateRolloutPercentage(50);

# 5. Full rollout
> await service.updateRolloutPercentage(100);
> await service.updateMigrationPhase('FULL_ROLLOUT');
```

## 🔄 Rollback Procedures

### Emergency Rollback Script
```bash
#!/bin/bash
# rollback-subscriptions.sh

echo "⚠️  Starting emergency rollback..."

# 1. Disable webhooks in Stripe Dashboard
echo "ACTION REQUIRED: Disable webhook in Stripe Dashboard"
read -p "Press enter when webhook is disabled..."

# 2. Set rollout to 0%
firebase functions:shell --project production << EOF
const service = new SubscriptionMigrationService();
await service.updateRolloutPercentage(0);
await service.updateMigrationPhase('ROLLED_BACK');
.exit
EOF

# 3. Deploy previous function version
firebase functions:delete handleStripeWebhook --project production --force

# 4. Restore user data from snapshots
node scripts/restore-user-snapshots.js

echo "✅ Rollback complete"
```

### User-Specific Rollback
```javascript
// In Firebase Functions shell
const service = new SubscriptionMigrationService();
const snapshotId = "snapshot_id_here";
await service.rollbackUserMigration("user_id", snapshotId);
```

## 📊 Monitoring & Alerts

### Key Metrics to Monitor
1. **Webhook Success Rate**
   ```
   Metric: stripe_webhook_success_rate
   Alert: < 95% over 5 minutes
   ```

2. **Checkout Conversion Rate**
   ```
   Metric: checkout_conversion_rate
   Alert: < 50% over 1 hour
   ```

3. **Subscription Churn Rate**
   ```
   Metric: subscription_cancellation_rate
   Alert: > 10% daily
   ```

4. **Payment Failure Rate**
   ```
   Metric: payment_failure_rate
   Alert: > 5% over 30 minutes
   ```

### Logging Queries
```sql
-- Failed webhook events
SELECT timestamp, error_message
FROM logs
WHERE function_name = 'handleStripeWebhook'
  AND severity = 'ERROR'
ORDER BY timestamp DESC
LIMIT 100;

-- Subscription creation failures
SELECT user_id, error_message, timestamp
FROM logs
WHERE function_name = 'createCheckoutSession'
  AND severity = 'ERROR'
  AND timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR);
```

## ✅ Post-Deployment Checklist

### Day 1 After Launch
- [ ] Review all error logs
- [ ] Check webhook delivery reports in Stripe
- [ ] Verify subscription counts match expectations
- [ ] Test customer support workflows
- [ ] Review rate limit metrics

### Week 1 After Launch
- [ ] Analyze conversion funnel
- [ ] Review churn reasons
- [ ] Optimize checkout flow based on data
- [ ] Update documentation
- [ ] Train support team

### Month 1 After Launch
- [ ] Full migration report
- [ ] Performance optimization
- [ ] Cost analysis
- [ ] Feature usage analytics
- [ ] Plan pricing adjustments if needed

## 🆘 Emergency Contacts

- **Stripe Support**: support@stripe.com
- **Technical Lead**: [Your contact]
- **Product Manager**: [PM contact]
- **On-Call Engineer**: [On-call rotation]

## 📝 Communication Templates

### User Migration Email
```
Subject: Exciting Updates to Dynasty Subscriptions

Dear [User Name],

We're upgrading our subscription system to provide you with:
- More flexible payment options
- Better plan management
- Enhanced security
- New features and addons

Your current plan remains unchanged, but you'll now have access to...

[Details]
```

### Internal Team Update
```
Subject: Stripe Subscription Migration - Status Update

Current Phase: [PHASE]
Rollout Percentage: [X]%
Issues Encountered: [COUNT]
Next Steps: [ACTIONS]
```

## 🔐 Security Checklist

- [ ] Webhook signature validation enabled
- [ ] Rate limiting active on all endpoints
- [ ] HTTPS enforced for all communications
- [ ] PCI compliance verified
- [ ] Customer data encryption confirmed
- [ ] Access logs reviewed
- [ ] Penetration testing completed

## 📚 Documentation Updates

- [ ] API documentation updated
- [ ] User guides created
- [ ] Support documentation prepared
- [ ] Developer onboarding updated
- [ ] Architecture diagrams current

---

**Last Updated**: [Current Date]
**Version**: 1.0
**Owner**: Subscription Team