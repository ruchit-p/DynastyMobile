// Tests for B2Service
import {B2Service, getB2Service, resetB2ServiceInstance} from "../b2Service";
import {getB2Config, getB2S3Config, validateB2Config} from "../../config/b2Config";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";

// Mock AWS SDK classes
const mockS3Send = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockS3Send,
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
  ListObjectsV2Command: jest.fn(),
  CopyObjectCommand: jest.fn(),
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn(),
}));

// Mock config
jest.mock("../../config/b2Config");

const mockGetB2Config = getB2Config as jest.MockedFunction<typeof getB2Config>;
const mockGetB2S3Config = getB2S3Config as jest.MockedFunction<typeof getB2S3Config>;
const mockValidateB2Config = validateB2Config as jest.MockedFunction<typeof validateB2Config>;
const mockGetSignedUrlFunc = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

describe("B2Service", () => {
  const mockB2Config = {
    keyId: "test-key-id",
    applicationKey: "test-app-key",
    endpoint: "https://s3.us-west-004.backblazeb2.com",
    region: "us-west-004",
    baseBucket: "test-bucket",
    bucketId: "test-bucket-id",
    enableMigration: false,
    migrationPercentage: 0,
    storageProvider: "b2",
    downloadUrl: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetB2ServiceInstance();

    // Mock valid config
    mockValidateB2Config.mockReturnValue({
      valid: true,
      errors: [],
    });

    mockGetB2Config.mockReturnValue(mockB2Config);

    // Mock S3 config
    mockGetB2S3Config.mockReturnValue({
      endpoint: mockB2Config.endpoint,
      region: mockB2Config.region,
      credentials: {
        accessKeyId: mockB2Config.keyId,
        secretAccessKey: mockB2Config.applicationKey,
      },
      forcePathStyle: true,
      s3ForcePathStyle: true,
    });
  });

  describe("Configuration", () => {
    it("should validate configuration on initialization", () => {
      new B2Service();
      expect(mockValidateB2Config).toHaveBeenCalled();
    });

    it("should throw error for invalid configuration", () => {
      mockValidateB2Config.mockReturnValue({
        valid: false,
        errors: ["B2 keyId is missing"],
      });

      expect(() => new B2Service()).toThrow("B2 configuration invalid: B2 keyId is missing");
    });

    it("should use provided config over environment config", () => {
      const customConfig = {
        keyId: "custom-key",
        applicationKey: "custom-app-key",
        bucketName: "custom-bucket",
      };

      new B2Service(customConfig);

      // Should not call getB2Config when custom config is provided
      expect(mockGetB2Config).not.toHaveBeenCalled();
    });
  });

  describe("Upload URL Generation", () => {
    let b2Service: B2Service;

    beforeEach(() => {
      b2Service = new B2Service();
      mockGetSignedUrlFunc.mockResolvedValue("https://signed-upload-url.com");
    });

    it("should generate upload URL successfully", async () => {
      const options = {
        bucket: "test-bucket",
        key: "test/file.txt",
        contentType: "text/plain",
        expiresIn: 3600,
      };

      const result = await b2Service.generateUploadUrl(options);

      expect(result).toBe("https://signed-upload-url.com");
      expect(mockGetSignedUrlFunc).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        {expiresIn: 3600}
      );
    });

    it("should handle B2 checksum in upload URL", async () => {
      const options = {
        bucket: "test-bucket",
        key: "test/file.txt",
        checksumSHA1: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      };

      await b2Service.generateUploadUrl(options);

      // Verify PutObjectCommand was called with checksum
      const {PutObjectCommand} = await import("@aws-sdk/client-s3");
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ChecksumSHA1: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
        })
      );
    });

    it("should cap expiration time to B2 maximum", async () => {
      const options = {
        bucket: "test-bucket",
        key: "test/file.txt",
        expiresIn: 10 * 24 * 60 * 60, // 10 days
      };

      await b2Service.generateUploadUrl(options);

      // Should cap to 7 days maximum
      expect(mockGetSignedUrlFunc).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        {expiresIn: 7 * 24 * 60 * 60}
      );
    });
  });

  describe("Download URL Generation", () => {
    let b2Service: B2Service;

    beforeEach(() => {
      b2Service = new B2Service();
      mockGetSignedUrlFunc.mockResolvedValue("https://signed-download-url.com");
    });

    it("should generate download URL successfully", async () => {
      const options = {
        bucket: "test-bucket",
        key: "test/file.txt",
        expiresIn: 1800,
      };

      const result = await b2Service.generateDownloadUrl(options);

      expect(result).toBe("https://signed-download-url.com");
      expect(mockGetSignedUrlFunc).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        {expiresIn: 1800}
      );
    });
  });

  describe("Object Operations", () => {
    let b2Service: B2Service;

    beforeEach(() => {
      b2Service = new B2Service();
    });

    it("should delete object successfully", async () => {
      mockS3Send.mockResolvedValue({});

      await b2Service.deleteObject("test-bucket", "test/file.txt");

      expect(mockS3Send).toHaveBeenCalledWith(expect.anything());
    });

    it("should check object existence", async () => {
      mockS3Send.mockResolvedValue({});

      const exists = await b2Service.objectExists("test-bucket", "test/file.txt");

      expect(exists).toBe(true);
      expect(mockS3Send).toHaveBeenCalledWith(expect.anything());
    });

    it("should return false for non-existent objects", async () => {
      mockS3Send.mockRejectedValue({
        name: "NotFound",
        $metadata: {httpStatusCode: 404},
      });

      const exists = await b2Service.objectExists("test-bucket", "test/file.txt");

      expect(exists).toBe(false);
    });

    it("should list objects in bucket", async () => {
      const mockResponse = {
        Contents: [
          {
            Key: "file1.txt",
            Size: 1024,
            LastModified: new Date(),
            ETag: "etag1",
          },
          {
            Key: "file2.txt",
            Size: 2048,
            LastModified: new Date(),
            ETag: "etag2",
          },
        ],
        IsTruncated: false,
      };

      mockS3Send.mockResolvedValue(mockResponse);

      const result = await b2Service.listObjects("test-bucket", "prefix/");

      expect(result.objects).toHaveLength(2);
      expect(result.objects[0].key).toBe("file1.txt");
      expect(result.objects[0].etag).toBe("etag1");
      expect(result.isTruncated).toBe(false);
    });
  });

  describe("Connectivity Check", () => {
    let b2Service: B2Service;

    beforeEach(() => {
      b2Service = new B2Service();
    });

    it("should return true for successful connectivity check", async () => {
      mockS3Send.mockResolvedValue({});

      const isConnected = await b2Service.checkConnectivity(1000);

      expect(isConnected).toBe(true);
    });

    it("should return false for failed connectivity check", async () => {
      mockS3Send.mockRejectedValue(new Error("Connection failed"));

      const isConnected = await b2Service.checkConnectivity(1000);

      expect(isConnected).toBe(false);
    });

    it("should handle timeout", async () => {
      // Mock a delayed response
      mockS3Send.mockImplementation(() =>
        new Promise((resolve) => setTimeout(() => resolve({}), 2000))
      );

      const isConnected = await b2Service.checkConnectivity(500);

      expect(isConnected).toBe(false);
    });
  });

  describe("Retry Logic", () => {
    let b2Service: B2Service;

    beforeEach(() => {
      b2Service = new B2Service();
    });

    it("should retry on server errors", async () => {
      // First call fails, second succeeds
      mockGetSignedUrlFunc
        .mockRejectedValueOnce({
          $metadata: {httpStatusCode: 500},
          message: "Internal Server Error",
        })
        .mockResolvedValueOnce("https://success-url.com");

      const result = await b2Service.generateUploadUrl({
        bucket: "test-bucket",
        key: "test/file.txt",
      });

      expect(result).toBe("https://success-url.com");
      expect(mockGetSignedUrlFunc).toHaveBeenCalledTimes(2);
    });

    it("should not retry on client errors", async () => {
      mockGetSignedUrlFunc.mockRejectedValue({
        $metadata: {httpStatusCode: 400},
        message: "Bad Request",
      });

      await expect(
        b2Service.generateUploadUrl({
          bucket: "test-bucket",
          key: "test/file.txt",
        })
      ).rejects.toThrow();

      expect(mockGetSignedUrlFunc).toHaveBeenCalledTimes(1);
    });

    it("should retry on specific client errors (408, 429)", async () => {
      // Test 429 (rate limit)
      mockGetSignedUrlFunc
        .mockRejectedValueOnce({
          $metadata: {httpStatusCode: 429},
          message: "Too Many Requests",
        })
        .mockResolvedValueOnce("https://success-url.com");

      const result = await b2Service.generateUploadUrl({
        bucket: "test-bucket",
        key: "test/file.txt",
      });

      expect(result).toBe("https://success-url.com");
      expect(mockGetSignedUrlFunc).toHaveBeenCalledTimes(2);
    });
  });

  describe("Static Methods", () => {
    it("should generate proper storage keys", () => {
      const key = B2Service.generateStorageKey("vault", "user123", "document.pdf", "folder1");

      expect(key).toMatch(/^vault\/user123\/folder1\/\d+_document\.pdf$/);
    });

    it("should generate storage keys without parent", () => {
      const key = B2Service.generateStorageKey("profiles", "user123", "avatar.jpg");

      expect(key).toMatch(/^profiles\/user123\/\d+_avatar\.jpg$/);
    });

    it("should sanitize file names", () => {
      const key = B2Service.generateStorageKey("vault", "user123", "my file (1).pdf");

      expect(key).toMatch(/^vault\/user123\/root\/\d+_my_file__1_\.pdf$/);
    });

    it("should get bucket name from config", () => {
      const bucketName = B2Service.getBucketName();

      expect(bucketName).toBe("test-bucket");
    });
  });

  describe("Advanced Features", () => {
    let b2Service: B2Service;

    beforeEach(() => {
      b2Service = new B2Service();
    });

    it("should get object metadata", async () => {
      const mockMetadata = {
        ContentLength: 1024,
        LastModified: new Date(),
        ContentType: "application/pdf",
        ETag: "etag123",
        Metadata: {userCustom: "value"},
        ChecksumSHA1: "sha1hash",
      };

      mockS3Send.mockResolvedValue(mockMetadata);

      const metadata = await b2Service.getObjectMetadata("test-bucket", "test/file.pdf");

      expect(metadata.size).toBe(1024);
      expect(metadata.contentType).toBe("application/pdf");
      expect(metadata.checksumSHA1).toBe("sha1hash");
    });

    it("should copy objects within B2", async () => {
      mockS3Send.mockResolvedValue({});

      await b2Service.copyObject(
        "source-bucket",
        "source/file.txt",
        "dest-bucket",
        "dest/file.txt",
        {newMeta: "value"}
      );

      expect(mockS3Send).toHaveBeenCalledWith(expect.anything());
    });

    it("should generate direct download URL when configured", async () => {
      const configWithDownloadUrl = {
        ...mockB2Config,
        downloadUrl: "https://cdn.example.com",
      };

      mockGetB2Config.mockReturnValue(configWithDownloadUrl);

      const b2ServiceWithCdn = new B2Service();

      const url = await b2ServiceWithCdn.getDirectDownloadUrl("test-bucket", "file.txt");

      expect(url).toBe("https://cdn.example.com/test-bucket/file.txt");
    });
  });

  describe("Singleton Pattern", () => {
    it("should return same instance", () => {
      const instance1 = getB2Service();
      const instance2 = getB2Service();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = getB2Service();
      resetB2ServiceInstance();
      const instance2 = getB2Service();

      expect(instance1).not.toBe(instance2);
    });
  });
});
