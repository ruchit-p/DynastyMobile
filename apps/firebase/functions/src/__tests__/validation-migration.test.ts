import { validateRequest } from "../utils/request-validator";
import { VALIDATION_SCHEMAS } from "../config/validation-schemas";

describe("Validation Migration Tests", () => {
  describe("Authentication Functions", () => {
    test("signup validation should reject invalid email", () => {
      expect(() => validateRequest(
        { email: "invalid-email", password: "password123" },
        VALIDATION_SCHEMAS.signup
      )).toThrow("invalid email format");
    });

    test("signup validation should reject missing fields", () => {
      expect(() => validateRequest(
        { email: "test@example.com" },
        VALIDATION_SCHEMAS.signup
      )).toThrow("password is required");
    });

    test("signup validation should accept valid input", () => {
      const result = validateRequest(
        { email: "test@example.com", password: "password123" },
        VALIDATION_SCHEMAS.signup
      );
      expect(result).toEqual({
        email: "test@example.com",
        password: "password123"
      });
    });

    test("updateUserProfile validation should accept partial updates", () => {
      const result = validateRequest(
        { uid: "user123", firstName: "John" },
        VALIDATION_SCHEMAS.updateUserProfile
      );
      expect(result).toEqual({
        uid: "user123",
        firstName: "John"
      });
    });

    test("updateUserProfile validation should validate enum values", () => {
      expect(() => validateRequest(
        { uid: "user123", gender: "invalid" },
        VALIDATION_SCHEMAS.updateUserProfile
      )).toThrow("Invalid gender. Must be one of: male, female, other, unspecified");
    });
  });

  describe("Event Functions", () => {
    test("createEvent validation should require all required fields", () => {
      expect(() => validateRequest(
        { title: "Test Event" },
        VALIDATION_SCHEMAS.createEvent
      )).toThrow("eventDate is required");
    });

    test("createEvent validation should validate privacy enum", () => {
      expect(() => validateRequest(
        { 
          title: "Test Event",
          eventDate: "2024-01-01",
          isVirtual: false,
          privacy: "invalid"
        },
        VALIDATION_SCHEMAS.createEvent
      )).toThrow("Invalid privacy. Must be one of: public, family_tree, invite_only");
    });

    test("createEvent validation should accept valid event data", () => {
      const result = validateRequest(
        {
          title: "Test Event",
          description: "Test Description",
          eventDate: "2024-01-01",
          isVirtual: false,
          privacy: "family_tree",
          location: { lat: 40.7128, lng: -74.0060, address: "New York, NY" }
        },
        VALIDATION_SCHEMAS.createEvent
      );
      expect(result.title).toBe("Test Event");
      expect(result.privacy).toBe("family_tree");
    });

    test("updateEvent validation should validate array size limits", () => {
      const largeArray = new Array(101).fill("member");
      expect(() => validateRequest(
        {
          eventId: "event123",
          invitedMemberIds: largeArray
        },
        VALIDATION_SCHEMAS.updateEvent
      )).toThrow("invitedMemberIds exceeds maximum size");
    });
  });

  describe("Chat Functions", () => {
    test("createChat validation should validate participants array", () => {
      expect(() => validateRequest(
        { groupName: "Test Chat" },
        VALIDATION_SCHEMAS.createChat
      )).toThrow("participantIds is required");
    });

    test("sendMessage validation should validate message structure", () => {
      const result = validateRequest(
        {
          chatId: "chat123",
          text: "Hello World"
        },
        VALIDATION_SCHEMAS.sendMessage
      );
      expect(result.text).toBe("Hello World");
      expect(result.chatId).toBe("chat123");
    });

    test("sendMessage validation should validate mediaIds", () => {
      const result = validateRequest(
        {
          chatId: "chat123",
          text: "Check this out",
          mediaIds: ["media1", "media2", "media3"]
        },
        VALIDATION_SCHEMAS.sendMessage
      );
      expect(result.mediaIds).toHaveLength(3);
      expect(result.mediaIds[0]).toBe("media1");
    });
  });

  describe("Vault Functions", () => {
    test("addVaultFile validation should validate file data", () => {
      const result = validateRequest(
        {
          fileName: "document.pdf",
          fileSize: 1024000,
          mimeType: "application/pdf",
          folderId: "folder123"
        },
        VALIDATION_SCHEMAS.addVaultFile
      );
      expect(result.fileName).toBe("document.pdf");
      // mimeType gets sanitized - forward slash becomes &#x2F;
      expect(result.mimeType).toBe("application&#x2F;pdf");
    });

    test("shareVaultItem validation should validate permissions", () => {
      expect(() => validateRequest(
        {
          itemId: "item123",
          userIds: ["user1", "user2"],
          permissions: "invalid"
        },
        VALIDATION_SCHEMAS.shareVaultItem
      )).toThrow("Invalid permissions. Must be one of: read, write, admin");
    });
  });

  describe("Device Fingerprint Functions", () => {
    test("verifyDeviceFingerprint validation should validate structure", () => {
      const result = validateRequest(
        {
          requestId: "req123",
          visitorId: "visitor123",
          deviceInfo: {
            platform: "iOS",
            version: "15.0"
          }
        },
        VALIDATION_SCHEMAS.verifyDeviceFingerprint
      );
      expect(result.requestId).toBe("req123");
      expect(result.visitorId).toBe("visitor123");
    });
  });

  describe("Sync Functions", () => {
    test("enqueueSyncOperation validation should validate operation", () => {
      const result = validateRequest(
        {
          operationType: "create",
          collection: "stories",
          documentId: "doc123",
          operationData: { title: "Test" },
          clientVersion: 1
        },
        VALIDATION_SCHEMAS.enqueueSyncOperation
      );
      expect(result.operationType).toBe("create");
      expect(result.collection).toBe("stories");
    });

    test("batchSyncOperations validation should validate array size", () => {
      const largeArray = new Array(51).fill({ operation: "test" });
      expect(() => validateRequest(
        {
          operations: largeArray,
          deviceId: "device123"
        },
        VALIDATION_SCHEMAS.batchSyncOperations
      )).toThrow("operations exceeds maximum size");
    });
  });

  describe("XSS Protection", () => {
    test("should block XSS attempts in strings", () => {
      expect(() => validateRequest(
        {
          title: "<script>alert('XSS')</script>Test Event",
          eventDate: "2024-01-01",
          isVirtual: false,
          privacy: "public"
        },
        VALIDATION_SCHEMAS.createEvent,
        "user123"
      )).toThrow("XSS attempt detected");
    });

    test("should block XSS in text fields", () => {
      expect(() => validateRequest(
        {
          chatId: "chat123",
          text: "<img src=x onerror=alert('XSS')>Hello"
        },
        VALIDATION_SCHEMAS.sendMessage,
        "user123"
      )).toThrow("XSS attempt detected");
    });

    test("should allow safe HTML entities", () => {
      const result = validateRequest(
        {
          title: "Q&A Session",
          description: "Let's discuss <best practices>",
          eventDate: "2024-01-01",
          isVirtual: false,
          privacy: "public"
        },
        VALIDATION_SCHEMAS.createEvent
      );
      // HTML entities get encoded for safety
      expect(result.title).toBe("Q&amp;A Session");
      expect(result.description).toBe("Let&#x27;s discuss &lt;best practices&gt;");
    });
  });

  describe("Data Type Validation", () => {
    test("should validate date formats", () => {
      const result = validateRequest(
        {
          inviteeId: "user123",
          inviteeEmail: "test@example.com",
          inviterId: "inviter123",
          familyTreeId: "family123",
          dateOfBirth: "1990-01-01T00:00:00Z"
        },
        VALIDATION_SCHEMAS.sendFamilyTreeInvitation
      );
      expect(result.dateOfBirth).toBeInstanceOf(Date);
    });

    test("should validate phone numbers", () => {
      expect(() => validateRequest(
        {
          uid: "user123",
          phoneNumber: "invalid-phone"
        },
        VALIDATION_SCHEMAS.updateUserProfile
      )).toThrow("invalid phone format");

      const result = validateRequest(
        {
          uid: "user123",
          phoneNumber: "+1234567890"
        },
        VALIDATION_SCHEMAS.updateUserProfile
      );
      expect(result.phoneNumber).toBe("+1234567890");
    });

    test("should validate Firestore IDs", () => {
      expect(() => validateRequest(
        {
          eventId: "invalid/id",
          title: "Updated Event"
        },
        VALIDATION_SCHEMAS.updateEvent
      )).toThrow("Invalid eventId format");
    });
  });

  describe("Performance", () => {
    test("should handle large valid payloads efficiently", () => {
      const startTime = Date.now();
      const largeDescription = "A".repeat(4999); // Just under 5000 char limit
      
      const result = validateRequest(
        {
          title: "Large Event",
          description: largeDescription,
          eventDate: "2024-01-01",
          isVirtual: false,
          privacy: "public",
          invitedMemberIds: new Array(99).fill("user").map((u, i) => `${u}${i}`)
        },
        VALIDATION_SCHEMAS.createEvent
      );
      
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
      expect(result.description.length).toBe(4999);
      expect(result.invitedMemberIds.length).toBe(99);
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty optional arrays", () => {
      const result = validateRequest(
        {
          chatId: "chat123",
          text: "Hello",
          mediaIds: []
        },
        VALIDATION_SCHEMAS.sendMessage
      );
      expect(result.mediaIds).toEqual([]);
    });

    test("should handle null and undefined appropriately", () => {
      const result = validateRequest(
        {
          title: "Event",
          eventDate: "2024-01-01",
          isVirtual: false,
          privacy: "public",
          description: undefined,
          location: null
        },
        VALIDATION_SCHEMAS.createEvent
      );
      expect(result.description).toBeUndefined();
      expect(result.location).toBeUndefined();
    });

    test("should preserve extra fields when allowExtraFields is true", () => {
      const result = validateRequest(
        {
          story: {
            title: "My Story",
            content: "Story content",
            customField: "Custom value"
          }
        },
        VALIDATION_SCHEMAS.createStory
      );
      expect(result.story.customField).toBe("Custom value");
    });
  });
});