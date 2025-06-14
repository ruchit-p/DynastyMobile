// MARK: - AWS End User Messaging Configuration

import {defineSecret} from "firebase-functions/params";

// Define AWS secrets
export const awsAccessKeyId = defineSecret("AWS_ACCESS_KEY_ID");
export const awsSecretAccessKey = defineSecret("AWS_SECRET_ACCESS_KEY");
export const awsRegion = defineSecret("AWS_REGION");
export const awsSmsPhonePoolId = defineSecret("AWS_SMS_PHONE_POOL_ID");
export const awsSmsConfigurationSetName = defineSecret("AWS_SMS_CONFIGURATION_SET_NAME");

// SMS Configuration
export const SMS_CONFIG = {
  // Maximum message length before splitting
  maxMessageLength: 1600, // SMS standard limit
  
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
  // Cost per SMS in USD (update based on AWS End User Messaging pricing)
  US: 0.00581, // AWS End User Messaging US pricing
  CA: 0.00575,
  UK: 0.0311,
  AU: 0.0420,
  // Add more countries as needed
  DEFAULT: 0.05, // Conservative default for unknown countries
};

// Webhook configuration for AWS SNS
export const AWS_WEBHOOK_CONFIG = {
  // Path for SNS notifications
  snsCallbackPath: "/webhooks/aws/sms-events",
  // Validate SNS message signatures
  validateSignatures: true,
  // Webhook timeout
  timeoutSeconds: 15,
};

// AWS SDK Configuration
export const AWS_SDK_CONFIG = {
  // Connection pooling
  maxSockets: 50,
  // Request timeout
  requestTimeout: 30000, // 30 seconds
  // Retry configuration
  maxAttempts: 3,
  retryMode: "adaptive",
};

// AWS End User Messaging specific configuration
export const AWS_SMS_SERVICE_CONFIG = {
  // Message type - TRANSACTIONAL or PROMOTIONAL
  messageType: "TRANSACTIONAL",
  // Sender ID support (for countries that support it)
  senderId: "Dynasty",
  // DLT registration for India (if applicable)
  entityId: undefined,
  templateId: undefined,
};