/**
 * Stripe webhook event fixtures for comprehensive testing
 * Based on actual Stripe webhook event structures
 */

import { SubscriptionPlan, SubscriptionTier } from '../../types/subscription';
import {
  createMockStripeCustomer,
  createMockStripeSubscription,
  createMockCheckoutSession,
  createMockStripeInvoice,
} from './stripeMocks';

// Base webhook event structure
interface BaseWebhookEvent {
  id: string;
  object: 'event';
  api_version: string;
  created: number;
  data: {
    object: any;
    previous_attributes?: any;
  };
  livemode: boolean;
  pending_webhooks: number;
  request: {
    id: string;
    idempotency_key: string;
  };
  type: string;
}

// Create base webhook event
function createBaseWebhookEvent(
  type: string,
  data: any,
  previousAttributes?: any
): BaseWebhookEvent {
  return {
    id: `evt_test_${Math.random().toString(36).substr(2, 9)}`,
    object: 'event',
    api_version: '2023-10-16',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: data,
      previous_attributes: previousAttributes,
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_test_${Math.random().toString(36).substr(2, 9)}`,
      idempotency_key: `idem_test_${Math.random().toString(36).substr(2, 9)}`,
    },
    type,
  };
}

// Checkout session webhook events
export const checkoutSessionCompleted = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'checkout.session.completed',
    createMockCheckoutSession({
      status: 'complete',
      payment_status: 'paid',
      subscription: 'sub_test_123',
      ...overrides,
    })
  );

export const checkoutSessionExpired = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'checkout.session.expired',
    createMockCheckoutSession({
      status: 'expired',
      ...overrides,
    })
  );

// Customer webhook events
export const customerCreated = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent('customer.created', createMockStripeCustomer(overrides));

export const customerUpdated = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'customer.updated',
    createMockStripeCustomer(overrides),
    { email: 'old@example.com' } // previous attributes
  );

export const customerDeleted = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'customer.deleted',
    createMockStripeCustomer({
      deleted: true,
      ...overrides,
    })
  );

// Subscription webhook events
export const customerSubscriptionCreated = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'customer.subscription.created',
    createMockStripeSubscription({
      status: 'active',
      ...overrides,
    })
  );

export const customerSubscriptionUpdated = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'customer.subscription.updated',
    createMockStripeSubscription({
      status: 'active',
      ...overrides,
    }),
    { status: 'incomplete' } // previous status
  );

export const customerSubscriptionDeleted = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'customer.subscription.deleted',
    createMockStripeSubscription({
      status: 'canceled',
      canceled_at: Math.floor(Date.now() / 1000),
      ...overrides,
    })
  );

export const customerSubscriptionPaused = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'customer.subscription.paused',
    createMockStripeSubscription({
      status: 'paused',
      pause_collection: {
        behavior: 'mark_uncollectible',
      },
      ...overrides,
    })
  );

export const customerSubscriptionResumed = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'customer.subscription.resumed',
    createMockStripeSubscription({
      status: 'active',
      pause_collection: null,
      ...overrides,
    })
  );

// Invoice webhook events
export const invoiceCreated = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'invoice.created',
    createMockStripeInvoice({
      status: 'draft',
      ...overrides,
    })
  );

export const invoiceFinalized = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'invoice.finalized',
    createMockStripeInvoice({
      status: 'open',
      ...overrides,
    })
  );

export const invoicePaymentSucceeded = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'invoice.payment_succeeded',
    createMockStripeInvoice({
      status: 'paid',
      paid: true,
      amount_paid: 999,
      ...overrides,
    })
  );

export const invoicePaymentFailed = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'invoice.payment_failed',
    createMockStripeInvoice({
      status: 'open',
      paid: false,
      amount_paid: 0,
      amount_remaining: 999,
      next_payment_attempt: Math.floor(Date.now() / 1000) + 86400, // 24 hours
      ...overrides,
    })
  );

export const invoicePaymentActionRequired = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent(
    'invoice.payment_action_required',
    createMockStripeInvoice({
      status: 'open',
      paid: false,
      ...overrides,
    })
  );

// Payment method webhook events
export const paymentMethodAttached = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent('payment_method.attached', {
    id: 'pm_test_123',
    object: 'payment_method',
    customer: 'cus_test_123',
    type: 'card',
    ...overrides,
  });

export const paymentMethodDetached = (overrides: Partial<any> = {}): BaseWebhookEvent =>
  createBaseWebhookEvent('payment_method.detached', {
    id: 'pm_test_123',
    object: 'payment_method',
    customer: null,
    type: 'card',
    ...overrides,
  });

// Test scenarios for different subscription flows
export const subscriptionScenarios = {
  // New subscription creation flow
  newSubscription: [
    checkoutSessionCompleted({
      metadata: {
        userId: 'test-user-id',
        plan: SubscriptionPlan.INDIVIDUAL,
        tier: SubscriptionTier.PLUS,
      },
    }),
    customerSubscriptionCreated({
      metadata: {
        userId: 'test-user-id',
        plan: SubscriptionPlan.INDIVIDUAL,
        tier: SubscriptionTier.PLUS,
      },
    }),
    invoicePaymentSucceeded(),
  ],

  // Failed payment recovery flow
  paymentFailure: [invoicePaymentFailed(), customerSubscriptionUpdated({ status: 'past_due' })],

  // Successful payment recovery
  paymentRecovery: [invoicePaymentSucceeded(), customerSubscriptionUpdated({ status: 'active' })],

  // Plan upgrade flow
  planUpgrade: [
    customerSubscriptionUpdated({
      metadata: {
        userId: 'test-user-id',
        plan: SubscriptionPlan.INDIVIDUAL,
        tier: SubscriptionTier.FAMILY_2_5TB,
      },
    }),
    invoiceCreated(),
    invoicePaymentSucceeded(),
  ],

  // Subscription cancellation flow
  cancellation: [
    customerSubscriptionUpdated({
      cancel_at_period_end: true,
      canceled_at: Math.floor(Date.now() / 1000),
    }),
    customerSubscriptionDeleted(),
  ],

  // Family plan creation
  familyPlanCreation: [
    checkoutSessionCompleted({
      metadata: {
        userId: 'test-user-id',
        plan: SubscriptionPlan.FAMILY,
        tier: SubscriptionTier.FAMILY_2_5TB,
        familyMemberIds: JSON.stringify(['member1', 'member2']),
      },
    }),
    customerSubscriptionCreated({
      metadata: {
        userId: 'test-user-id',
        plan: SubscriptionPlan.FAMILY,
        tier: SubscriptionTier.FAMILY_2_5TB,
        familyMemberIds: JSON.stringify(['member1', 'member2']),
      },
    }),
  ],
};

// Webhook signature testing utilities
export const webhookSignatureUtils = {
  // Mock webhook secret for testing
  mockSecret: 'whsec_test_secret_123',

  // Create mock signature header
  createMockSignature: (payload: string, timestamp: number = Math.floor(Date.now() / 1000)) => {
    // In real implementation, this would use actual HMAC
    // For tests, we just return a predictable mock signature
    return `t=${timestamp},v1=mock_signature_${payload.length}`;
  },

  // Create webhook request headers
  createWebhookHeaders: (payload: string) => {
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      'stripe-signature': webhookSignatureUtils.createMockSignature(payload, timestamp),
      'content-type': 'application/json',
    };
  },
};

// Test helper to create webhook request mock
export function createWebhookRequest(event: BaseWebhookEvent) {
  const payload = JSON.stringify(event);
  return {
    body: payload,
    headers: webhookSignatureUtils.createWebhookHeaders(payload),
    rawRequest: {
      body: payload,
      headers: webhookSignatureUtils.createWebhookHeaders(payload),
    },
  };
}

// Export all webhook events for easy access
export const webhookEvents = {
  checkout: {
    sessionCompleted: checkoutSessionCompleted,
    sessionExpired: checkoutSessionExpired,
  },
  customer: {
    created: customerCreated,
    updated: customerUpdated,
    deleted: customerDeleted,
  },
  subscription: {
    created: customerSubscriptionCreated,
    updated: customerSubscriptionUpdated,
    deleted: customerSubscriptionDeleted,
    paused: customerSubscriptionPaused,
    resumed: customerSubscriptionResumed,
  },
  invoice: {
    created: invoiceCreated,
    finalized: invoiceFinalized,
    paymentSucceeded: invoicePaymentSucceeded,
    paymentFailed: invoicePaymentFailed,
    paymentActionRequired: invoicePaymentActionRequired,
  },
  paymentMethod: {
    attached: paymentMethodAttached,
    detached: paymentMethodDetached,
  },
};
