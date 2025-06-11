import {ValidationSchema} from "../utils/request-validator";

/**
 * Comprehensive validation schemas for subscription operations
 * These extend the basic schemas in validation-schemas.ts with business rules
 */
export const SUBSCRIPTION_VALIDATION_SCHEMAS: Record<string, ValidationSchema> = {
  // Enhanced checkout session validation
  createCheckoutSession: {
    rules: [
      {field: "plan", type: "enum", required: true,
        enumValues: ["free", "individual", "family"]},
      {field: "tier", type: "enum",
        enumValues: ["plus", "family_2_5tb", "family_7_5tb", "family_12tb", "lite", "pro"]},
      {field: "interval", type: "enum", required: true,
        enumValues: ["month", "year"]},
      {field: "successUrl", type: "string", required: true, maxLength: 500},
      {field: "cancelUrl", type: "string", required: true, maxLength: 500},
      {field: "referralCode", type: "string", maxLength: 50,
        custom: (value) => {
          if (value && !/^[A-Z0-9]{8}$/.test(value)) {
            throw new Error("Referral code must be 8 uppercase alphanumeric characters");
          }
        }},
      {field: "familyMemberIds", type: "array", maxSize: 4}, // 5 total including owner
      {field: "addons", type: "array", maxSize: 3,
        custom: (value) => {
          if (value && Array.isArray(value)) {
            const validAddons = ["storage_1tb", "storage_2tb", "storage_5tb", "storage_20tb"];
            value.forEach((addon) => {
              if (!validAddons.includes(addon)) {
                throw new Error(`Invalid addon type: ${addon}`);
              }
            });
          }
        }},
      {field: "couponCode", type: "string", maxLength: 50},
      {field: "allowPromotionCodes", type: "boolean"},
    ],
    xssCheck: true,
    customValidation: (data: any) => {
      // Family plan specific validation
      if (data.plan === "family" && !data.tier) {
        return {isValid: false, error: "Tier is required for family plans"};
      }

      // Individual plan specific validation
      if (data.plan === "individual" && data.tier !== "plus") {
        return {isValid: false, error: "Only 'plus' tier is available for individual plans"};
      }

      // Addons only for individual plans
      if (data.addons && data.addons.length > 0 && data.plan !== "individual") {
        return {isValid: false, error: "Addons are only available for individual plans"};
      }

      // Family members only for family plans
      if (data.familyMemberIds && data.familyMemberIds.length > 0 && data.plan !== "family") {
        return {isValid: false, error: "Family members can only be added to family plans"};
      }

      return {isValid: true};
    },
  },

  // Plan change validation
  changePlan: {
    rules: [
      {field: "subscriptionId", type: "id", required: true},
      {field: "newPlan", type: "enum", required: true,
        enumValues: ["individual", "family"]}, // Can't downgrade to free
      {field: "newTier", type: "enum",
        enumValues: ["plus", "family_2_5tb", "family_7_5tb", "family_12tb"]},
      {field: "prorationBehavior", type: "enum",
        enumValues: ["create_prorations", "none", "always_invoice"]},
      {field: "immediateChange", type: "boolean"},
    ],
    xssCheck: false,
    customValidation: (data: any) => {
      // Set defaults
      if (!data.prorationBehavior) {
        data.prorationBehavior = "create_prorations";
      }
      if (data.immediateChange === undefined) {
        data.immediateChange = false;
      }
      // Validate plan/tier combinations
      if (data.newPlan === "individual" && data.newTier && data.newTier !== "plus") {
        return {isValid: false, error: "Individual plan only supports 'plus' tier"};
      }

      if (data.newPlan === "family" && !data.newTier) {
        return {isValid: false, error: "Family plan requires a tier selection"};
      }

      if (data.newPlan === "family" && !["family_2_5tb", "family_7_5tb", "family_12tb"].includes(data.newTier)) {
        return {isValid: false, error: "Invalid tier for family plan"};
      }

      return {isValid: true};
    },
  },

  // Enhanced family member validation
  addFamilyMember: {
    rules: [
      {field: "subscriptionId", type: "id", required: true},
      {field: "memberId", type: "id", required: true},
      {field: "memberEmail", type: "email", required: true},
      {field: "memberName", type: "string", required: true, maxLength: 100},
      {field: "relationshipVerified", type: "boolean", required: true},
      {field: "sendInvitation", type: "boolean"},
    ],
    xssCheck: true,
    customValidation: async (data: any, _context: any) => { // eslint-disable-line @typescript-eslint/no-unused-vars
      // Set default
      if (data.sendInvitation === undefined) {
        data.sendInvitation = true;
      }
      // This will be validated in the business rule validator
      return {isValid: true};
    },
  },

  // Addon purchase validation
  purchaseAddon: {
    rules: [
      {field: "subscriptionId", type: "id", required: true},
      {field: "addonType", type: "enum", required: true,
        enumValues: ["storage_1tb", "storage_2tb", "storage_5tb", "storage_20tb"]},
      {field: "quantity", type: "number", custom: (value) => {
        if (value === undefined) return; // Will use default
        if (value < 1 || value > 1) {
          throw new Error("Quantity must be 1");
        }
      }},
    ],
    xssCheck: false,
    customValidation: (data: any) => {
      if (data.quantity === undefined) {
        data.quantity = 1;
      }
      return {isValid: true};
    },
  },

  // Enhanced referral validation
  validateReferralCode: {
    rules: [
      {field: "referralCode", type: "string", required: true,
        minLength: 8, maxLength: 8,
        custom: (value) => {
          if (!/^[A-Z0-9]{8}$/.test(value)) {
            throw new Error("Referral code must be 8 uppercase alphanumeric characters");
          }
        }},
    ],
    xssCheck: false,
  },

  createReferral: {
    rules: [
      {field: "referralCode", type: "string", required: true,
        custom: (value) => {
          if (!/^[A-Z0-9]{8}$/.test(value)) {
            throw new Error("Referral code must be 8 uppercase alphanumeric characters");
          }
        }},
      {field: "referredUserId", type: "id", required: true},
      {field: "referredUserEmail", type: "email", required: true},
      {field: "campaign", type: "string", maxLength: 50},
      {field: "source", type: "string", maxLength: 50},
    ],
    xssCheck: true,
  },

  // Storage validation
  validateStorageLimit: {
    rules: [
      {field: "userId", type: "id", required: true},
      {field: "uploadSizeBytes", type: "number", required: true,
        custom: (value) => {
          if (value < 1) {
            throw new Error("Upload size must be at least 1 byte");
          }
        }},
      {field: "fileType", type: "string", maxLength: 50},
    ],
    xssCheck: false,
    customValidation: (data: any) => {
      // Max single file size: 5GB
      const maxFileSize = 5 * 1024 * 1024 * 1024;
      if (data.uploadSizeBytes > maxFileSize) {
        return {isValid: false, error: "File size exceeds maximum allowed size of 5GB"};
      }
      return {isValid: true};
    },
  },

  // Payment method update
  updatePaymentMethod: {
    rules: [
      {field: "paymentMethodId", type: "string", required: true,
        custom: (value) => {
          if (!/^pm_[a-zA-Z0-9_]+$/.test(value)) {
            throw new Error("Invalid payment method ID format");
          }
        }},
      {field: "setAsDefault", type: "boolean"},
    ],
    xssCheck: false,
    customValidation: (data: any) => {
      if (data.setAsDefault === undefined) {
        data.setAsDefault = true;
      }
      return {isValid: true};
    },
  },

  // Subscription cancellation
  cancelSubscription: {
    rules: [
      {field: "subscriptionId", type: "id", required: true},
      {field: "reason", type: "enum", required: true,
        enumValues: ["too_expensive", "not_using", "missing_features", "technical_issues", "other"]},
      {field: "feedback", type: "string", maxLength: 1000},
      {field: "immediateCancel", type: "boolean"},
    ],
    xssCheck: true,
    customValidation: (data: any) => {
      if (data.immediateCancel === undefined) {
        data.immediateCancel = false;
      }
      return {isValid: true};
    },
  },

  // Reactivate subscription
  reactivateSubscription: {
    rules: [
      {field: "subscriptionId", type: "id", required: true},
      {field: "paymentMethodId", type: "string", required: true,
        custom: (value) => {
          if (!/^pm_[a-zA-Z0-9_]+$/.test(value)) {
            throw new Error("Invalid payment method ID format");
          }
        }},
    ],
    xssCheck: false,
  },

  // Retry payment
  retryPayment: {
    rules: [
      {field: "subscriptionId", type: "id", required: true},
      {field: "paymentMethodId", type: "string",
        custom: (value) => {
          if (value && !/^pm_[a-zA-Z0-9_]+$/.test(value)) {
            throw new Error("Invalid payment method ID format");
          }
        }},
    ],
    xssCheck: false,
  },

  // Get subscription usage
  getSubscriptionUsage: {
    rules: [
      {field: "subscriptionId", type: "id"},
      {field: "userId", type: "id"},
      {field: "includeFamily", type: "boolean"},
    ],
    xssCheck: false,
    customValidation: (data: any) => {
      if (data.includeFamily === undefined) {
        data.includeFamily = false;
      }
      // Must provide either subscriptionId or userId
      if (!data.subscriptionId && !data.userId) {
        return {isValid: false, error: "Either subscriptionId or userId must be provided"};
      }
      return {isValid: true};
    },
  },

  // Apply promo code
  applyPromoCode: {
    rules: [
      {field: "promoCode", type: "string", required: true, maxLength: 50},
      {field: "plan", type: "enum", required: true,
        enumValues: ["individual", "family"]},
      {field: "tier", type: "enum",
        enumValues: ["plus", "family_2_5tb", "family_7_5tb", "family_12tb"]},
    ],
    xssCheck: false,
  },
};

