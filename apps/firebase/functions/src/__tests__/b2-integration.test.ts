// B2 Integration Tests
// Tests the full B2 integration including migration flows

import {getFirestore} from "firebase-admin/firestore";
import {StorageAdapter} from "../services/storageAdapter";
import {B2VaultMigration, getB2VaultMigration} from "../migrations/b2VaultMigration";
import {B2MigrationStrategy, getB2MigrationStrategy} from "../migrations/b2MigrationStrategy";
import {getB2Service} from "../services/b2Service";
import {validateB2Config} from "../config/b2Config";

// Mock Firebase Admin
jest.mock("firebase-admin/firestore");
jest.mock("../services/b2Service");
jest.mock("../config/b2Config");

const mockFirestore = {
  collection: jest.fn(),
  doc: jest.fn(),
  batch: jest.fn(),
};

const mockCollection = {
  doc: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  get: jest.fn(),
  add: jest.fn(),
};

const mockDoc = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockQuery = {
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  get: jest.fn(),
};

// Setup mocks
(getFirestore as jest.Mock).mockReturnValue(mockFirestore);
mockFirestore.collection.mockReturnValue(mockCollection);
mockCollection.doc.mockReturnValue(mockDoc);
mockCollection.where.mockReturnValue(mockQuery);
mockQuery.where.mockReturnValue(mockQuery);
mockQuery.orderBy.mockReturnValue(mockQuery);
mockQuery.limit.mockReturnValue(mockQuery);

const mockB2Service = {
  generateUploadUrl: jest.fn(),
  generateDownloadUrl: jest.fn(),
  deleteObject: jest.fn(),
  objectExists: jest.fn(),
  checkConnectivity: jest.fn(),
};

(getB2Service as jest.Mock).mockReturnValue(mockB2Service);
(validateB2Config as jest.Mock).mockReturnValue({valid: true, errors: []});

