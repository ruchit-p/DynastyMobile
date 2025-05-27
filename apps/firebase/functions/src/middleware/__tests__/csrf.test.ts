import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CallableRequest } from 'firebase-functions/v2/https';
import { requireCSRFToken, withCSRFProtection, CSRFValidatedRequest } from '../csrf';

// Mock dependencies
const mockValidateToken = jest.fn<(token: string, userId: string, sessionId?: string) => boolean>();
const mockGenerateToken = jest.fn<(userId: string, sessionId: string) => string>();

jest.mock('../../services/csrfService', () => ({
  CSRFService: {
    validateToken: mockValidateToken,
    generateToken: mockGenerateToken,
    getTimeUntilExpiry: jest.fn(() => 3600000),
  },
}));

jest.mock('firebase-functions/v2', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../utils/errors', () => ({
  createError: jest.fn((code: string, message: string) => {
    const error = new Error(message) as any;
    error.code = code;
    return error;
  }),
  ErrorCode: {
    PERMISSION_DENIED: 'permission-denied',
    UNAUTHENTICATED: 'unauthenticated',
  },
  withErrorHandling: jest.fn((fn: any) => fn),
}));

describe('CSRF Middleware Tests', () => {
  let mockRequest: CallableRequest;
  let mockHandler: jest.Mock<(request: CSRFValidatedRequest) => Promise<any>>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockHandler = jest.fn<(request: CSRFValidatedRequest) => Promise<any>>(() => Promise.resolve({ success: true }));
    
    mockRequest = {
      auth: {
        uid: 'test-user-id',
        token: {
          email: 'test@example.com',
        } as any,
      },
      data: {},
      rawRequest: {
        headers: {
          'x-csrf-token': 'valid-csrf-token',
          'user-agent': 'Mozilla/5.0',
          'cookie': 'sessionId=test-session-123',
        },
        ip: '127.0.0.1',
      } as any,
    } as CallableRequest;
  });

  describe('requireCSRFToken', () => {
    it('should pass through when CSRF token is valid', async () => {
      mockValidateToken.mockReturnValue(true);
      
      const wrappedHandler = requireCSRFToken(mockHandler);
      const result = await wrappedHandler(mockRequest);
      
      expect(mockValidateToken).toHaveBeenCalledWith(
        'valid-csrf-token',
        'test-user-id',
        'test-session-123'
      );
      expect(mockHandler).toHaveBeenCalledWith(expect.objectContaining({
        csrfToken: 'valid-csrf-token',
        sessionId: 'test-session-123',
      }));
      expect(result).toEqual({ success: true });
    });

    it('should reject when CSRF token is invalid', async () => {
      mockValidateToken.mockReturnValue(false);
      
      const wrappedHandler = requireCSRFToken(mockHandler);
      
      await expect(wrappedHandler(mockRequest)).rejects.toThrow();
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should reject when CSRF token is missing', async () => {
      delete mockRequest.rawRequest.headers['x-csrf-token'];
      
      const wrappedHandler = requireCSRFToken(mockHandler);
      
      await expect(wrappedHandler(mockRequest)).rejects.toThrow();
      expect(mockValidateToken).not.toHaveBeenCalled();
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should handle missing session ID', async () => {
      mockRequest.rawRequest.headers.cookie = '';
      mockValidateToken.mockReturnValue(true);
      
      const wrappedHandler = requireCSRFToken(mockHandler);
      const result = await wrappedHandler(mockRequest);
      
      expect(mockValidateToken).toHaveBeenCalledWith(
        'valid-csrf-token',
        'test-user-id',
        undefined
      );
      expect(result).toEqual({ success: true });
    });

    it('should skip validation for mobile apps', async () => {
      mockRequest.rawRequest.headers['user-agent'] = 'Expo/1.0';
      
      const wrappedHandler = requireCSRFToken(mockHandler);
      const result = await wrappedHandler(mockRequest);
      
      expect(mockValidateToken).not.toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should handle malformed cookie headers', async () => {
      mockRequest.rawRequest.headers.cookie = 'malformed;;cookie=;;data';
      mockValidateToken.mockReturnValue(true);
      
      const wrappedHandler = requireCSRFToken(mockHandler);
      const result = await wrappedHandler(mockRequest);
      
      expect(result).toEqual({ success: true });
    });
  });

  describe('withCSRFProtection', () => {
    it('should enforce authentication and CSRF protection', async () => {
      mockValidateToken.mockReturnValue(true);
      
      const wrappedHandler = withCSRFProtection(mockHandler);
      const result = await wrappedHandler(mockRequest);
      
      expect(mockValidateToken).toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should reject unauthenticated requests', async () => {
      mockRequest.auth = undefined;
      
      const wrappedHandler = withCSRFProtection(mockHandler);
      
      await expect(wrappedHandler(mockRequest)).rejects.toThrow();
      expect(mockValidateToken).not.toHaveBeenCalled();
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should reject when both auth and CSRF fail', async () => {
      mockRequest.auth = undefined;
      delete mockRequest.rawRequest.headers['x-csrf-token'];
      
      const wrappedHandler = withCSRFProtection(mockHandler);
      
      await expect(wrappedHandler(mockRequest)).rejects.toThrow();
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Mobile App Detection', () => {
    it.each([
      ['Expo/1.0', true],
      ['okhttp/4.9.0', true],
      ['Dynasty/Mobile/1.0', true],
      ['Mozilla/5.0 (Windows NT 10.0)', false],
      ['Chrome/96.0', false],
    ])('should detect %s as mobile: %s', async (userAgent, isMobile) => {
      mockRequest.rawRequest.headers['user-agent'] = userAgent;
      mockValidateToken.mockReturnValue(true);
      
      const wrappedHandler = requireCSRFToken(mockHandler);
      await wrappedHandler(mockRequest);
      
      if (isMobile) {
        expect(mockValidateToken).not.toHaveBeenCalled();
      } else {
        expect(mockValidateToken).toHaveBeenCalled();
      }
    });
  });

  describe('Cookie Parsing', () => {
    it.each([
      ['sessionId=abc123; userId=def456', { sessionId: 'abc123', userId: 'def456' }],
      ['sessionId=abc123', { sessionId: 'abc123' }],
      ['', {}],
      ['malformed', {}],
      ['key=value; ; empty=', { key: 'value' }],
      ['encoded=%20value%20', { encoded: ' value ' }],
    ])('should parse cookie: %s', async (cookieString, expected) => {
      mockRequest.rawRequest.headers.cookie = cookieString;
      mockValidateToken.mockReturnValue(true);
      
      const wrappedHandler = requireCSRFToken(mockHandler);
      await wrappedHandler(mockRequest);
      
      const sessionId = expected.sessionId || undefined;
      if (mockValidateToken.mock.calls.length > 0) {
        expect(mockValidateToken).toHaveBeenCalledWith(
          'valid-csrf-token',
          'test-user-id',
          sessionId
        );
      }
    });
  });
});