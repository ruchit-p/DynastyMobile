import Stripe from "stripe";
import {logger} from "firebase-functions/v2";
import {defineSecret} from "firebase-functions/params";
import {SubscriptionStatus} from "../types/subscription";

// Define Stripe secret key
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

/**
 * Stripe service for payment processing
 */
export class StripeService {
  private stripe: Stripe | null = null;
  private initialized = false;

  /**
   * Initialize Stripe client
   */
  private async initializeStripe(): Promise<Stripe> {
    if (this.initialized && this.stripe) {
      return this.stripe;
    }

    try {
      const secretKey = stripeSecretKey.value();
      if (!secretKey) {
        throw new Error("Stripe secret key not configured");
      }

      this.stripe = new Stripe(secretKey, {
        apiVersion: "2025-05-28.basil",
        typescript: true,
      });

      this.initialized = true;
      return this.stripe;
    } catch (error) {
      logger.error("Failed to initialize Stripe", {error});
      throw error;
    }
  }

  /**
   * Get Stripe instance
   */
  async getStripe(): Promise<Stripe> {
    return this.initializeStripe();
  }

  /**
   * Get total revenue for date range
   */
  async getTotalRevenue(startDate: Date, endDate: Date): Promise<number> {
    const stripe = await this.getStripe();
    
    try {
      // Get all charges for the date range
      const charges = await stripe.charges.list({
        created: {
          gte: Math.floor(startDate.getTime() / 1000),
          lte: Math.floor(endDate.getTime() / 1000),
        },
        limit: 100,
        expand: ["data.balance_transaction"],
      });

      // Calculate total revenue
      let totalRevenue = 0;
      for (const charge of charges.data) {
        if (charge.status === "succeeded" && charge.balance_transaction && typeof charge.balance_transaction === "object") {
          totalRevenue += charge.balance_transaction.net;
        }
      }

      return totalRevenue;
    } catch (error) {
      logger.error("Error calculating total revenue", {error});
      throw error;
    }
  }

