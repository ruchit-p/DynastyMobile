import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_REGION, FUNCTION_TIMEOUT } from '../../common';
import { createLogContext } from '../../utils/sanitization';
import { validateSNSSignature, isTimestampRecent } from './snsValidator';

interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL?: string;
}

interface SESEvent {
  eventType: 'send' | 'reject' | 'bounce' | 'complaint' | 'delivery' | 'open' | 'click';
  mail: {
    timestamp: string;
    source: string;
    sourceArn: string;
    sourceIp: string;
    sendingAccountId: string;
    messageId: string;
    destination: string[];
    headersTruncated: boolean;
    headers: Array<{ name: string; value: string }>;
    commonHeaders: {
      from: string[];
      to: string[];
      messageId: string;
      subject: string;
    };
  };
  bounce?: {
    feedbackId: string;
    bounceType: 'Undetermined' | 'Permanent' | 'Transient';
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      action?: string;
      status?: string;
      diagnosticCode?: string;
    }>;
    timestamp: string;
    remoteMtaIp?: string;
    reportingMTA?: string;
  };
  complaint?: {
    feedbackId: string;
    complaintSubType?: string;
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    timestamp: string;
    userAgent?: string;
    complaintFeedbackType?: string;
    arrivalDate?: string;
  };
  delivery?: {
    timestamp: string;
    processingTimeMillis: number;
    recipients: string[];
    smtpResponse: string;
    remoteMtaIp?: string;
    reportingMTA?: string;
  };
}

/**
 * Handles incoming SES events via SNS webhooks
 * Processes bounces, complaints, and deliveries for email compliance
 */
export const handleSESWebhook = onRequest(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    cors: false, // SNS webhooks don't need CORS
  },
  async (request, response) => {
    try {
      // Only accept POST requests
      if (request.method !== 'POST') {
        logger.warn('Invalid HTTP method for SES webhook', {
          method: request.method,
          headers: request.headers,
        });
        response.status(405).send('Method Not Allowed');
        return;
      }

      // Parse SNS message
      const snsMessage: SNSMessage = request.body;

      logger.info(
        'Received SES webhook',
        createLogContext({
          messageId: snsMessage.MessageId,
          type: snsMessage.Type,
          topicArn: snsMessage.TopicArn,
          subject: snsMessage.Subject,
        })
      );

      // Validate SNS signature for security
      const isValidSignature = await validateSNSSignature(snsMessage);
      if (!isValidSignature) {
        logger.error(
          'Invalid SNS signature',
          createLogContext({
            messageId: snsMessage.MessageId,
            topicArn: snsMessage.TopicArn,
          })
        );
        response.status(403).send('Forbidden: Invalid signature');
        return;
      }

      // Validate timestamp to prevent replay attacks
      if (!isTimestampRecent(snsMessage.Timestamp)) {
        logger.warn(
          'SNS message timestamp too old',
          createLogContext({
            messageId: snsMessage.MessageId,
            timestamp: snsMessage.Timestamp,
            topicArn: snsMessage.TopicArn,
          })
        );
        response.status(400).send('Bad Request: Message timestamp too old');
        return;
      }

      // Handle different SNS message types
      if (snsMessage.Type === 'SubscriptionConfirmation') {
        // For initial SNS topic subscription
        logger.info(
          'SNS subscription confirmation',
          createLogContext({
            topicArn: snsMessage.TopicArn,
            subscribeURL: snsMessage.UnsubscribeURL,
          })
        );
        response.status(200).send('Subscription confirmed');
        return;
      }

      if (snsMessage.Type === 'Notification') {
        // Parse the SES event from the SNS message
        let sesEvent: SESEvent;
        try {
          sesEvent = JSON.parse(snsMessage.Message);
        } catch (parseError) {
          logger.error(
            'Failed to parse SES event',
            createLogContext({
              error: parseError instanceof Error ? parseError.message : String(parseError),
              message: snsMessage.Message,
            })
          );
          response.status(400).send('Bad Request: Invalid SES event format');
          return;
        }

        // Process the event based on type
        await processSESEvent(sesEvent, snsMessage);
        response.status(200).send('OK');
        return;
      }

      // Unknown message type
      logger.warn(
        'Unknown SNS message type',
        createLogContext({
          type: snsMessage.Type,
          messageId: snsMessage.MessageId,
        })
      );
      response.status(200).send('OK'); // Still return 200 to avoid retries
    } catch (error) {
      logger.error(
        'Error processing SES webhook',
        createLogContext({
          error: error instanceof Error ? error.message : String(error),
          body: request.body,
        })
      );

      // Return 500 to trigger SNS retry
      response.status(500).send('Internal Server Error');
    }
  }
);

