import {describe, it, expect, beforeEach, afterEach, jest} from "@jest/globals";

// Create comprehensive mocks for Firebase services
const mockFirestore = {
  collection: jest.fn(),
  doc: jest.fn(),
  batch: jest.fn(),
} as any;

const mockAuth = {
  getUser: jest.fn(),
  getUserByEmail: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  generatePasswordResetLink: jest.fn(),
} as any;

const mockDoc = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  exists: false,
  data: jest.fn(),
  id: "test-user-id",
  ref: {
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
} as any;

const mockCollection = {
  doc: jest.fn(() => mockDoc),
  where: jest.fn(() => ({
    limit: jest.fn(() => ({
      get: jest.fn(() => ({
        empty: true,
        docs: [],
      })),
    })),
    get: jest.fn(() => ({
      empty: true,
      docs: [],
    })),
    orderBy: jest.fn(() => ({
      orderBy: jest.fn(() => ({
        get: jest.fn(() => ({
          empty: true,
          docs: [],
        })),
      })),
    })),
  })),
} as any;

const mockBatch = {
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  commit: jest.fn(),
} as any;

// Set up mocks before importing modules
jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => mockFirestore),
  Timestamp: {
    now: jest.fn(() => ({toDate: () => new Date()})),
    fromDate: jest.fn((date: any) => ({toDate: () => date})),
    fromMillis: jest.fn((millis: any) => ({
      toMillis: () => millis,
      toDate: () => new Date(millis),
    })),
  },
  FieldValue: {
    serverTimestamp: jest.fn(() => new Date()),
  },
}));

jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => mockAuth),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: jest.fn((config: any, handler?: any) => {
    // Return a function that can be called in tests
    const actualHandler = typeof config === "function" ? config : handler;
    return async (request: any) => {
      return actualHandler(request);
    };
  }),
  HttpsError: class MockHttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "HttpsError";
    }
  },
}));

jest.mock("firebase-functions/v2", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock middleware
jest.mock("../middleware/auth", () => ({
  withAuth: jest.fn((handler: any) => handler),
  withResourceAccess: jest.fn((handler: any) => handler),
  PermissionLevel: {
    PROFILE_OWNER: "profileOwner",
    ADMIN: "admin",
    FAMILY_MEMBER: "familyMember",
  },
  RateLimitType: {
    EMAIL_VERIFICATION_SEND: "email_verification_send",
    EMAIL_VERIFICATION_VERIFY: "email_verification_verify",
    API: "api",
    AUTH: "auth",
    WRITE: "write",
    DELETE: "delete",
  },
}));

// Mock validation
jest.mock("../utils/request-validator", () => ({
  validateRequest: jest.fn((data: any) => {
    // Return the data with proper structure that matches what functions expect
    // Ensure all properties are preserved and accessible
    if (!data) return {};
    return {...data};
  }),
}));

// Mock email and other services
jest.mock("../auth/config/emailConfig", () => ({
  // @ts-expect-error - Mock implementation for testing
  sendEmailUniversal: jest.fn().mockResolvedValue(true),
}));

jest.mock("../auth/utils/tokens", () => ({
  generateSecureToken: jest.fn(() => "mock-token"),
  hashToken: jest.fn((token: string) => `hashed-${token}`),
}));

jest.mock("../auth/config/secrets", () => ({
  FRONTEND_URL: {
    value: jest.fn(() => "http://localhost:3000"),
  },
  EMAIL_PROVIDER: {
    value: jest.fn(() => "ses"),
  },
  SES_CONFIG: {
    value: jest.fn(() => ({})),
  },
}));

// Store reference to createError mock for testing
let createErrorMock: any;

jest.mock("../utils/errors", () => {
  // Create a mock HttpsError class that matches the real one
  class MockHttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "HttpsError";
    }
  }

  createErrorMock = jest.fn((code: string, message: string) => {
    // Return a mock HttpsError that calling code can throw
    return new MockHttpsError(code, message);
  });

  return {
    createError: createErrorMock,
    ErrorCode: {
      UNAUTHENTICATED: "unauthenticated",
      NOT_FOUND: "not-found",
      EMAIL_EXISTS: "email-exists",
      PERMISSION_DENIED: "permission-denied",
      INTERNAL: "internal",
      INVALID_ARGUMENT: "invalid-argument",
    },
  };
});

