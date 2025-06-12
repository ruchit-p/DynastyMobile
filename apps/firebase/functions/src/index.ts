/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// Load environment variables for local development
if (process.env.FUNCTIONS_EMULATOR === "true") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config({path: ".env.local"});
}

import {initializeApp} from "firebase-admin/app";
import {setGlobalOptions} from "firebase-functions/v2";
import {DEFAULT_REGION} from "./common";
import {UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN} from "./services/rateLimitService";
import {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_API_VERSION,
} from "./config/stripeSecrets";

// Set global options for ALL Firebase Functions
setGlobalOptions({
  region: DEFAULT_REGION,
  secrets: [
    UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN,
    // Stripe secrets
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    STRIPE_PUBLISHABLE_KEY,
    STRIPE_API_VERSION,
  ],
});

// Initialize Firebase Admin
if (process.env.FUNCTIONS_EMULATOR === "true") {
  // Set environment variables BEFORE initializing Firebase Admin SDK
  // Use the correct environment variable names for Firebase emulators
  process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = "localhost:9199";

  // For emulator, use the configured project ID to avoid warnings
  initializeApp({
    projectId: "dynasty-eba63",
    // No credentials needed for emulator
  });
} else {
  // For production, use default credentials
  initializeApp();
}

// Export all functions
export * from "./familyTree";
export * from "./stories";
export * from "./auth/index"; // Modular auth functions (user management, authentication, passwords, etc.)
export * from "./api"; // HTTP API endpoints
export * from "./events-service"; // Consolidated event management functions
export * from "./notifications"; // Notification functions
export * from "./vault";
export * from "./placesApi";
export * from "./encryption"; // End-to-end encryption functions
export * from "./support"; // Support and contact functions
export * from "./sync"; // Offline sync functions
export * from "./messaging"; // Chat messaging and notifications
export * from "./chatManagement"; // Chat management APIs
export * from "./migrations/userDocumentConsistency"; // User document consistency migration
export * from "./migrations/userSubscriptionFieldsMigration"; // User subscription fields migration
export * from "./migrations/addSearchableFields"; // Add searchable fields for optimized search
export * from "./signal"; // Signal Protocol key management and verification
export * from "./sms"; // Twilio SMS functions for invitations and notifications
export * from "./subscriptions"; // Stripe subscription management and webhooks
export * from "./emailCompliance"; // Email compliance management (unsubscribe, preferences, suppression)
export * from "./webhooks/ses/sesEventHandler"; // SES webhook handlers for bounces and complaints

// R2 Migration functions (only when enabled)
if (process.env.ENABLE_R2_MIGRATION === "true") {
  console.log("R2 migration functions enabled");
  // Dynamic imports for optional functions
  import("./migrations/r2VaultMigration").then((module) => {
    Object.keys(module).forEach((key) => {
      (exports as any)[key] = (module as any)[key];
    });
  });
}

// R2 Test functions (only in development)
if (process.env.NODE_ENV !== "production" && process.env.ENABLE_R2_TESTS === "true") {
  console.log("R2 test functions enabled");
  import("./test/r2ServiceTest").then((module) => {
    Object.keys(module).forEach((key) => {
      (exports as any)[key] = (module as any)[key];
    });
  });
}
