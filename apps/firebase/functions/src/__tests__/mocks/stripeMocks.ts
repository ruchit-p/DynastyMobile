/**
 * Comprehensive Stripe mocking infrastructure for testing
 * Follows Dynasty's established testing patterns for external service mocking
 */

import { jest } from '@jest/globals';
import { SubscriptionPlan, SubscriptionTier } from '../../types/subscription';
import { CheckoutSessionMetadata, SubscriptionMetadata } from '../../types/stripe';

// Mock Stripe customer object factory
export function createMockStripeCustomer(overrides: Partial<any> = {}): any {
  return {
    id: 'cus_test_123',
    object: 'customer',
    created: Math.floor(Date.now() / 1000),
    email: 'test@example.com',
    name: 'Test User',
    deleted: false,
    metadata: {
      userId: 'test-user-id',
      ...overrides.metadata,
    },
    ...overrides,
  };
}

// Mock Stripe subscription object factory
export function createMockStripeSubscription(overrides: Partial<any> = {}): any {
  return {
    id: 'sub_test_123',
    object: 'subscription',
    created: Math.floor(Date.now() / 1000),
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 2592000, // 30 days
    customer: 'cus_test_123',
    status: 'active',
    collection_method: 'charge_automatically',
    items: {
      object: 'list',
      data: [
        {
          id: 'si_test_123',
          price: {
            id: 'price_test_123',
            unit_amount: 999,
            currency: 'usd',
            recurring: {
              interval: 'month',
            },
          },
        },
      ],
    },
    metadata: {
      userId: 'test-user-id',
      plan: SubscriptionPlan.INDIVIDUAL,
      tier: SubscriptionTier.PLUS,
      ...overrides.metadata,
    } as SubscriptionMetadata,
    ...overrides,
  };
}

// Mock Stripe checkout session object factory
export function createMockCheckoutSession(overrides: Partial<any> = {}): any {
  return {
    id: 'cs_test_123',
    object: 'checkout.session',
    created: Math.floor(Date.now() / 1000),
    customer: 'cus_test_123',
    mode: 'subscription',
    status: 'complete',
    success_url: 'https://example.com/success',
    cancel_url: 'https://example.com/cancel',
    url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    subscription: 'sub_test_123',
    metadata: {
      userId: 'test-user-id',
      plan: SubscriptionPlan.INDIVIDUAL,
      tier: SubscriptionTier.PLUS,
      ...overrides.metadata,
    } as CheckoutSessionMetadata,
    ...overrides,
  };
}

// Mock Stripe invoice object factory
export function createMockStripeInvoice(overrides: Partial<any> = {}): any {
  return {
    id: 'in_test_123',
    object: 'invoice',
    created: Math.floor(Date.now() / 1000),
    customer: 'cus_test_123',
    subscription: 'sub_test_123',
    status: 'paid',
    amount_paid: 999,
    amount_due: 999,
    currency: 'usd',
    ...overrides,
  };
}

// Mock Stripe payment method object factory
export function createMockPaymentMethod(overrides: Partial<any> = {}): any {
  return {
    id: 'pm_test_123',
    object: 'payment_method',
    created: Math.floor(Date.now() / 1000),
    customer: 'cus_test_123',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242',
      exp_month: 12,
      exp_year: 2025,
    },
    ...overrides,
  };
}

// Mock Stripe price object factory
export function createMockStripePrice(overrides: Partial<any> = {}): any {
  return {
    id: 'price_test_123',
    object: 'price',
    created: Math.floor(Date.now() / 1000),
    currency: 'usd',
    unit_amount: 999,
    recurring: {
      interval: 'month',
    },
    product: 'prod_test_123',
    ...overrides,
  };
}

// Mock Stripe product object factory
export function createMockStripeProduct(overrides: Partial<any> = {}): any {
  return {
    id: 'prod_test_123',
    object: 'product',
    created: Math.floor(Date.now() / 1000),
    name: 'Individual Plan',
    description: 'Dynasty Individual subscription',
    active: true,
    ...overrides,
  };
}