/**
 * Storage limit validation rules per plan
 */
export const STORAGE_LIMITS = {
  free: {
    maxFileSize: 25 * 1024 * 1024, // 25MB
    maxPhotoSize: 10 * 1024 * 1024, // 10MB
    totalStorage: 0, // No storage for free plan
    maxReferralBonus: 5 * 1024 * 1024 * 1024, // 5GB
  },
  individual: {
    plus: {
      maxFileSize: 500 * 1024 * 1024, // 500MB
      maxPhotoSize: 50 * 1024 * 1024, // 50MB
      totalStorage: 1000 * 1024 * 1024 * 1024, // 1TB
      maxReferralBonus: 25 * 1024 * 1024 * 1024, // 25GB
    },
  },
  family: {
    family_2_5tb: {
      maxFileSize: 1000 * 1024 * 1024, // 1GB
      maxPhotoSize: 100 * 1024 * 1024, // 100MB
      maxVideoLength: 30 * 60, // 30 minutes
      totalStorage: 2500 * 1024 * 1024 * 1024, // 2.5TB
      maxReferralBonus: 100 * 1024 * 1024 * 1024, // 100GB
    },
    family_7_5tb: {
      maxFileSize: 1000 * 1024 * 1024, // 1GB
      maxPhotoSize: 100 * 1024 * 1024, // 100MB
      maxVideoLength: 60 * 60, // 60 minutes
      totalStorage: 7500 * 1024 * 1024 * 1024, // 7.5TB
      maxReferralBonus: 200 * 1024 * 1024 * 1024, // 200GB
    },
    family_12tb: {
      maxFileSize: 2000 * 1024 * 1024, // 2GB
      maxPhotoSize: 200 * 1024 * 1024, // 200MB
      maxVideoLength: 120 * 60, // 120 minutes
      totalStorage: 12000 * 1024 * 1024 * 1024, // 12TB
      maxReferralBonus: 300 * 1024 * 1024 * 1024, // 300GB
    },
  },
};