jest.mock("../common", () => ({
  FUNCTION_TIMEOUT: {
    SHORT: 30,
    MEDIUM: 60,
    LONG: 120,
  },
  DEFAULT_REGION: "us-central1",
}));

jest.mock("../config/validation-schemas", () => ({
  VALIDATION_SCHEMAS: {
    handleSignIn: {},
    signup: {},
    completeOnboarding: {},
    handlePhoneSignIn: {},
    handleGoogleSignIn: {},
    handleAppleSignIn: {},
    updateUserPassword: {},
    initiatePasswordReset: {},
    sendVerificationEmail: {},
    verifyEmail: {},
    handleAccountDeletion: {},
    updateUserProfile: {},
    updateDataRetention: {},
    getFamilyMembers: {},
  },
}));

jest.mock("../config/security-config", () => ({
  SECURITY_CONFIG: {
    rateLimits: {
      auth: {maxRequests: 20, windowSeconds: 60},
      passwordReset: {maxRequests: 5, windowSeconds: 300},
      delete: {maxRequests: 2, windowSeconds: 3600},
      write: {maxRequests: 100, windowSeconds: 60},
    },
  },
}));

jest.mock("../auth/config/constants", () => ({
  ERROR_MESSAGES: {
    EMAIL_SEND_FAILED: "Failed to send email",
    INVALID_TOKEN: "Invalid token",
    EXPIRED_TOKEN: "Token expired",
  },
  TOKEN_EXPIRY: {
    EMAIL_VERIFICATION: 1800000, // 30 minutes
  },
  MAX_OPERATIONS_PER_BATCH: 500,
}));

// Now import the functions to test
import {
  handleSignIn,
  handleSignUp,
  completeOnboarding,
  handlePhoneSignIn,
  handleGoogleSignIn,
  handleAppleSignIn,
} from "../auth/modules/authentication";
import {
  updateUserPassword,
  initiatePasswordReset,
} from "../auth/modules/password-management";
import {
  sendVerificationEmail,
  verifyEmail,
} from "../auth/modules/email-verification";
import {
  handleAccountDeletion,
  updateUserProfile,
  getFamilyMembers,
  getUserData,
} from "../auth/modules/user-management";