// Create comprehensive Stripe client mock
export function createMockStripeClient(): any {
  return {
    customers: {
      create: jest.fn().mockResolvedValue(createMockStripeCustomer()),
      retrieve: jest.fn().mockResolvedValue(createMockStripeCustomer()),
      update: jest.fn().mockResolvedValue(createMockStripeCustomer()),
      del: jest.fn().mockResolvedValue({ id: 'cus_test_123', deleted: true }),
      list: jest.fn().mockResolvedValue({
        object: 'list',
        data: [createMockStripeCustomer()],
        has_more: false,
      }),
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue(createMockStripeSubscription()),
      retrieve: jest.fn().mockResolvedValue(createMockStripeSubscription()),
      update: jest.fn().mockResolvedValue(createMockStripeSubscription()),
      cancel: jest.fn().mockResolvedValue(createMockStripeSubscription({ status: 'canceled' })),
      list: jest.fn().mockResolvedValue({
        object: 'list',
        data: [createMockStripeSubscription()],
        has_more: false,
      }),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue(createMockCheckoutSession()),
        retrieve: jest.fn().mockResolvedValue(createMockCheckoutSession()),
        list: jest.fn().mockResolvedValue({
          object: 'list',
          data: [createMockCheckoutSession()],
          has_more: false,
        }),
      },
    },
    invoices: {
      retrieve: jest.fn().mockResolvedValue(createMockStripeInvoice()),
      pay: jest.fn().mockResolvedValue(createMockStripeInvoice({ status: 'paid' })),
      list: jest.fn().mockResolvedValue({
        object: 'list',
        data: [createMockStripeInvoice()],
        has_more: false,
      }),
    },
    paymentMethods: {
      retrieve: jest.fn().mockResolvedValue(createMockPaymentMethod()),
      attach: jest.fn().mockResolvedValue(createMockPaymentMethod()),
      detach: jest.fn().mockResolvedValue(createMockPaymentMethod()),
      list: jest.fn().mockResolvedValue({
        object: 'list',
        data: [createMockPaymentMethod()],
        has_more: false,
      }),
    },
    prices: {
      retrieve: jest.fn().mockResolvedValue(createMockStripePrice()),
      list: jest.fn().mockResolvedValue({
        object: 'list',
        data: [createMockStripePrice()],
        has_more: false,
      }),
    },
    products: {
      retrieve: jest.fn().mockResolvedValue(createMockStripeProduct()),
      list: jest.fn().mockResolvedValue({
        object: 'list',
        data: [createMockStripeProduct()],
        has_more: false,
      }),
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'bps_test_123',
          object: 'billing_portal.session',
          created: Math.floor(Date.now() / 1000),
          customer: 'cus_test_123',
          return_url: 'https://example.com/account',
          url: 'https://billing.stripe.com/p/session/test_123',
        }),
      },
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  };
}

// Reset all Stripe mocks to their default state
export function resetStripeMocks(stripeMock: any): void {
  // Reset all mock functions
  Object.values(stripeMock).forEach((service: any) => {
    if (service && typeof service === 'object') {
      Object.values(service).forEach((method: any) => {
        if (jest.isMockFunction(method)) {
          method.mockClear();
        }
      });
    }
  });

  // Reset to default implementations
  stripeMock.customers.create.mockResolvedValue(createMockStripeCustomer());
  stripeMock.customers.retrieve.mockResolvedValue(createMockStripeCustomer());
  stripeMock.subscriptions.create.mockResolvedValue(createMockStripeSubscription());
  stripeMock.subscriptions.retrieve.mockResolvedValue(createMockStripeSubscription());
  stripeMock.checkout.sessions.create.mockResolvedValue(createMockCheckoutSession());
  stripeMock.invoices.retrieve.mockResolvedValue(createMockStripeInvoice());
  stripeMock.paymentMethods.retrieve.mockResolvedValue(createMockPaymentMethod());
  stripeMock.prices.retrieve.mockResolvedValue(createMockStripePrice());
  stripeMock.products.retrieve.mockResolvedValue(createMockStripeProduct());
}

// Configure mock to simulate specific scenarios
export function configureMockForScenario(stripeMock: any, scenario: string): void {
  switch (scenario) {
    case 'payment_failed':
      stripeMock.invoices.pay.mockRejectedValue(new Error('Your card was declined.'));
      stripeMock.subscriptions.retrieve.mockResolvedValue(
        createMockStripeSubscription({ status: 'past_due' })
      );
      break;

    case 'subscription_canceled':
      stripeMock.subscriptions.retrieve.mockResolvedValue(
        createMockStripeSubscription({ status: 'canceled' })
      );
      break;

    case 'customer_not_found':
      stripeMock.customers.retrieve.mockRejectedValue(new Error('No such customer'));
      break;

    case 'rate_limit':
      stripeMock.customers.create.mockRejectedValue(new Error('Rate limit exceeded'));
      break;

    case 'api_error':
      stripeMock.subscriptions.create.mockRejectedValue(new Error('API Error'));
      break;

    default:
      resetStripeMocks(stripeMock);
  }
}

// Error simulation utilities
export const StripeErrorSimulator = {
  cardDeclined: () => {
    const error = new Error('Your card was declined.');
    (error as any).type = 'card_error';
    (error as any).code = 'card_declined';
    return error;
  },

  rateLimited: () => {
    const error = new Error('Too many requests');
    (error as any).type = 'rate_limit_error';
    return error;
  },

  apiError: () => {
    const error = new Error('API Error');
    (error as any).type = 'api_error';
    return error;
  },

  invalidRequest: (message: string = 'Invalid request') => {
    const error = new Error(message);
    (error as any).type = 'invalid_request_error';
    return error;
  },
};
