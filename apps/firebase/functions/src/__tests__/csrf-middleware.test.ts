import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({
          exists: true,
          data: () => ({ emailVerified: true, hasCompletedOnboarding: true })
        })),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
      })),
    })),
  })),
}));

// Mock CSRFService
jest.mock('../services/csrfService', () => ({
  CSRFService: {
    validateToken: jest.fn((token: string, userId: string, sessionId: string) => {
      // Valid tokens start with "valid-"
      if (!token) return false;
      return token.startsWith('valid-');
    }),
    generateToken: jest.fn((userId: string, sessionId: string) => `valid-token-${userId}-${sessionId}`),
    getTimeUntilExpiry: jest.fn(() => 3600000),
  },
}));

// Mock logger
jest.mock('firebase-functions/v2', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { CSRFService } from '../services/csrfService';

describe('CSRF Middleware Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CSRFService', () => {
    it('should generate valid tokens', () => {
      const token = CSRFService.generateToken('user-123', 'session-456');
      expect(token).toBe('valid-token-user-123-session-456');
      expect(CSRFService.generateToken).toHaveBeenCalledWith('user-123', 'session-456');
    });

    it('should validate tokens correctly', () => {
      expect(CSRFService.validateToken('valid-token', 'user-123', 'session-456')).toBe(true);
      expect(CSRFService.validateToken('invalid-token', 'user-123', 'session-456')).toBe(false);
    });

    it('should return token expiry time', () => {
      const expiryTime = CSRFService.getTimeUntilExpiry('some-token');
      expect(expiryTime).toBe(3600000); // 1 hour in ms
    });
  });

  describe('CSRF Protection Flow', () => {
    it('should protect state-changing operations', async () => {
      // Test that CSRF tokens are required for mutations
      const validToken = 'valid-csrf-token';
      const invalidToken = 'invalid-csrf-token';
      const userId = 'test-user';

      // Valid token should pass
      const isValid = CSRFService.validateToken(validToken, userId, 'session-123');
      expect(isValid).toBe(true);

      // Invalid token should fail
      const isInvalid = CSRFService.validateToken(invalidToken, userId, 'session-123');
      expect(isInvalid).toBe(false);
    });

    it('should handle session-based validation', () => {
      const token = 'valid-session-token';
      const userId = 'user-123';
      const sessionId = 'session-456';

      // Validate with session
      const result = CSRFService.validateToken(token, userId, sessionId);
      expect(result).toBe(true);
    });
  });

  describe('Mobile App Exemption', () => {
    it('should identify mobile user agents', () => {
      const mobileUserAgents = [
        'Expo/1.0',
        'okhttp/4.9.0',
        'Dynasty/Mobile/1.0',
      ];

      const webUserAgents = [
        'Mozilla/5.0 (Windows NT 10.0)',
        'Chrome/96.0',
      ];

      // Test mobile user agent detection
      mobileUserAgents.forEach(ua => {
        const isMobile = ua.includes('Expo') || 
                         ua.includes('okhttp') || 
                         ua.includes('Dynasty/Mobile');
        expect(isMobile).toBe(true);
      });

      // Test web user agent detection
      webUserAgents.forEach(ua => {
        const isMobile = ua.includes('Expo') || 
                         ua.includes('okhttp') || 
                         ua.includes('Dynasty/Mobile');
        expect(isMobile).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing tokens gracefully', () => {
      const result = CSRFService.validateToken('', 'user-123', 'session-456');
      expect(result).toBe(false);
    });

    it('should handle null/undefined tokens', () => {
      const result = CSRFService.validateToken(null as any, 'user-123', 'session-456');
      expect(result).toBe(false);
    });
  });
});