/**
 * Addon combination rules
 */
export const ADDON_RULES = {
  maxAddonsPerSubscription: 3,
  exclusiveAddons: [], // No mutually exclusive addons currently
  requiredTier: "plus", // All addons require Individual Plus
  validCombinations: [
    ["storage_1tb"],
    ["storage_2tb"],
    ["storage_5tb"],
    ["storage_20tb"],
    ["storage_1tb", "storage_2tb"], // 3TB total
    ["storage_1tb", "storage_5tb"], // 6TB total
    ["storage_2tb", "storage_5tb"], // 7TB total
    ["storage_1tb", "storage_2tb", "storage_5tb"], // 8TB total
    // Note: storage_20tb cannot be combined with others
  ],
};

/**
 * Plan change rules
 */
export const PLAN_CHANGE_RULES: {
  upgradePaths: Record<string, string[]>;
  downgradePaths: Record<string, string[]>;
  tierChanges: Record<string, Record<string, string[]>>;
  restrictions: Record<string, string>;
} = {
  // Allowed upgrade paths
  upgradePaths: {
    free: ["individual", "family"],
    individual: ["family"],
    family: [], // Family can only change tiers, not upgrade to another plan
  },

  // Allowed downgrade paths
  downgradePaths: {
    family: ["individual"], // Can downgrade from family to individual
    individual: [], // Cannot downgrade from individual to free
    free: [],
  },

  // Tier changes within plans
  tierChanges: {
    individual: {
      plus: [], // No other individual tiers
    },
    family: {
      family_2_5tb: ["family_7_5tb", "family_12tb"],
      family_7_5tb: ["family_2_5tb", "family_12tb"],
      family_12tb: ["family_2_5tb", "family_7_5tb"],
    },
  },

  // Restrictions
  restrictions: {
    // Cannot downgrade with active family members
    familyMemberRestriction: "Cannot downgrade from family plan with active members",
    // Cannot change plan mid-billing cycle for annual plans
    annualPlanRestriction: "Annual plans can only be changed at renewal",
    // Must clear outstanding balance before plan change
    outstandingBalanceRestriction: "Cannot change plan with outstanding balance",
  },
};
