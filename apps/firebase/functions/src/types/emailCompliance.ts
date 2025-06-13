import {Timestamp} from "firebase-admin/firestore";

/**
 * Email suppression list entry
 * Used to track emails that should not receive certain types of messages
 */
export interface EmailSuppressionEntry {
  /** Normalized email address (lowercase) */
  email: string;
  /** Reason for suppression */
  reason: "bounce" | "complaint" | "unsubscribe";
  /** Type of suppression */
  type: "hard" | "soft" | "transient";
  /** When the email was suppressed */
  suppressedAt: Timestamp;
  /** Whether the suppression is currently active */
  active: boolean;
  /** Additional metadata about the suppression */
  metadata: {
    /** Original message ID that caused suppression */
    messageId?: string;
    /** Bounce/complaint feedback ID */
    feedbackId?: string;
    /** Bounce type for bounce suppressions */
    bounceType?: string;
    /** Bounce subtype for bounce suppressions */
    bounceSubType?: string;
    /** Diagnostic code for bounces */
    diagnosticCode?: string;
    /** Complaint type for complaint suppressions */
    complaintType?: string;
    /** User agent for complaints */
    userAgent?: string;
    /** Source that triggered the suppression */
    source?: string;
  };
  /** User ID if linked to a user account */
  userId?: string;
  /** When the suppression was last updated */
  updatedAt?: Timestamp;
  /** When the suppression was removed (if inactive) */
  removedAt?: Timestamp;
  /** Reason for removal (if inactive) */
  removalReason?: string;
}

/**
 * Email preferences for granular control
 * Extends the existing user notification preferences
 */
export interface EmailPreferences {
  /** User ID this preference belongs to */
  userId: string;
  /** Global email opt-out (overrides all other settings) */
  globalOptOut: boolean;
  /** Email categories and their preferences */
  categories: {
    /** Marketing emails (newsletters, promotions) */
    marketing: boolean;
    /** Family-related notifications */
    familyUpdates: boolean;
    /** Event invitations and reminders */
    eventInvitations: boolean;
    /** System notifications (always enabled for security) */
    systemNotifications: boolean;
    /** Payment and billing notifications */
    billing: boolean;
  };
  /** Sub-preferences for more granular control */
  subPreferences: {
    /** Weekly digest emails */
    weeklyDigest: boolean;
    /** New story notifications */
    newStories: boolean;
    /** Comment notifications */
    comments: boolean;
    /** Family member join notifications */
    familyJoins: boolean;
    /** Product updates and announcements */
    productUpdates: boolean;
  };
  /** When preferences were last updated */
  lastUpdated: Timestamp;
  /** Consent history for GDPR compliance */
  consentHistory: Array<{
    /** Type of consent given/withdrawn */
    type: "opt-in" | "opt-out" | "preference-change";
    /** Categories affected */
    categories: string[];
    /** When consent was given/withdrawn */
    timestamp: Timestamp;
    /** IP address for audit trail */
    ipAddress?: string;
    /** Location for audit trail */
    location?: string;
    /** Version of terms/privacy policy */
    policyVersion?: string;
    /** Method of consent (web, mobile, email link) */
    method: "web" | "mobile" | "email" | "admin";
  }>;
}

/**
 * Email audit log for compliance and monitoring
 */
export interface EmailAuditLog {
  /** SES message ID */
  messageId: string;
  /** Email recipients */
  recipients: string[];
  /** Template used */
  templateType?: string;
  /** Email status */
  status: "sent" | "delivered" | "bounced" | "complained" | "suppressed";
  /** When the email was sent */
  timestamp: Timestamp;
  /** Source email address */
  source: string;
  /** Email subject */
  subject?: string;
  /** Processing time in milliseconds */
  processingTimeMillis?: number;
  /** SMTP response for delivered emails */
  smtpResponse?: string;
  /** Error message for failed emails */
  errorMessage?: string;
  /** Configuration set used */
  configurationSet?: string;
  /** User ID who triggered the email (if applicable) */
  triggeredByUserId?: string;
  /** Email type classification */
  emailType: "transactional" | "marketing";
}