describe("Authentication Functions", () => {
  // Simple test to verify createError mock is working
  it("should track createError calls", async () => {
    const {createError} = await import("../utils/errors");
    const result = createError("not-found", "test message");
    expect(createErrorMock).toHaveBeenCalledWith("not-found", "test message");
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("test message");
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations with proper chaining
    mockFirestore.collection.mockImplementation(() => mockCollection);
    mockFirestore.doc.mockImplementation(() => mockDoc);
    mockFirestore.batch.mockImplementation(() => mockBatch);
    mockCollection.doc.mockImplementation(() => mockDoc);

    // Reset individual mock functions
    Object.keys(mockDoc).forEach((key) => {
      if (typeof mockDoc[key] === "function" && mockDoc[key].mockReset) {
        mockDoc[key].mockReset();
      }
    });

    // Reset the createError mock specifically
    if (createErrorMock && createErrorMock.mockClear) {
      createErrorMock.mockClear();
    }

    // Ensure Firestore mock is properly connected
    const firestoreModule = jest.requireMock("firebase-admin/firestore");
    if (firestoreModule.getFirestore && firestoreModule.getFirestore.mockReturnValue) {
      firestoreModule.getFirestore.mockReturnValue(mockFirestore);
    }

    // Reset validateRequest mock to ensure it returns data properly
    const validatorModule = jest.requireMock("../utils/request-validator");
    if (validatorModule.validateRequest && validatorModule.validateRequest.mockImplementation) {
      validatorModule.validateRequest.mockImplementation((data: any) => {
        if (!data) return {};
        return {...data};
      });
    }
    // Default successful responses
    mockAuth.getUser.mockResolvedValue({
      uid: "test-user-id",
      email: "test@example.com",
      emailVerified: true,
      displayName: "Test User",
    });

    mockAuth.getUserByEmail.mockResolvedValue({
      uid: "test-user-id",
      email: "test@example.com",
      emailVerified: true,
      displayName: "Test User",
    });

    mockDoc.get.mockResolvedValue({
      exists: true,
      data: () => ({
        id: "test-user-id",
        email: "test@example.com",
        emailVerified: true,
        onboardingCompleted: true,
        displayName: "Test User",
        familyTreeId: "test-tree-id",
      }),
      id: "test-user-id",
    });

    // Set up default collection and batch operations
    mockDoc.set.mockResolvedValue({});
    mockDoc.update.mockResolvedValue({});
    mockBatch.set.mockReturnValue(mockBatch);
    mockBatch.update.mockReturnValue(mockBatch);
    mockBatch.delete.mockReturnValue(mockBatch);
    mockBatch.commit.mockResolvedValue({});
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("handleSignIn", () => {
    const mockRequest = {
      data: {
        email: "test@example.com",
        password: "password123",
      },
      auth: null,
    };

    it("should successfully sign in a user with verified email", async () => {
      const result = await (handleSignIn as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        userId: "test-user-id",
        email: "test@example.com",
        displayName: "Test User",
        onboardingCompleted: true,
      });

      expect(mockAuth.getUserByEmail).toHaveBeenCalledWith("test@example.com");
      expect(mockDoc.get).toHaveBeenCalled();
    });

    it("should throw error for non-existent user", async () => {
      mockAuth.getUserByEmail.mockRejectedValue(new Error("User not found"));

      await expect((handleSignIn as any)(mockRequest)).rejects.toThrow();
      expect(createErrorMock).toHaveBeenCalledWith("not-found", "Invalid email or password");
    });

    it("should throw error for unverified email", async () => {
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: "test-user-id",
        email: "test@example.com",
        emailVerified: false,
      });

      await expect((handleSignIn as any)(mockRequest)).rejects.toThrow();
      expect(createErrorMock).toHaveBeenCalledWith(
        "permission-denied",
        "Please verify your email before signing in"
      );
    });

    it("should throw error when user document not found", async () => {
      mockDoc.get.mockResolvedValue({
        exists: false,
      });

      await expect((handleSignIn as any)(mockRequest)).rejects.toThrow();
      expect(createErrorMock).toHaveBeenCalledWith(
        "not-found",
        "User profile not found. Please contact support."
      );
    });

    it("should handle unexpected errors gracefully", async () => {
      mockAuth.getUserByEmail.mockRejectedValue(new Error("Database connection failed"));

      await expect((handleSignIn as any)(mockRequest)).rejects.toThrow();
      // Should be called twice - once for the caught error, once for the final generic error
      expect(createErrorMock).toHaveBeenCalledWith("internal", "Invalid email or password");
    });
  });

  describe("handleSignUp", () => {
    const mockRequest = {
      data: {
        email: "newuser@example.com",
        password: "password123",
      },
      auth: null,
    };

    it("should successfully create a new user", async () => {
      // Mock that user doesn't exist
      mockAuth.getUserByEmail.mockRejectedValue({code: "auth/user-not-found"});

      mockAuth.createUser.mockResolvedValue({
        uid: "new-user-id",
        email: "newuser@example.com",
      });

      // @ts-expect-error - Mock function override for testing
      mockDoc.set = jest.fn().mockResolvedValue({});
      // @ts-expect-error - Mock function override for testing
      mockDoc.update = jest.fn().mockResolvedValue({});

      const result = await (handleSignUp as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        userId: "new-user-id",
      });

      expect(mockAuth.createUser).toHaveBeenCalledWith({
        email: "newuser@example.com",
        password: "password123",
        emailVerified: false,
      });
    });

    it("should throw error for existing email", async () => {
      // Mock that user already exists
      mockAuth.getUserByEmail.mockResolvedValue({
        uid: "existing-user-id",
        email: "newuser@example.com",
      });

      await expect((handleSignUp as any)(mockRequest)).rejects.toThrow();
      expect(createErrorMock).toHaveBeenCalledWith(
        "email-exists",
        "An account with this email already exists. Please sign in instead or use a different email address."
      );
    });

    it("should handle Firebase Auth emulator errors", async () => {
      // Mock admin SDK auth error
      mockAuth.getUserByEmail.mockRejectedValue({
        code: "app/invalid-credential",
        message: "Invalid credential",
      });

      mockAuth.createUser.mockResolvedValue({
        uid: "new-user-id",
        email: "newuser@example.com",
      });

      const result = await (handleSignUp as any)(mockRequest);
      expect(result.success).toBe(true);
    });
  });

  describe("completeOnboarding", () => {
    const mockRequest = {
      data: {
        userId: "test-user-id",
        firstName: "John",
        lastName: "Doe",
        displayName: "John Doe",
        dateOfBirth: "1990-01-01",
        gender: "male",
        phoneNumber: "+1234567890",
      },
      auth: {uid: "test-user-id"},
    };

    it("should complete onboarding for new user", async () => {
      mockDoc.get.mockResolvedValue({exists: false});

      const result = await (completeOnboarding as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        userId: "test-user-id",
        familyTreeId: expect.any(String),
        historyBookId: expect.any(String),
      });

      expect(mockBatch.set).toHaveBeenCalledTimes(3); // family tree, history book, user
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it("should complete onboarding for existing user", async () => {
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          email: "test@example.com",
          createdAt: new Date(),
        }),
      });

      const result = await (completeOnboarding as any)(mockRequest);

      expect(result.success).toBe(true);
      expect(mockBatch.update).toHaveBeenCalled();
    });

    it("should throw error for missing required fields", async () => {
      const invalidRequest = {
        data: {
          userId: "test-user-id",
          // Missing firstName and lastName
        },
        auth: {uid: "test-user-id"},
      };

      await expect((completeOnboarding as any)(invalidRequest)).rejects.toThrow(
        "Required fields missing. Please provide userId, firstName, and lastName."
      );
    });
  });

  describe("handlePhoneSignIn", () => {
    const mockRequest = {
      data: {
        uid: "test-user-id",
        phoneNumber: "+1234567890",
      },
      auth: null,
    };

    it("should handle phone sign-in for new user", async () => {
      mockDoc.get.mockResolvedValue({exists: false});

      const result = await (handlePhoneSignIn as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        message: expect.stringContaining("User test-user-id processed successfully"),
        userId: "test-user-id",
        isNewUser: true,
      });

      expect(mockDoc.set).toHaveBeenCalled();
    });

    it("should handle phone sign-in for existing user", async () => {
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({id: "test-user-id"}),
      });

      const result = await (handlePhoneSignIn as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        message: expect.stringContaining("User test-user-id processed successfully"),
        userId: "test-user-id",
        isNewUser: false,
      });

      expect(mockDoc.update).toHaveBeenCalledWith({
        phoneNumber: "+1234567890",
        phoneNumberVerified: true,
        updatedAt: expect.any(Date),
      });
    });

    it("should throw error for invalid user", async () => {
      mockAuth.getUser.mockRejectedValue(new Error("User not found"));

      await expect((handlePhoneSignIn as any)(mockRequest)).rejects.toThrow();
      expect(createErrorMock).toHaveBeenCalled();
    });
  });

  describe("handleGoogleSignIn", () => {
    const mockRequest = {
      data: {
        userId: "test-user-id",
        email: "test@gmail.com",
        displayName: "Google User",
        photoURL: "https://example.com/photo.jpg",
      },
      auth: null,
    };

    it("should handle Google sign-in for new user", async () => {
      mockDoc.get.mockResolvedValue({exists: false});

      const result = await (handleGoogleSignIn as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        userId: "test-user-id",
        isNewUser: true,
      });

      expect(mockDoc.set).toHaveBeenCalled();
    });

    it("should handle Google sign-in for existing user", async () => {
      mockDoc.get.mockResolvedValue({exists: true});

      const result = await (handleGoogleSignIn as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        userId: "test-user-id",
        isNewUser: false,
      });
    });

    it("should extract name parts from displayName", async () => {
      mockDoc.get.mockResolvedValue({exists: false});

      await (handleGoogleSignIn as any)(mockRequest);

      // Check that the user document was created with proper name fields
      const setCall = mockDoc.set.mock.calls[0][0];
      expect(setCall.firstName).toBe("Google");
      expect(setCall.lastName).toBe("User");
    });
  });

  describe("handleAppleSignIn", () => {
    const mockRequest = {
      data: {
        userId: "test-user-id",
        email: "test@privaterelay.appleid.com",
        fullName: {
          givenName: "Apple",
          familyName: "User",
        },
      },
      auth: null,
    };

    it("should handle Apple sign-in for new user", async () => {
      mockDoc.get.mockResolvedValue({exists: false});

      const result = await (handleAppleSignIn as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        userId: "test-user-id",
        isNewUser: true,
      });

      expect(mockDoc.set).toHaveBeenCalled();
    });

    it("should handle missing fullName", async () => {
      const requestWithoutName = {
        ...mockRequest,
        data: {
          ...mockRequest.data,
          fullName: null,
        },
      };

      mockDoc.get.mockResolvedValue({exists: false});

      await (handleAppleSignIn as any)(requestWithoutName);

      const setCall = mockDoc.set.mock.calls[0][0];
      expect(setCall.firstName).toBe("test"); // Should use email username
    });
  });
});

