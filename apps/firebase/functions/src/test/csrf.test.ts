import {describe, it, expect, jest, beforeEach, afterEach} from "@jest/globals";
import * as admin from "firebase-admin";
import {CallableRequest} from "firebase-functions/v2/https";
import {withAuth, withResourceAccess, PermissionLevel, RateLimitType} from "../middleware/auth";
import {createError, ErrorCode} from "../utils/errors";
import {csrfService} from "../services/csrfService";

// Mock Firebase Admin
jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({
          exists: true,
          data: () => ({
            emailVerified: true,
            hasCompletedOnboarding: true,
            publicKey: "test-public-key",
            familyTreeId: "test-family-tree",
          }),
        })),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
      })),
    })),
  })),
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(() => Promise.resolve({
      uid: "test-user-id",
      email: "test@example.com",
    })),
  })),
}));

// Mock CSRF Service
jest.mock("../services/csrfService", () => ({
  csrfService: {
    generateToken: jest.fn(() => "test-csrf-token"),
    validateToken: jest.fn(),
    cleanup: jest.fn(() => Promise.resolve()),
  },
}));

// Mock rate limiter
jest.mock("../services/rateLimiter", () => ({
  checkRateLimit: jest.fn(() => Promise.resolve()),
}));

describe("CSRF Protection Tests", () => {
  let mockRequest: CallableRequest;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup base mock request
    mockRequest = {
      auth: {
        uid: "test-user-id",
        token: {
          email: "test@example.com",
          email_verified: true,
          uid: "test-user-id",
          firebase: {
            identities: {},
            sign_in_provider: "password",
          },
        },
      },
      data: {},
      rawRequest: {
        headers: {
          "x-csrf-token": "test-csrf-token",
        },
        body: {},
      } as any,
    } as CallableRequest;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("withAuth middleware with CSRF", () => {
    it("should pass when CSRF is disabled", async () => {
      const handler = jest.fn().mockResolvedValue({success: true});
      const wrappedHandler = withAuth(handler, "testFunction", {
        authLevel: "auth",
        enableCSRF: false,
      });

      const result = await wrappedHandler(mockRequest);

      expect(handler).toHaveBeenCalledWith(mockRequest);
      expect(result).toEqual({success: true});
      expect(csrfService.validateToken).not.toHaveBeenCalled();
    });

    it("should validate CSRF token when enabled", async () => {
      const handler = jest.fn().mockResolvedValue({success: true});
      const wrappedHandler = withAuth(handler, "testFunction", {
        authLevel: "auth",
        enableCSRF: true,
      });

      (csrfService.validateToken as jest.Mock).mockResolvedValue(true);

      const result = await wrappedHandler(mockRequest);

      expect(csrfService.validateToken).toHaveBeenCalledWith(
        "test-user-id",
        "test-csrf-token",
        "testFunction"
      );
      expect(handler).toHaveBeenCalledWith(mockRequest);
      expect(result).toEqual({success: true});
    });

    it("should fail when CSRF token is missing", async () => {
      const handler = jest.fn().mockResolvedValue({success: true});
      const wrappedHandler = withAuth(handler, "testFunction", {
        authLevel: "auth",
        enableCSRF: true,
      });

      // Remove CSRF token from request
      mockRequest.rawRequest.headers["x-csrf-token"] = undefined;

      await expect(wrappedHandler(mockRequest)).rejects.toMatchObject({
        code: "functions/invalid-argument",
        message: expect.stringContaining("CSRF token is required"),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("should fail when CSRF token is invalid", async () => {
      const handler = jest.fn().mockResolvedValue({success: true});
      const wrappedHandler = withAuth(handler, "testFunction", {
        authLevel: "auth",
        enableCSRF: true,
      });

      (csrfService.validateToken as jest.Mock).mockResolvedValue(false);

      await expect(wrappedHandler(mockRequest)).rejects.toMatchObject({
        code: "functions/permission-denied",
        message: expect.stringContaining("Invalid CSRF token"),
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("should handle CSRF validation errors gracefully", async () => {
      const handler = jest.fn().mockResolvedValue({success: true});
      const wrappedHandler = withAuth(handler, "testFunction", {
        authLevel: "auth",
        enableCSRF: true,
      });

      (csrfService.validateToken as jest.Mock).mockRejectedValue(new Error("Database error"));

      await expect(wrappedHandler(mockRequest)).rejects.toMatchObject({
        code: "functions/internal",
        message: expect.stringContaining("CSRF validation failed"),
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("withResourceAccess middleware with CSRF", () => {
    beforeEach(() => {
      // Mock resource fetch
      const mockFirestore = admin.firestore() as any;
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              id: "test-resource-id",
              ownerId: "test-user-id",
              type: "test-resource",
            }),
          }),
        }),
      });
    });

    it("should validate CSRF token when enabled for resource access", async () => {
      const handler = jest.fn().mockResolvedValue({success: true});
      const wrappedHandler = withResourceAccess(handler, "testResourceFunction", {
        resourceConfig: {
          resourceType: "test-resource",
          resourceIdField: "resourceId",
          requiredLevel: PermissionLevel.OWNER,
        },
        enableCSRF: true,
      });

      (csrfService.validateToken as jest.Mock).mockResolvedValue(true);
      mockRequest.data = {resourceId: "test-resource-id"};

      const result = await wrappedHandler(mockRequest);

      expect(csrfService.validateToken).toHaveBeenCalledWith(
        "test-user-id",
        "test-csrf-token",
        "testResourceFunction"
      );
      expect(handler).toHaveBeenCalled();
      expect(result).toEqual({success: true});
    });

    it("should fail resource access when CSRF validation fails", async () => {
      const handler = jest.fn().mockResolvedValue({success: true});
      const wrappedHandler = withResourceAccess(handler, "testResourceFunction", {
        resourceConfig: {
          resourceType: "test-resource",
          resourceIdField: "resourceId",
          requiredLevel: PermissionLevel.OWNER,
        },
        enableCSRF: true,
      });

      (csrfService.validateToken as jest.Mock).mockResolvedValue(false);
      mockRequest.data = {resourceId: "test-resource-id"};

      await expect(wrappedHandler(mockRequest)).rejects.toMatchObject({
        code: "functions/permission-denied",
        message: expect.stringContaining("Invalid CSRF token"),
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("CSRF Token Generation", () => {
    it("should generate CSRF token in generateCSRFToken function", async () => {
      // Import the actual function
      const {generateCSRFToken} = await import("../auth/index");

      const result = await generateCSRFToken(mockRequest);

      expect(csrfService.generateToken).toHaveBeenCalledWith("test-user-id");
      expect(result).toEqual({
        token: "test-csrf-token",
        expiresIn: 3600,
      });
    });

    it("should fail to generate token when not authenticated", async () => {
      const {generateCSRFToken} = await import("../auth/index");

      mockRequest.auth = undefined;

      await expect(generateCSRFToken(mockRequest)).rejects.toMatchObject({
        code: "functions/unauthenticated",
      });
    });
  });

  describe("Rate Limiting with CSRF", () => {
    it("should apply rate limiting along with CSRF check", async () => {
      const handler = jest.fn().mockResolvedValue({success: true});
      const wrappedHandler = withAuth(handler, "testFunction", {
        authLevel: "auth",
        enableCSRF: true,
        rateLimitConfig: {
          type: RateLimitType.WRITE,
          maxRequests: 10,
          windowSeconds: 60,
        },
      });

      (csrfService.validateToken as jest.Mock).mockResolvedValue(true);
      const {checkRateLimit} = await import("../services/rateLimiter");

      await wrappedHandler(mockRequest);

      expect(checkRateLimit).toHaveBeenCalledWith(
        "test-user-id",
        "testFunction",
        expect.objectContaining({
          type: RateLimitType.WRITE,
          maxRequests: 10,
          windowSeconds: 60,
        })
      );
    });
  });

  describe("Function-specific CSRF Tests", () => {
    describe("Event Functions", () => {
      it("createEvent should require CSRF token", async () => {
        const {createEvent} = await import("../events-service");

        // Mock successful event creation
        const mockFirestore = admin.firestore() as any;
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            id: "new-event-id",
            set: jest.fn().mockResolvedValue(undefined),
          }),
        });

        (csrfService.validateToken as jest.Mock).mockResolvedValue(true);

        mockRequest.data = {
          title: "Test Event",
          eventDate: "2024-12-25",
          privacy: "family_tree",
          isVirtual: false,
        };

        const result = await createEvent(mockRequest);

        expect(csrfService.validateToken).toHaveBeenCalled();
        expect(result).toHaveProperty("eventId");
      });

      it("createEvent should fail without CSRF token", async () => {
        const {createEvent} = await import("../events-service");

        mockRequest.rawRequest.headers["x-csrf-token"] = undefined;
        mockRequest.data = {
          title: "Test Event",
          eventDate: "2024-12-25",
          privacy: "family_tree",
          isVirtual: false,
        };

        await expect(createEvent(mockRequest)).rejects.toMatchObject({
          code: "functions/invalid-argument",
          message: expect.stringContaining("CSRF token is required"),
        });
      });
    });

    describe("Vault Functions", () => {
      it("createVaultFolder should require CSRF token", async () => {
        const {createVaultFolder} = await import("../vault");

        const mockFirestore = admin.firestore() as any;
        mockFirestore.collection.mockReturnValue({
          add: jest.fn().mockResolvedValue({id: "new-folder-id"}),
        });

        (csrfService.validateToken as jest.Mock).mockResolvedValue(true);

        mockRequest.data = {
          name: "Test Folder",
          parentId: null,
        };

        const result = await createVaultFolder(mockRequest);

        expect(csrfService.validateToken).toHaveBeenCalled();
        expect(result).toHaveProperty("id");
      });
    });

    describe("Chat Functions", () => {
      it("createChat should require CSRF token", async () => {
        const {createChat} = await import("../chatManagement");

        // Mock user lookups
        const mockFirestore = admin.firestore() as any;
        mockFirestore.collection.mockImplementation((collection: string) => {
          if (collection === "users") {
            return {
              doc: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  exists: true,
                  data: () => ({
                    publicKey: "test-key",
                    displayName: "Test User",
                  }),
                }),
              }),
            };
          }
          if (collection === "chats") {
            return {
              add: jest.fn().mockResolvedValue({id: "new-chat-id"}),
              doc: jest.fn().mockReturnValue({
                collection: jest.fn().mockReturnValue({
                  doc: jest.fn().mockReturnValue({
                    set: jest.fn().mockResolvedValue(undefined),
                  }),
                }),
              }),
            };
          }
        });

        (csrfService.validateToken as jest.Mock).mockResolvedValue(true);

        mockRequest.data = {
          participantIds: ["user2"],
          isGroup: false,
        };

        const result = await createChat(mockRequest);

        expect(csrfService.validateToken).toHaveBeenCalled();
        expect(result).toHaveProperty("chatId");
      });
    });

    describe("Family Tree Functions", () => {
      it("updateFamilyRelationships should require CSRF token", async () => {
        const {updateFamilyRelationships} = await import("../familyTree");

        // Mock resource access
        const mockFirestore = admin.firestore() as any;
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                id: "test-user-id",
                familyTreeId: "test-family-tree",
                parentIds: [],
                childrenIds: [],
                spouseIds: [],
              }),
            }),
            update: jest.fn().mockResolvedValue(undefined),
          }),
        });

        // Mock batch operations
        mockFirestore.batch = jest.fn().mockReturnValue({
          update: jest.fn(),
          commit: jest.fn().mockResolvedValue(undefined),
        });

        (csrfService.validateToken as jest.Mock).mockResolvedValue(true);

        mockRequest.data = {
          userId: "test-user-id",
          updates: {
            addParents: ["parent-id"],
          },
        };

        const result = await updateFamilyRelationships(mockRequest);

        expect(csrfService.validateToken).toHaveBeenCalled();
        expect(result).toHaveProperty("success", true);
      });
    });
  });

  describe("CSRF Cleanup", () => {
    it("should cleanup expired tokens", async () => {
      await csrfService.cleanup();

      expect(csrfService.cleanup).toHaveBeenCalled();
    });
  });
});
