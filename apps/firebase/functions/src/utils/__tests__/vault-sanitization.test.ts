import {
  sanitizeFileName,
  sanitizeFolderName,
  sanitizeVaultPath,
  sanitizeMimeType,
  sanitizeSearchQuery,
  sanitizeTag,
  validateItemId,
  validateShareId,
  sanitizeFileMetadata,
  validateFileSize,
  getFileExtension,
} from "../vault-sanitization";

describe("Vault Sanitization Utilities", () => {
  describe("sanitizeFileName", () => {
    it("should remove dangerous extensions", () => {
      expect(sanitizeFileName("malware.exe")).toBe("malware.exe.txt");
      expect(sanitizeFileName("script.js")).toBe("script.js.txt");
      expect(sanitizeFileName("virus.bat")).toBe("virus.bat.txt");
    });

    it("should remove path traversal attempts", () => {
      expect(sanitizeFileName("../../../etc/passwd")).toBe("passwd");
      expect(sanitizeFileName("..\\windows\\system32\\config")).toBe("config");
    });

    it("should remove control characters", () => {
      expect(sanitizeFileName("file\x00name.txt")).toBe("filename.txt");
      expect(sanitizeFileName("file\x1fname.txt")).toBe("filename.txt");
    });

    it("should handle normal filenames", () => {
      expect(sanitizeFileName("document.pdf")).toBe("document.pdf");
      expect(sanitizeFileName("image.jpg")).toBe("image.jpg");
      expect(sanitizeFileName("My File (2023).docx")).toBe("My File (2023).docx");
    });

    it("should enforce maximum length", () => {
      const longName = "a".repeat(300) + ".txt";
      const result = sanitizeFileName(longName);
      expect(result.length).toBeLessThanOrEqual(255);
    });
  });

  describe("sanitizeFolderName", () => {
    it("should remove path separators", () => {
      expect(sanitizeFolderName("folder/subfolder")).toBe("foldersubfolder");
      expect(sanitizeFolderName("folder\\subfolder")).toBe("foldersubfolder");
    });

    it("should remove special characters", () => {
      expect(sanitizeFolderName("folder<>:\"|?*")).toBe("folder");
      expect(sanitizeFolderName("My Folder!")).toBe("My Folder_");
    });

    it("should handle normal folder names", () => {
      expect(sanitizeFolderName("Documents")).toBe("Documents");
      expect(sanitizeFolderName("Project Files 2023")).toBe("Project Files 2023");
    });
  });

  describe("sanitizeVaultPath", () => {
    it("should prevent directory traversal", () => {
      expect(sanitizeVaultPath("../../../etc")).toBe("/etc");
      expect(sanitizeVaultPath("/vault/../../../etc")).toBe("/vault/etc");
      expect(sanitizeVaultPath("/folder/../..")).toBe("/folder");
    });

    it("should normalize paths", () => {
      expect(sanitizeVaultPath("folder//subfolder")).toBe("/folder/subfolder");
      expect(sanitizeVaultPath("/folder/")).toBe("/folder");
      expect(sanitizeVaultPath("//folder///")).toBe("/folder");
    });

    it("should ensure paths start with /", () => {
      expect(sanitizeVaultPath("folder/file")).toBe("/folder/file");
      expect(sanitizeVaultPath("")).toBe("/");
    });
  });

  describe("sanitizeMimeType", () => {
    it("should block dangerous MIME types", () => {
      expect(sanitizeMimeType("text/html")).toBe("application/octet-stream");
      expect(sanitizeMimeType("application/javascript")).toBe("application/octet-stream");
      expect(sanitizeMimeType("application/x-executable")).toBe("application/octet-stream");
    });

    it("should allow safe MIME types", () => {
      expect(sanitizeMimeType("image/jpeg")).toBe("image/jpeg");
      expect(sanitizeMimeType("application/pdf")).toBe("application/pdf");
      expect(sanitizeMimeType("video/mp4")).toBe("video/mp4");
    });

    it("should normalize MIME types", () => {
      expect(sanitizeMimeType("IMAGE/JPEG")).toBe("image/jpeg");
      expect(sanitizeMimeType("image/jpg")).toBe("image/jpeg");
      expect(sanitizeMimeType("  image/png  ")).toBe("image/png");
    });

    it("should handle invalid MIME types", () => {
      expect(sanitizeMimeType("not-a-mime-type")).toBe("application/octet-stream");
      expect(sanitizeMimeType("")).toBe("application/octet-stream");
    });
  });

  describe("sanitizeSearchQuery", () => {
    it("should remove regex special characters", () => {
      expect(sanitizeSearchQuery("file.*")).toBe("file");
      expect(sanitizeSearchQuery("test[0-9]+")).toBe("test0-9");
    });

    it("should remove SQL keywords", () => {
      expect(sanitizeSearchQuery("drop table users")).toBe("table users");
      expect(sanitizeSearchQuery("delete from files")).toBe("from files");
    });

    it("should handle normal queries", () => {
      expect(sanitizeSearchQuery("vacation photos 2023")).toBe("vacation photos 2023");
      expect(sanitizeSearchQuery("project documents")).toBe("project documents");
    });
  });

  describe("sanitizeTag", () => {
    it("should convert to lowercase and replace spaces", () => {
      expect(sanitizeTag("My Tag")).toBe("my-tag");
      expect(sanitizeTag("Tag Name")).toBe("tag-name");
    });

    it("should remove special characters", () => {
      expect(sanitizeTag("tag@#$%")).toBe("tag");
      expect(sanitizeTag("tag_name-123")).toBe("tag_name-123");
    });
  });

  describe("validateItemId", () => {
    it("should validate correct IDs", () => {
      expect(validateItemId("vault-1234567890-abcdef")).toBe(true);
      expect(validateItemId("item_12345")).toBe(true);
    });

    it("should reject invalid IDs", () => {
      expect(validateItemId("short")).toBe(false);
      expect(validateItemId("id with spaces")).toBe(false);
      expect(validateItemId("id@#$%")).toBe(false);
      expect(validateItemId("")).toBe(false);
    });
  });

  describe("validateShareId", () => {
    it("should validate correct share IDs", () => {
      expect(validateShareId("share-1234567890")).toBe(true);
      expect(validateShareId("abcdefghijklmnop")).toBe(true);
    });

    it("should reject invalid share IDs", () => {
      expect(validateShareId("short")).toBe(false);
      expect(validateShareId("a".repeat(60))).toBe(false);
      expect(validateShareId("share id")).toBe(false);
    });
  });

  describe("sanitizeFileMetadata", () => {
    it("should whitelist allowed fields", () => {
      const metadata = {
        width: 1920,
        height: 1080,
        maliciousField: "evil",
        originalName: "photo.jpg",
      };
      const result = sanitizeFileMetadata(metadata);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.originalName).toBe("photo.jpg");
      expect(result.maliciousField).toBeUndefined();
    });

    it("should validate numeric fields", () => {
      const metadata = {
        width: "1920",
        height: -100,
        duration: 1000000000,
      };
      const result = sanitizeFileMetadata(metadata);
      expect(result.width).toBeUndefined();
      expect(result.height).toBeUndefined();
      expect(result.duration).toBeUndefined();
    });

    it("should validate location data", () => {
      const metadata = {
        location: {latitude: 37.7749, longitude: -122.4194},
      };
      const result = sanitizeFileMetadata(metadata);
      expect(result.location).toEqual({latitude: 37.7749, longitude: -122.4194});

      const badLocation = {
        location: {latitude: 200, longitude: -300},
      };
      const badResult = sanitizeFileMetadata(badLocation);
      expect(badResult.location).toBeUndefined();
    });
  });

  describe("validateFileSize", () => {
    it("should accept valid file sizes", () => {
      expect(validateFileSize(1024 * 1024)).toBe(true); // 1MB
      expect(validateFileSize(50 * 1024 * 1024)).toBe(true); // 50MB
    });

    it("should reject invalid file sizes", () => {
      expect(validateFileSize(200 * 1024 * 1024)).toBe(false); // 200MB > 100MB
      expect(validateFileSize(-100)).toBe(false);
      expect(validateFileSize(NaN)).toBe(false);
    });
  });

  describe("getFileExtension", () => {
    it("should extract file extensions", () => {
      expect(getFileExtension("document.pdf")).toBe(".pdf");
      expect(getFileExtension("archive.tar.gz")).toBe(".gz");
      expect(getFileExtension("no-extension")).toBe("");
    });

    it("should handle edge cases", () => {
      expect(getFileExtension(".hidden")).toBe("");
      expect(getFileExtension("file.")).toBe("");
    });
  });
});
