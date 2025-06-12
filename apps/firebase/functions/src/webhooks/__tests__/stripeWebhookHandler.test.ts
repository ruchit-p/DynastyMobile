/**
 * Comprehensive tests for Stripe webhook handling
 * Tests webhook signature verification, event routing, and processing
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { StripeWebhookHandler } from '../stripeWebhookHandler';
import { ErrorCode } from '../../utils/errors';
import { StripeTestEnvironment } from '../../__tests__/utils/testHelpers';
import {
  webhookEvents,
  subscriptionScenarios,
  createWebhookRequest,
  webhookSignatureUtils,
} from '../../__tests__/mocks/stripeWebhookFixtures';

// Create test environment
const testEnv = new StripeTestEnvironment();

// Mock all dependencies
jest.mock('../../config/stripeConfig');
jest.mock('../../config/stripeSecrets');
jest.mock('../../webhooks/processors/subscriptionProcessor');
jest.mock('../../webhooks/processors/paymentProcessor');
jest.mock('../../webhooks/processors/customerProcessor');
jest.mock('firebase-functions/v2');

describe('StripeWebhookHandler', () => {
  let webhookHandler: StripeWebhookHandler;
  let mockSubscriptionProcessor: any;
  let mockPaymentProcessor: any;
  let mockCustomerProcessor: any;

  beforeEach(async () => {
    testEnv.setup();

    // Mock processors
    mockSubscriptionProcessor = {
      processEvent: jest.fn().mockResolvedValue({ success: true, message: 'Processed' }),
      processCheckoutEvent: jest.fn().mockResolvedValue({ success: true, message: 'Processed' }),
    };

    mockPaymentProcessor = {
      processEvent: jest.fn().mockResolvedValue({ success: true, message: 'Processed' }),
    };

    mockCustomerProcessor = {
      processEvent: jest.fn().mockResolvedValue({ success: true, message: 'Processed' }),
      processPaymentMethodEvent: jest
        .fn()
        .mockResolvedValue({ success: true, message: 'Processed' }),
    };

    // Mock Stripe configuration
    const stripeConfig = await import('../../config/stripeConfig');
    const getStripeClient = stripeConfig.getStripeClient as jest.Mock;
    getStripeClient.mockReturnValue(testEnv.mockStripeClient);

    const stripeSecrets = await import('../../config/stripeSecrets');
    const getStripeConfig = stripeSecrets.getStripeConfig as jest.Mock;
    getStripeConfig.mockReturnValue({
      webhookSecret: webhookSignatureUtils.mockSecret,
    });

    // Mock processor constructors
    const subscriptionProcessor = await import('../../webhooks/processors/subscriptionProcessor');
    const paymentProcessor = await import('../../webhooks/processors/paymentProcessor');
    const customerProcessor = await import('../../webhooks/processors/customerProcessor');

    const SubscriptionWebhookProcessor =
      subscriptionProcessor.SubscriptionWebhookProcessor as jest.Mock;
    const PaymentWebhookProcessor = paymentProcessor.PaymentWebhookProcessor as jest.Mock;
    const CustomerWebhookProcessor = customerProcessor.CustomerWebhookProcessor as jest.Mock;

    SubscriptionWebhookProcessor.mockImplementation(() => mockSubscriptionProcessor);
    PaymentWebhookProcessor.mockImplementation(() => mockPaymentProcessor);
    CustomerWebhookProcessor.mockImplementation(() => mockCustomerProcessor);

    webhookHandler = new StripeWebhookHandler();

    // Mock the Stripe webhook construction to return valid events
    testEnv.mockStripeClient.webhooks.constructEvent.mockImplementation(rawBody => {
      // Parse the raw body to get the event
      const event = JSON.parse(rawBody.toString());
      return event;
    });
  });

  afterEach(() => {
    testEnv.teardown();
  });

  describe('handleWebhook', () => {
    it('should handle valid webhook request successfully', async () => {
      // Setup
      const event = webhookEvents.subscription.created();
      const request = createWebhookRequest(event);

      // Execute
      const result = await webhookHandler.handleWebhook(request as any);

      // Verify
      expect(result.success).toBe(true);
      expect(testEnv.mockStripeClient.webhooks.constructEvent).toHaveBeenCalledWith(
        request.body,
        request.headers['stripe-signature'],
        webhookSignatureUtils.mockSecret
      );
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledWith(event);
    });

    it('should throw error for missing signature', async () => {
      // Setup
      const event = webhookEvents.subscription.created();
      const request = {
        body: JSON.stringify(event),
        headers: {}, // No stripe-signature header
        rawRequest: {
          body: JSON.stringify(event),
        },
      };

      // Execute & Verify
      await expect(webhookHandler.handleWebhook(request as any)).rejects.toMatchObject({
        code: ErrorCode.WEBHOOK_SIGNATURE_MISSING,
        message: 'Missing webhook signature',
      });
    });

    it('should throw error for missing request body', async () => {
      // Setup
      const request = {
        headers: {
          'stripe-signature': 'test-signature',
        },
        rawRequest: {}, // No body
      };

      // Execute & Verify
      await expect(webhookHandler.handleWebhook(request as any)).rejects.toMatchObject({
        code: ErrorCode.INVALID_REQUEST,
        message: 'Missing request body',
      });
    });

    it('should handle Stripe signature verification error', async () => {
      // Setup
      const event = webhookEvents.subscription.created();
      const request = createWebhookRequest(event);

      // Mock Stripe to throw signature error
      const signatureError = new Error('Invalid signature');
      (signatureError as any).constructor = { name: 'StripeSignatureVerificationError' };
      testEnv.mockStripeClient.webhooks.constructEvent.mockImplementation(() => {
        throw signatureError;
      });

      // Execute & Verify
      await expect(webhookHandler.handleWebhook(request as any)).rejects.toMatchObject({
        code: ErrorCode.WEBHOOK_SIGNATURE_INVALID,
        message: 'Invalid webhook signature',
      });
    });

    it('should return error result when processor fails', async () => {
      // Setup
      const event = webhookEvents.subscription.created();
      const request = createWebhookRequest(event);

      const processingError = new Error('Processing failed');
      mockSubscriptionProcessor.processEvent.mockResolvedValue({
        success: false,
        error: processingError,
        message: 'Failed to process event: Processing failed',
      });

      // Execute
      const result = await webhookHandler.handleWebhook(request as any);

      // Verify
      expect(result.success).toBe(false);
      expect(result.error).toBe(processingError);
      expect(result.message).toBe('Failed to process event: Processing failed');
    });
  });

  describe('Event Routing', () => {
    // Test subscription events routing
    describe('Subscription Events', () => {
      const subscriptionEventTypes = [
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'customer.subscription.trial_will_end',
        'customer.subscription.paused',
        'customer.subscription.resumed',
      ];

      subscriptionEventTypes.forEach(eventType => {
        it(`should route ${eventType} to subscription processor`, async () => {
          // Setup
          const event = webhookEvents.subscription.created({ type: eventType });
          const request = createWebhookRequest(event);

          // Execute
          const result = await webhookHandler.handleWebhook(request as any);

          // Verify
          expect(result.success).toBe(true);
          expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledWith(event);
        });
      });
    });

    // Test payment events routing
    describe('Payment Events', () => {
      const paymentEventTypes = [
        'invoice.payment_succeeded',
        'invoice.payment_failed',
        'invoice.payment_action_required',
        'invoice.upcoming',
        'invoice.finalized',
      ];

      paymentEventTypes.forEach(eventType => {
        it(`should route ${eventType} to payment processor`, async () => {
          // Setup
          const event = webhookEvents.invoice.paymentSucceeded({ type: eventType });
          const request = createWebhookRequest(event);

          // Execute
          const result = await webhookHandler.handleWebhook(request as any);

          // Verify
          expect(result.success).toBe(true);
          expect(mockPaymentProcessor.processEvent).toHaveBeenCalledWith(event);
        });
      });
    });

    // Test customer events routing
    describe('Customer Events', () => {
      const customerEventTypes = ['customer.created', 'customer.updated', 'customer.deleted'];

      customerEventTypes.forEach(eventType => {
        it(`should route ${eventType} to customer processor`, async () => {
          // Setup
          const event = webhookEvents.customer.created({ type: eventType });
          const request = createWebhookRequest(event);

          // Execute
          const result = await webhookHandler.handleWebhook(request as any);

          // Verify
          expect(result.success).toBe(true);
          expect(mockCustomerProcessor.processEvent).toHaveBeenCalledWith(event);
        });
      });
    });

    // Test checkout events routing
    describe('Checkout Events', () => {
      const checkoutEventTypes = ['checkout.session.completed', 'checkout.session.expired'];

      checkoutEventTypes.forEach(eventType => {
        it(`should route ${eventType} to subscription processor`, async () => {
          // Setup
          const event = webhookEvents.checkout.sessionCompleted({ type: eventType });
          const request = createWebhookRequest(event);

          // Execute
          const result = await webhookHandler.handleWebhook(request as any);

          // Verify
          expect(result.success).toBe(true);
          expect(mockSubscriptionProcessor.processCheckoutEvent).toHaveBeenCalledWith(event);
        });
      });
    });

    // Test payment method events routing
    describe('Payment Method Events', () => {
      const paymentMethodEventTypes = [
        'payment_method.attached',
        'payment_method.detached',
        'payment_method.updated',
      ];

      paymentMethodEventTypes.forEach(eventType => {
        it(`should route ${eventType} to customer processor`, async () => {
          // Setup
          const event = webhookEvents.paymentMethod.attached({ type: eventType });
          const request = createWebhookRequest(event);

          // Execute
          const result = await webhookHandler.handleWebhook(request as any);

          // Verify
          expect(result.success).toBe(true);
          expect(mockCustomerProcessor.processPaymentMethodEvent).toHaveBeenCalledWith(event);
        });
      });
    });

    // Test product/price events (acknowledged but not processed)
    describe('Product/Price Events', () => {
      const productPriceEventTypes = [
        'product.created',
        'product.updated',
        'price.created',
        'price.updated',
      ];

      productPriceEventTypes.forEach(eventType => {
        it(`should acknowledge ${eventType} without processing`, async () => {
          // Setup
          const event = {
            id: 'evt_test_123',
            type: eventType,
            data: { object: { id: 'prod_test_123' } },
          };
          const request = createWebhookRequest(event);

          // Execute
          const result = await webhookHandler.handleWebhook(request as any);

          // Verify
          expect(result.success).toBe(true);
          expect(result.message).toBe('Product/Price event acknowledged');
        });
      });
    });

    // Test unhandled events
    it('should handle unhandled event types gracefully', async () => {
      // Setup
      const event = {
        id: 'evt_test_123',
        type: 'unknown.event.type',
        data: { object: {} },
      };
      const request = createWebhookRequest(event);

      // Execute
      const result = await webhookHandler.handleWebhook(request as any);

      // Verify
      expect(result.success).toBe(true);
      expect(result.message).toBe('Event type not handled');
    });
  });

  describe('Subscription Flow Scenarios', () => {
    it('should handle new subscription creation flow', async () => {
      // Setup
      const events = subscriptionScenarios.newSubscription;

      // Execute each event in sequence
      for (const event of events) {
        const request = createWebhookRequest(event);
        const result = await webhookHandler.handleWebhook(request as any);
        expect(result.success).toBe(true);
      }

      // Verify all processors were called appropriately
      expect(mockSubscriptionProcessor.processCheckoutEvent).toHaveBeenCalledTimes(1);
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledTimes(1);
      expect(mockPaymentProcessor.processEvent).toHaveBeenCalledTimes(1);
    });

    it('should handle payment failure flow', async () => {
      // Setup
      const events = subscriptionScenarios.paymentFailure;

      // Execute each event in sequence
      for (const event of events) {
        const request = createWebhookRequest(event);
        const result = await webhookHandler.handleWebhook(request as any);
        expect(result.success).toBe(true);
      }

      // Verify payment processor handled failure events
      expect(mockPaymentProcessor.processEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'invoice.payment_failed' })
      );
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'customer.subscription.updated' })
      );
    });

    it('should handle subscription cancellation flow', async () => {
      // Setup
      const events = subscriptionScenarios.cancellation;

      // Execute each event in sequence
      for (const event of events) {
        const request = createWebhookRequest(event);
        const result = await webhookHandler.handleWebhook(request as any);
        expect(result.success).toBe(true);
      }

      // Verify subscription processor handled cancellation
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'customer.subscription.updated',
          data: expect.objectContaining({
            object: expect.objectContaining({
              cancel_at_period_end: true,
            }),
          }),
        })
      );
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'customer.subscription.deleted' })
      );
    });

    it('should handle family plan creation flow', async () => {
      // Setup
      const events = subscriptionScenarios.familyPlanCreation;

      // Execute each event in sequence
      for (const event of events) {
        const request = createWebhookRequest(event);
        const result = await webhookHandler.handleWebhook(request as any);
        expect(result.success).toBe(true);
      }

      // Verify family plan metadata was included
      expect(mockSubscriptionProcessor.processCheckoutEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            object: expect.objectContaining({
              metadata: expect.objectContaining({
                plan: 'family',
                familyMemberIds: expect.any(String),
              }),
            }),
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle processor throwing error', async () => {
      // Setup
      const event = webhookEvents.subscription.created();
      const request = createWebhookRequest(event);

      const processingError = new Error('Database connection failed');
      mockSubscriptionProcessor.processEvent.mockRejectedValue(processingError);

      // Execute
      const result = await webhookHandler.handleWebhook(request as any);

      // Verify
      expect(result.success).toBe(false);
      expect(result.error).toBe(processingError);
      expect(result.message).toBe('Failed to process event: Database connection failed');
    });

    it('should handle malformed event data', async () => {
      // Setup
      const malformedEvent = {
        // Missing required fields
        type: 'customer.subscription.created',
      };
      const request = createWebhookRequest(malformedEvent);

      // Execute
      const result = await webhookHandler.handleWebhook(request as any);

      // Verify - handler should still route to processor
      expect(result.success).toBe(true);
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalled();
    });

    it('should handle processor timeout gracefully', async () => {
      // Setup
      const event = webhookEvents.subscription.created();
      const request = createWebhookRequest(event);

      const timeoutError = new Error('Operation timed out');
      (timeoutError as any).code = 'TIMEOUT';
      mockSubscriptionProcessor.processEvent.mockRejectedValue(timeoutError);

      // Execute
      const result = await webhookHandler.handleWebhook(request as any);

      // Verify
      expect(result.success).toBe(false);
      expect(result.error).toBe(timeoutError);
      expect(result.message).toContain('Operation timed out');
    });
  });

  describe('Webhook Signature Verification', () => {
    it('should verify valid Stripe signatures', async () => {
      // Setup
      const event = webhookEvents.subscription.created();
      const request = createWebhookRequest(event);

      // Execute
      const result = await webhookHandler.handleWebhook(request as any);

      // Verify
      expect(result.success).toBe(true);
      expect(testEnv.mockStripeClient.webhooks.constructEvent).toHaveBeenCalledWith(
        request.body,
        request.headers['stripe-signature'],
        webhookSignatureUtils.mockSecret
      );
    });

    it('should reject invalid signatures', async () => {
      // Setup
      const event = webhookEvents.subscription.created();
      const request = createWebhookRequest(event);

      // Mock Stripe to reject signature
      const signatureError = new Error('Invalid signature');
      signatureError.constructor = Error;
      Object.defineProperty(signatureError.constructor, 'name', {
        value: 'StripeSignatureVerificationError',
      });

      testEnv.mockStripeClient.webhooks.constructEvent.mockImplementation(() => {
        throw signatureError;
      });

      // Execute & Verify
      await expect(webhookHandler.handleWebhook(request as any)).rejects.toThrow(
        'Invalid webhook signature'
      );
    });

    it('should handle missing signature header', async () => {
      // Setup
      const event = webhookEvents.subscription.created();
      const request = {
        body: JSON.stringify(event),
        headers: {}, // No stripe-signature
        rawRequest: {
          body: JSON.stringify(event),
        },
      };

      // Execute & Verify
      await expect(webhookHandler.handleWebhook(request as any)).rejects.toMatchObject({
        code: ErrorCode.WEBHOOK_SIGNATURE_MISSING,
      });
    });
  });

  describe('Event Idempotency', () => {
    it('should handle duplicate events gracefully', async () => {
      // Setup
      const event = webhookEvents.subscription.created();
      const request = createWebhookRequest(event);

      // Execute same event twice
      const result1 = await webhookHandler.handleWebhook(request as any);
      const result2 = await webhookHandler.handleWebhook(request as any);

      // Verify both succeed (processor should handle idempotency)
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(mockSubscriptionProcessor.processEvent).toHaveBeenCalledTimes(2);
    });
  });
});
