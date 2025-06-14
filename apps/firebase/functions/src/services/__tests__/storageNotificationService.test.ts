import {describe, it, beforeEach, afterEach, expect, jest} from "@jest/globals";
import {Timestamp} from "firebase-admin/firestore";
import {StorageNotificationService} from "../storageNotificationService";
import {StorageCalculationResult} from "../storageCalculationService";
import * as admin from "firebase-admin";

// Mock Firebase Admin
jest.mock("firebase-admin", () => ({
  messaging: jest.fn(() => ({
    sendEachForMulticast: jest.fn().mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{success: true}],
    }),
  })),
}));

// Mock Firestore
const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockAdd = jest.fn();
const mockCollection = jest.fn(() => ({
  doc: jest.fn(() => ({
    get: mockGet,
    update: mockUpdate,
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{data: () => ({token: "test-token", active: true})}],
        }),
      })),
    })),
  })),
  add: mockAdd,
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
  })),
  Timestamp: {
    now: jest.fn(() => ({toMillis: () => Date.now()})),
    fromMillis: jest.fn((millis) => ({toMillis: () => millis})),
  },
  FieldValue: {
    delete: jest.fn(() => "DELETE_FIELD"),
  },
}));

// Mock logger
jest.mock("firebase-functions/v2", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("StorageNotificationService", () => {
  let service: StorageNotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StorageNotificationService();
  });

  describe("checkAndNotifyStorageLimit", () => {
    const userId = "test-user-123";
    const baseStorageResult: StorageCalculationResult = {
      basePlanGB: 5,
      addonGB: 0,
      referralBonusGB: 0,
      totalGB: 5,
      usedBytes: 0,
      availableBytes: 5 * 1024 * 1024 * 1024,
      usagePercentage: 0,
      isOverLimit: false,
    };

    it("should not send notification when usage is below 80%", async () => {
      const storageResult = {
        ...baseStorageResult,
        usagePercentage: 75,
      };

      mockGet.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          storageNotifications: {
            lastUsagePercentage: 70,
            lastChecked: Timestamp.now(),
          },
        }),
      });

      const result = await service.checkAndNotifyStorageLimit(userId, storageResult);

      expect(result.notificationSent).toBe(false);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it("should send notification when crossing 80% threshold", async () => {
      const storageResult = {
        ...baseStorageResult,
        usagePercentage: 81,
        usedBytes: 4.05 * 1024 * 1024 * 1024,
        availableBytes: 0.95 * 1024 * 1024 * 1024,
      };

      mockGet.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          storageNotifications: {
            lastUsagePercentage: 75,
            lastChecked: Timestamp.now(),
          },
        }),
      });

      const result = await service.checkAndNotifyStorageLimit(userId, storageResult);

      expect(result.notificationSent).toBe(true);
      expect(result.threshold).toBe(80);
      expect(result.message).toContain("80%");
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: "storage_limit",
          threshold: 80,
        })
      );
    });

    it("should not send duplicate notification for same threshold", async () => {
      const storageResult = {
        ...baseStorageResult,
        usagePercentage: 85,
      };

      mockGet.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          storageNotifications: {
            lastUsagePercentage: 82,
            lastNotified80: Timestamp.now(),
            lastChecked: Timestamp.now(),
          },
        }),
      });

      const result = await service.checkAndNotifyStorageLimit(userId, storageResult);

      expect(result.notificationSent).toBe(false);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it("should send notification when crossing 90% threshold", async () => {
      const storageResult = {
        ...baseStorageResult,
        usagePercentage: 92,
        usedBytes: 4.6 * 1024 * 1024 * 1024,
        availableBytes: 0.4 * 1024 * 1024 * 1024,
      };

      mockGet.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          storageNotifications: {
            lastUsagePercentage: 85,
            lastNotified80: Timestamp.now(),
            lastChecked: Timestamp.now(),
          },
        }),
      });

      const result = await service.checkAndNotifyStorageLimit(userId, storageResult);

      expect(result.notificationSent).toBe(true);
      expect(result.threshold).toBe(90);
      expect(result.message).toContain("90%");
      expect(result.message).toContain("Only");
      expect(result.message).toContain("remaining");
    });

    it("should send notification when reaching 100% capacity", async () => {
      const storageResult = {
        ...baseStorageResult,
        usagePercentage: 100,
        usedBytes: 5 * 1024 * 1024 * 1024,
        availableBytes: 0,
        isOverLimit: true,
      };

      mockGet.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          storageNotifications: {
            lastUsagePercentage: 95,
            lastNotified80: Timestamp.now(),
            lastNotified90: Timestamp.now(),
            lastChecked: Timestamp.now(),
          },
        }),
      });

      const result = await service.checkAndNotifyStorageLimit(userId, storageResult);

      expect(result.notificationSent).toBe(true);
      expect(result.threshold).toBe(100);
      expect(result.message).toContain("full");
      expect(result.message).toContain("cannot upload");
    });

    it("should reset notification history when usage drops below 70%", async () => {
      const storageResult = {
        ...baseStorageResult,
        usagePercentage: 65,
      };

      mockGet.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          storageNotifications: {
            lastUsagePercentage: 85,
            lastNotified80: Timestamp.now(),
            lastChecked: Timestamp.now(),
          },
        }),
      });

      const result = await service.checkAndNotifyStorageLimit(userId, storageResult);

      expect(result.notificationSent).toBe(false);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          "storageNotifications.lastNotified80": "DELETE_FIELD",
          "storageNotifications.lastNotified90": "DELETE_FIELD",
          "storageNotifications.lastNotified100": "DELETE_FIELD",
        })
      );
    });

    it("should handle missing user gracefully", async () => {
      mockGet.mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      });

      await expect(
        service.checkAndNotifyStorageLimit(userId, baseStorageResult)
      ).rejects.toThrow("User not found");
    });

    it("should handle notification sending failure gracefully", async () => {
      const storageResult = {
        ...baseStorageResult,
        usagePercentage: 85,
      };

      mockGet.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          storageNotifications: {
            lastUsagePercentage: 75,
            lastChecked: Timestamp.now(),
          },
        }),
      });

      // Mock messaging failure
      (admin.messaging as jest.Mock).mockReturnValueOnce({
        sendEachForMulticast: jest.fn().mockRejectedValue(new Error("FCM error")),
      });

      // Should not throw even if notification fails
      const result = await service.checkAndNotifyStorageLimit(userId, storageResult);
      
      expect(result.notificationSent).toBe(true);
      expect(result.threshold).toBe(80);
    });

    it("should respect cooldown period for notifications", async () => {
      const storageResult = {
        ...baseStorageResult,
        usagePercentage: 85,
      };

      const recentTimestamp = Timestamp.fromMillis(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago

      mockGet.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          storageNotifications: {
            lastUsagePercentage: 75,
            lastNotified80: recentTimestamp,
            lastChecked: Timestamp.now(),
          },
        }),
      });

      const result = await service.checkAndNotifyStorageLimit(userId, storageResult);

      expect(result.notificationSent).toBe(false);
      expect(mockAdd).not.toHaveBeenCalled();
    });
  });

  describe("getNotificationHistory", () => {
    it("should return notification history for user", async () => {
      const expectedHistory = {
        lastUsagePercentage: 85,
        lastNotified80: Timestamp.now(),
        lastChecked: Timestamp.now(),
      };

      mockGet.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          storageNotifications: expectedHistory,
        }),
      });

      const history = await service.getNotificationHistory("test-user");

      expect(history).toEqual(expectedHistory);
    });

    it("should return null for user without history", async () => {
      mockGet.mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      });

      const history = await service.getNotificationHistory("test-user");

      expect(history).toBeNull();
    });
  });
});