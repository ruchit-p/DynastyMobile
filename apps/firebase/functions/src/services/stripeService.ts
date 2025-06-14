import Stripe from "stripe";
import {logger} from "firebase-functions/v2";
import {defineSecret} from "firebase-functions/params";

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
        apiVersion: "2024-06-20",
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
        status: "succeeded",
        limit: 100,
        expand: ["data.balance_transaction"],
      });

      // Calculate total revenue
      let totalRevenue = 0;
      for (const charge of charges.data) {
        if (charge.balance_transaction && typeof charge.balance_transaction === "object") {
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
}

export interface CancelSubscriptionParams {
  subscriptionId: string;
  immediately?: boolean;
  reason?: string;
}