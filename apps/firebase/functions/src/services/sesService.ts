import {
  SESClient,
  SendTemplatedEmailCommand,
  GetIdentityVerificationAttributesCommand,
  GetSendStatisticsCommand,
} from '@aws-sdk/client-ses';
import { logger } from 'firebase-functions/v2';
import { createError, ErrorCode } from '../utils/errors';
import { createLogContext } from '../utils/sanitization';
import { getEmailSuppressionService } from './emailSuppressionService';

interface SESConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  fromEmail: string;
  fromName: string;
}

interface SendTemplatedEmailOptions {
  to: string | string[];
  template: string;
  templateData: Record<string, any>;
  replyTo?: string[];
  configurationSet?: string;
  emailType?: 'transactional' | 'marketing';
  allowSuppressionOverride?: boolean;
}

/**
 * AWS SES Service for sending templated emails
 * Replaces SendGrid implementation with AWS SES
 */
export class SESService {
  private sesClient: SESClient;
  private config: SESConfig;
  private initialized: boolean = false;

  constructor(config: SESConfig) {
    this.config = config;

    // Initialize AWS SES client configuration
    const clientConfig: any = {
      region: config.region,
    };

    // Only add credentials if explicitly provided (for local testing)
    // In production, use IAM roles instead
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    this.sesClient = new SESClient(clientConfig);
    this.initialized = true;
  }

  /**
   * Send a templated email using AWS SES
   */
  async sendTemplatedEmail(options: SendTemplatedEmailOptions): Promise<void> {
    if (!this.initialized) {
      throw createError(ErrorCode.INTERNAL, 'SES service not initialized');
    }

    const {
      to,
      template,
      templateData,
      replyTo,
      configurationSet,
      emailType = 'marketing',
      allowSuppressionOverride = false,
    } = options;

    // Ensure 'to' is an array
    const toAddresses = Array.isArray(to) ? to : [to];

    // Check suppression list for all recipients
    const suppressionService = getEmailSuppressionService();
    const validRecipients: string[] = [];
    const suppressedRecipients: string[] = [];

    for (const email of toAddresses) {
      const validation = await suppressionService.validateEmailForSending(
        email,
        emailType,
        allowSuppressionOverride
      );

      if (validation.canSend) {
        validRecipients.push(email);
      } else {
        suppressedRecipients.push(email);
        logger.info(
          'Email blocked by suppression list',
          createLogContext({
            email: email.substring(0, 3) + '***',
            reason: validation.reason,
            template,
          })
        );
      }
    }

    // If no valid recipients, don't send
    if (validRecipients.length === 0) {
      logger.warn(
        'All recipients suppressed, email not sent',
        createLogContext({
          template,
          suppressedCount: suppressedRecipients.length,
          originalRecipients: toAddresses.length,
        })
      );
      return;
    }

    // Log if some recipients were suppressed
    if (suppressedRecipients.length > 0) {
      logger.info(
        'Some recipients suppressed',
        createLogContext({
          template,
          validRecipients: validRecipients.length,
          suppressedRecipients: suppressedRecipients.length,
        })
      );
    }

    // Build the SES command input with valid recipients only
    const input: any = {
      Source: `${this.config.fromName} <${this.config.fromEmail}>`,
      Destination: {
        ToAddresses: validRecipients,
      },
      Template: template,
      TemplateData: JSON.stringify(templateData),
      ConfigurationSetName: configurationSet || 'dynasty-email-events', // Use default configuration set
    };

    // Add optional parameters
    if (replyTo && replyTo.length > 0) {
      input.ReplyToAddresses = replyTo;
    }

    try {
      const command = new SendTemplatedEmailCommand(input);
      const result = await this.sesClient.send(command);

      logger.info(
        'Email sent successfully via SES',
        createLogContext({
          messageId: result.MessageId,
          to: validRecipients,
          template,
          region: this.config.region,
          suppressedCount: suppressedRecipients.length,
        })
      );
    } catch (error: any) {
      logger.error(
        'Failed to send email via SES',
        createLogContext({
          error: error.message,
          code: error.code || error.name,
          statusCode: error.$metadata?.httpStatusCode,
          to: toAddresses,
          template,
          templateData,
        })
      );

      // Handle specific SES errors
      const errorCode = error.code || error.name;
      if (errorCode === 'MessageRejected') {
        throw createError(
          ErrorCode.INVALID_ARGUMENT,
          'Email rejected by SES. Please check the recipient address.'
        );
      } else if (errorCode === 'TemplateDoesNotExist') {
        throw createError(ErrorCode.NOT_FOUND, `Email template '${template}' not found in SES.`);
      } else if (errorCode === 'ConfigurationSetDoesNotExist') {
        throw createError(ErrorCode.NOT_FOUND, 'SES configuration set not found.');
      } else if (
        errorCode === 'Throttling' ||
        errorCode === 'SendingQuotaExceeded' ||
        errorCode === 'TooManyRequestsException'
      ) {
        throw createError(
          ErrorCode.RESOURCE_EXHAUSTED,
          'Email sending limit exceeded. Please try again later.'
        );
      } else {
        throw createError(ErrorCode.INTERNAL, `Failed to send email: ${error.message}`);
      }
    }
  }