describe("Password Management Functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("updateUserPassword", () => {
    const mockRequest = {
      data: {
        userId: "test-user-id",
      },
      auth: {uid: "test-user-id"},
    };

    it("should verify user exists for password update", async () => {
      const result = await (updateUserPassword as any)(mockRequest);

      expect(result).toEqual({success: true});
      expect(mockAuth.getUser).toHaveBeenCalledWith("test-user-id");
    });

    it("should throw error for non-existent user", async () => {
      mockAuth.getUser.mockResolvedValue(null);

      await expect((updateUserPassword as any)(mockRequest)).rejects.toThrow();
      // The function calls createError twice: once for NOT_FOUND, then INTERNAL in catch block
      expect(createErrorMock).toHaveBeenCalledWith("not-found", "User not found");
      expect(createErrorMock).toHaveBeenCalledWith("internal", "Failed to verify user");
    });
  });

  describe("initiatePasswordReset", () => {
    const mockRequest = {
      data: {
        email: "test@example.com",
      },
      auth: null,
    };

    it("should initiate password reset successfully", async () => {
      mockAuth.generatePasswordResetLink.mockResolvedValue("https://reset-link");
      mockAuth.getUserByEmail.mockResolvedValue({
        displayName: "Test User",
      });

      const emailModule = jest.requireMock("../auth/config/emailConfig");
      emailModule.sendEmailUniversal.mockResolvedValue(true);

      const result = await (initiatePasswordReset as any)(mockRequest);

      expect(result).toEqual({success: true});
      expect(mockAuth.generatePasswordResetLink).toHaveBeenCalledWith("test@example.com");
      expect(sendEmailUniversal).toHaveBeenCalledWith({
        to: "test@example.com",
        templateType: "passwordReset",
        dynamicTemplateData: {
          username: "Test User",
          resetLink: "https://reset-link",
        },
      });
    });
  });
});

