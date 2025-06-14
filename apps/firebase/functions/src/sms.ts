// MARK: - SMS Firebase Functions

import {onCall, onRequest} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {createError, withErrorHandling, ErrorCode} from "./utils/errors";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";
import {
  getAWSSmsService,
  SMS_TEMPLATES,
  checkRateLimit,
  validateSmsPreferences,
  formatPhoneNumber,
  type SmsType,
} from "./services/awsSmsService";

const db = getFirestore();

// MARK: - Update SMS Preferences

export const updateSmsPreferences = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  secrets: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_SMS_PHONE_POOL_ID", "AWS_SMS_CONFIGURATION_SET_NAME"],
}, async (request) => {
  return withErrorHandling(async () => {
    // Validate request
    const validation = validateRequest(request, VALIDATION_SCHEMAS.updateSmsPreferences);
    if (!validation.valid) {
      throw createError(ErrorCode.INVALID_ARGUMENT, validation.error);
    }

    const {auth} = request;
    if (!auth) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {preferences, phoneNumber} = request.data;

    // Validate preferences
    validateSmsPreferences(preferences);

    // Format and validate phone number if provided
    let formattedPhone: string | undefined;
    if (phoneNumber) {
      formattedPhone = formatPhoneNumber(phoneNumber);
    }

    // Update user document
    await db.collection("users").doc(auth.uid).update({
      smsPreferences: preferences,
      ...(formattedPhone && {phoneNumber: formattedPhone}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: "SMS preferences updated successfully",
    };
  }, "updateSmsPreferences")();
});

// MARK: - Send Phone Verification

export const sendPhoneVerification = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  secrets: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_SMS_PHONE_POOL_ID", "AWS_SMS_CONFIGURATION_SET_NAME"],
}, async (request) => {
  return withErrorHandling(async () => {
    // Validate request
    const validation = validateRequest(request, VALIDATION_SCHEMAS.sendPhoneVerification);
    if (!validation.valid) {
      throw createError(ErrorCode.INVALID_ARGUMENT, validation.error);
    }

    const {auth} = request;
    if (!auth) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {phoneNumber} = request.data;

    // Check rate limit
    await checkRateLimit(auth.uid, "phone_verification");

    // Generate 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store verification code (expires in 10 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await db.collection("phoneVerifications").doc(auth.uid).set({
      phoneNumber: formatPhoneNumber(phoneNumber),
      code,
      attempts: 0,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Send SMS
    const awsSmsService = getAWSSmsService();
    await awsSmsService.sendSms(
      {
        to: phoneNumber,
        body: SMS_TEMPLATES.phoneVerification(code),
      },
      auth.uid,
      "phone_verification"
    );

    return {
      success: true,
      message: "Verification code sent",
    };
  }, "sendPhoneVerification")();
});

// MARK: - Verify Phone Number

export const verifySmsCode = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
}, async (request) => {
  return withErrorHandling(async () => {
    // Validate request
    const validation = validateRequest(request, VALIDATION_SCHEMAS.verifySmsCode);
    if (!validation.valid) {
      throw createError(ErrorCode.INVALID_ARGUMENT, validation.error);
    }

    const {auth} = request;
    if (!auth) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {phoneNumber, code} = request.data;

    // Get verification record
    const verificationDoc = await db.collection("phoneVerifications").doc(auth.uid).get();
    if (!verificationDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "No verification request found");
    }

    const verification = verificationDoc.data()!;

    // Check expiration
    if (verification.expiresAt.toDate() < new Date()) {
      await verificationDoc.ref.delete();
      throw createError(ErrorCode.FAILED_PRECONDITION, "Verification code has expired");
    }

    // Check attempts
    if (verification.attempts >= 3) {
      await verificationDoc.ref.delete();
      throw createError(ErrorCode.PERMISSION_DENIED, "Too many attempts. Please request a new code.");
    }

    // Verify code
    if (verification.code !== code.trim()) {
      await verificationDoc.ref.update({
        attempts: verification.attempts + 1,
      });
      return {
        verified: false,
        attemptsRemaining: 3 - verification.attempts - 1,
      };
    }

    // Success - update user document
    await db.collection("users").doc(auth.uid).update({
      phoneNumber: verification.phoneNumber,
      phoneVerified: true,
      phoneVerifiedAt: FieldValue.serverTimestamp(),
    });

    // Delete verification record
    await verificationDoc.ref.delete();

    return {
      verified: true,
      message: "Phone number verified successfully",
    };
  }, "verifySmsCode")();
});

