import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock Redis client before importing the service
jest.mock('../config/redis', () => ({
  getRedisClient: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    disconnect: jest.fn(),
  })),
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => 'mocked-csrf-token-123'),
  })),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'hashed-token'),
  })),
}));

// Import the service we're testing
import { CSRFService } from '../services/csrfService';

describe('CSRF Service Comprehensive Tests', () => {
  let mockRedisClient: any;
  let csrfService: CSRFService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mocked Redis client
    const { getRedisClient } = require('../config/redis');
    mockRedisClient = getRedisClient();
    
    // Create a new instance of CSRFService for each test
    csrfService = new CSRFService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateToken', () => {
    it('should generate a CSRF token for a user', async () => {
      const userId = 'test-user-123';
      const sessionId = 'session-456';

      // Mock Redis set operation
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.expire.mockResolvedValue(1);

      const token = await csrfService.generateToken(userId, sessionId);

      expect(token).toBe('mocked-csrf-token-123');

      // Verify Redis was called correctly
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('csrf:test-user-123:'),
        expect.any(String),
        'EX',
        3600 // 1 hour default TTL
      );
    });

    it('should generate a token with custom TTL', async () => {
      const userId = 'test-user-123';
      const sessionId = 'session-456';
      const customTTL = 7200; // 2 hours

      mockRedisClient.set.mockResolvedValue('OK');

      await csrfService.generateToken(userId, sessionId, customTTL);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'EX',
        customTTL
      );
    });

    it('should handle Redis errors gracefully', async () => {
      const userId = 'test-user-123';
      const sessionId = 'session-456';

      // Mock Redis error
      mockRedisClient.set.mockRejectedValue(new Error('Redis connection failed'));

      await expect(csrfService.generateToken(userId, sessionId))
        .rejects.toThrow('Failed to generate CSRF token');
    });

    it('should generate unique tokens for different sessions', async () => {
      const userId = 'test-user-123';
      const crypto = require('crypto');
      
      // Mock different tokens for different calls
      let callCount = 0;
      (crypto.randomBytes as jest.Mock).mockImplementation(() => ({
        toString: () => `token-${++callCount}`,
      }));

      mockRedisClient.set.mockResolvedValue('OK');

      const token1 = await csrfService.generateToken(userId, 'session-1');
      const token2 = await csrfService.generateToken(userId, 'session-2');

      expect(token1).not.toBe(token2);
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      const userId = 'test-user-123';
      const sessionId = 'session-456';
      const token = 'valid-token';

      // Mock stored data
      const storedData = {
        sessionId: sessionId,
        createdAt: Date.now(),
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(storedData));

      const isValid = await csrfService.validateToken(userId, sessionId, token);

      expect(isValid).toBe(true);

      // Verify Redis key format
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        expect.stringContaining(`csrf:${userId}:`)
      );
    });

    it('should reject token for wrong session', async () => {
      const userId = 'test-user-123';
      const token = 'valid-token';

      // Mock stored data for different session
      const storedData = {
        sessionId: 'different-session',
        createdAt: Date.now(),
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(storedData));

      const isValid = await csrfService.validateToken(userId, 'session-456', token);

      expect(isValid).toBe(false);
    });

    it('should reject non-existent token', async () => {
      const userId = 'test-user-123';
      const sessionId = 'session-456';
      const token = 'non-existent-token';

      mockRedisClient.get.mockResolvedValue(null);

      const isValid = await csrfService.validateToken(userId, sessionId, token);

      expect(isValid).toBe(false);
    });

    it('should reject expired token', async () => {
      const userId = 'test-user-123';
      const sessionId = 'session-456';
      const token = 'expired-token';

      // Mock stored data with old timestamp
      const storedData = {
        sessionId: sessionId,
        createdAt: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(storedData));

      const isValid = await csrfService.validateToken(userId, sessionId, token);

      expect(isValid).toBe(false);
    });

    it('should handle malformed stored data', async () => {
      const userId = 'test-user-123';
      const sessionId = 'session-456';
      const token = 'valid-token';

      // Mock malformed JSON
      mockRedisClient.get.mockResolvedValue('invalid-json');

      const isValid = await csrfService.validateToken(userId, sessionId, token);

      expect(isValid).toBe(false);
    });

    it('should handle Redis errors', async () => {
      const userId = 'test-user-123';
      const sessionId = 'session-456';
      const token = 'valid-token';

      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      await expect(csrfService.validateToken(userId, sessionId, token))
        .rejects.toThrow('Failed to validate CSRF token');
    });
  });

  describe('revokeToken', () => {
    it('should revoke an existing token', async () => {
      const userId = 'test-user-123';
      const token = 'token-to-revoke';

      mockRedisClient.del.mockResolvedValue(1); // 1 key deleted

      const result = await csrfService.revokeToken(userId, token);

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        expect.stringContaining(`csrf:${userId}:`)
      );
    });

    it('should return false for non-existent token', async () => {
      const userId = 'test-user-123';
      const token = 'non-existent-token';

      mockRedisClient.del.mockResolvedValue(0); // 0 keys deleted

      const result = await csrfService.revokeToken(userId, token);

      expect(result).toBe(false);
    });

    it('should handle Redis errors', async () => {
      const userId = 'test-user-123';
      const token = 'token-to-revoke';

      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      await expect(csrfService.revokeToken(userId, token))
        .rejects.toThrow('Failed to revoke CSRF token');
    });
  });

  describe('revokeAllTokensForUser', () => {
    it('should revoke all tokens for a user', async () => {
      const userId = 'test-user-123';

      // Mock Redis scan operation
      const mockKeys = [
        'csrf:test-user-123:token1',
        'csrf:test-user-123:token2',
        'csrf:test-user-123:token3',
      ];

      // Mock scan-like behavior
      mockRedisClient.keys = jest.fn().mockResolvedValue(mockKeys);
      mockRedisClient.del.mockResolvedValue(mockKeys.length);

      await csrfService.revokeAllTokensForUser(userId);

      expect(mockRedisClient.del).toHaveBeenCalledWith(...mockKeys);
    });

    it('should handle no tokens to revoke', async () => {
      const userId = 'test-user-123';

      mockRedisClient.keys = jest.fn().mockResolvedValue([]);

      await csrfService.revokeAllTokensForUser(userId);

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should handle Redis errors', async () => {
      const userId = 'test-user-123';

      mockRedisClient.keys = jest.fn().mockRejectedValue(new Error('Redis error'));

      await expect(csrfService.revokeAllTokensForUser(userId))
        .rejects.toThrow('Failed to revoke all CSRF tokens');
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should clean up expired tokens', async () => {
      // Mock Redis scan and get operations
      const mockKeys = [
        'csrf:user1:token1',
        'csrf:user2:token2',
        'csrf:user3:token3',
      ];

      const mockData = [
        JSON.stringify({ sessionId: 's1', createdAt: Date.now() - 2 * 60 * 60 * 1000 }), // Expired
        JSON.stringify({ sessionId: 's2', createdAt: Date.now() }), // Valid
        JSON.stringify({ sessionId: 's3', createdAt: Date.now() - 2 * 60 * 60 * 1000 }), // Expired
      ];

      mockRedisClient.keys = jest.fn().mockResolvedValue(mockKeys);
      mockRedisClient.get
        .mockResolvedValueOnce(mockData[0])
        .mockResolvedValueOnce(mockData[1])
        .mockResolvedValueOnce(mockData[2]);
      mockRedisClient.del.mockResolvedValue(1);

      const deletedCount = await csrfService.cleanupExpiredTokens();

      expect(deletedCount).toBe(2);
      expect(mockRedisClient.del).toHaveBeenCalledTimes(2);
    });

    it('should handle malformed data during cleanup', async () => {
      const mockKeys = ['csrf:user1:token1'];

      mockRedisClient.keys = jest.fn().mockResolvedValue(mockKeys);
      mockRedisClient.get.mockResolvedValue('invalid-json');
      mockRedisClient.del.mockResolvedValue(1);

      const deletedCount = await csrfService.cleanupExpiredTokens();

      // Should delete malformed data
      expect(deletedCount).toBe(1);
      expect(mockRedisClient.del).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty userId', async () => {
      await expect(csrfService.generateToken('', 'session'))
        .rejects.toThrow();
    });

    it('should handle empty sessionId', async () => {
      await expect(csrfService.generateToken('user', ''))
        .rejects.toThrow();
    });

    it('should handle very long tokens', async () => {
      const userId = 'test-user';
      const sessionId = 'session';
      const longToken = 'a'.repeat(1000);

      const storedData = {
        sessionId: sessionId,
        createdAt: Date.now(),
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(storedData));

      // Should still work with long tokens
      const isValid = await csrfService.validateToken(userId, sessionId, longToken);
      expect(mockRedisClient.get).toHaveBeenCalled();
    });

    it('should handle concurrent token generation', async () => {
      const userId = 'test-user';
      const promises = [];

      mockRedisClient.set.mockResolvedValue('OK');

      // Generate multiple tokens concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(csrfService.generateToken(userId, `session-${i}`));
      }

      const tokens = await Promise.all(promises);

      expect(tokens).toHaveLength(10);
      expect(mockRedisClient.set).toHaveBeenCalledTimes(10);
    });
  });

  describe('Token Format and Security', () => {
    it('should generate cryptographically secure tokens', () => {
      const crypto = require('crypto');
      
      // Verify randomBytes is called with correct length
      csrfService.generateToken('user', 'session');
      
      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
    });

    it('should hash tokens for storage', async () => {
      const crypto = require('crypto');
      const userId = 'test-user';
      const sessionId = 'session';

      mockRedisClient.set.mockResolvedValue('OK');

      await csrfService.generateToken(userId, sessionId);

      // Verify createHash was called for secure storage
      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
    });
  });

  describe('Error Handling', () => {
    it('should provide meaningful error messages', async () => {
      const userId = 'test-user';
      const sessionId = 'session';

      mockRedisClient.set.mockRejectedValue(new Error('Connection refused'));

      try {
        await csrfService.generateToken(userId, sessionId);
      } catch (error: any) {
        expect(error.message).toContain('Failed to generate CSRF token');
        expect(error.cause).toBeDefined();
      }
    });

    it('should handle Redis connection issues during validation', async () => {
      const userId = 'test-user';
      const sessionId = 'session';
      const token = 'test-token';

      // Simulate connection timeout
      mockRedisClient.get.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 100)
        )
      );

      await expect(csrfService.validateToken(userId, sessionId, token))
        .rejects.toThrow('Failed to validate CSRF token');
    });
  });
});