describe("Email Verification Functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("sendVerificationEmail", () => {
    const mockRequest = {
      data: {
        userId: "test-user-id",
        email: "test@example.com",
        displayName: "Test User",
      },
      auth: {uid: "test-user-id"},
    };

    it("should send verification email successfully", async () => {
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          emailVerified: false,
          firstName: "Test",
        }),
      });

      const emailModule = jest.requireMock("../auth/config/emailConfig");
      emailModule.sendEmailUniversal.mockResolvedValue(true);

      const result = await (sendVerificationEmail as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        message: "Verification email sent successfully.",
      });

      expect(mockDoc.update).toHaveBeenCalled();
      expect(sendEmailUniversal).toHaveBeenCalled();
    });

    it("should return early if email already verified", async () => {
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          emailVerified: true,
        }),
      });

      const result = await (sendVerificationEmail as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        message: "Email is already verified.",
      });
    });
  });

  describe("verifyEmail", () => {
    const mockRequest = {
      data: {
        token: "verification-token",
      },
      auth: null,
    };

    it("should verify email successfully", async () => {
      const mockSnapshot = {
        empty: false,
        docs: [{
          id: "test-user-id",
          data: () => ({
            emailVerificationExpires: {
              toMillis: () => Date.now() + 3600000, // 1 hour from now
            },
          }),
          ref: {
            update: jest.fn(),
          },
        }],
      };

      mockCollection.where.mockReturnValue({
        limit: jest.fn(() => ({
          get: jest.fn(() => mockSnapshot),
        })),
      });

      const result = await (verifyEmail as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        message: "Email verified successfully.",
      });

      expect(mockAuth.updateUser).toHaveBeenCalledWith("test-user-id", {emailVerified: true});
    });

    it("should throw error for invalid token", async () => {
      mockCollection.where.mockReturnValue({
        limit: jest.fn(() => ({
          get: jest.fn(() => ({empty: true})),
        })),
      });

      await expect((verifyEmail as any)(mockRequest)).rejects.toThrow();
      expect(createErrorMock).toHaveBeenCalled();
    });
  });
});

