import Stripe from "stripe";
import {SubscriptionPlan, SubscriptionTier} from "./subscription";

// Checkout session metadata
export interface CheckoutSessionMetadata {
  userId: string;
  userEmail: string;
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  addons?: string; // JSON stringified array of addon IDs
  referralCode?: string;
  familyMemberIds?: string; // JSON stringified array of user IDs
  source?: string; // Where the checkout was initiated from
}

// Subscription metadata
export interface SubscriptionMetadata {
  userId: string;
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  referralCode?: string;
}

// Product metadata structure
export interface ProductMetadata {
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  type: "subscription" | "addon";
  storageGB?: string;
  familyMemberLimit?: string;
  features?: string; // JSON stringified array
}

// Price metadata
export interface PriceMetadata {
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  interval: "month" | "year";
  addOnType?: string;
}

// Webhook event data types
export interface WebhookEventData {
  object: Stripe.Event.Data.Object;
  previousAttributes?: Record<string, any>;
}

// Subscription item for addons
export interface SubscriptionItemData {
  id: string;
  priceId: string;
  productId: string;
  quantity: number;
  metadata: {
    addonType?: string;
    storageGB?: string;
  };
}

// Customer update data
export interface CustomerUpdateData {
  id: string;
  email?: string;
  metadata?: {
    userId?: string;
    displayName?: string;
  };
}

// Invoice data
export interface InvoiceData {
  id: string;
  customerId: string;
  subscriptionId: string;
  status: string;
  amountPaid: number;
  amountDue: number;
  currency: string;
  periodStart: number;
  periodEnd: number;
  billingReason: string;
  paymentIntentId?: string;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
}

// Payment method data
export interface PaymentMethodData {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  billingDetails?: {
    email?: string;
    name?: string;
    phone?: string;
  };
}

// Stripe configuration
export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
  apiVersion?: string;
  maxNetworkRetries?: number;
  timeout?: number;
}

// Product/Price mapping configuration
export interface StripePriceMapping {
  // Free plan
  free: {
    productId: string;
    priceId: null; // Free plan has no price
  };

  // Individual plans
  individual: {
    plus: {
      productId: string;
      priceIdMonthly: string;
      priceIdYearly?: string;
    };
  };

  // Family plan with tiers
  family: {
    family_2_5tb: {
      productId: string;
      priceIdMonthly: string;
      priceIdYearly?: string;
    };
    family_7_5tb: {
      productId: string;
      priceIdMonthly: string;
      priceIdYearly?: string;
    };
    family_12tb: {
      productId: string;
      priceIdMonthly: string;
      priceIdYearly?: string;
    };
  };

  // Addons (updated for pricing matrix)
  addons: {
    storage_1tb: {
      productId: string;
      priceIdMonthly: string;
    };
    storage_2tb: {
      productId: string;
      priceIdMonthly: string;
    };
    storage_5tb: {
      productId: string;
      priceIdMonthly: string;
    };
    storage_20tb: {
      productId: string;
      priceIdMonthly: string;
    };
  };
}

// Checkout session configuration
export interface CheckoutSessionConfig {
  mode: "subscription" | "payment";
  paymentMethodTypes: string[];
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  clientReferenceId?: string;
  metadata: CheckoutSessionMetadata;
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  subscriptionData?: {
    metadata: SubscriptionMetadata;
    trialPeriodDays?: number;
  };
  allowPromotionCodes?: boolean;
  billingAddressCollection?: "auto" | "required";
  customerUpdate?: {
    address?: "auto" | "never";
    name?: "auto" | "never";
  };
}

// Subscription update configuration
export interface SubscriptionUpdateConfig {
  items?: Array<{
    id?: string;
    price?: string;
    quantity?: number;
  }>;
  prorationBehavior?: "create_prorations" | "none" | "always_invoice";
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, string>;
  paymentBehavior?: "default_incomplete" | "error_if_incomplete" | "allow_incomplete";
}

// Error types for better error handling
export enum StripeErrorType {
  INVALID_REQUEST = "invalid_request",
  API_ERROR = "api_error",
  CARD_ERROR = "card_error",
  AUTHENTICATION_ERROR = "authentication_error",
  RATE_LIMIT_ERROR = "rate_limit_error",
  WEBHOOK_ERROR = "webhook_error",
  CONFIGURATION_ERROR = "configuration_error",
}

// Custom error class for Stripe operations
export class StripeOperationError extends Error {
  constructor(
    message: string,
    public errorType: StripeErrorType,
    public stripeError?: Stripe.errors.StripeError,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = "StripeOperationError";
  }
}
