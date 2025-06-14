// MARK: - AWS End User Messaging SMS Service

import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {createError, ErrorCode, handleError} from "../utils/errors";
import {logger} from "firebase-functions/v2";
import {sanitizePhoneNumber as sanitizePhoneForLogs, createLogContext} from "../utils/sanitization";
import {sanitizeUserInput} from "../utils/xssSanitization";
import {isValidPhone} from "../utils/validation";
import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
  DescribePhoneNumbersCommand,
  MessageType,
  ConflictException,
  ServiceQuotaExceededException,
  ValidationException,
  AccessDeniedException,
  ResourceNotFoundException,
  ThrottlingException,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import {
  awsAccessKeyId,
  awsSecretAccessKey,
  awsRegion,
  awsSmsPhonePoolId,
  awsSmsConfigurationSetName,
  SMS_CONFIG,
  SMS_COSTS,
  AWS_SDK_CONFIG,
  AWS_SMS_SERVICE_CONFIG,
} from "../config/awsConfig";

const db = getFirestore();

// MARK: - Types

export interface SmsMessage {
  to: string;
  body: string;
  mediaUrl?: string; // For future MMS support
}

export interface SmsPreferences {
  enabled: boolean;
  familyInvites: boolean;
  eventInvites: boolean;
  eventReminders: boolean;
  eventUpdates: boolean;
  rsvpConfirmations: boolean;
  reminderTiming: number; // hours before event
}

export interface SmsLog {
  id?: string;
  userId: string;
  phoneNumber: string;
  type: SmsType;
  status: "pending" | "sent" | "failed" | "delivered";
  messageId?: string; // AWS Message ID
  message: string;
  metadata: Record<string, any>;
  createdAt: Timestamp | FieldValue;
  sentAt?: Timestamp;
  deliveredAt?: Timestamp;
  error?: string;
  cost?: number;
}

export type SmsType =
  | "family_invite"
  | "event_invite"
  | "event_reminder"
  | "event_update"
  | "rsvp_confirmation"
  | "phone_verification";

// MARK: - SMS Templates

export const SMS_TEMPLATES = {
  familyInvite: (inviterName: string, familyName: string, inviteLink: string): string =>
    `${inviterName} invited you to join the ${familyName} family on Dynasty! Join here: ${inviteLink}`,

  eventInvite: (eventName: string, date: string, location: string, rsvpLink: string): string =>
    `You're invited to ${eventName} on ${date} at ${location}. RSVP: ${rsvpLink}`,

  eventReminder: (eventName: string, timeUntil: string): string =>
    `Reminder: ${eventName} is in ${timeUntil}. We hope to see you there!`,

  eventUpdate: (eventName: string, changeType: string, details: string): string =>
    `${eventName} update: ${changeType}. ${details}`,

  rsvpConfirmation: (eventName: string, rsvpStatus: string, guestCount?: number): string => {
    const guestInfo = guestCount && guestCount > 1 ? ` for ${guestCount} guests` : "";
    return `Your RSVP for ${eventName} is confirmed as "${rsvpStatus}"${guestInfo}.`;
  },

  phoneVerification: (code: string): string =>
    `Your Dynasty verification code is: ${code}. This code expires in 10 minutes.`,
};

// MARK: - Configuration

interface AWSConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  phonePoolId: string;
  configurationSetName: string;
  testMode?: boolean;
}

// MARK: - Helper Functions

/**
 * Get AWS configuration from Firebase secrets
 */
async function getAWSConfig(): Promise<AWSConfig> {
  try {
    const config = {
      region: awsRegion.value(),
      accessKeyId: awsAccessKeyId.value(),
      secretAccessKey: awsSecretAccessKey.value(),
      phonePoolId: awsSmsPhonePoolId.value(),
      configurationSetName: awsSmsConfigurationSetName.value(),
      testMode: process.env.NODE_ENV === "development",
    };

    if (!config.region || !config.accessKeyId || !config.secretAccessKey || 
        !config.phonePoolId || !config.configurationSetName) {
      throw createError(
        ErrorCode.INTERNAL,
        "AWS configuration is incomplete. Please set all required AWS secrets."
      );
    }

    return config;
  } catch (error) {
    throw handleError(error, "getAWSConfig", ErrorCode.INTERNAL);
  }
}

/**
 * Format phone number to E.164 format
 */
