import {describe, it, expect} from "@jest/globals";
import {
  sanitizeFileName,
  sanitizeFolderName,
  sanitizeVaultPath,
  sanitizeMimeType,
  validateFileSize,
  validateItemId,
  validateShareId,
  sanitizeFileMetadata,
} from "../utils/vault-sanitization";

describe("Vault Security Tests", () => {
  describe("File Security", () => {
    it("should prevent dangerous file uploads", () => {
      // Test dangerous extensions
      const dangerousFiles = [
        "malware.exe",
        "script.js",
        "virus.bat",
        "shell.sh",
        "hack.cmd",
      ];

      dangerousFiles.forEach((fileName) => {
        const sanitized = sanitizeFileName(fileName);
        expect(sanitized).toMatch(/\.txt$/);
        console.log(`${fileName} → ${sanitized}`);
      });
    });

    it("should prevent path traversal attacks", () => {
      const maliciousPaths = [
        "../../../etc/passwd",
        "..\\..\\windows\\system32",
        "/vault/../../../sensitive",
        "folder/../../private",
      ];

      maliciousPaths.forEach((path) => {
        const sanitized = sanitizeVaultPath(path);
        expect(sanitized).not.toContain("..");
        console.log(`${path} → ${sanitized}`);
      });
    });

    it("should block dangerous MIME types", () => {
      const dangerousMimes = [
        "text/html",
        "application/javascript",
        "application/x-executable",
        "application/x-msdownload",
      ];

      dangerousMimes.forEach((mime) => {
        const sanitized = sanitizeMimeType(mime);
        expect(sanitized).toBe("application/octet-stream");
        console.log(`${mime} → ${sanitized}`);
      });
    });
  });

  describe("Input Validation", () => {
    it("should validate file sizes", () => {
      expect(validateFileSize(50 * 1024 * 1024)).toBe(true); // 50MB - OK
      expect(validateFileSize(100 * 1024 * 1024)).toBe(true); // 100MB - OK
      expect(validateFileSize(101 * 1024 * 1024)).toBe(false); // 101MB - Too large
      expect(validateFileSize(-1)).toBe(false); // Negative - Invalid
      expect(validateFileSize(0)).toBe(false); // Zero - Invalid
    });

    it("should validate item IDs", () => {
      expect(validateItemId("vault-123-abc")).toBe(true);
      expect(validateItemId("item_12345")).toBe(true);
      expect(validateItemId("short")).toBe(false); // Too short
      expect(validateItemId("id with spaces")).toBe(false); // Invalid chars
      expect(validateItemId("../../../etc")).toBe(false); // Path traversal
    });

    it("should validate share IDs", () => {
      expect(validateShareId("share-1234567890")).toBe(true);
      expect(validateShareId("abcdef123456")).toBe(true);
      expect(validateShareId("short")).toBe(false); // Too short
      expect(validateShareId("a".repeat(60))).toBe(false); // Too long
    });
  });

  describe("Metadata Sanitization", () => {
    it("should whitelist allowed metadata fields", () => {
      const metadata = {
        width: 1920,
        height: 1080,
        duration: 120,
        maliciousField: "evil code",
        dangerousScript: "<script>alert(1)</script>",
      };

      const sanitized = sanitizeFileMetadata(metadata);

      // Allowed fields should be present
      expect(sanitized.width).toBe(1920);
      expect(sanitized.height).toBe(1080);
      expect(sanitized.duration).toBe(120);

      // Dangerous fields should be removed
      expect(sanitized.maliciousField).toBeUndefined();
      expect(sanitized.dangerousScript).toBeUndefined();
    });

    it("should validate metadata values", () => {
      const invalidMetadata = {
        width: "not-a-number",
        height: -100,
        duration: 1000000000, // Too large
        location: {latitude: 200, longitude: -400}, // Invalid coordinates
      };

      const sanitized = sanitizeFileMetadata(invalidMetadata);

      // Invalid values should be removed
      expect(sanitized.width).toBeUndefined();
      expect(sanitized.height).toBeUndefined();
      expect(sanitized.duration).toBeUndefined();
      expect(sanitized.location).toBeUndefined();
    });
  });
});

// Run some basic tests to demonstrate functionality
describe("Vault Encryption Basics", () => {
  it("should handle file name edge cases", () => {
    const testCases = [
      {input: "normal-file.pdf", expected: "normal-file.pdf"},
      {input: ".hidden-file", expected: "hidden-file"},
      {input: "file.....txt", expected: "file.txt"},
      {input: "file<>:\"|?*.txt", expected: "file.txt"},
      {input: "very long " + "a".repeat(300) + ".txt", expectedLength: 255},
    ];

    testCases.forEach(({input, expected, expectedLength}) => {
      const result = sanitizeFileName(input);
      if (expected) {
        expect(result).toBe(expected);
      }
      if (expectedLength) {
        expect(result.length).toBeLessThanOrEqual(expectedLength);
      }
      console.log(`"${input}" → "${result}"`);
    });
  });

  it("should handle folder name edge cases", () => {
    const testCases = [
      {input: "Normal Folder", expected: "Normal Folder"},
      {input: "Folder/With/Slashes", expected: "FolderWithSlashes"},
      {input: "...dots...", expected: "dots"},
      {input: "", expected: "New Folder"},
    ];

    testCases.forEach(({input, expected}) => {
      const result = sanitizeFolderName(input);
      expect(result).toBe(expected);
      console.log(`"${input}" → "${result}"`);
    });
  });
});
