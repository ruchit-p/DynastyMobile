// Tests for StorageAdapter B2 integration
import {StorageAdapter, getStorageAdapter} from "../storageAdapter";
import {getB2Service} from "../b2Service";
import {getR2Service} from "../r2Service";

// Mock services
jest.mock("../b2Service");
jest.mock("../r2Service");
jest.mock("firebase-admin/storage");

const mockGetB2Service = getB2Service as jest.MockedFunction<typeof getB2Service>;
const mockGetR2Service = getR2Service as jest.MockedFunction<typeof getR2Service>;

describe("StorageAdapter - B2 Integration", () => {
  let mockB2Service: any;
  let mockR2Service: any;
  let mockFirebaseStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock B2 service
    mockB2Service = {
      generateUploadUrl: jest.fn().mockResolvedValue("https://b2-upload-url.com"),
      generateDownloadUrl: jest.fn().mockResolvedValue("https://b2-download-url.com"),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      objectExists: jest.fn().mockResolvedValue(true),
      checkConnectivity: jest.fn().mockResolvedValue(true),
    };

    // Mock R2 service
    mockR2Service = {
      generateUploadUrl: jest.fn().mockResolvedValue("https://r2-upload-url.com"),
      generateDownloadUrl: jest.fn().mockResolvedValue("https://r2-download-url.com"),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      objectExists: jest.fn().mockResolvedValue(true),
      checkConnectivity: jest.fn().mockResolvedValue(true),
    };

    // Mock Firebase Storage
    mockFirebaseStorage = {
      bucket: jest.fn().mockReturnValue({
        file: jest.fn().mockReturnValue({
          getSignedUrl: jest.fn().mockResolvedValue(["https://firebase-url.com"]),
          delete: jest.fn().mockResolvedValue(undefined),
          exists: jest.fn().mockResolvedValue([true]),
        }),
      }),
    };

    mockGetB2Service.mockReturnValue(mockB2Service);
    mockGetR2Service.mockReturnValue(mockR2Service);

    // Mock firebase-admin/storage
    jest.doMock("firebase-admin/storage", () => ({
      getStorage: jest.fn().mockReturnValue(mockFirebaseStorage),
    }));

    // Reset singleton
    (getStorageAdapter as any).storageAdapterInstance = null;
  });

  describe("B2 Provider Configuration", () => {
    it("should initialize with B2 provider", () => {
      const adapter = new StorageAdapter({
        provider: "b2",
        enableMigration: false,
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });

      expect(adapter.getProvider()).toBe("b2");
      expect(mockGetB2Service).toHaveBeenCalled();
    });

    it("should initialize B2 service when migration is enabled", () => {
      new StorageAdapter({
        provider: "firebase",
        enableMigration: true,
      });

      expect(mockGetB2Service).toHaveBeenCalled();
    });
  });

  describe("B2 Upload URL Generation", () => {
    let adapter: StorageAdapter;

    beforeEach(() => {
      adapter = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });
    });

    it("should generate B2 upload URL", async () => {
      const result = await adapter.generateUploadUrl({
        path: "test/file.txt",
        contentType: "text/plain",
        expiresIn: 3600,
      });

      expect(result.signedUrl).toBe("https://b2-upload-url.com");
      expect(result.provider).toBe("b2");
      expect(result.bucket).toBe("test-b2-bucket");
      expect(result.key).toBe("test/file.txt");

      expect(mockB2Service.generateUploadUrl).toHaveBeenCalledWith({
        bucket: "test-b2-bucket",
        key: "test/file.txt",
        contentType: "text/plain",
        metadata: undefined,
        expiresIn: 3600,
      });
    });

    it("should use custom bucket when specified", async () => {
      await adapter.generateUploadUrl({
        path: "test/file.txt",
        bucket: "custom-bucket",
      });

      expect(mockB2Service.generateUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "custom-bucket",
        })
      );
    });

    it("should handle metadata properly", async () => {
      const metadata = {userId: "123", type: "document"};

      await adapter.generateUploadUrl({
        path: "test/file.txt",
        metadata,
      });

      expect(mockB2Service.generateUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata,
        })
      );
    });
  });

  describe("B2 Download URL Generation", () => {
    let adapter: StorageAdapter;

    beforeEach(() => {
      adapter = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });
    });

    it("should generate B2 download URL", async () => {
      const result = await adapter.generateDownloadUrl({
        path: "test/file.txt",
        expiresIn: 1800,
      });

      expect(result.signedUrl).toBe("https://b2-download-url.com");
      expect(result.provider).toBe("b2");

      expect(mockB2Service.generateDownloadUrl).toHaveBeenCalledWith({
        bucket: "test-b2-bucket",
        key: "test/file.txt",
        expiresIn: 1800,
      });
    });

    it("should support legacy string parameter style", async () => {
      const result = await adapter.generateDownloadUrl("test/file.txt", 1800);

      expect(result.signedUrl).toBe("https://b2-download-url.com");
      expect(mockB2Service.generateDownloadUrl).toHaveBeenCalledWith({
        bucket: "test-b2-bucket",
        key: "test/file.txt",
        expiresIn: 1800,
      });
    });
  });

  describe("B2 File Operations", () => {
    let adapter: StorageAdapter;

    beforeEach(() => {
      adapter = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });
    });

    it("should delete B2 files", async () => {
      await adapter.deleteFile({
        path: "test/file.txt",
      });

      expect(mockB2Service.deleteObject).toHaveBeenCalledWith(
        "test-b2-bucket",
        "test/file.txt"
      );
    });

    it("should check B2 file existence", async () => {
      const exists = await adapter.fileExists({
        path: "test/file.txt",
      });

      expect(exists).toBe(true);
      expect(mockB2Service.objectExists).toHaveBeenCalledWith(
        "test-b2-bucket",
        "test/file.txt"
      );
    });

    it("should handle custom bucket in operations", async () => {
      await adapter.deleteFile({
        path: "test/file.txt",
        bucket: "custom-bucket",
      });

      expect(mockB2Service.deleteObject).toHaveBeenCalledWith(
        "custom-bucket",
        "test/file.txt"
      );
    });
  });

  describe("Provider Switching", () => {
    it("should switch from firebase to B2", () => {
      const adapter = new StorageAdapter({
        provider: "firebase",
        enableMigration: true,
      });

      expect(adapter.getProvider()).toBe("firebase");

      adapter.setProvider("b2");

      expect(adapter.getProvider()).toBe("b2");
      expect(mockGetB2Service).toHaveBeenCalled();
    });

    it("should generate URLs with overridden provider", async () => {
      const adapter = new StorageAdapter({
        provider: "firebase",
        enableMigration: true,
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });

      const result = await adapter.generateUploadUrl({
        path: "test/file.txt",
        provider: "b2",
      });

      expect(result.provider).toBe("b2");
      expect(mockB2Service.generateUploadUrl).toHaveBeenCalled();
    });
  });

  describe("Connectivity Checks", () => {
    beforeEach(() => {
      // Mock emulator environment
      process.env.FUNCTIONS_EMULATOR = "true";
    });

    afterEach(() => {
      delete process.env.FUNCTIONS_EMULATOR;
    });

    it("should check B2 connectivity in emulator mode", async () => {
      const adapter = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });

      // Trigger connectivity check
      await adapter.generateUploadUrl("test/file.txt");

      expect(mockB2Service.checkConnectivity).toHaveBeenCalledWith(3000);
    });

    it("should fallback to firebase when B2 is unavailable", async () => {
      mockB2Service.checkConnectivity.mockResolvedValue(false);

      const adapter = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });

      const result = await adapter.generateUploadUrl("test/file.txt");

      // Should fallback to Firebase
      expect(result.provider).toBe("firebase");
      expect(mockFirebaseStorage.bucket).toHaveBeenCalled();
    });
  });

  describe("Migration Between Providers", () => {
    let adapter: StorageAdapter;

    beforeEach(() => {
      adapter = new StorageAdapter({
        provider: "firebase",
        enableMigration: true,
        r2Config: {
          defaultBucket: "test-r2-bucket",
        },
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });

      // Mock fetch for file copying
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
          headers: new Map([["content-type", "text/plain"]]),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
        } as any);
    });

    afterEach(() => {
      (global.fetch as jest.Mock).mockRestore();
    });

    it("should copy files from R2 to B2", async () => {
      await adapter.copyBetweenProviders({
        sourcePath: "source/file.txt",
        sourceProvider: "r2",
        sourceBucket: "test-r2-bucket",
        destPath: "dest/file.txt",
        destProvider: "b2",
        destBucket: "test-b2-bucket",
      });

      expect(mockR2Service.generateDownloadUrl).toHaveBeenCalledWith({
        bucket: "test-r2-bucket",
        key: "source/file.txt",
        expiresIn: 300,
      });

      expect(mockB2Service.generateUploadUrl).toHaveBeenCalledWith({
        path: "dest/file.txt",
        bucket: "test-b2-bucket",
        contentType: "text/plain",
        expiresIn: 300,
      });
    });

    it("should copy files from Firebase to B2", async () => {
      await adapter.copyBetweenProviders({
        sourcePath: "source/file.txt",
        sourceProvider: "firebase",
        destPath: "dest/file.txt",
        destProvider: "b2",
        destBucket: "test-b2-bucket",
      });

      // Should use Firebase for source
      expect(mockFirebaseStorage.bucket().file("source/file.txt").getSignedUrl).toHaveBeenCalled();

      // Should use B2 for destination
      expect(mockB2Service.generateUploadUrl).toHaveBeenCalledWith({
        path: "dest/file.txt",
        bucket: "test-b2-bucket",
        contentType: "text/plain",
        expiresIn: 300,
      });
    });

    it("should throw error when copying within same provider", async () => {
      await expect(
        adapter.copyBetweenProviders({
          sourcePath: "source/file.txt",
          sourceProvider: "b2",
          destPath: "dest/file.txt",
          destProvider: "b2",
        })
      ).rejects.toThrow("Source and destination providers must be different");
    });
  });

  describe("Storage Status", () => {
    it("should return B2 status information", async () => {
      const adapter = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });

      const status = await adapter.getStorageStatus();

      expect(status.configuredProvider).toBe("b2");
      expect(status.actualProvider).toBe("b2");
      expect(status.bucket).toBe("test-b2-bucket");
      expect(status.b2Available).toBe(true);
    });

    it("should show connectivity check status", async () => {
      process.env.FUNCTIONS_EMULATOR = "true";

      const adapter = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });

      // Trigger connectivity check
      await adapter.generateUploadUrl("test.txt");

      const status = await adapter.getStorageStatus();

      expect(status.connectivityChecked).toBe(true);
      expect(status.isEmulator).toBe(true);

      delete process.env.FUNCTIONS_EMULATOR;
    });
  });

  describe("Error Handling", () => {
    let adapter: StorageAdapter;

    beforeEach(() => {
      adapter = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });
    });

    it("should throw error when B2 bucket is not configured", async () => {
      const adapterNoBucket = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "",
        },
      });

      await expect(
        adapterNoBucket.generateUploadUrl("test/file.txt")
      ).rejects.toThrow("B2 bucket not configured");
    });

    it("should propagate B2 service errors", async () => {
      mockB2Service.generateUploadUrl.mockRejectedValue(new Error("B2 API Error"));

      await expect(
        adapter.generateUploadUrl("test/file.txt")
      ).rejects.toThrow("B2 API Error");
    });

    it("should handle connectivity errors gracefully", async () => {
      process.env.FUNCTIONS_EMULATOR = "true";
      mockB2Service.checkConnectivity.mockRejectedValue(new Error("Network error"));

      const adapter = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });

      // Should fallback to Firebase without throwing
      const result = await adapter.generateUploadUrl("test/file.txt");
      expect(result.provider).toBe("firebase");

      delete process.env.FUNCTIONS_EMULATOR;
    });
  });

  describe("Backward Compatibility", () => {
    let adapter: StorageAdapter;

    beforeEach(() => {
      adapter = new StorageAdapter({
        provider: "b2",
        b2Config: {
          defaultBucket: "test-b2-bucket",
        },
      });
    });

    it("should support legacy string parameters for upload", async () => {
      const result = await adapter.generateUploadUrl(
        "test/file.txt",
        "text/plain",
        3600,
        {userId: "123"}
      );

      expect(result.signedUrl).toBe("https://b2-upload-url.com");
      expect(mockB2Service.generateUploadUrl).toHaveBeenCalledWith({
        bucket: "test-b2-bucket",
        key: "test/file.txt",
        contentType: "text/plain",
        metadata: {userId: "123"},
        expiresIn: 3600,
      });
    });

    it("should support legacy string parameters for file operations", async () => {
      await adapter.deleteFile("test/file.txt");

      expect(mockB2Service.deleteObject).toHaveBeenCalledWith(
        "test-b2-bucket",
        "test/file.txt"
      );
    });
  });
});