/**
 * Email event log for detailed SES event tracking
 */
export interface EmailEventLog {
  /** SES event type */
  eventType: "send" | "reject" | "bounce" | "complaint" | "delivery" | "open" | "click";
  /** SES message ID */
  messageId: string;
  /** Event timestamp from SES */
  timestamp: Timestamp;
  /** Source email address */
  source: string;
  /** Destination email addresses */
  destinations: string[];
  /** SNS message ID */
  snsMessageId: string;
  /** SNS topic ARN */
  topicArn: string;
  /** When the event was processed by our system */
  processedAt: Timestamp;
  /** Bounce details (if bounce event) */
  bounce?: {
    feedbackId: string;
    bounceType: string;
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      action?: string;
      status?: string;
      diagnosticCode?: string;
    }>;
  };
  /** Complaint details (if complaint event) */
  complaint?: {
    feedbackId: string;
    complaintSubType?: string;
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    complaintFeedbackType?: string;
    userAgent?: string;
  };
  /** Delivery details (if delivery event) */
  delivery?: {
    processingTimeMillis: number;
    recipients: string[];
    smtpResponse: string;
    remoteMtaIp?: string;
  };
}

/**
 * Bounce tracking for soft bounce management
 */
export interface EmailBounceTracking {
  /** Email address being tracked */
  email: string;
  /** Number of consecutive bounces */
  bounceCount: number;
  /** First bounce timestamp */
  firstBounce: Timestamp;
  /** Most recent bounce timestamp */
  lastBounce: Timestamp;
  /** History of bounces */
  bounceHistory: Array<{
    timestamp: Timestamp;
    bounceType: string;
    bounceSubType: string;
    diagnosticCode?: string;
    messageId: string;
  }>;
  /** Whether this email has been suppressed */
  suppressed: boolean;
  /** When it was suppressed (if applicable) */
  suppressedAt?: Timestamp;
}

/**
 * Unsubscribe token for secure unsubscribe links
 */
export interface UnsubscribeToken {
  /** Unique token ID */
  tokenId: string;
  /** Email address this token is for */
  email: string;
  /** User ID (if linked to account) */
  userId?: string;
  /** When token was created */
  createdAt: Timestamp;
  /** When token expires */
  expiresAt: Timestamp;
  /** Whether token has been used */
  used: boolean;
  /** When token was used (if applicable) */
  usedAt?: Timestamp;
  /** IP address that used the token */
  usedFromIp?: string;
  /** Categories this token can modify */
  allowedCategories: string[];
  /** Type of unsubscribe action */
  actionType: "unsubscribe-all" | "manage-preferences" | "unsubscribe-category";
  /** Specific category for category unsubscribes */
  category?: string;
}

/**
 * Email compliance metrics for monitoring
 */
export interface EmailComplianceMetrics {
  /** Date of the metrics */
  date: string; // YYYY-MM-DD format
  /** Email volume metrics */
  volume: {
    sent: number;
    delivered: number;
    bounced: number;
    complained: number;
    suppressed: number;
  };
  /** Rate metrics (percentages) */
  rates: {
    deliveryRate: number;
    bounceRate: number;
    complaintRate: number;
    suppressionRate: number;
  };
  /** Suppression metrics */
  suppressions: {
    totalActive: number;
    newToday: number;
    byReason: {
      bounce: number;
      complaint: number;
      unsubscribe: number;
    };
    byType: {
      hard: number;
      soft: number;
      transient: number;
    };
  };
  /** Preference metrics */
  preferences: {
    totalOptOuts: number;
    newOptOuts: number;
    reSubscriptions: number;
    preferenceChanges: number;
  };
  /** Compliance metrics */
  compliance: {
    unsubscribeResponseTime: number; // average in hours
    complaintResponseTime: number; // average in minutes
    gdprRequestsProcessed: number;
    auditLogIntegrity: boolean;
  };
  /** When metrics were calculated */
  calculatedAt: Timestamp;
}