describe("User Management Functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("handleAccountDeletion", () => {
    const mockRequest = {
      data: {
        userId: "test-user-id",
      },
      auth: {uid: "test-user-id"},
    };

    it("should delete user account successfully", async () => {
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          familyTreeId: "tree-id",
          isTreeOwner: true,
        }),
      });

      // Mock family members query
      const mockMembersSnapshot = {
        docs: [{
          id: "test-user-id",
          data: () => ({status: "active"}),
        }],
      };

      mockCollection.where.mockReturnValue({
        get: jest.fn(() => mockMembersSnapshot),
      });

      const result = await (handleAccountDeletion as any)(mockRequest);

      expect(result).toEqual({success: true});
      expect(mockBatch.delete).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it("should throw error for non-existent user", async () => {
      mockDoc.get.mockResolvedValue({exists: false});

      await expect((handleAccountDeletion as any)(mockRequest)).rejects.toThrow();
      expect(createErrorMock).toHaveBeenCalledWith("not-found", "User test-user-id not found.");
    });
  });

  describe("updateUserProfile", () => {
    const mockRequest = {
      data: {
        uid: "test-user-id",
        displayName: "Updated Name",
        firstName: "Updated",
        lastName: "Name",
      },
      auth: {uid: "test-user-id"},
    };

    it("should update user profile successfully", async () => {
      const result = await (updateUserProfile as any)(mockRequest);

      expect(result).toEqual({
        success: true,
        message: "Profile updated successfully.",
      });

      expect(mockAuth.updateUser).toHaveBeenCalled();
      expect(mockDoc.update).toHaveBeenCalled();
    });

    it("should handle profile picture updates", async () => {
      const requestWithPicture = {
        ...mockRequest,
        data: {
          ...mockRequest.data,
          profilePicture: "https://example.com/photo.jpg",
        },
      };

      await (updateUserProfile as any)(requestWithPicture);

      const updateCall = mockDoc.update.mock.calls[0][0];
      expect(updateCall.profilePicture).toEqual({
        url: "https://example.com/photo.jpg",
        path: "",
      });
    });
  });

  describe("getUserData", () => {
    const mockRequest = {
      data: {},
      auth: {uid: "test-user-id"},
    };

    it("should return user data successfully", async () => {
      const userData = {
        onboardingCompleted: true,
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
      };

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => userData,
      });

      const result = await (getUserData as any)(mockRequest);

      expect(result.success).toBe(true);
      expect(result.userData).toMatchObject(userData);
    });

    it("should handle non-existent user", async () => {
      mockDoc.get.mockResolvedValue({exists: false});

      const result = await (getUserData as any)(mockRequest);

      expect(result).toEqual({
        success: false,
        message: "User not found",
        userData: null,
      });
    });
  });

  describe("getFamilyMembers", () => {
    const mockRequest = {
      data: {
        familyTreeId: "tree-id",
      },
      auth: {uid: "test-user-id"},
    };

    it("should return family members successfully", async () => {
      const mockSnapshot = {
        empty: false,
        docs: [{
          id: "member-1",
          data: () => ({
            displayName: "Member One",
            firstName: "Member",
            lastName: "One",
            email: "member1@example.com",
          }),
        }],
      };

      mockCollection.where.mockReturnValue({
        orderBy: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            get: jest.fn(() => mockSnapshot),
          })),
        })),
      });

      const result = await (getFamilyMembers as any)(mockRequest);

      expect(result.familyMembers).toHaveLength(1);
      expect(result.familyMembers[0]).toMatchObject({
        id: "member-1",
        displayName: "Member One",
      });
    });

    it("should handle empty family tree", async () => {
      mockCollection.where.mockReturnValue({
        orderBy: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            get: jest.fn(() => ({empty: true})),
          })),
        })),
      });

      const result = await (getFamilyMembers as any)(mockRequest);

      expect(result).toEqual({
        familyMembers: [],
        message: "No members found in this family tree.",
      });
    });
  });
});

