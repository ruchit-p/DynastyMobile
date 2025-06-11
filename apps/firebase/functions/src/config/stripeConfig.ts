import {logger} from "firebase-functions/v2";
import Stripe from "stripe";
import {getStripeConfig as getStripeSecrets, isStripeTestMode} from "./stripeSecrets";

/**
 * Stripe API configuration constants
 */
export const STRIPE_CONFIG = {
  // API Version - Pin to ensure consistent behavior
  API_VERSION: "2025-05-28.basil" as const,

  // Retry configuration
  MAX_NETWORK_RETRIES: 3,
  TIMEOUT: 60000, // 60 seconds

  // Webhook configuration
  WEBHOOK_TOLERANCE_SECONDS: 300, // 5 minutes
  WEBHOOK_MAX_EVENT_AGE_SECONDS: 600, // 10 minutes

  // Payment configuration
  PAYMENT_METHOD_TYPES: ["card"] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
  BILLING_ADDRESS_COLLECTION: "auto" as const,

  // Subscription configuration
  PRORATION_BEHAVIOR: "create_prorations" as const,
  COLLECTION_METHOD: "charge_automatically" as const,

  // Memory and timeout for payment functions
  FUNCTION_MEMORY: "1GB" as const,
  FUNCTION_TIMEOUT: 540, // 9 minutes
  WEBHOOK_FUNCTION_TIMEOUT: 60, // 1 minute

  // Currency
  DEFAULT_CURRENCY: "usd",

  // Trial periods (in days)
  TRIAL_PERIOD_DAYS: {
    INDIVIDUAL: 7,
    FAMILY: 14,
  },
} as const;

/**
 * Environment-specific Stripe configuration
 */
export interface StripeEnvironmentConfig {
  isTestMode: boolean;
  dashboardUrl: string;
  checkoutSuccessUrl: string;
  checkoutCancelUrl: string;
  customerPortalUrl: string;
  webhookEndpointUrl: string;
}

/**
 * Get environment-specific Stripe configuration
 */
export function getStripeEnvironmentConfig(): StripeEnvironmentConfig {
  const isTest = isStripeTestMode();
  const frontendUrl = process.env.FRONTEND_URL || "https://mydynastyapp.com";
  const functionsUrl = process.env.FUNCTIONS_URL || `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net`;

  return {
    isTestMode: isTest,
    dashboardUrl: isTest ?
      "https://dashboard.stripe.com/test" :
      "https://dashboard.stripe.com",
    checkoutSuccessUrl: `${frontendUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    checkoutCancelUrl: `${frontendUrl}/subscription/cancelled`,
    customerPortalUrl: `${frontendUrl}/account/billing`,
    webhookEndpointUrl: `${functionsUrl}/stripeWebhook`,
  };
}

/**
 * Stripe client singleton
 */
let stripeClient: Stripe | null = null;

/**
 * Get or create Stripe client instance
 */
export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const config = getStripeSecrets();

    stripeClient = new Stripe(config.secretKey, {
      apiVersion: STRIPE_CONFIG.API_VERSION,
      typescript: true,
      maxNetworkRetries: config.maxNetworkRetries || STRIPE_CONFIG.MAX_NETWORK_RETRIES,
      timeout: config.timeout || STRIPE_CONFIG.TIMEOUT,
      telemetry: false, // Disable telemetry in serverless environment
    });

    logger.info("Stripe client initialized", {
      isTestMode: isStripeTestMode(),
      apiVersion: STRIPE_CONFIG.API_VERSION,
    });
  }

  return stripeClient;
}

/**
 * Create a Stripe checkout session configuration
 */
export function createCheckoutSessionConfig(params: {
  customerId?: string;
  customerEmail?: string;
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  metadata: Record<string, string>;
  subscriptionData?: Stripe.Checkout.SessionCreateParams.SubscriptionData;
  allowPromotionCodes?: boolean;
}): Stripe.Checkout.SessionCreateParams {
  const envConfig = getStripeEnvironmentConfig();

  return {
    mode: "subscription",
    payment_method_types: STRIPE_CONFIG.PAYMENT_METHOD_TYPES,
    line_items: params.lineItems,
    success_url: envConfig.checkoutSuccessUrl,
    cancel_url: envConfig.checkoutCancelUrl,
    customer: params.customerId,
    customer_email: params.customerEmail,
    client_reference_id: params.metadata.userId,
    metadata: params.metadata,
    subscription_data: params.subscriptionData,
    allow_promotion_codes: params.allowPromotionCodes ?? false,
    billing_address_collection: STRIPE_CONFIG.BILLING_ADDRESS_COLLECTION,
    customer_update: {
      address: "auto",
      name: "auto",
    },
    phone_number_collection: {
      enabled: true,
    },
    consent_collection: {
      terms_of_service: "required",
    },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
  };
}

/**
 * Create subscription update parameters
 */
export function createSubscriptionUpdateParams(params: {
  items?: Stripe.SubscriptionUpdateParams.Item[];
  metadata?: Record<string, string>;
  cancelAtPeriodEnd?: boolean;
  prorationBehavior?: Stripe.SubscriptionUpdateParams.ProrationBehavior;
  trialEnd?: number | "now";
}): Stripe.SubscriptionUpdateParams {
  return {
    items: params.items,
    metadata: params.metadata,
    cancel_at_period_end: params.cancelAtPeriodEnd,
    proration_behavior: params.prorationBehavior || STRIPE_CONFIG.PRORATION_BEHAVIOR,
    trial_end: params.trialEnd,
    payment_behavior: "error_if_incomplete",
    expand: ["latest_invoice.payment_intent"],
  };
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  endpointSecret: string
): Stripe.Event {
  const stripe = getStripeClient();

  try {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      endpointSecret
    );
  } catch (err) {
    logger.error("Webhook signature verification failed", {error: err});
    throw err;
  }
}

/**
 * Format amount for display (converts cents to dollars)
 */
export function formatAmount(amountInCents: number, currency: string = STRIPE_CONFIG.DEFAULT_CURRENCY): string {
  const amount = amountInCents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

/**
 * Get subscription status display text
 */
export function getSubscriptionStatusText(status: Stripe.Subscription.Status): string {
  const statusMap: Record<Stripe.Subscription.Status, string> = {
    active: "Active",
    past_due: "Past Due",
    unpaid: "Unpaid",
    canceled: "Canceled",
    incomplete: "Incomplete",
    incomplete_expired: "Expired",
    trialing: "Trial",
    paused: "Paused",
  };

  return statusMap[status] || "Unknown";
}

/**
 * Check if subscription is in good standing
 */
export function isSubscriptionActive(status: Stripe.Subscription.Status): boolean {
  return ["active", "trialing"].includes(status);
}

/**
 * Get trial end date for a plan
 */
export function getTrialEndDate(plan: "individual" | "family"): Date {
  const trialDays = STRIPE_CONFIG.TRIAL_PERIOD_DAYS[plan.toUpperCase() as keyof typeof STRIPE_CONFIG.TRIAL_PERIOD_DAYS];
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + trialDays);
  return trialEndDate;
}
