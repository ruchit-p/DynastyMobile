import {Request} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import Stripe from "stripe";
import {getStripeClient} from "../config/stripeConfig";
import {getStripeConfig} from "../config/stripeSecrets";
import {createError, ErrorCode} from "../utils/errors";
import {SubscriptionWebhookProcessor} from "./processors/subscriptionProcessor";
import {PaymentWebhookProcessor} from "./processors/paymentProcessor";
import {CustomerWebhookProcessor} from "./processors/customerProcessor";
import {technicalMonitoringService} from "../services/technicalMonitoringService";

export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  created: number;
  livemode: boolean;
}

export interface WebhookProcessorResult {
  success: boolean;
  message?: string;
  error?: Error;
}

export class StripeWebhookHandler {
  private stripe?: Stripe;
  private webhookSecret?: string;
  private subscriptionProcessor?: SubscriptionWebhookProcessor;
  private paymentProcessor?: PaymentWebhookProcessor;
  private customerProcessor?: CustomerWebhookProcessor;

  constructor() {
    // Lazy initialization - don't access secrets during construction
  }

  private initializeIfNeeded() {
    if (!this.stripe) {
      this.stripe = getStripeClient();
      const config = getStripeConfig();
      this.webhookSecret = config.webhookSecret;

      // Initialize processors
      this.subscriptionProcessor = new SubscriptionWebhookProcessor();
      this.paymentProcessor = new PaymentWebhookProcessor();
      this.customerProcessor = new CustomerWebhookProcessor();
    }
  }
  /**
   * Handle incoming webhook request
   */
  async handleWebhook(req: Request): Promise<WebhookProcessorResult> {
    this.initializeIfNeeded();

    // Start performance tracking
    const startTime = Date.now();
    let event: Stripe.Event | undefined;
    let payloadSize = 0;

    try {
      // Calculate payload size for monitoring
      payloadSize = req.rawBody ? req.rawBody.length : 0;

      // Validate webhook signature
      event = this.constructEvent(req);

      logger.info("Processing webhook event", {
        eventId: event.id,
        eventType: event.type,
        livemode: event.livemode,
        payloadSize,
      });

      // Route event to appropriate processor
      const result = await this.routeEvent(event);

      // Track successful webhook processing
      await this.trackWebhookPerformance({
        event,
        startTime,
        payloadSize,
        result,
        status: result.success ? "success" : "failed",
      });

      // Log result
      if (result.success) {
        logger.info("Webhook processed successfully", {
          eventId: event.id,
          eventType: event.type,
          processingTimeMs: Date.now() - startTime,
        });
      } else {
        logger.error("Webhook processing failed", {
          eventId: event.id,
          eventType: event.type,
          error: result.error,
          processingTimeMs: Date.now() - startTime,
        });
      }

      return result;
    } catch (error) {
      // Track failed webhook processing
      await this.trackWebhookPerformance({
        event,
        startTime,
        payloadSize,
        result: {
          success: false,
          error: error as Error,
          message: (error as Error).message,
        },
        status: "failed",
      });

      logger.error("Webhook handler error", {
        error,
        processingTimeMs: Date.now() - startTime,
        eventType: event?.type || "unknown",
        eventId: event?.id || "unknown",
      });

      if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
        throw createError(ErrorCode.WEBHOOK_SIGNATURE_INVALID, "Invalid webhook signature");
      }

      throw error;
    }
  }

  /**
   * Construct and validate webhook event
   */
  private constructEvent(req: Request): Stripe.Event {
    this.initializeIfNeeded();
    const signature = req.headers["stripe-signature"];

    if (!signature || typeof signature !== "string") {
      throw createError(ErrorCode.WEBHOOK_SIGNATURE_MISSING, "Missing webhook signature");
    }

    // Get raw body for signature verification
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw createError(ErrorCode.INVALID_REQUEST, "Missing request body");
    }

    try {
      // Construct event with signature verification
      return this.stripe!.webhooks.constructEvent(rawBody, signature, this.webhookSecret!);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
        logger.error("Webhook signature verification failed", {
          error: err.message,
          signature: signature.substring(0, 20) + "...",
        });
        throw err;
      }
      throw err;
    }
  }

  /**
   * Route event to appropriate processor
   */
  private async routeEvent(event: Stripe.Event): Promise<WebhookProcessorResult> {
    try {
      switch (event.type) {
      // Subscription events
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.trial_will_end":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        return await this.subscriptionProcessor!.processEvent(event);

        // Payment events
      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
      case "invoice.payment_action_required":
      case "invoice.upcoming":
      case "invoice.finalized":
        return await this.paymentProcessor!.processEvent(event);

        // Customer events
      case "customer.created":
      case "customer.updated":
      case "customer.deleted":
        return await this.customerProcessor!.processEvent(event);

        // Checkout events
      case "checkout.session.completed":
      case "checkout.session.expired":
        return await this.subscriptionProcessor!.processCheckoutEvent(event);

        // Payment method events
      case "payment_method.attached":
      case "payment_method.detached":
      case "payment_method.updated":
        return await this.customerProcessor!.processPaymentMethodEvent(event);

        // Product/Price events (for syncing)
      case "product.created":
      case "product.updated":
      case "price.created":
      case "price.updated":
        logger.info("Product/Price event received", {
          eventType: event.type,
          eventId: event.id,
        });
        return {success: true, message: "Product/Price event acknowledged"};

      default:
        logger.warn("Unhandled webhook event type", {
          eventType: event.type,
          eventId: event.id,
        });
        return {success: true, message: "Event type not handled"};
      }
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        message: `Failed to process event: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Safely track webhook performance metrics without breaking webhook processing
   */
  private async trackWebhookPerformance(params: {
    event?: Stripe.Event;
    startTime: number;
    payloadSize: number;
    result: WebhookProcessorResult;
    status: "success" | "failed" | "timeout";
  }): Promise<void> {
    try {
      const {event, startTime, payloadSize, result, status} = params;
      const processingTimeMs = Date.now() - startTime;

      // Extract metadata from webhook event
      const {userId, subscriptionId} = this.extractWebhookMetadata(event);

      const metrics = {
        webhookType: event?.type || "unknown",
        processingTimeMs,
        status,
        timestamp: new Date(),
        errorCode: result.error ? this.getErrorCode(result.error) : undefined,
        errorMessage: result.error?.message,
        payloadSize,
        userId,
        subscriptionId,
      };

      // Track performance asynchronously - don't await to avoid blocking webhook response
      technicalMonitoringService.trackWebhookPerformance(metrics).catch((monitoringError) => {
        // Log monitoring errors but don't throw them
        logger.warn("Failed to track webhook performance", {
          monitoringError: monitoringError.message,
          eventId: event?.id,
          eventType: event?.type,
        });
      });
    } catch (error) {
      // Catch any errors in performance tracking to ensure webhook processing isn't affected
      logger.warn("Error in webhook performance tracking", {
        error: (error as Error).message,
        eventId: params.event?.id,
        eventType: params.event?.type,
      });
    }
  }

  /**
   * Extract userId and subscriptionId from webhook event data
   */
  private extractWebhookMetadata(event?: Stripe.Event): {
    userId?: string;
    subscriptionId?: string;
  } {
    if (!event?.data?.object) {
      return {};
    }

    const object = event.data.object as any;
    let userId: string | undefined;
    let subscriptionId: string | undefined;

    try {
      // Extract based on event type and object structure
      switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.trial_will_end":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        subscriptionId = object.id;
        userId = object.metadata?.userId;
        break;

      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
      case "invoice.payment_action_required":
      case "invoice.upcoming":
      case "invoice.finalized":
        subscriptionId = object.subscription;
        userId = object.metadata?.userId || object.customer_email;
        break;

      case "checkout.session.completed":
      case "checkout.session.expired":
        subscriptionId = object.subscription;
        userId = object.metadata?.userId || object.customer_email;
        break;

      case "customer.created":
      case "customer.updated":
      case "customer.deleted":
        userId = object.metadata?.userId || object.id;
        break;

      default:
        // Try to extract from common fields
        userId = object.metadata?.userId || object.customer_email;
        subscriptionId = object.subscription || object.id;
      }
    } catch (error) {
      // Don't throw errors for metadata extraction failures
      logger.debug("Failed to extract webhook metadata", {
        error: (error as Error).message,
        eventType: event.type,
        eventId: event.id,
      });
    }

    return {userId, subscriptionId};
  }

  /**
   * Extract error code from error object for monitoring
   */
  private getErrorCode(error: Error): string | undefined {
    // Check for Dynasty error codes
    if ((error as any).code) {
      return (error as any).code;
    }

    // Check for Stripe error types
    if (error instanceof Stripe.errors.StripeError) {
      return error.type;
    }

    // Return error name as fallback
    return error.name || "unknown_error";
  }

  /**
   * Verify webhook endpoint configuration (for testing)
   */
  async verifyEndpointConfiguration(): Promise<boolean> {
    try {
      // This would typically make a test call to Stripe to verify the endpoint
      // For now, we just check that we have the necessary configuration
      if (!this.webhookSecret) {
        throw new Error("Webhook secret not configured");
      }

      const config = getStripeConfig();
      if (!config.secretKey) {
        throw new Error("Stripe secret key not configured");
      }

      logger.info("Webhook endpoint configuration verified");
      return true;
    } catch (error) {
      logger.error("Webhook endpoint configuration invalid", {error});
      return false;
    }
  }

  /**
   * Get webhook event from database (for replay/debugging)
   */
  async getWebhookEvent(eventId: string): Promise<Stripe.Event | null> {
    this.initializeIfNeeded();
    try {
      // In production, you might want to store webhook events in Firestore
      // for debugging and replay capabilities
      const event = await this.stripe!.events.retrieve(eventId);
      return event;
    } catch (error) {
      logger.error("Failed to retrieve webhook event", {eventId, error});
      return null;
    }
  }

  /**
   * Replay a webhook event (for manual recovery)
   */
  async replayWebhookEvent(eventId: string): Promise<WebhookProcessorResult> {
    try {
      const event = await this.getWebhookEvent(eventId);
      if (!event) {
        throw createError(ErrorCode.NOT_FOUND, "Webhook event not found");
      }

      logger.info("Replaying webhook event", {
        eventId: event.id,
        eventType: event.type,
      });

      return await this.routeEvent(event);
    } catch (error) {
      logger.error("Failed to replay webhook event", {eventId, error});
      return {
        success: false,
        error: error as Error,
        message: `Failed to replay event: ${(error as Error).message}`,
      };
    }
  }
}
