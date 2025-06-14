// MARK: - AWS SMS Webhook Handler

import {onRequest} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode, handleError, withErrorHandling} from "../utils/errors";
import {getAWSSmsService} from "../services/awsSmsService";
import {validateSNSSignature, SNSMessage} from "./ses/snsValidator";
import {AWS_WEBHOOK_CONFIG} from "../config/awsConfig";
import {validateRequest} from "../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../config/validation-schemas";
import {createLogContext} from "../utils/sanitization";

// MARK: - Types

interface SMSEventRecord {
  eventVersion: string;
  eventSource: string;
  eventName: string;
  eventTime: string;
  messageId: string;
  destinationPhoneNumber: string;
  messageStatus: "SUCCESSFUL" | "FAILED" | "PENDING" | "OPTED_OUT";
  messageStatusDescription?: string;
  isFinal: boolean;
  priceInUSD?: string;
  numberOfMessageParts?: number;
  originationIdentity?: string;
  originationPhoneNumber?: string;
  messageType?: string;
  configurationSet?: string;
}

// MARK: - Helper Functions

/**
 * Parse SMS event from SNS message
 */
function parseSMSEvent(message: string): SMSEventRecord | null {
  try {
    const event = JSON.parse(message);
    
    // Validate required fields
    if (!event.messageId || !event.destinationPhoneNumber || !event.messageStatus) {
      logger.warn("Invalid SMS event structure", {event});
      return null;
    }
    
    return event as SMSEventRecord;
  } catch (error) {
    logger.error("Failed to parse SMS event", {error, message});
    return null;
  }
}

/**
 * Process SMS delivery event
 */
async function processSMSEvent(event: SMSEventRecord): Promise<void> {
  const smsService = getAWSSmsService();
  
  try {
    // Log the event for debugging
    logger.info("Processing SMS event", createLogContext({
      messageId: event.messageId,
      status: event.messageStatus,
      phoneNumber: event.destinationPhoneNumber,
      isFinal: event.isFinal,
      cost: event.priceInUSD,
    }));
    
    // Only update status for final events
    if (event.isFinal) {
      await smsService.updateSmsStatus(
        event.messageId,
        event.messageStatus,
        event.messageStatusDescription
      );
      
      // Log cost information if available
      if (event.priceInUSD) {
        logger.info("SMS cost recorded", {
          messageId: event.messageId,
          cost: event.priceInUSD,
          parts: event.numberOfMessageParts,
        });
      }
    }
    
    // Handle opt-out status
    if (event.messageStatus === "OPTED_OUT") {
      logger.warn("Phone number opted out", createLogContext({
        phoneNumber: event.destinationPhoneNumber,
        messageId: event.messageId,
      }));
      // You might want to update user preferences here
    }
  } catch (error) {
    throw handleError(error, "processSMSEvent", ErrorCode.INTERNAL, {
      messageId: event.messageId,
      status: event.messageStatus,
    });
  }
}

// MARK: - Webhook Handler

/**
 * AWS SMS webhook handler for SNS notifications
 * Receives SMS delivery status updates from AWS End User Messaging
 */
export const awsSmsWebhook = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: AWS_WEBHOOK_CONFIG.timeoutSeconds,
    maxInstances: 10,
  },
  async (req, res) => {
    try {
      // Only accept POST requests
      if (req.method !== "POST") {
        res.status(405).send("Method not allowed");
        return;
      }
      
      // Validate request body against schema
      const validation = validateRequest(req.body, VALIDATION_SCHEMAS.awsSnsWebhook);
      if (!validation.valid) {
        logger.error("Invalid webhook request", {error: validation.error});
        res.status(400).send("Invalid request");
        return;
      }
      
      // Parse SNS message
      const snsMessage = req.body as SNSMessage;
      
      // Always validate SNS message signature for security
      const isValid = await validateSNSSignature(snsMessage);
      if (!isValid) {
        logger.error("Invalid SNS signature", createLogContext({
          messageId: snsMessage.MessageId,
          topicArn: snsMessage.TopicArn,
        }));
        res.status(401).send("Invalid signature");
        return;
      }
      
      // Handle SNS subscription confirmation
      if (snsMessage.Type === "SubscriptionConfirmation") {
        logger.info("SNS subscription confirmation received", createLogContext({
          topicArn: snsMessage.TopicArn,
          token: snsMessage.Token?.substring(0, 10) + "...",
        }));
        
        // Auto-confirm subscription in production
        if (snsMessage.SubscribeURL) {
          try {
            const https = await import("https");
            await new Promise((resolve, reject) => {
              https.get(snsMessage.SubscribeURL!, (res) => {
                if (res.statusCode === 200) {
                  resolve(true);
                } else {
                  reject(new Error(`Failed to confirm subscription: ${res.statusCode}`));
                }
              }).on("error", reject);
            });
            logger.info("SNS subscription confirmed", {topicArn: snsMessage.TopicArn});
          } catch (error) {
            logger.error("Failed to confirm SNS subscription", {error});
          }
        }
        
        res.status(200).send("Subscription confirmation processed");
        return;
      }
      
      // Handle unsubscribe confirmation
      if (snsMessage.Type === "UnsubscribeConfirmation") {
        logger.info("SNS unsubscribe confirmation received", createLogContext({
          topicArn: snsMessage.TopicArn,
        }));
        res.status(200).send("Unsubscribe confirmation received");
        return;
      }
      
      // Handle SMS event notification
      if (snsMessage.Type === "Notification") {
        const notification = snsMessage as SNSNotification;
        
        // Parse SMS event from message
        const smsEvent = parseSMSEvent(notification.Message);
        if (!smsEvent) {
          logger.error("Failed to parse SMS event from SNS notification", createLogContext({
            messageId: notification.MessageId,
          }));
          res.status(400).send("Invalid SMS event format");
          return;
        }
        
        // Process the SMS event
        await processSMSEvent(smsEvent);
        
        res.status(200).send("SMS event processed");
        return;
      }
      
      // Unknown message type
      logger.warn("Unknown SNS message type", {type: snsMessage.Type});
      res.status(400).send("Unknown message type");
      
    } catch (error) {
      const err = handleError(error, "awsSmsWebhook", ErrorCode.INTERNAL);
      res.status(500).send("Internal server error");
    }
  }
);