/**
 * Process different types of SES events
 */
async function processSESEvent(event: SESEvent, snsMessage: SNSMessage): Promise<void> {
  const db = getFirestore();

  // Log the event for audit purposes
  await logEmailEvent(event, snsMessage);

  switch (event.eventType) {
    case 'bounce':
      await processBounceEvent(event, db);
      break;
    case 'complaint':
      await processComplaintEvent(event, db);
      break;
    case 'delivery':
      await processDeliveryEvent(event, db);
      break;
    case 'send':
      await processSendEvent(event, db);
      break;
    default:
      logger.info(
        'Unhandled SES event type',
        createLogContext({
          eventType: event.eventType,
          messageId: event.mail.messageId,
        })
      );
  }
}

/**
 * Process bounce events and update suppression list
 */
async function processBounceEvent(event: SESEvent, db: FirebaseFirestore.Firestore): Promise<void> {
  if (!event.bounce) return;

  const { bounce, mail } = event;

  logger.info(
    'Processing bounce event',
    createLogContext({
      messageId: mail.messageId,
      bounceType: bounce.bounceType,
      bounceSubType: bounce.bounceSubType,
      recipients: bounce.bouncedRecipients.length,
    })
  );

  // Process each bounced recipient
  for (const recipient of bounce.bouncedRecipients) {
    const email = recipient.emailAddress.toLowerCase();

    // Determine suppression type based on bounce type
    let suppressionType: 'hard' | 'soft' | 'transient';
    if (bounce.bounceType === 'Permanent') {
      suppressionType = 'hard';
    } else if (bounce.bounceType === 'Transient') {
      suppressionType = 'transient';
    } else {
      suppressionType = 'soft';
    }

    // Only suppress hard bounces and repeated soft bounces
    if (suppressionType === 'hard') {
      await addToSuppressionList(db, email, 'bounce', suppressionType, {
        bounceType: bounce.bounceType,
        bounceSubType: bounce.bounceSubType,
        diagnosticCode: recipient.diagnosticCode,
        messageId: mail.messageId,
        feedbackId: bounce.feedbackId,
      });
    } else if (suppressionType === 'soft') {
      // Track soft bounces and suppress after 3 occurrences
      await trackSoftBounce(db, email, {
        bounceType: bounce.bounceType,
        bounceSubType: bounce.bounceSubType,
        diagnosticCode: recipient.diagnosticCode,
        messageId: mail.messageId,
      });
    }
  }
}

/**
 * Process complaint events and immediately suppress
 */
async function processComplaintEvent(
  event: SESEvent,
  db: FirebaseFirestore.Firestore
): Promise<void> {
  if (!event.complaint) return;

  const { complaint, mail } = event;

  logger.info(
    'Processing complaint event',
    createLogContext({
      messageId: mail.messageId,
      complaintType: complaint.complaintFeedbackType,
      recipients: complaint.complainedRecipients.length,
    })
  );

  // Immediately suppress all complained recipients
  for (const recipient of complaint.complainedRecipients) {
    const email = recipient.emailAddress.toLowerCase();

    await addToSuppressionList(db, email, 'complaint', 'hard', {
      complaintType: complaint.complaintFeedbackType,
      complaintSubType: complaint.complaintSubType,
      messageId: mail.messageId,
      feedbackId: complaint.feedbackId,
      userAgent: complaint.userAgent,
    });

    // Also update user preferences to opt out of all marketing emails
    await optOutUserFromMarketing(db, email);
  }
}

/**
 * Process delivery events for tracking
 */
async function processDeliveryEvent(
  event: SESEvent,
  db: FirebaseFirestore.Firestore
): Promise<void> {
  if (!event.delivery) return;

  const { delivery, mail } = event;

  logger.info(
    'Processing delivery event',
    createLogContext({
      messageId: mail.messageId,
      recipients: delivery.recipients.length,
      processingTime: delivery.processingTimeMillis,
    })
  );

  // Update audit log with delivery confirmation
  await db.collection('emailAuditLog').add({
    messageId: mail.messageId,
    recipients: delivery.recipients,
    status: 'delivered',
    timestamp: Timestamp.fromDate(new Date(delivery.timestamp)),
    processingTimeMillis: delivery.processingTimeMillis,
    smtpResponse: delivery.smtpResponse,
    source: mail.source,
  });
}