// MARK: - Send Event SMS

export const sendEventSms = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_SMS_PHONE_POOL_ID", "AWS_SMS_CONFIGURATION_SET_NAME"],
}, async (request) => {
  return withErrorHandling(async () => {
    const {auth} = request;
    if (!auth) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {eventId, recipientIds, template} = request.data;
    if (!eventId || !recipientIds || !Array.isArray(recipientIds)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid request data");
    }

    // Get event data
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (!eventDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Event not found");
    }

    const event = eventDoc.data()!;

    // Check if user is event admin
    if (event.createdBy !== auth.uid && !event.adminUserIds?.includes(auth.uid)) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Only event admins can send SMS");
    }

    // Get recipients
    const recipientDocs = await db.collection("users")
      .where("__name__", "in", recipientIds)
      .get();

    const awsSmsService = getAWSSmsService();
    const messages = [];

    for (const doc of recipientDocs.docs) {
      const recipient = doc.data();

      // Check if user has SMS enabled
      if (!await awsSmsService.canSendSmsToUser(doc.id, "event_invite")) {
        continue;
      }

      if (!recipient.phoneNumber || !recipient.phoneVerified) {
        continue;
      }

      // Prepare message based on template
      let messageBody = "";
      const eventDate = event.startDate.toDate().toLocaleDateString();
      const rsvpLink = `https://mydynastyapp.com/events/${eventId}/rsvp`;

      switch (template) {
      case "invite":
        messageBody = SMS_TEMPLATES.eventInvite(
          event.title,
          eventDate,
          event.location || "TBD",
          rsvpLink
        );
        break;
      case "reminder": {
        const hoursUntil = Math.floor((event.startDate.toDate().getTime() - Date.now()) / (1000 * 60 * 60));
        const timeUntil = hoursUntil > 24 ? `${Math.floor(hoursUntil / 24)} days` : `${hoursUntil} hours`;
        messageBody = SMS_TEMPLATES.eventReminder(event.title, timeUntil);
        break;
      }
      case "update":
        messageBody = SMS_TEMPLATES.eventUpdate(
          event.title,
          "Event details updated",
          "Check the app for details"
        );
        break;
      default:
        throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid template");
      }

      messages.push({
        to: recipient.phoneNumber,
        body: messageBody,
        userId: doc.id,
        type: "event_invite" as SmsType,
        metadata: {
          eventId,
          template,
        },
      });
    }

    // Send batch SMS
    const results = await awsSmsService.sendBatchSms(messages);

    return {
      success: true,
      sent: results.length,
      total: messages.length,
      message: `SMS sent to ${results.length} of ${messages.length} recipients`,
    };
  }, "sendEventSms")();
});

// MARK: - Send Test SMS

export const sendTestSms = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  secrets: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_SMS_PHONE_POOL_ID", "AWS_SMS_CONFIGURATION_SET_NAME"],
}, async (request) => {
  return withErrorHandling(async () => {
    // Validate request
    const validation = validateRequest(request, VALIDATION_SCHEMAS.sendTestSms);
    if (!validation.valid) {
      throw createError(ErrorCode.INVALID_ARGUMENT, validation.error);
    }

    const {auth} = request;
    if (!auth) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {phoneNumber} = request.data;

    // Check rate limit
    await checkRateLimit(auth.uid, "phone_verification");

    // Send test SMS
    const awsSmsService = getAWSSmsService();
    await awsSmsService.sendSms(
      {
        to: phoneNumber,
        body: "This is a test message from Dynasty. If you received this, SMS is working correctly!",
      },
      auth.uid,
      "phone_verification"
    );

    return {
      success: true,
      message: "Test SMS sent successfully",
    };
  }, "sendTestSms")();
});

// Note: AWS SMS webhook is now handled in webhooks/awsSmsWebhook.ts
// The old twilioWebhook export has been removed as it's no longer needed