export function formatPhoneNumber(phoneNumber: string): string {
  // Sanitize input first
  const sanitized = sanitizeUserInput(phoneNumber, {maxLength: 20});
  
  // Remove all non-numeric characters except +
  const cleaned = sanitized.replace(/[^\d+]/g, "");

  // If already in E.164 format (starts with +), validate and return
  if (cleaned.startsWith("+")) {
    // Validate it's a proper E.164 format
    if (cleaned.length >= 10 && cleaned.length <= 15 && isValidPhone(cleaned)) {
      return cleaned;
    }
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      "Invalid phone number format. E.164 format should be 10-15 digits including country code."
    );
  }

  // Add country code if not present (assuming US for 10-digit numbers)
  let formatted: string;
  if (cleaned.length === 10) {
    formatted = `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
    formatted = `+${cleaned}`;
  } else {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      "Invalid phone number format. Please provide a valid phone number."
    );
  }

  // Final validation
  if (!isValidPhone(formatted)) {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      "Invalid phone number format."
    );
  }

  return formatted;
}

/**
 * Validate SMS preferences
 */
export function validateSmsPreferences(preferences: Partial<SmsPreferences>): void {
  if (preferences.reminderTiming !== undefined) {
    if (preferences.reminderTiming < 1 || preferences.reminderTiming > 168) {
      throw createError(
        ErrorCode.INVALID_ARGUMENT,
        "Reminder timing must be between 1 and 168 hours"
      );
    }
  }
}

/**
 * Replace special characters that might cause issues with SMS
 */
function sanitizeSmsContent(content: string): string {
  // First apply XSS sanitization
  let sanitized = sanitizeUserInput(content, {
    maxLength: SMS_CONFIG.maxMessageLength,
    allowedTags: [], // No HTML in SMS
  });
  
  // Replace special characters as defined in config
  Object.entries(SMS_CONFIG.characterReplacements).forEach(([char, replacement]) => {
    sanitized = sanitized.replace(new RegExp(char, "g"), replacement);
  });
  
  // Ensure message doesn't exceed maximum length
  if (sanitized.length > SMS_CONFIG.maxMessageLength) {
    sanitized = sanitized.substring(0, SMS_CONFIG.maxMessageLength - 3) + "...";
  }
  
  return sanitized;
}

/**
 * Calculate SMS cost based on destination country
 */
function calculateSmsCost(phoneNumber: string): number {
  // Extract country code from phone number
  const countryCode = phoneNumber.substring(0, 3);
  
  // Map country codes to cost structure
  const costMap: Record<string, keyof typeof SMS_COSTS> = {
    "+1": "US",
    "+44": "UK",
    "+61": "AU",
    // Add more mappings as needed
  };
  
  const country = costMap[countryCode];
  return SMS_COSTS[country] || SMS_COSTS.DEFAULT;
}

// MARK: - AWS SMS Service Class

export class AWSSmsService {
  private client: PinpointSMSVoiceV2Client | null = null;
  private config: AWSConfig | null = null;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize the AWS client
   */
  private async initialize(): Promise<void> {
    if (this.client && this.config) return;
    
    if (!this.initializationPromise) {
      this.initializationPromise = this.doInitialize();
    }
    
    await this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      this.config = await getAWSConfig();
      
      // Initialize AWS client with configuration
      this.client = new PinpointSMSVoiceV2Client({
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        maxAttempts: AWS_SDK_CONFIG.maxAttempts,
        requestHandler: {
          requestTimeout: AWS_SDK_CONFIG.requestTimeout,
        },
      });
    } catch (error) {
      throw handleError(error, "AWSSmsService.initialize", ErrorCode.INTERNAL);
    }
  }

  /**
   * Send an SMS message
   */
  async sendSms(message: SmsMessage, userId: string, type: SmsType, metadata: Record<string, any> = {}): Promise<string> {
    await this.initialize();
    
    try {
      // Format and validate phone number
      const formattedPhone = formatPhoneNumber(message.to);
      
      // Sanitize message content
      const sanitizedBody = sanitizeSmsContent(message.body);
      
      // Calculate cost
      const estimatedCost = calculateSmsCost(formattedPhone);
      
      // Create SMS log entry
      const smsLogRef = db.collection("smsLogs").doc();
      const smsLog: SmsLog = {
        id: smsLogRef.id,
        userId,
        phoneNumber: formattedPhone,
        type,
        status: "pending",
        message: sanitizedBody,
        metadata: {
          ...metadata,
          originalMessageLength: message.body.length,
          sanitized: message.body !== sanitizedBody,
        },
        createdAt: FieldValue.serverTimestamp(),
        cost: estimatedCost,
      };

      await smsLogRef.set(smsLog);

      // In test mode, skip actual sending
      if (this.config!.testMode && SMS_CONFIG.testPhoneNumbers.includes(formattedPhone)) {
        logger.info("Test mode: SMS would be sent", createLogContext({
          to: formattedPhone,
          bodyLength: sanitizedBody.length,
          type,
        }));
        await smsLogRef.update({
          status: "sent",
          sentAt: FieldValue.serverTimestamp(),
          messageId: "TEST_" + Date.now(),
        });
        return smsLogRef.id;
      }

      // Prepare SMS command
      const command = new SendTextMessageCommand({
        DestinationPhoneNumber: formattedPhone,
        MessageBody: sanitizedBody,
        MessageType: AWS_SMS_SERVICE_CONFIG.messageType as MessageType,
        OriginationIdentity: this.config!.phonePoolId,
        ConfigurationSetName: this.config!.configurationSetName,
        // Add sender ID for countries that support it
        ...(AWS_SMS_SERVICE_CONFIG.senderId ? {
          SenderId: AWS_SMS_SERVICE_CONFIG.senderId,
        } : {}),
        // Add DLT parameters for India if configured
        ...(AWS_SMS_SERVICE_CONFIG.entityId ? {
          DltEntityId: AWS_SMS_SERVICE_CONFIG.entityId,
          DltTemplateId: AWS_SMS_SERVICE_CONFIG.templateId,
        } : {}),
      });

      // Send SMS via AWS
      const result = await this.client!.send(command);

      // Update log with success
      await smsLogRef.update({
        status: "sent",
        sentAt: FieldValue.serverTimestamp(),
        messageId: result.MessageId,
      });

      logger.info("SMS sent successfully", createLogContext({
        smsLogId: smsLogRef.id,
        messageId: result.MessageId,
        type,
        phoneNumber: formattedPhone, // Will be sanitized by createLogContext
        cost: estimatedCost,
      }));

      return smsLogRef.id;
    } catch (error) {
      // Map AWS errors to appropriate error codes
      let errorCode = ErrorCode.INTERNAL;
      let errorMessage = "Failed to send SMS";
      
      if (error instanceof ValidationException) {
        errorCode = ErrorCode.INVALID_ARGUMENT;
        errorMessage = "Invalid SMS parameters";
      } else if (error instanceof AccessDeniedException) {
        errorCode = ErrorCode.PERMISSION_DENIED;
        errorMessage = "Access denied. Check AWS permissions.";
      } else if (error instanceof ResourceNotFoundException) {
        errorCode = ErrorCode.NOT_FOUND;
        errorMessage = "AWS SMS resources not found. Check configuration.";
      } else if (error instanceof ThrottlingException) {
        errorCode = ErrorCode.RATE_LIMITED;
        errorMessage = "SMS rate limit exceeded. Please try again later.";
      } else if (error instanceof ServiceQuotaExceededException) {
        errorCode = ErrorCode.RESOURCE_EXHAUSTED;
        errorMessage = "AWS service quota exceeded.";
      } else if (error instanceof ConflictException) {
        errorCode = ErrorCode.ALREADY_EXISTS;
        errorMessage = "SMS conflict error. Please try again.";
      }
      
      throw handleError(error, "AWSSmsService.sendSms", errorCode, {
        message: errorMessage,
        phoneNumber: sanitizePhoneForLogs(message.to),
        type,
      });
    }
  }

  /**
   * Send multiple SMS messages (batch)
   */
  async sendBatchSms(
    messages: Array<SmsMessage & { userId: string; type: SmsType; metadata?: Record<string, any> }>
  ): Promise<string[]> {
    await this.initialize();
    
    // AWS End User Messaging doesn't have a native batch API like Twilio
    // We'll process messages in parallel with rate limiting
    const batchSize = 10; // Process 10 messages at a time
    const results: string[] = [];
    const errors: any[] = [];
    
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((msg) =>
          this.sendSms(
            {to: msg.to, body: msg.body, mediaUrl: msg.mediaUrl},
            msg.userId,
            msg.type,
            msg.metadata || {}
          )
        )
      );
      
      batchResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          errors.push({
            index: i + index,
            phoneNumber: messages[i + index].to,
            error: result.reason,
          });
        }
      });
      
      // Add a small delay between batches to avoid throttling
      if (i + batchSize < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    if (errors.length > 0) {
      logger.warn("Some SMS messages failed to send", createLogContext({
        errorCount: errors.length,
        totalMessages: messages.length,
        errors: errors.map(e => ({
          ...e,
          phoneNumber: sanitizePhoneForLogs(e.phoneNumber),
        })),
      }));
    }
    
    return results;
  }

  /**
   * Update SMS delivery status (called by webhook handler)
   */
  async updateSmsStatus(messageId: string, status: string, errorCode?: string): Promise<void> {
    try {
      // Find the SMS log by AWS Message ID
      const snapshot = await db.collection("smsLogs")
        .where("messageId", "==", messageId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        logger.warn("SMS log not found for Message ID", createLogContext({messageId}));
        return;
      }

      const doc = snapshot.docs[0];
      const updateData: any = {
        status: status === "SUCCESSFUL" ? "delivered" : "failed",
        ...(status === "SUCCESSFUL" && {deliveredAt: FieldValue.serverTimestamp()}),
        ...(errorCode && {error: errorCode}),
      };

      await doc.ref.update(updateData);
      logger.info("SMS status updated", createLogContext({messageId, status}));
    } catch (error) {
      logger.error("Failed to update SMS status", createLogContext({
        error: error instanceof Error ? error.message : "Unknown error",
        messageId,
      }));
    }
  }

  /**
   * Check if phone number is opted out
   */
  async checkOptOutStatus(phoneNumber: string): Promise<boolean> {
    await this.initialize();
    
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);
      
      // Check opt-out list in AWS
      const command = new DescribePhoneNumbersCommand({
        PhoneNumberIds: [formattedPhone],
      });
      
      const response = await this.client!.send(command);
      const phoneInfo = response.PhoneNumbers?.[0];
      
      if (phoneInfo?.OptOutListName) {
        logger.info("Phone number is opted out", createLogContext({
          phoneNumber: formattedPhone,
          optOutList: phoneInfo.OptOutListName,
        }));
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error("Failed to check opt-out status", createLogContext({
        error: error instanceof Error ? error.message : "Unknown error",
        phoneNumber,
      }));
      // In case of error, assume not opted out to avoid blocking legitimate messages
      return false;
    }
  }

  /**
   * Get user's SMS preferences
   */
  async getUserSmsPreferences(userId: string): Promise<SmsPreferences | null> {
    try {
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        return null;
      }

      const userData = userDoc.data();
      return userData?.smsPreferences || null;
    } catch (error) {
      throw handleError(error, "getUserSmsPreferences", ErrorCode.INTERNAL, {
        userId: sanitizeUserInput(userId, {maxLength: 50}),
      });
    }
  }

  /**
   * Check if user has SMS enabled for a specific type
   */
  async canSendSmsToUser(userId: string, type: SmsType): Promise<boolean> {
    const preferences = await this.getUserSmsPreferences(userId);
    if (!preferences || !preferences.enabled) {
      return false;
    }

    switch (type) {
    case "family_invite":
      return preferences.familyInvites;
    case "event_invite":
      return preferences.eventInvites;
    case "event_reminder":
      return preferences.eventReminders;
    case "event_update":
      return preferences.eventUpdates;
    case "rsvp_confirmation":
      return preferences.rsvpConfirmations;
    case "phone_verification":
      return true; // Always allow verification codes
    default:
      return false;
    }
  }
}

// MARK: - Rate Limiting

interface RateLimitConfig {
  maxPerHour: number;
  maxPerDay: number;
  maxPerMonth: number;
}

const RATE_LIMITS: Record<SmsType, RateLimitConfig> = {
  family_invite: {maxPerHour: 5, maxPerDay: 20, maxPerMonth: 100},
  event_invite: {maxPerHour: 20, maxPerDay: 100, maxPerMonth: 500},
  event_reminder: {maxPerHour: 50, maxPerDay: 200, maxPerMonth: 1000},
  event_update: {maxPerHour: 20, maxPerDay: 100, maxPerMonth: 500},
  rsvp_confirmation: {maxPerHour: 50, maxPerDay: 200, maxPerMonth: 1000},
  phone_verification: {maxPerHour: 3, maxPerDay: 10, maxPerMonth: 50},
};

/**
 * Check if user has exceeded rate limits
 */
export async function checkRateLimit(userId: string, type: SmsType): Promise<boolean> {
  const limits = RATE_LIMITS[type];
  const now = new Date();

  // Check hourly limit
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const hourlyCount = await db.collection("smsLogs")
    .where("userId", "==", userId)
    .where("type", "==", type)
    .where("createdAt", ">=", oneHourAgo)
    .count()
    .get();

  if (hourlyCount.data().count >= limits.maxPerHour) {
    throw createError(
      ErrorCode.RESOURCE_EXHAUSTED,
      `SMS rate limit exceeded. Maximum ${limits.maxPerHour} ${type} messages per hour.`
    );
  }

  // Check daily limit
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dailyCount = await db.collection("smsLogs")
    .where("userId", "==", userId)
    .where("type", "==", type)
    .where("createdAt", ">=", oneDayAgo)
    .count()
    .get();

  if (dailyCount.data().count >= limits.maxPerDay) {
    throw createError(
      ErrorCode.RESOURCE_EXHAUSTED,
      `SMS rate limit exceeded. Maximum ${limits.maxPerDay} ${type} messages per day.`
    );
  }

  return true;
}

// MARK: - Singleton Instance

let awsSmsService: AWSSmsService | null = null;

export function getAWSSmsService(): AWSSmsService {
  if (!awsSmsService) {
    awsSmsService = new AWSSmsService();
  }
  return awsSmsService;
}