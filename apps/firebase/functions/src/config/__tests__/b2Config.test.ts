// Tests for B2 Configuration
import {getB2Config, getB2S3Config, validateB2Config, isB2Configured} from "../b2Config";
import {B2_CONFIG} from "../b2Secrets";

// Mock Firebase secrets
jest.mock("../b2Secrets", () => ({
  B2_CONFIG: {
    value: jest.fn(),
  },
  getEnvironmentBucketName: jest.fn().mockReturnValue("test-bucket"),
  B2_DEFAULTS: {
    region: "us-west-004",
    endpoint: "https://s3.us-west-004.backblazeb2.com",
    maxSignedUrlExpiry: 7 * 24 * 60 * 60,
  },
}));

const mockB2Config = B2_CONFIG as jest.Mocked<typeof B2_CONFIG>;

describe("B2 Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {...originalEnv};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getB2Config", () => {
    it("should use Firebase secrets in production", () => {
      const mockConfigData = {
        keyId: "test-key-id",
        applicationKey: "test-app-key",
        bucketName: "production-bucket",
      };

      mockB2Config.value.mockReturnValue(JSON.stringify(mockConfigData));

      const config = getB2Config();

      expect(config.keyId).toBe("test-key-id");
      expect(config.applicationKey).toBe("test-app-key");
      expect(config.baseBucket).toBe("production-bucket");
      expect(config.endpoint).toBe("https://s3.us-west-004.backblazeb2.com");
      expect(config.region).toBe("us-west-004");
    });

    it("should use environment variables in emulator mode", () => {
      process.env.FUNCTIONS_EMULATOR = "true";
      process.env.B2_CONFIG = JSON.stringify({
        keyId: "emulator-key",
        applicationKey: "emulator-app-key",
      });

      const config = getB2Config();

      expect(config.keyId).toBe("emulator-key");
      expect(config.applicationKey).toBe("emulator-app-key");
    });

    it("should fallback to individual env vars in emulator mode", () => {
      process.env.FUNCTIONS_EMULATOR = "true";
      process.env.B2_KEY_ID = "fallback-key";
      process.env.B2_APPLICATION_KEY = "fallback-app-key";
      process.env.B2_BASE_BUCKET = "fallback-bucket";

      const config = getB2Config();

      expect(config.keyId).toBe("fallback-key");
      expect(config.applicationKey).toBe("fallback-app-key");
      expect(config.baseBucket).toBe("fallback-bucket");
    });

    it("should use default values when env vars are missing", () => {
      process.env.FUNCTIONS_EMULATOR = "true";
      process.env.B2_KEY_ID = "test-key";
      process.env.B2_APPLICATION_KEY = "test-app-key";

      const config = getB2Config();

      expect(config.endpoint).toBe("https://s3.us-west-004.backblazeb2.com");
      expect(config.region).toBe("us-west-004");
      expect(config.baseBucket).toBe("dynasty"); // default fallback
    });

    it("should handle invalid JSON gracefully in emulator mode", () => {
      process.env.FUNCTIONS_EMULATOR = "true";
      process.env.B2_CONFIG = "invalid-json";
      process.env.B2_KEY_ID = "fallback-key";
      process.env.B2_APPLICATION_KEY = "fallback-app-key";

      const config = getB2Config();

      expect(config.keyId).toBe("fallback-key");
      expect(config.applicationKey).toBe("fallback-app-key");
    });

    it("should include optional configuration fields", () => {
      const mockConfigData = {
        keyId: "test-key",
        applicationKey: "test-app-key",
        bucketId: "bucket-id-123",
      };

      mockB2Config.value.mockReturnValue(JSON.stringify(mockConfigData));

      const config = getB2Config();

      expect(config.bucketId).toBe("bucket-id-123");
      expect(config.enableMigration).toBe(false); // default
      expect(config.migrationPercentage).toBe(0); // default
    });
  });

  describe("getB2S3Config", () => {
    beforeEach(() => {
      const mockConfigData = {
        keyId: "test-key-id",
        applicationKey: "test-app-key",
      };

      mockB2Config.value.mockReturnValue(JSON.stringify(mockConfigData));
    });

    it("should return S3-compatible configuration", () => {
      const s3Config = getB2S3Config();

      expect(s3Config.endpoint).toBe("https://s3.us-west-004.backblazeb2.com");
      expect(s3Config.region).toBe("us-west-004");
      expect(s3Config.credentials.accessKeyId).toBe("test-key-id");
      expect(s3Config.credentials.secretAccessKey).toBe("test-app-key");
      expect(s3Config.forcePathStyle).toBe(true);
      expect(s3Config.s3ForcePathStyle).toBe(true);
    });

    it("should use custom endpoint and region", () => {
      process.env.FUNCTIONS_EMULATOR = "true";
      process.env.B2_ENDPOINT = "https://custom-endpoint.com";
      process.env.B2_REGION = "eu-central-1";
      process.env.B2_KEY_ID = "test-key";
      process.env.B2_APPLICATION_KEY = "test-app-key";

      const s3Config = getB2S3Config();

      expect(s3Config.endpoint).toBe("https://custom-endpoint.com");
      expect(s3Config.region).toBe("eu-central-1");
    });
  });

  describe("validateB2Config", () => {
    it("should validate complete configuration", () => {
      const mockConfigData = {
        keyId: "valid-key-id",
        applicationKey: "valid-app-key",
        bucketName: "valid-bucket",
      };

      mockB2Config.value.mockReturnValue(JSON.stringify(mockConfigData));

      const result = validateB2Config();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should identify missing required fields", () => {
      const mockConfigData = {
        keyId: "",
        applicationKey: "test-app-key",
      };

      mockB2Config.value.mockReturnValue(JSON.stringify(mockConfigData));

      const result = validateB2Config();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("B2 keyId is missing");
    });

    it("should validate endpoint format", () => {
      process.env.FUNCTIONS_EMULATOR = "true";
      process.env.B2_KEY_ID = "test-key";
      process.env.B2_APPLICATION_KEY = "test-app-key";
      process.env.B2_ENDPOINT = "http://insecure-endpoint.com"; // HTTP instead of HTTPS

      const result = validateB2Config();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("B2 endpoint must use HTTPS");
    });

    it("should handle configuration errors", () => {
      // Mock an error in getB2Config
      mockB2Config.value.mockImplementation(() => {
        throw new Error("Configuration access denied");
      });

      const result = validateB2Config();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("B2 configuration error: Configuration access denied");
    });

    it("should check all required fields", () => {
      const mockConfigData = {};

      mockB2Config.value.mockReturnValue(JSON.stringify(mockConfigData));

      const result = validateB2Config();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("B2 keyId is missing");
      expect(result.errors).toContain("B2 applicationKey is missing");
      expect(result.errors).toContain("B2 baseBucket is missing");
    });
  });

  describe("isB2Configured", () => {
    it("should return true for complete configuration", () => {
      const mockConfigData = {
        keyId: "test-key",
        applicationKey: "test-app-key",
        bucketName: "test-bucket",
      };

      mockB2Config.value.mockReturnValue(JSON.stringify(mockConfigData));

      const isConfigured = isB2Configured();

      expect(isConfigured).toBe(true);
    });

    it("should return false for incomplete configuration", () => {
      const mockConfigData = {
        keyId: "test-key",
        // Missing applicationKey
      };

      mockB2Config.value.mockReturnValue(JSON.stringify(mockConfigData));

      const isConfigured = isB2Configured();

      expect(isConfigured).toBe(false);
    });

    it("should return false for empty configuration", () => {
      const mockConfigData = {
        keyId: "",
        applicationKey: "",
        bucketName: "",
      };

      mockB2Config.value.mockReturnValue(JSON.stringify(mockConfigData));

      const isConfigured = isB2Configured();

      expect(isConfigured).toBe(false);
    });
  });

  describe("Environment-specific behavior", () => {
    it("should handle production environment", () => {
      delete process.env.FUNCTIONS_EMULATOR;

      const mockConfigData = {
        keyId: "prod-key",
        applicationKey: "prod-app-key",
        bucketName: "prod-bucket",
      };

      mockB2Config.value.mockReturnValue(JSON.stringify(mockConfigData));

      const config = getB2Config();

      expect(config.keyId).toBe("prod-key");
      expect(config.storageProvider).toBe("firebase"); // default
    });

    it("should handle staging environment variables", () => {
      process.env.FUNCTIONS_EMULATOR = "true";
      process.env.B2_MIGRATION_ENABLED = "true";
      process.env.B2_MIGRATION_PERCENTAGE = "25";
      process.env.B2_KEY_ID = "staging-key";
      process.env.B2_APPLICATION_KEY = "staging-app-key";

      const config = getB2Config();

      expect(config.enableMigration).toBe(true);
      expect(config.migrationPercentage).toBe(25);
    });

    it("should provide download URL configuration", () => {
      process.env.FUNCTIONS_EMULATOR = "true";
      process.env.B2_DOWNLOAD_URL = "https://cdn.example.com";
      process.env.B2_KEY_ID = "test-key";
      process.env.B2_APPLICATION_KEY = "test-app-key";

      const config = getB2Config();

      expect(config.downloadUrl).toBe("https://cdn.example.com");
    });
  });

  describe("Error handling", () => {
    it("should handle malformed JSON in secrets", () => {
      mockB2Config.value.mockReturnValue("{ invalid json }");

      expect(() => getB2Config()).toThrow();
    });

    it("should handle missing secret value", () => {
      mockB2Config.value.mockImplementation(() => {
        throw new Error("Secret not found");
      });

      expect(() => getB2Config()).toThrow("Secret not found");
    });
  });
});
