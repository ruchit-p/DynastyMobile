// MARK: - Twilio SMS Service

import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {createError, ErrorCode} from "../utils/errors";
import {logger} from "firebase-functions/v2";

import twilio from "twilio";

const db = getFirestore();

// MARK: - Types

export interface SmsMessage {
  to: string;
  body: string;
  mediaUrl?: string; // For MMS support
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
  twilioSid?: string;
  message: string;
  metadata: Record<string, any>;
  createdAt: Timestamp | FieldValue;
  sentAt?: Timestamp;
  deliveredAt?: Timestamp;
  error?: string;
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

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  testMode?: boolean;
}

// MARK: - Helper Functions

/**
 * Get Twilio configuration from Firebase functions config
 */
function getTwilioConfig(): TwilioConfig {
  // In production, these would come from Firebase secrets
  // For now, we'll use placeholders
  const config = {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
    testMode: process.env.NODE_ENV === "development",
  };

  if (!config.accountSid || !config.authToken || !config.phoneNumber) {
    throw createError(
      ErrorCode.INTERNAL,
      "Twilio configuration is incomplete. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER."
    );
  }

  return config;
}

/**
 * Format phone number to E.164 format
 */
export function formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-numeric characters
  const cleaned = phoneNumber.replace(/\D/g, "");

  // Add country code if not present (assuming US for now)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  } else if (cleaned.startsWith("+")) {
    return phoneNumber;
  }

  throw createError(
    ErrorCode.INVALID_ARGUMENT,
    "Invalid phone number format. Please provide a valid phone number."
  );
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

// MARK: - SMS Service Class

export class TwilioService {
  private client: twilio.Twilio;
  private config: TwilioConfig;

  constructor() {
    this.config = getTwilioConfig();
    // Initialize Twilio client
    this.client = twilio(this.config.accountSid, this.config.authToken);
  }

  /**
   * Send an SMS message
   */
  async sendSms(message: SmsMessage, userId: string, type: SmsType, metadata: Record<string, any> = {}): Promise<string> {
    try {
      // Format phone number
      const formattedPhone = formatPhoneNumber(message.to);

      // Create SMS log entry
      const smsLogRef = db.collection("smsLogs").doc();
      const smsLog: SmsLog = {
        id: smsLogRef.id,
        userId,
        phoneNumber: formattedPhone,
        type,
        status: "pending",
        message: message.body,
        metadata,
        createdAt: FieldValue.serverTimestamp(),
      };

      await smsLogRef.set(smsLog);

      // In test mode, skip actual sending
      if (this.config.testMode) {
        logger.info("Test mode: SMS would be sent", {to: formattedPhone, body: message.body});
        await smsLogRef.update({
          status: "sent",
          sentAt: FieldValue.serverTimestamp(),
          twilioSid: "TEST_" + Date.now(),
        });
        return smsLogRef.id;
      }

      // Send SMS via Twilio
      const result = await this.client.messages.create({
        body: message.body,
        from: this.config.phoneNumber,
        to: formattedPhone,
        ...(message.mediaUrl && {mediaUrl: [message.mediaUrl]}),
      });

      // Update log with success
      await smsLogRef.update({
        status: "sent",
        sentAt: FieldValue.serverTimestamp(),
        twilioSid: result.sid,
      });

      logger.info("SMS sent successfully", {
        smsLogId: smsLogRef.id,
        twilioSid: result.sid,
        type,
      });

      return smsLogRef.id;
    } catch (error) {
      logger.error("Failed to send SMS", {error, message});

      // Update log with failure if we have a log ID
      if (error instanceof Error) {
        throw createError(
          ErrorCode.INTERNAL,
          `Failed to send SMS: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Send multiple SMS messages (batch)
   */
  async sendBatchSms(
    messages: Array<SmsMessage & { userId: string; type: SmsType; metadata?: Record<string, any> }>
  ): Promise<string[]> {
    const results = await Promise.allSettled(
      messages.map((msg) =>
        this.sendSms(
          {to: msg.to, body: msg.body, mediaUrl: msg.mediaUrl},
          msg.userId,
          msg.type,
          msg.metadata || {}
        )
      )
    );

    const successfulIds: string[] = [];
    const errors: any[] = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successfulIds.push(result.value);
      } else {
        errors.push({
          index,
          phoneNumber: messages[index].to,
          error: result.reason,
        });
      }
    });

    if (errors.length > 0) {
      logger.warn("Some SMS messages failed to send", {errors});
    }

    return successfulIds;
  }

  /**
   * Update SMS delivery status (webhook handler)
   */
  async updateSmsStatus(twilioSid: string, status: string, errorCode?: string): Promise<void> {
    try {
      // Find the SMS log by Twilio SID
      const snapshot = await db.collection("smsLogs")
        .where("twilioSid", "==", twilioSid)
        .limit(1)
        .get();

      if (snapshot.empty) {
        logger.warn("SMS log not found for Twilio SID", {twilioSid});
        return;
      }

      const doc = snapshot.docs[0];
      const updateData: any = {
        status: status === "delivered" ? "delivered" : "failed",
        ...(status === "delivered" && {deliveredAt: FieldValue.serverTimestamp()}),
        ...(errorCode && {error: errorCode}),
      };

      await doc.ref.update(updateData);
      logger.info("SMS status updated", {twilioSid, status});
    } catch (error) {
      logger.error("Failed to update SMS status", {error, twilioSid});
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
      logger.error("Failed to get user SMS preferences", {error, userId});
      throw error;
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

let twilioService: TwilioService | null = null;

export function getTwilioService(): TwilioService {
  if (!twilioService) {
    twilioService = new TwilioService();
  }
  return twilioService;
}
