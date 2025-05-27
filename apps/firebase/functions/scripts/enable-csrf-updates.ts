/**
 * Script to document the CSRF protection updates needed for Firebase Functions
 * This script provides the exact changes needed for each function
 */

import { RateLimitType } from "../src/middleware";
import { SECURITY_CONFIG } from "../src/config/security-config";

// Define the updates needed for each file
export const CSRF_UPDATES = {
  // Events Service - these functions use withErrorHandling directly and need to be wrapped with withAuth
  "events-service.ts": {
    createEvent: {
      current: "withErrorHandling(async (request) => {",
      update: `withAuth(
    async (request) => {`,
      closing: `}, "createEvent", {
      authLevel: "onboarded",
      enableCSRF: true,
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write
    }
  )`
    },
    updateEvent: {
      needsWrapper: true,
      config: {
        authLevel: "onboarded",
        enableCSRF: true,
        rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
      }
    },
    deleteEvent: {
      needsWrapper: true,
      config: {
        authLevel: "onboarded",
        enableCSRF: true,
        rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
      }
    },
    rsvpToEvent: {
      needsWrapper: true,
      config: {
        authLevel: "verified",
        enableCSRF: true,
        rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
      }
    },
    addCommentToEvent: {
      needsWrapper: true,
      config: {
        authLevel: "verified",
        enableCSRF: true,
        rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
      }
    },
    deleteEventComment: {
      needsWrapper: true,
      config: {
        authLevel: "verified",
        enableCSRF: true,
        rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
      }
    },
    sendEventInvitations: {
      needsWrapper: true,
      config: {
        authLevel: "onboarded",
        enableCSRF: true,
        rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
      }
    },
    respondToInvitation: {
      needsWrapper: true,
      config: {
        authLevel: "verified",
        enableCSRF: true,
        rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
      }
    }
  },

  // Vault Service
  "vault.ts": {
    getVaultUploadSignedUrl: {
      updateConfig: true,
      from: 'withAuth(handler, "getVaultUploadSignedUrl", "onboarded")',
      to: `withAuth(handler, "getVaultUploadSignedUrl", {
        authLevel: "onboarded",
        enableCSRF: true,
        rateLimitConfig: SECURITY_CONFIG.rateLimits.mediaUpload
      })`
    },
    createVaultFolder: {
      // Uses withResourceAccess
      updateConfig: true,
      pattern: "withResourceAccess",
      enableCSRF: true
    },
    addVaultFile: {
      updateConfig: true,
      enableCSRF: true
    },
    deleteVaultItem: {
      updateConfig: true,
      enableCSRF: true
    },
    shareVaultItem: {
      updateConfig: true,
      enableCSRF: true
    }
  },

  // Chat Management
  "chatManagement.ts": {
    createChat: {
      updateConfig: true,
      pattern: "withAuth",
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
    },
    updateChatSettings: {
      updateConfig: true,
      enableCSRF: true
    },
    addChatMembers: {
      updateConfig: true,
      enableCSRF: true
    },
    removeChatMember: {
      updateConfig: true,
      enableCSRF: true
    },
    deleteChat: {
      updateConfig: true,
      enableCSRF: true
    }
  },

  // User Management
  "auth/modules/user-management.ts": {
    handleAccountDeletion: {
      pattern: "withResourceAccess",
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.auth"
    },
    updateUserProfile: {
      pattern: "withResourceAccess",
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
    }
  },

  // Email Verification - already has rate limiting, just needs CSRF
  "auth/modules/email-verification.ts": {
    sendVerificationEmail: {
      current: `withAuth(
    async (request) => {
      // ... handler code
    },
    "sendVerificationEmail",
    "auth",
    {
      type: RateLimitType.AUTH,
      maxRequests: 3,
      windowSeconds: 3600,
    }
  )`,
      update: `withAuth(
    async (request) => {
      // ... handler code
    },
    "sendVerificationEmail",
    {
      authLevel: "auth",
      enableCSRF: true,
      rateLimitConfig: {
        type: RateLimitType.AUTH,
        maxRequests: 3,
        windowSeconds: 3600,
      }
    }
  )`
    }
  },

  // Password Management
  "auth/modules/password-management.ts": {
    resetPassword: {
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.passwordReset"
    },
    changePassword: {
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.auth"
    },
    sendPasswordResetEmail: {
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.passwordReset"
    }
  },

  // Family Tree
  "familyTree.ts": {
    createFamilyMember: {
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
    },
    updateFamilyMember: {
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
    },
    deleteFamilyMember: {
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
    },
    updateFamilyRelationships: {
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
    }
  },

  // Messaging
  "messaging.ts": {
    sendMessage: {
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
    },
    updateNotificationSettings: {
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
    },
    registerFCMToken: {
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
    },
    removeFCMToken: {
      updateConfig: true,
      enableCSRF: true,
      rateLimitConfig: "SECURITY_CONFIG.rateLimits.write"
    }
  }
};

console.log("CSRF Protection Updates Required:");
console.log("=================================");
console.log("\nThese functions need to be updated to enable CSRF protection:");
console.log("\n1. Functions using withErrorHandling directly need to be wrapped with withAuth");
console.log("2. Functions using withAuth need config object with enableCSRF: true");
console.log("3. Functions using withResourceAccess need enableCSRF: true in config");
console.log("\nRefer to the CSRF_UPDATES object for specific changes needed.");