  /**
   * Get active subscriptions count
   */
  async getActiveSubscriptionsCount(): Promise<number> {
    const stripe = await this.getStripe();
    
    try {
      const subscriptions = await stripe.subscriptions.list({
        status: "active",
        limit: 1,
      });

      return subscriptions.data.length;
    } catch (error) {
      logger.error("Error getting active subscriptions count", {error});
      throw error;
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string): Promise<Stripe.Customer | null> {
    const stripe = await this.getStripe();
    
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        return null;
      }
      return customer as Stripe.Customer;
    } catch (error) {
      logger.error("Error getting customer", {error, customerId});
      return null;
    }
  }

  /**
   * Retry subscription payment by attempting to pay the latest invoice
   */
  async retrySubscriptionPayment(subscriptionId: string): Promise<Stripe.Invoice> {
    const stripe = await this.getStripe();
    
    try {
      // Get the subscription to find the latest invoice
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["latest_invoice"],
      });

      if (!subscription.latest_invoice || typeof subscription.latest_invoice === "string") {
        throw new Error("No invoice found for subscription");
      }

      const invoice = subscription.latest_invoice as Stripe.Invoice;
      
      // Only attempt to pay if the invoice is not already paid
      if (invoice.status === "open" || invoice.status === "draft") {
        // Finalize the invoice if it's in draft status
        if (invoice.status === "draft" && invoice.id) {
          await stripe.invoices.finalizeInvoice(invoice.id);
        }
        
        // Attempt to pay the invoice
        if (!invoice.id) {
          throw new Error("Invoice has no ID");
        }
        const paidInvoice = await stripe.invoices.pay(invoice.id);
        
        logger.info("Successfully retried subscription payment", {
          subscriptionId,
          invoiceId: paidInvoice.id,
          amountPaid: paidInvoice.amount_paid,
        });
        
        return paidInvoice;
      } else if (invoice.status === "paid") {
        logger.info("Invoice already paid", {
          subscriptionId,
          invoiceId: invoice.id,
        });
        return invoice;
      } else {
        throw new Error(`Cannot pay invoice with status: ${invoice.status}`);
      }
    } catch (error) {
      logger.error("Failed to retry subscription payment", {error, subscriptionId});
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(params: CancelSubscriptionParams): Promise<Stripe.Subscription> {
    const stripe = await this.getStripe();
    
    try {
      const immediately = params.cancelImmediately ?? params.immediately ?? false;
      
      const subscription = await stripe.subscriptions.cancel(
        params.subscriptionId,
        {
          invoice_now: !immediately,
          prorate: !immediately,
          cancellation_details: {
            comment: params.feedback,
            feedback: params.reason as any,
          },
        }
      );
      
      logger.info("Subscription cancelled", {
        subscriptionId: params.subscriptionId,
        immediately,
        reason: params.reason,
      });
      
      return subscription;
    } catch (error) {
      logger.error("Failed to cancel subscription", {error, params});
      throw error;
    }
  }

  /**
   * Update customer's default payment method
   */
  async updateCustomerPaymentMethod(customerId: string, paymentMethodId: string): Promise<Stripe.Customer> {
    const stripe = await this.getStripe();
    
    try {
      // First attach the payment method to the customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
      
      // Then set it as the default payment method
      const customer = await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      
      logger.info("Updated customer payment method", {
        customerId,
        paymentMethodId,
      });
      
      return customer;
    } catch (error) {
      logger.error("Failed to update customer payment method", {error, customerId, paymentMethodId});
      throw error;
    }
  }

  /**
   * Create a new subscription
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<Stripe.Subscription> {
    const stripe = await this.getStripe();
    
    try {
      const subscriptionData: Stripe.SubscriptionCreateParams = {
        customer: params.customerId,
        items: [{
          price: params.priceId,
          quantity: params.quantity || 1,
        }],
        metadata: params.metadata,
      };

      if (params.paymentMethodId) {
        subscriptionData.default_payment_method = params.paymentMethodId;
      }

      if (params.trialPeriodDays) {
        subscriptionData.trial_period_days = params.trialPeriodDays;
      }

      if (params.coupon) {
        subscriptionData.discounts = [{
          coupon: params.coupon,
        }];
      }

      const subscription = await stripe.subscriptions.create(subscriptionData);
      
      logger.info("Created new subscription", {
        subscriptionId: subscription.id,
        customerId: params.customerId,
        priceId: params.priceId,
      });
      
      return subscription;
    } catch (error) {
      logger.error("Failed to create subscription", {error, params});
      throw error;
    }
  }

  /**
   * Update an existing subscription
   */
  async updateSubscription(params: UpdateSubscriptionParams): Promise<Stripe.Subscription> {
    const stripe = await this.getStripe();
    
    try {
      const updateData: Stripe.SubscriptionUpdateParams = {};

      if (params.priceId) {
        // Cancel all existing items and add the new one
        const subscription = await stripe.subscriptions.retrieve(params.subscriptionId);
        updateData.items = [
          ...subscription.items.data.map(item => ({id: item.id, deleted: true})),
          {price: params.priceId, quantity: params.quantity || 1},
        ];
      } else if (params.quantity !== undefined) {
        // Just update quantity on existing items
        const subscription = await stripe.subscriptions.retrieve(params.subscriptionId);
        updateData.items = subscription.items.data.map(item => ({
          id: item.id,
          quantity: params.quantity,
        }));
      }

      if (params.metadata) {
        updateData.metadata = params.metadata;
      }

      if (params.cancelAtPeriodEnd !== undefined) {
        updateData.cancel_at_period_end = params.cancelAtPeriodEnd;
      }

      const subscription = await stripe.subscriptions.update(params.subscriptionId, updateData);
      
      logger.info("Updated subscription", {
        subscriptionId: params.subscriptionId,
        priceId: params.priceId,
        quantity: params.quantity,
      });
      
      return subscription;
    } catch (error) {
      logger.error("Failed to update subscription", {error, params});
      throw error;
    }
  }

  /**
   * Create a checkout session
   */
  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
    const stripe = await this.getStripe();
    
    try {
      const sessionData: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ["card"],
        line_items: [{
          price: params.priceId,
          quantity: params.quantity || 1,
        }],
        mode: "subscription",
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      };

      if (params.customerId) {
        sessionData.customer = params.customerId;
      } else if (params.customerEmail) {
        sessionData.customer_email = params.customerEmail;
      }

      const session = await stripe.checkout.sessions.create(sessionData);
      
      logger.info("Created checkout session", {
        sessionId: session.id,
        customerId: params.customerId,
        priceId: params.priceId,
      });
      
      return session;
    } catch (error) {
      logger.error("Failed to create checkout session", {error, params});
      throw error;
    }
  }

  /**
   * Get a subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
    const stripe = await this.getStripe();
    
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      logger.error("Error getting subscription", {error, subscriptionId});
      return null;
    }
  }

  /**
   * Map Stripe subscription status to our internal status
   */
  mapSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
    const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      canceled: SubscriptionStatus.CANCELED,
      incomplete: SubscriptionStatus.INCOMPLETE,
      incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
      past_due: SubscriptionStatus.PAST_DUE,
      trialing: SubscriptionStatus.TRIALING,
      unpaid: SubscriptionStatus.UNPAID,
      paused: SubscriptionStatus.PAUSED,
    };
    
    return statusMap[stripeStatus] || SubscriptionStatus.UNPAID;
  }
}

// Singleton instance
let stripeServiceInstance: StripeService | null = null;

/**
 * Get Stripe service instance
 */
export function getStripeService(): StripeService {
  if (!stripeServiceInstance) {
    stripeServiceInstance = new StripeService();
  }
  return stripeServiceInstance;
}

// Export types for convenience
export interface CreateCheckoutSessionParams {
  customerId?: string;
  customerEmail?: string;
  priceId: string;
  quantity?: number;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface UpdateSubscriptionParams {
  subscriptionId: string;
  priceId?: string;
  quantity?: number;
  metadata?: Record<string, string>;
  cancelAtPeriodEnd?: boolean;
}

export interface CancelSubscriptionParams {
  subscriptionId: string;
  cancelImmediately?: boolean;
  immediately?: boolean;
  reason?: string;
  feedback?: string;
}

export interface CreateSubscriptionParams {
  customerId: string;
  priceId: string;
  quantity?: number;
  paymentMethodId?: string;
  trialPeriodDays?: number;
  coupon?: string;
  metadata?: Record<string, string>;
}