  /**
   * Verify if an email address is verified in SES
   */
  async isEmailVerified(email: string): Promise<boolean> {
    try {
      const command = new GetIdentityVerificationAttributesCommand({
        Identities: [email],
      });
      const result = await this.sesClient.send(command);

      const attributes = result.VerificationAttributes?.[email];
      return attributes?.VerificationStatus === 'Success';
    } catch (error) {
      logger.error(
        'Failed to check email verification status',
        createLogContext({
          email,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      return false;
    }
  }

  /**
   * Get sending statistics
   */
  async getSendingStatistics(): Promise<any> {
    try {
      const command = new GetSendStatisticsCommand({});
      return await this.sesClient.send(command);
    } catch (error) {
      logger.error(
        'Failed to get sending statistics',
        createLogContext({
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw createError(ErrorCode.INTERNAL, 'Failed to retrieve sending statistics');
    }
  }
}

// Singleton instance
let sesInstance: SESService | null = null;

/**
 * Get or create SES service instance
 */
export function getSESService(config?: SESConfig): SESService {
  if (!sesInstance && !config) {
    throw createError(
      ErrorCode.INTERNAL,
      'SES service not configured. Please provide configuration.'
    );
  }

  if (!sesInstance && config) {
    sesInstance = new SESService(config);
  }

  return sesInstance!;
}

/**
 * Template name mapping from SendGrid to SES
 */
export const SES_TEMPLATE_NAMES = {
  verification: 'verify-email',
  passwordReset: 'password-reset',
  invite: 'invite',
  mfa: 'mfa',
  paymentFailed: 'payment-failed',
  paymentRetry: 'payment-retry',
  subscriptionSuspended: 'subscription-suspended',
} as const;

/**
 * Map SendGrid template variables to SES template variables
 */
export function mapTemplateVariables(
  templateType: keyof typeof SES_TEMPLATE_NAMES,
  sendGridVariables: Record<string, any>
): Record<string, any> {
  const baseVariables = {
    ...sendGridVariables,
    year: new Date().getFullYear().toString(),
    baseUrl: sendGridVariables.baseUrl || process.env.FRONTEND_URL || 'https://mydynastyapp.com',
  };

  switch (templateType) {
    case 'verification':
      return {
        ...baseVariables,
        username: sendGridVariables.userName || sendGridVariables.username,
        verificationLink: sendGridVariables.verificationUrl || sendGridVariables.verificationLink,
        expiryTime: sendGridVariables.expiryTime || '30 minutes',
      };

    case 'passwordReset':
      // Password reset variables match perfectly
      return baseVariables;

    case 'invite':
      return {
        ...baseVariables,
        signUpLink: sendGridVariables.acceptLink || sendGridVariables.signUpLink,
      };

    case 'mfa':
      return {
        ...baseVariables,
        username: sendGridVariables.username,
        code: sendGridVariables.code,
        expiryMinutes: sendGridVariables.expiryMinutes || '10',
      };

    case 'paymentFailed':
      return {
        ...baseVariables,
        username: sendGridVariables.userName || sendGridVariables.username,
        plan: sendGridVariables.plan,
        amount: sendGridVariables.amount,
        currency: sendGridVariables.currency || 'USD',
        failureReason: sendGridVariables.failureReason,
        updatePaymentUrl: sendGridVariables.updatePaymentUrl,
        supportUrl: sendGridVariables.supportUrl || `${baseVariables.baseUrl}/support`,
      };

    case 'paymentRetry':
      return {
        ...baseVariables,
        username: sendGridVariables.userName || sendGridVariables.username,
        plan: sendGridVariables.plan,
        amount: sendGridVariables.amount,
        currency: sendGridVariables.currency || 'USD',
        retryDate: sendGridVariables.retryDate,
        attemptNumber: sendGridVariables.attemptNumber,
        updatePaymentUrl: sendGridVariables.updatePaymentUrl,
        supportUrl: sendGridVariables.supportUrl || `${baseVariables.baseUrl}/support`,
      };

    case 'subscriptionSuspended':
      return {
        ...baseVariables,
        username: sendGridVariables.userName || sendGridVariables.username,
        plan: sendGridVariables.plan,
        suspensionDate: sendGridVariables.suspensionDate,
        gracePeriodEnds: sendGridVariables.gracePeriodEnds,
        reactivateUrl: sendGridVariables.reactivateUrl,
        supportUrl: sendGridVariables.supportUrl || `${baseVariables.baseUrl}/support`,
      };

    default:
      return baseVariables;
  }
}