/**
 * Process send events for tracking
 */
async function processSendEvent(event: SESEvent, db: FirebaseFirestore.Firestore): Promise<void> {
  const { mail } = event;

  logger.info(
    'Processing send event',
    createLogContext({
      messageId: mail.messageId,
      destinations: mail.destination.length,
      source: mail.source,
    })
  );

  // Log the send event
  await db.collection('emailAuditLog').add({
    messageId: mail.messageId,
    recipients: mail.destination,
    status: 'sent',
    timestamp: Timestamp.fromDate(new Date(mail.timestamp)),
    source: mail.source,
    subject: mail.commonHeaders.subject,
  });
}

/**
 * Add email to suppression list
 */
async function addToSuppressionList(
  db: FirebaseFirestore.Firestore,
  email: string,
  reason: 'bounce' | 'complaint' | 'unsubscribe',
  type: 'hard' | 'soft' | 'transient',
  metadata: any
): Promise<void> {
  const suppressionRef = db.collection('emailSuppressionList').doc(email);

  await suppressionRef.set(
    {
      email,
      reason,
      type,
      suppressedAt: FieldValue.serverTimestamp(),
      metadata,
      active: true,
    },
    { merge: true }
  );

  logger.info(
    'Added email to suppression list',
    createLogContext({
      email: email.substring(0, 3) + '***', // Mask email for privacy
      reason,
      type,
    })
  );
}

/**
 * Track soft bounces and suppress after threshold
 */
async function trackSoftBounce(
  db: FirebaseFirestore.Firestore,
  email: string,
  bounceInfo: any
): Promise<void> {
  const bounceRef = db.collection('emailBounceTracking').doc(email);
  const bounceDoc = await bounceRef.get();

  if (bounceDoc.exists) {
    const data = bounceDoc.data();
    const bounceCount = (data?.bounceCount || 0) + 1;

    await bounceRef.update({
      bounceCount,
      lastBounce: FieldValue.serverTimestamp(),
      bounceHistory: FieldValue.arrayUnion({
        timestamp: FieldValue.serverTimestamp(),
        ...bounceInfo,
      }),
    });

    // Suppress after 3 soft bounces
    if (bounceCount >= 3) {
      await addToSuppressionList(db, email, 'bounce', 'soft', {
        softBounceCount: bounceCount,
        lastBounceInfo: bounceInfo,
      });
    }
  } else {
    await bounceRef.set({
      email,
      bounceCount: 1,
      firstBounce: FieldValue.serverTimestamp(),
      lastBounce: FieldValue.serverTimestamp(),
      bounceHistory: [
        {
          timestamp: FieldValue.serverTimestamp(),
          ...bounceInfo,
        },
      ],
    });
  }
}

/**
 * Opt user out of marketing emails after complaint
 */
async function optOutUserFromMarketing(
  db: FirebaseFirestore.Firestore,
  email: string
): Promise<void> {
  // Find user by email
  const usersQuery = await db.collection('users').where('email', '==', email).limit(1).get();

  if (!usersQuery.empty) {
    const userDoc = usersQuery.docs[0];
    await userDoc.ref.update({
      'emailPreferences.marketing': false,
      'emailPreferences.familyUpdates': false,
      'emailPreferences.eventInvitations': false,
      'emailPreferences.lastUpdated': FieldValue.serverTimestamp(),
    });

    logger.info(
      'User opted out of marketing emails',
      createLogContext({
        userId: userDoc.id,
        email: email.substring(0, 3) + '***',
      })
    );
  }
}

/**
 * Log email events for audit trail
 */
async function logEmailEvent(event: SESEvent, snsMessage: SNSMessage): Promise<void> {
  const db = getFirestore();

  await db.collection('emailEventLog').add({
    eventType: event.eventType,
    messageId: event.mail.messageId,
    timestamp: Timestamp.fromDate(new Date(event.mail.timestamp)),
    source: event.mail.source,
    destinations: event.mail.destination,
    snsMessageId: snsMessage.MessageId,
    topicArn: snsMessage.TopicArn,
    processedAt: FieldValue.serverTimestamp(),
    bounce: event.bounce || null,
    complaint: event.complaint || null,
    delivery: event.delivery || null,
  });
}