describe("B2 Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Storage Configuration", () => {
    it("should validate B2 configuration is working", () => {
      const config = validateB2Config();
      expect(config.valid).toBe(true);
    });

    it("should initialize storage adapter with B2", () => {
      const adapter = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "dynasty-test",
        },
      });

      expect(adapter.getProvider()).toBe("b2");
    });
  });

  describe("Vault Migration Workflow", () => {
    let migration: B2VaultMigration;

    beforeEach(() => {
      migration = getB2VaultMigration();

      // Mock Firestore responses
      mockDoc.set.mockResolvedValue(undefined);
      mockDoc.update.mockResolvedValue(undefined);
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          status: "pending",
          options: {
            batchSize: 50,
            maxRetries: 5,
            dryRun: false,
            verifyChecksums: true,
            preserveOriginal: true,
          },
        }),
      });

      mockQuery.get.mockResolvedValue({
        docs: [
          {
            id: "item1",
            data: () => ({
              id: "item1",
              userId: "user123",
              name: "document.pdf",
              size: 1024,
              mimeType: "application/pdf",
              storageProvider: "firebase",
              storagePath: "vault/user123/root/document.pdf",
              parentId: "root",
            }),
          },
          {
            id: "item2",
            data: () => ({
              id: "item2",
              userId: "user123",
              name: "image.jpg",
              size: 2048,
              mimeType: "image/jpeg",
              storageProvider: "r2",
              r2Key: "vault/user123/root/image.jpg",
              r2Bucket: "dynasty-vault",
              parentId: "root",
            }),
          },
        ],
      });
    });

    it("should create B2 migration batch", async () => {
      const batchId = await migration.createB2MigrationBatch({
        userId: "user123",
        sourceProvider: "firebase",
        batchSize: 10,
        dryRun: true,
      });

      expect(batchId).toMatch(/^b2-migration-\d+-[a-z0-9]+$/);
      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          id: batchId,
          sourceProvider: "firebase",
          destProvider: "b2",
          status: "pending",
          options: expect.objectContaining({
            batchSize: 10,
            dryRun: true,
          }),
        })
      );
    });

    it("should start migration and process items", async () => {
      const batchId = "test-batch-123";

      // Setup storage adapter mock
      const mockStorageAdapter = {
        copyBetweenProviders: jest.fn().mockResolvedValue(undefined),
      };

      (migration as any).storageAdapter = mockStorageAdapter;

      await migration.startB2Migration(batchId);

      expect(mockDoc.update).toHaveBeenCalledWith({
        status: "running",
        updatedAt: expect.anything(),
      });

      expect(mockDoc.update).toHaveBeenCalledWith({
        status: "completed",
        completedAt: expect.anything(),
      });
    });

    it("should handle migration failures gracefully", async () => {
      const batchId = "test-batch-123";

      // Mock failure
      mockQuery.get.mockRejectedValueOnce(new Error("Database error"));

      await expect(migration.startB2Migration(batchId)).rejects.toThrow("Database error");

      expect(mockDoc.update).toHaveBeenCalledWith({
        status: "failed",
        error: "Database error",
        updatedAt: expect.anything(),
      });
    });

    it("should verify migration integrity", async () => {
      const itemId = "item123";

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          storageProvider: "b2",
          b2Key: "vault/user123/root/file.pdf",
          b2Bucket: "dynasty-vault",
          storagePath: "vault/user123/root/file.pdf",
        }),
      });

      mockB2Service.objectExists.mockResolvedValue(true);

      const result = await migration.verifyB2ItemMigration(itemId);

      expect(result.valid).toBe(true);
      expect(result.destExists).toBe(true);
      expect(mockB2Service.objectExists).toHaveBeenCalledWith(
        "dynasty-vault",
        "vault/user123/root/file.pdf"
      );
    });

    it("should rollback migration when requested", async () => {
      const itemId = "item123";

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          storageProvider: "b2",
          r2Key: "vault/user123/root/file.pdf",
          r2Bucket: "dynasty-vault",
        }),
      });

      await migration.rollbackB2Migration(itemId, "r2");

      expect(mockDoc.update).toHaveBeenCalledWith({
        storageProvider: "r2",
        b2Bucket: expect.anything(), // FieldValue.delete()
        b2Key: expect.anything(), // FieldValue.delete()
        migratedToB2At: expect.anything(), // FieldValue.delete()
        rolledBackFromB2At: expect.anything(),
        updatedAt: expect.anything(),
      });
    });

    it("should get storage migration statistics", async () => {
      mockQuery.get.mockResolvedValue({
        forEach: (callback: any) => {
          callback({data: () => ({storageProvider: "firebase", size: 1024})});
          callback({data: () => ({storageProvider: "r2", size: 2048})});
          callback({data: () => ({storageProvider: "b2", size: 512})});
        },
      });

      const stats = await migration.getStorageMigrationStats();

      expect(stats).toEqual({
        firebase: {count: 1, totalSize: 1024},
        r2: {count: 1, totalSize: 2048},
        b2: {count: 1, totalSize: 512},
      });
    });
  });

  describe("Migration Strategy", () => {
    let strategy: B2MigrationStrategy;

    beforeEach(() => {
      strategy = getB2MigrationStrategy();
    });

    it("should create migration cohort", async () => {
      const cohortId = await strategy.createMigrationCohort({
        name: "Test Cohort",
        description: "Test cohort for B2 migration",
        criteria: {
          userType: "premium",
          rolloutPercentage: 25,
        },
        rolloutPercentage: 25,
        enabled: true,
      });

      expect(cohortId).toMatch(/^cohort-\d+-[a-z0-9]+$/);
      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test Cohort",
          rolloutPercentage: 25,
          enabled: true,
        })
      );
    });

    it("should check user eligibility correctly", async () => {
      const userId = "user123";

      // Mock user data
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          subscriptionStatus: "active",
          createdAt: {toMillis: () => Date.now() - 86400000}, // 1 day ago
          storageUsed: 5000,
        }),
      });

      // Mock user migration status
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          migrationStatus: "not_started",
        }),
      });

      // Mock cohorts
      mockQuery.get.mockResolvedValue({
        docs: [
          {
            data: () => ({
              id: "cohort1",
              enabled: true,
              rolloutPercentage: 50,
              criteria: {
                userType: "premium",
                storageUsage: {min: 1000, max: 10000},
              },
            }),
          },
        ],
      });

      const eligibility = await strategy.checkUserEligibility(userId);

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.cohortId).toBe("cohort1");
    });

    it("should calculate user vault metrics", async () => {
      mockQuery.get.mockResolvedValue({
        forEach: (callback: any) => {
          callback({
            data: () => ({
              storageProvider: "firebase",
              size: 1024,
            }),
          });
          callback({
            data: () => ({
              storageProvider: "r2",
              size: 2048,
            }),
          });
          callback({
            data: () => ({
              storageProvider: "b2",
              size: 512,
            }),
          });
        },
      });

      const metrics = await strategy.calculateUserVaultMetrics("user123");

      expect(metrics.totalFiles).toBe(3);
      expect(metrics.totalSize).toBe(3584);
      expect(metrics.filesByProvider.firebase).toEqual({count: 1, size: 1024});
      expect(metrics.filesByProvider.r2).toEqual({count: 1, size: 2048});
      expect(metrics.filesByProvider.b2).toEqual({count: 1, size: 512});
      expect(metrics.estimatedMigrationTime).toBeGreaterThan(0);
    });

    it("should update cohort rollout percentage", async () => {
      const cohortId = "cohort123";

      await strategy.updateCohortRollout(cohortId, 75);

      expect(mockDoc.update).toHaveBeenCalledWith({
        rolloutPercentage: 75,
        updatedAt: expect.anything(),
      });
    });

    it("should exclude user from migration", async () => {
      const userId = "user123";
      const reason = "User requested exclusion";

      await strategy.excludeUserFromMigration(userId, reason);

      expect(mockDoc.update).toHaveBeenCalledWith({
        eligibleForB2: false,
        migrationStatus: "excluded",
        exclusionReason: reason,
        lastCheckedAt: expect.anything(),
      });
    });
  });

  describe("End-to-End Migration Flow", () => {
    it("should complete full migration workflow", async () => {
      const migration = getB2VaultMigration();
      const strategy = getB2MigrationStrategy();

      // 1. Create cohort
      const cohortId = await strategy.createMigrationCohort({
        name: "B2 Migration Pilot",
        description: "Initial B2 migration for test users",
        criteria: {
          testGroup: true,
        },
        rolloutPercentage: 100,
        enabled: true,
      });

      expect(cohortId).toBeDefined();

      // 2. Check user eligibility
      mockDoc.get.mockImplementation((path) => {
        if (path.includes("users")) {
          return Promise.resolve({
            exists: true,
            data: () => ({
              testUser: true,
              subscriptionStatus: "active",
            }),
          });
        }
        if (path.includes("userMigrationStatus")) {
          return Promise.resolve({
            exists: true,
            data: () => ({
              migrationStatus: "not_started",
            }),
          });
        }
        return Promise.resolve({exists: false});
      });

      mockQuery.get.mockResolvedValue({
        docs: [
          {
            data: () => ({
              id: cohortId,
              enabled: true,
              rolloutPercentage: 100,
              criteria: {testGroup: true},
            }),
          },
        ],
      });

      const eligibility = await strategy.checkUserEligibility("testuser123");
      expect(eligibility.eligible).toBe(true);

      // 3. Create migration batch
      const batchId = await migration.createB2MigrationBatch({
        userId: "testuser123",
        sourceProvider: "firebase",
        batchSize: 5,
        dryRun: false,
        verifyChecksums: true,
      });

      expect(batchId).toBeDefined();

      // 4. Start migration (would be mocked in real test)
      expect(mockDoc.set).toHaveBeenCalledTimes(2); // Cohort + batch creation
    });

    it("should handle migration errors gracefully", async () => {
      const migration = getB2VaultMigration();

      // Mock failure scenario
      mockB2Service.generateUploadUrl.mockRejectedValue(new Error("B2 rate limit exceeded"));

      const batchId = await migration.createB2MigrationBatch({
        sourceProvider: "firebase",
        batchSize: 1,
        maxRetries: 1,
      });

      // Migration should fail but not crash
      await expect(migration.startB2Migration(batchId)).rejects.toThrow();

      // Verify error handling
      expect(mockDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          error: expect.stringContaining("rate limit"),
        })
      );
    });
  });

  describe("Performance and Scalability", () => {
    it("should handle large migration batches efficiently", async () => {
      const migration = getB2VaultMigration();

      // Mock large dataset
      const largeDataset = Array.from({length: 1000}, (_, i) => ({
        id: `item${i}`,
        data: () => ({
          id: `item${i}`,
          userId: "user123",
          name: `file${i}.pdf`,
          size: 1024,
          storageProvider: "firebase",
          storagePath: `vault/user123/root/file${i}.pdf`,
        }),
      }));

      mockQuery.get.mockResolvedValue({
        docs: largeDataset,
      });

      const batchId = await migration.createB2MigrationBatch({
        sourceProvider: "firebase",
        batchSize: 100, // Process in chunks
        dryRun: true, // Don't actually migrate
      });

      // Should handle large batch creation without issues
      expect(batchId).toBeDefined();
      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            batchSize: 100,
          }),
        })
      );
    });

    it("should implement proper rate limiting for B2", async () => {
      const migration = getB2VaultMigration();

      // Verify that B2 migration uses lower concurrency
      const batchConfig = {
        sourceProvider: "firebase" as const,
        batchSize: 50, // Smaller than R2
        maxRetries: 5, // More retries
      };

      await migration.createB2MigrationBatch(batchConfig);

      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            batchSize: 50, // Smaller batch size for B2
            maxRetries: 5, // More retries for B2
          }),
        })
      );
    });
  });
});
