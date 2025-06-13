import {defineSecret} from "firebase-functions/params";
import {logger} from "firebase-functions/v2";

/**
 * Stripe Configuration Guide:
 *
 * Test Mode:
 * 1. Go to https://dashboard.stripe.com/test/apikeys
 * 2. Copy your test Secret Key (sk_test_...)
 * 3. Create webhook endpoint at https://dashboard.stripe.com/test/webhooks
 * 4. Set endpoint URL to: https://[PROJECT_ID].cloudfunctions.net/stripeWebhook
 * 5. Select events to listen for:
 *    - checkout.session.completed
 *    - customer.subscription.created
 *    - customer.subscription.updated
 *    - customer.subscription.deleted
 *    - invoice.payment_failed
 *    - invoice.payment_succeeded
 * 6. Copy the webhook signing secret (whsec_...)
 *
 * Production:
 * Same process but at https://dashboard.stripe.com/apikeys
 *
 * Environment Variables:
 * - STRIPE_SECRET_KEY: Your Stripe secret key
 * - STRIPE_WEBHOOK_SECRET: Webhook endpoint signing secret
 * - STRIPE_PUBLISHABLE_KEY: Public key for client-side
 * - STRIPE_API_VERSION: (Optional) Pin specific API version
 */

// Stripe API Secret Key
// Production: sk_live_xxx, Test: sk_test_xxx
export const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

// Stripe Webhook Endpoint Secret
// Used to verify webhook signatures
export const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

// Stripe Publishable Key (for client-side usage)
// Production: pk_live_xxx, Test: pk_test_xxx
export const STRIPE_PUBLISHABLE_KEY = defineSecret("STRIPE_PUBLISHABLE_KEY");

// Optional: Stripe API Version
// If not set, uses the latest version from the SDK
export const STRIPE_API_VERSION = defineSecret("STRIPE_API_VERSION");

/**
 * Stripe configuration interface
 */
export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
  apiVersion?: string;
  maxNetworkRetries?: number;
  timeout?: number;
}

/**
 * Get Stripe configuration from secrets or environment variables
 * Following the pattern from getSESConfig()
 */
export function getStripeConfig(): StripeConfig {
  // For local development with emulator
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    // Try environment variables first for local development
    if (process.env.STRIPE_SECRET_KEY) {
      logger.info("Using Stripe config from environment variables");
      return {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
        apiVersion: process.env.STRIPE_API_VERSION,
        maxNetworkRetries: 3,
        timeout: 60000, // 60 seconds
      };
    }

    // Fallback to test values for local development
    logger.warn("Stripe config not found in environment, using test defaults");
    return {
      secretKey: "sk_test_placeholder",
      webhookSecret: "whsec_placeholder",
      publishableKey: "pk_test_placeholder",
      maxNetworkRetries: 3,
      timeout: 60000,
    };
  }

  // In production/staging, use secrets
  try {
    const config: StripeConfig = {
      secretKey: STRIPE_SECRET_KEY.value(),
      webhookSecret: STRIPE_WEBHOOK_SECRET.value(),
      publishableKey: STRIPE_PUBLISHABLE_KEY.value(),
      maxNetworkRetries: 3,
      timeout: 60000,
    };

    // Optional API version
    const apiVersion = STRIPE_API_VERSION.value();
    if (apiVersion) {
      config.apiVersion = apiVersion;
    }

    logger.info("Using Stripe config from Secret Manager");
    return config;
  } catch (error) {
    logger.error("Failed to load Stripe configuration from secrets", error);
    throw new Error("Stripe configuration is missing. Please set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PUBLISHABLE_KEY secrets.");
  }
}

/**
 * Check if we're in Stripe test mode
 */
export function isStripeTestMode(): boolean {
  const config = getStripeConfig();
  return config.secretKey.startsWith("sk_test_");
}
