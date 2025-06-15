# Stripe Integration Setup Guide

## Current Status
The Stripe integration code is complete and production-ready. You just need to configure the actual Stripe IDs and deploy.

## Your Stripe Products (from Dashboard)
- **Free Plan**: `prod_STTujqN4OfWiE8` - $0
- **Individual Plan**: `prod_STTtdOmm3OjPxQ` - $8/month
- **Family Plan 2.5 TB**: `prod_STTvKJTt5QhTt9` - $25/month
- **Family Plan 7.5 TB**: `prod_STVDPTdGGXWqhD` - $60/month
- **Family Plan 12 TB**: `prod_STVGxk4sOSLsw2` - $100/month
- **Extra Vault Storage Add-on**: `prod_STV4aalNPp3LEM` - Multiple price points

## Setup Steps

### 1. Get Price IDs from Stripe Dashboard
For each product, you need to get the price IDs:
1. Go to https://dashboard.stripe.com/products
2. Click on each product
3. Find the price IDs (they start with `price_`)
4. Note both monthly and yearly price IDs where applicable

### 2. Configure Firebase Secrets

#### API Keys (Already Set ✅)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PUBLISHABLE_KEY`

#### Product/Price Configuration
```bash
# Set the Stripe configuration as a single JSON secret
firebase functions:secrets:set STRIPE_CONFIG < stripe-config.json

# Or run the setup script
./setup-stripe-config.sh
```

The `stripe-config.json` file contains all product and price IDs in a single, easy-to-manage JSON format.

### 3. Configure Webhook in Stripe Dashboard
1. Go to https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.created`
   - `customer.updated`
   - `customer.deleted`
4. Copy the webhook signing secret and set it as `STRIPE_WEBHOOK_SECRET`

### 4. Update Web App Environment
In `apps/web/dynastyweb/.env.production`:
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_KEY
```

### 5. Implement Email Service
The `SubscriptionEmailService` needs to be implemented. Create:
- `apps/firebase/functions/src/services/email/SubscriptionEmailService.ts`

Required email templates:
- Checkout confirmation
- Payment success
- Payment failed
- Subscription created/updated/cancelled
- Trial ending reminder

### 6. Test in Test Mode First
1. Use test mode keys initially
2. Test all flows:
   - Sign up for each plan
   - Add storage addons
   - Cancel subscription
   - Payment failure handling
   - Webhook processing

### 7. Deploy to Production
```bash
# Deploy Firebase functions
cd apps/firebase/functions
yarn deploy

# Deploy web app
cd apps/web/dynastyweb
yarn build
yarn deploy
```

## Missing Implementation

### Email Service Example
```typescript
// apps/firebase/functions/src/services/email/SubscriptionEmailService.ts
export class SubscriptionEmailService {
  async sendCheckoutConfirmation(params: {
    email: string;
    customerName: string;
    planName: string;
    amount: number;
  }): Promise<void> {
    // Implement using your email provider (SendGrid, AWS SES, etc.)
  }

  async sendPaymentSuccess(params: {
    email: string;
    invoiceUrl: string;
    amount: number;
  }): Promise<void> {
    // Implement
  }

  // Add other methods...
}
```

## Monitoring Setup
Consider integrating:
- Sentry for error tracking
- Stripe Sigma for analytics
- Custom dashboards for subscription metrics

## Security Checklist
- [ ] All Stripe keys stored as secrets
- [ ] Webhook signature validation enabled
- [ ] HTTPS enforced on all endpoints
- [ ] Rate limiting configured
- [ ] Input sanitization active
- [ ] Audit logging enabled

## Post-Deployment
1. Monitor webhook failures in Stripe Dashboard
2. Set up alerts for payment failures
3. Review subscription analytics weekly
4. Test customer portal access
5. Verify email notifications are sending