describe("Error Handling and Edge Cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should handle Firestore connection errors", async () => {
    mockFirestore.collection.mockImplementation(() => {
      throw new Error("Firestore connection failed");
    });

    const mockRequest = {
      data: {email: "test@example.com", password: "password"},
      auth: null,
    };

    await expect((handleSignIn as any)(mockRequest)).rejects.toThrow();
  });

  it("should handle Firebase Auth service errors", async () => {
    const errorModule = jest.requireMock("../utils/errors");
    mockAuth.getUserByEmail.mockRejectedValue({
      code: "auth/service-unavailable",
      message: "Service temporarily unavailable",
    });

    const mockRequest = {
      data: {email: "test@example.com", password: "password"},
      auth: null,
    };

    await expect((handleSignIn as any)(mockRequest)).rejects.toThrow();
    expect(errorModule.createError).toHaveBeenCalledWith("internal", "Invalid email or password");
  });

  it("should handle concurrent user creation attempts", async () => {
    const mockRequest = {
      data: {
        email: "concurrent@example.com",
        password: "password123",
      },
      auth: null,
    };

    // First check shows user doesn't exist
    mockAuth.getUserByEmail.mockRejectedValueOnce({code: "auth/user-not-found"});
    // But creation fails because user was created by another request
    mockAuth.createUser.mockRejectedValue({
      code: "auth/email-already-exists",
      message: "Email already exists",
    });

    await expect((handleSignUp as any)(mockRequest)).rejects.toThrow();
  });
});

describe("Integration Scenarios", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should handle complete user journey: signup -> verify -> onboard", async () => {
    // Step 1: Sign up
    mockAuth.getUserByEmail.mockRejectedValue({code: "auth/user-not-found"});
    mockAuth.createUser.mockResolvedValue({
      uid: "journey-user-id",
      email: "journey@example.com",
    });

    const signupRequest = {
      data: {
        email: "journey@example.com",
        password: "password123",
      },
      auth: null,
    };

    const signupResult = await (handleSignUp as any)(signupRequest);
    expect(signupResult.success).toBe(true);

    // Step 2: Verify email
    const verifyRequest = {
      data: {token: "verification-token"},
      auth: null,
    };

    const mockSnapshot = {
      empty: false,
      docs: [{
        id: "journey-user-id",
        data: () => ({
          emailVerificationExpires: {
            toMillis: () => Date.now() + 3600000,
          },
        }),
        ref: {update: jest.fn()},
      }],
    };

    mockCollection.where.mockReturnValue({
      limit: jest.fn(() => ({
        get: jest.fn(() => mockSnapshot),
      })),
    });

    const verifyResult = await (verifyEmail as any)(verifyRequest);
    expect(verifyResult.success).toBe(true);

    // Step 3: Complete onboarding
    mockDoc.get.mockResolvedValue({exists: false});

    const onboardingRequest = {
      data: {
        userId: "journey-user-id",
        firstName: "Journey",
        lastName: "User",
      },
      auth: {uid: "journey-user-id"},
    };

    const onboardingResult = await (completeOnboarding as any)(onboardingRequest);
    expect(onboardingResult.success).toBe(true);
  });
});
