// MARK: - Twilio Configuration

import {defineSecret} from "firebase-functions/params";

// Define Twilio secrets
export const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
export const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");
export const twilioPhoneNumber = defineSecret("TWILIO_PHONE_NUMBER");

// SMS Configuration
export const SMS_CONFIG = {
  // Maximum message length before splitting
  maxMessageLength: 1600, // Twilio's limit

  // Link shortening
  useShortLinks: true,
  shortLinkDomain: "https://dyn.link", // Configure your short link domain

  // Retry configuration
  maxRetries: 3,
  retryDelay: 1000, // milliseconds

  // Default country code
  defaultCountryCode: "+1", // US

  // Test mode settings
  testMode: process.env.NODE_ENV === "development",
  testPhoneNumbers: [
    "+15555551234", // Add test numbers here
  ],

  // Character replacements for SMS
  characterReplacements: {
    "\u2014": "-", // em dash
    "\u201C": "\"", // left double quotation mark
    "\u201D": "\"", // right double quotation mark
    "\u2018": "'", // left single quotation mark
    "\u2019": "'", // right single quotation mark
    "\u2026": "...", // horizontal ellipsis
  },
};

// SMS sending windows (in user's timezone)
export const SMS_SENDING_WINDOWS = {
  // Don't send SMS before this hour (24-hour format)
  earliestHour: 9,
  // Don't send SMS after this hour
  latestHour: 21,
  // Days of week to send reminders (0 = Sunday, 6 = Saturday)
  allowedDays: [0, 1, 2, 3, 4, 5, 6], // All days
};

// Event reminder timings (in hours before event)
export const EVENT_REMINDER_TIMINGS = [
  {hours: 168, name: "1 week"},
  {hours: 48, name: "2 days"},
  {hours: 24, name: "1 day"},
  {hours: 2, name: "2 hours"},
];

// SMS cost tracking
export const SMS_COSTS = {
  // Cost per SMS in USD (update based on your Twilio pricing)
  US: 0.0079,
  CA: 0.0075,
  UK: 0.04,
  AU: 0.055,
  // Add more countries as needed
  DEFAULT: 0.05, // Conservative default for unknown countries
};

// Webhook configuration
export const TWILIO_WEBHOOK_CONFIG = {
  // Path for status callbacks
  statusCallbackPath: "/webhooks/twilio/status",
  // Validate webhook signatures
  validateSignatures: true,
  // Webhook timeout
  timeoutSeconds: 15,
};
