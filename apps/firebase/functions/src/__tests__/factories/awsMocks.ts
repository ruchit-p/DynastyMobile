/**
 * AWS service mocks for testing
 * Provides realistic mock implementations of AWS SDK clients
 */

import { 
  PinpointSMSVoiceV2Client,
  ValidationException,
  AccessDeniedException,
  ThrottlingException,
  ResourceNotFoundException,
} from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { SNSClient } from '@aws-sdk/client-sns';
import { SESClient } from '@aws-sdk/client-ses';
import { TEST_CONFIG } from '../config/testConfig';

/**
 * Create mock PinpointSMSVoiceV2Client for SMS testing
 */
export function createMockPinpointClient() {
  const mockSend = jest.fn();
  
  const mockClient = {
    send: mockSend,
    config: {
      region: () => Promise.resolve(TEST_CONFIG.aws.region),
    },
  } as unknown as PinpointSMSVoiceV2Client;

  // Helper to configure responses
  const configureMockResponse = (response: any) => {
    mockSend.mockResolvedValueOnce(response);
  };

  // Helper to configure errors
  const configureMockError = (error: any) => {
    mockSend.mockRejectedValueOnce(error);
  };

  return {
    client: mockClient,
    mockSend,
    configureMockResponse,
    configureMockError,
    // Preset error scenarios
    mockValidationError: () => configureMockError(
      new ValidationException({
        message: 'Invalid phone number format',
        $metadata: {},
      })
    ),
    mockAccessDeniedError: () => configureMockError(
      new AccessDeniedException({
        message: 'Access denied to SMS service',
        $metadata: {},
      })
    ),
    mockThrottlingError: () => configureMockError(
      new ThrottlingException({
        message: 'Rate limit exceeded',
        $metadata: {},
      })
    ),
    mockResourceNotFoundError: () => configureMockError(
      new ResourceNotFoundException({
        message: 'Phone pool not found',
        $metadata: {},
      })
    ),
    // Success response helper
    mockSuccessResponse: (messageId: string = 'msg_test_123') => configureMockResponse({
      MessageId: messageId,
      $metadata: {
        httpStatusCode: 200,
      },
    }),
  };
}

/**
 * Create mock SNS client for webhook testing
 */
export function createMockSNSClient() {
  const mockSend = jest.fn();
  
  const mockClient = {
    send: mockSend,
    config: {
      region: () => Promise.resolve(TEST_CONFIG.aws.region),
    },
  } as unknown as SNSClient;

  return {
    client: mockClient,
    mockSend,
    mockPublishResponse: (messageId: string = 'sns_msg_123') => {
      mockSend.mockResolvedValueOnce({
        MessageId: messageId,
        $metadata: {
          httpStatusCode: 200,
        },
      });
    },
  };
}

/**
 * Create mock SES client for email testing
 */
export function createMockSESClient() {
  const mockSend = jest.fn();
  
  const mockClient = {
    send: mockSend,
    config: {
      region: () => Promise.resolve(TEST_CONFIG.aws.region),
    },
  } as unknown as SESClient;

  return {
    client: mockClient,
    mockSend,
    mockSendEmailResponse: (messageId: string = 'ses_msg_123') => {
      mockSend.mockResolvedValueOnce({
        MessageId: messageId,
        $metadata: {
          httpStatusCode: 200,
        },
      });
    },
  };
}

/**
 * Create mock AWS webhook event for SMS delivery status
 */
export function createMockSMSWebhookEvent(options: {
  status: 'DELIVERED' | 'FAILED' | 'PENDING';
  messageId?: string;
  phoneNumber?: string;
  errorCode?: string;
} = { status: 'DELIVERED' }) {
  const event = {
    Type: 'Notification',
    MessageId: `sns_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    TopicArn: TEST_CONFIG.aws.snsTopicArn,
    Subject: 'SMS Event',
    Message: JSON.stringify({
      eventType: 'TEXT_DELIVERED',
      eventTimestamp: new Date().toISOString(),
      messageId: options.messageId || 'msg_test_123',
      originationPhoneNumber: '+12025551234',
      destinationPhoneNumber: options.phoneNumber || '+15551234567',
      messageStatus: options.status,
      messageStatusDescription: options.status === 'FAILED' 
        ? `Delivery failed: ${options.errorCode || 'UNKNOWN_ERROR'}`
        : 'Message delivered successfully',
      isoCountryCode: 'US',
      eventAttributes: {
        campaign_activity_id: 'test_campaign',
        campaign_id: 'test_campaign_id',
      },
    }),
    Timestamp: new Date().toISOString(),
    SignatureVersion: '1',
    Signature: 'mock_signature',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/mock.pem',
    UnsubscribeURL: 'https://sns.us-east-1.amazonaws.com/unsubscribe',
  };

  return event;
}

/**
 * Mock AWS configuration helper
 */
export const mockAWSConfig = {
  credentials: {
    accessKeyId: 'test_access_key',
    secretAccessKey: 'test_secret_key',
  },
  region: TEST_CONFIG.aws.region,
};