import {SubscriptionPlan, SubscriptionTier} from "../types/subscription";
import {StripePriceMapping} from "../types/stripe";

/**
 * Stripe Product and Price mapping configuration
 *
 * IMPORTANT: These IDs must match your Stripe dashboard products/prices
 *
 * Setup Instructions:
 * 1. Create products in Stripe Dashboard for each plan/tier
 * 2. Create prices for each product (monthly and optionally yearly)
 * 3. Update the IDs below with your actual Stripe IDs
 * 4. Deploy to production only after verifying in test mode
 */

// Storage allocations per plan (in GB - converted from TB in pricing matrix)
export const STORAGE_ALLOCATIONS = {
  [SubscriptionPlan.FREE]: {
    baseStorageGB: 5, // 0 TB from pricing matrix
    maxReferralBonusGB: 15,
  },
  [SubscriptionPlan.INDIVIDUAL]: {
    [SubscriptionTier.PLUS]: {
      baseStorageGB: 1000, // 1 TB - Individual Plan from matrix
      maxReferralBonusGB: 25,
    },
  },
  [SubscriptionPlan.FAMILY]: {
    [SubscriptionTier.FAMILY_2_5TB]: {
      baseStorageGB: 2500, // 2.5 TB - Family Plan Base from matrix
      maxReferralBonusGB: 100,
      maxMembers: 5, // up to 5 users per matrix
    },
    [SubscriptionTier.FAMILY_7_5TB]: {
      baseStorageGB: 7500, // 7.5 TB - Family Plan Upgrade from matrix
      maxReferralBonusGB: 200,
      maxMembers: 5,
    },
    [SubscriptionTier.FAMILY_12TB]: {
      baseStorageGB: 12000, // 12 TB - Family Plan Upgrade from matrix
      maxReferralBonusGB: 300,
      maxMembers: 5,
    },
  },
} as const;

// Addon storage allocations (in GB - for Individual Plus Base only)
// These add to the 1TB base storage from Individual Plus
export const ADDON_STORAGE = {
  storage_1tb: 1000, // +1 TB addon ($7/mo)
  storage_2tb: 2000, // +2 TB addon ($14/mo)
  storage_5tb: 5000, // +5 TB addon ($35/mo)
  storage_20tb: 20000, // +20 TB addon ($140/mo)
} as const;

// Pricing configuration (monthly USD) - matches pricing matrix
export const PLAN_PRICING = {
  [SubscriptionPlan.FREE]: {
    monthly: 0,
  },
  [SubscriptionPlan.INDIVIDUAL]: {
    [SubscriptionTier.PLUS]: {
      monthly: 8, // Individual Plan from matrix
    },
  },
  [SubscriptionPlan.FAMILY]: {
    [SubscriptionTier.FAMILY_2_5TB]: {
      monthly: 25, // Family Plan 2.5TB from matrix
    },
    [SubscriptionTier.FAMILY_7_5TB]: {
      monthly: 60, // Family Plan 7.5TB from matrix
    },
    [SubscriptionTier.FAMILY_12TB]: {
      monthly: 100, // Family Plan 12TB from matrix
    },
  },
} as const;

// Addon pricing (monthly USD) - matches pricing matrix
export const ADDON_PRICING = {
  storage_1tb: 7, // +1 TB addon
  storage_2tb: 14, // +2 TB addon
  storage_5tb: 35, // +5 TB addon
  storage_20tb: 140, // +20 TB addon
} as const;

// Referral bonus configuration
export const REFERRAL_CONFIG = {
  storagePerReferralGB: 1, // 1GB per successful referral
  maxReferrals: 50, // Maximum number of referrals that earn storage
  referralExpirationDays: 90, // Referral links expire after 90 days
} as const;

// Feature flags per plan
export const PLAN_FEATURES = {
  [SubscriptionPlan.FREE]: {
    unlimitedPhotos: false,
    videoUpload: false,
    audioRecording: false,
    documentScanning: false,
    aiFeatures: false,
    advancedSharing: false,
    prioritySupport: false,
    familySharing: false,
    sharedCalendar: false,
    familyVault: false,
    maxPhotoUploadSizeMB: 10,
    maxFileUploadSizeMB: 25,
  },
  [SubscriptionPlan.INDIVIDUAL]: {
    [SubscriptionTier.PLUS]: {
      unlimitedPhotos: true,
      videoUpload: true,
      audioRecording: true,
      documentScanning: true,
      aiFeatures: true,
      advancedSharing: true,
      prioritySupport: false,
      familySharing: false,
      sharedCalendar: false,
      familyVault: false,
      maxPhotoUploadSizeMB: 50,
      maxFileUploadSizeMB: 500,
      maxVideoLengthMinutes: 10,
    },
  },
  [SubscriptionPlan.FAMILY]: {
    [SubscriptionTier.FAMILY_2_5TB]: {
      unlimitedPhotos: true,
      videoUpload: true,
      audioRecording: true,
      documentScanning: true,
      aiFeatures: true,
      advancedSharing: true,
      prioritySupport: false,
      familySharing: true,
      sharedCalendar: true,
      familyVault: true,
      maxPhotoUploadSizeMB: 100,
      maxFileUploadSizeMB: 1000,
      maxVideoLengthMinutes: 30,
    },
    [SubscriptionTier.FAMILY_7_5TB]: {
      unlimitedPhotos: true,
      videoUpload: true,
      audioRecording: true,
      documentScanning: true,
      aiFeatures: true,
      advancedSharing: true,
      prioritySupport: true,
      familySharing: true,
      sharedCalendar: true,
      familyVault: true,
      maxPhotoUploadSizeMB: 100,
      maxFileUploadSizeMB: 1000,
      maxVideoLengthMinutes: 60,
    },
    [SubscriptionTier.FAMILY_12TB]: {
      unlimitedPhotos: true,
      videoUpload: true,
      audioRecording: true,
      documentScanning: true,
      aiFeatures: true,
      advancedSharing: true,
      prioritySupport: true,
      familySharing: true,
      sharedCalendar: true,
      familyVault: true,
      maxPhotoUploadSizeMB: 200,
      maxFileUploadSizeMB: 2000,
      maxVideoLengthMinutes: 120,
    },
  },
} as const;

/**
 * Stripe Product/Price IDs
 *
 * NOTE: These are placeholder IDs. Replace with your actual Stripe IDs.
 * Test mode IDs start with "price_" and "prod_"
 * Live mode IDs will be different
 */
export const STRIPE_PRICE_MAPPING: StripePriceMapping = {
  // Free plan (no Stripe product needed)
  free: {
    productId: "prod_free_placeholder",
    priceId: null,
  },

  // Individual plans
  individual: {
    plus: {
      productId: process.env.STRIPE_PRODUCT_INDIVIDUAL_PLUS || "prod_individual_plus",
      priceIdMonthly: process.env.STRIPE_PRICE_INDIVIDUAL_PLUS_MONTHLY || "price_individual_plus_monthly",
      priceIdYearly: process.env.STRIPE_PRICE_INDIVIDUAL_PLUS_YEARLY || "price_individual_plus_yearly",
    },
  },

  // Family plan with tiers
  family: {
    family_2_5tb: {
      productId: process.env.STRIPE_PRODUCT_FAMILY_2_5TB || "prod_family_2_5tb",
      priceIdMonthly: process.env.STRIPE_PRICE_FAMILY_2_5TB_MONTHLY || "price_family_2_5tb_monthly",
      priceIdYearly: process.env.STRIPE_PRICE_FAMILY_2_5TB_YEARLY || "price_family_2_5tb_yearly",
    },
    family_7_5tb: {
      productId: process.env.STRIPE_PRODUCT_FAMILY_7_5TB || "prod_family_7_5tb",
      priceIdMonthly: process.env.STRIPE_PRICE_FAMILY_7_5TB_MONTHLY || "price_family_7_5tb_monthly",
      priceIdYearly: process.env.STRIPE_PRICE_FAMILY_7_5TB_YEARLY || "price_family_7_5tb_yearly",
    },
    family_12tb: {
      productId: process.env.STRIPE_PRODUCT_FAMILY_12TB || "prod_family_12tb",
      priceIdMonthly: process.env.STRIPE_PRICE_FAMILY_12TB_MONTHLY || "price_family_12tb_monthly",
      priceIdYearly: process.env.STRIPE_PRICE_FAMILY_12TB_YEARLY || "price_family_12tb_yearly",
    },
  },

  // Storage addons (Individual Plus only) - updated to match pricing matrix
  addons: {
    storage_1tb: {
      productId: process.env.STRIPE_PRODUCT_ADDON_1TB || "prod_addon_storage_1tb",
      priceIdMonthly: process.env.STRIPE_PRICE_ADDON_1TB_MONTHLY || "price_addon_storage_1tb_monthly",
    },
    storage_2tb: {
      productId: process.env.STRIPE_PRODUCT_ADDON_2TB || "prod_addon_storage_2tb",
      priceIdMonthly: process.env.STRIPE_PRICE_ADDON_2TB_MONTHLY || "price_addon_storage_2tb_monthly",
    },
    storage_5tb: {
      productId: process.env.STRIPE_PRODUCT_ADDON_5TB || "prod_addon_storage_5tb",
      priceIdMonthly: process.env.STRIPE_PRICE_ADDON_5TB_MONTHLY || "price_addon_storage_5tb_monthly",
    },
    storage_20tb: {
      productId: process.env.STRIPE_PRODUCT_ADDON_20TB || "prod_addon_storage_20tb",
      priceIdMonthly: process.env.STRIPE_PRICE_ADDON_20TB_MONTHLY || "price_addon_storage_20tb_monthly",
    },
  },
};

/**
 * Get Stripe price ID for a plan
 */
export function getStripePriceId(
  plan: SubscriptionPlan,
  tier?: SubscriptionTier,
  interval: "month" | "year" = "month"
): string | null {
  if (plan === SubscriptionPlan.FREE) {
    return null;
  }

  if (plan === SubscriptionPlan.INDIVIDUAL && tier === SubscriptionTier.PLUS) {
    const tierConfig = STRIPE_PRICE_MAPPING.individual.plus;
    return interval === "month" ? tierConfig.priceIdMonthly : tierConfig.priceIdYearly || tierConfig.priceIdMonthly;
  }

  if (plan === SubscriptionPlan.FAMILY && tier) {
    let familyTierKey: keyof typeof STRIPE_PRICE_MAPPING.family;

    // Map tier to correct family key
    switch (tier) {
    case SubscriptionTier.FAMILY_2_5TB:
    case SubscriptionTier.LITE:
      familyTierKey = "family_2_5tb";
      break;
    case SubscriptionTier.FAMILY_7_5TB:
      familyTierKey = "family_7_5tb";
      break;
    case SubscriptionTier.FAMILY_12TB:
    case SubscriptionTier.PRO:
      familyTierKey = "family_12tb";
      break;
    default:
      throw new Error(`Invalid family tier: ${tier}`);
    }

    const tierConfig = STRIPE_PRICE_MAPPING.family[familyTierKey];
    return interval === "month" ? tierConfig.priceIdMonthly : tierConfig.priceIdYearly || tierConfig.priceIdMonthly;
  }

  throw new Error(`Invalid plan configuration: ${plan} ${tier}`);
}

/**
 * Get Stripe product ID for a plan
 */
export function getStripeProductId(
  plan: SubscriptionPlan,
  tier?: SubscriptionTier
): string {
  if (plan === SubscriptionPlan.FREE) {
    return STRIPE_PRICE_MAPPING.free.productId;
  }

  if (plan === SubscriptionPlan.INDIVIDUAL && tier === SubscriptionTier.PLUS) {
    return STRIPE_PRICE_MAPPING.individual.plus.productId;
  }

  if (plan === SubscriptionPlan.FAMILY && tier) {
    // Map tier to correct family key
    switch (tier) {
    case SubscriptionTier.FAMILY_2_5TB:
    case SubscriptionTier.LITE:
      return STRIPE_PRICE_MAPPING.family.family_2_5tb.productId;
    case SubscriptionTier.FAMILY_7_5TB:
      return STRIPE_PRICE_MAPPING.family.family_7_5tb.productId;
    case SubscriptionTier.FAMILY_12TB:
    case SubscriptionTier.PRO:
      return STRIPE_PRICE_MAPPING.family.family_12tb.productId;
    }
  }

  throw new Error(`Invalid plan configuration: ${plan} ${tier}`);
}

/**
 * Get addon price ID
 */
export function getAddonPriceId(addonType: keyof typeof ADDON_STORAGE): string {
  return STRIPE_PRICE_MAPPING.addons[addonType].priceIdMonthly;
}

/**
 * Get storage allocation for a plan
 */
export function getStorageAllocation(
  plan: SubscriptionPlan,
  tier?: SubscriptionTier
): number {
  if (plan === SubscriptionPlan.FREE) {
    return STORAGE_ALLOCATIONS.free.baseStorageGB;
  }

  if (plan === SubscriptionPlan.INDIVIDUAL && tier === SubscriptionTier.PLUS) {
    return STORAGE_ALLOCATIONS.individual.plus.baseStorageGB;
  }

  if (plan === SubscriptionPlan.FAMILY && tier) {
    // Map tier to correct family key
    switch (tier) {
    case SubscriptionTier.FAMILY_2_5TB:
    case SubscriptionTier.LITE:
      return STORAGE_ALLOCATIONS.family.family_2_5tb.baseStorageGB;
    case SubscriptionTier.FAMILY_7_5TB:
      return STORAGE_ALLOCATIONS.family.family_7_5tb.baseStorageGB;
    case SubscriptionTier.FAMILY_12TB:
    case SubscriptionTier.PRO:
      return STORAGE_ALLOCATIONS.family.family_12tb.baseStorageGB;
    }
  }

  return 0;
}

/**
 * Get features for a plan
 */
export function getPlanFeatures(
  plan: SubscriptionPlan,
  tier?: SubscriptionTier
): any {
  if (plan === SubscriptionPlan.FREE) {
    return PLAN_FEATURES.free;
  }

  if (plan === SubscriptionPlan.INDIVIDUAL && tier === SubscriptionTier.PLUS) {
    return PLAN_FEATURES.individual.plus;
  }

  if (plan === SubscriptionPlan.FAMILY && tier) {
    // Map tier to correct family key
    switch (tier) {
    case SubscriptionTier.FAMILY_2_5TB:
    case SubscriptionTier.LITE:
      return PLAN_FEATURES.family.family_2_5tb;
    case SubscriptionTier.FAMILY_7_5TB:
      return PLAN_FEATURES.family.family_7_5tb;
    case SubscriptionTier.FAMILY_12TB:
    case SubscriptionTier.PRO:
      return PLAN_FEATURES.family.family_12tb;
    }
  }

  // Default to free plan features
  return PLAN_FEATURES.free;
}

/**
 * Validate addon eligibility
 */
export function isAddonEligible(
  plan: SubscriptionPlan,
  tier?: SubscriptionTier,
  addonType?: keyof typeof ADDON_STORAGE
): boolean {
  // Addons are only available for Individual plans
  if (plan !== SubscriptionPlan.INDIVIDUAL) {
    return false;
  }

  // No specific addon type means checking general eligibility
  if (!addonType) {
    return true;
  }

  // All addon types are available for all Individual tiers
  return true;
}

/**
 * Calculate total storage with addons and referrals
 */
export function calculateTotalStorage(params: {
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  addons: Array<keyof typeof ADDON_STORAGE>;
  referralCount: number;
}): number {
  // Base storage
  let totalGB = getStorageAllocation(params.plan, params.tier);

  // Add addon storage
  params.addons.forEach((addon) => {
    totalGB += ADDON_STORAGE[addon];
  });

  // Add referral bonus
  let maxReferralBonus = 0;

  if (params.plan === SubscriptionPlan.FREE) {
    maxReferralBonus = STORAGE_ALLOCATIONS.free.maxReferralBonusGB;
  } else if (params.plan === SubscriptionPlan.INDIVIDUAL && params.tier === SubscriptionTier.PLUS) {
    maxReferralBonus = STORAGE_ALLOCATIONS.individual.plus.maxReferralBonusGB;
  } else if (params.plan === SubscriptionPlan.FAMILY && params.tier) {
    // Map tier to correct family key
    switch (params.tier) {
    case SubscriptionTier.FAMILY_2_5TB:
    case SubscriptionTier.LITE:
      maxReferralBonus = STORAGE_ALLOCATIONS.family.family_2_5tb.maxReferralBonusGB;
      break;
    case SubscriptionTier.FAMILY_7_5TB:
      maxReferralBonus = STORAGE_ALLOCATIONS.family.family_7_5tb.maxReferralBonusGB;
      break;
    case SubscriptionTier.FAMILY_12TB:
    case SubscriptionTier.PRO:
      maxReferralBonus = STORAGE_ALLOCATIONS.family.family_12tb.maxReferralBonusGB;
      break;
    }
  }

  const referralBonus = Math.min(
    params.referralCount * REFERRAL_CONFIG.storagePerReferralGB,
    maxReferralBonus
  );

  totalGB += referralBonus;

  return totalGB;
}

/**
 * Check if plan/tier combination is eligible
 */
export function isEligibleForPlan(plan: SubscriptionPlan, tier?: SubscriptionTier): boolean {
  if (plan === SubscriptionPlan.FREE) {
    return true;
  }

  if (plan === SubscriptionPlan.INDIVIDUAL) {
    return tier !== undefined && Object.values(SubscriptionTier).includes(tier);
  }

  if (plan === SubscriptionPlan.FAMILY) {
    return true;
  }

  return false;
}

/**
 * Plan limits
 */
export const PLAN_LIMITS = {
  free: {
    maxStorageGB: 0,
    maxMembers: 1,
  },
  individual: {
    plus: {
      maxStorageGB: 1000, // 1 TB - Individual Plan from matrix
      maxMembers: 1,
    },
  },
  family: {
    maxMembers: 5, // up to 5 users per matrix - consistent across all family tiers
    family_2_5tb: {
      maxStorageGB: 2500, // 2.5 TB - Family Plan from matrix
      maxMembers: 5, // up to 5 users per matrix
    },
    family_7_5tb: {
      maxStorageGB: 7500, // 7.5 TB - Family Plan from matrix
      maxMembers: 5,
    },
    family_12tb: {
      maxStorageGB: 12000, // 12 TB - Family Plan from matrix
      maxMembers: 5,
    },
  },
} as const;

/**
 * Get plan display name
 */
export function getPlanDisplayName(plan: SubscriptionPlan, tier?: SubscriptionTier): string {
  if (plan === SubscriptionPlan.FREE) {
    return "Free Plan";
  }

  if (plan === SubscriptionPlan.INDIVIDUAL && tier) {
    // Individual plan only has one tier in the pricing matrix (Individual Plus)
    return "Individual Plan";
  }

  if (plan === SubscriptionPlan.FAMILY && tier) {
    switch (tier) {
    case SubscriptionTier.FAMILY_2_5TB:
    case SubscriptionTier.LITE:
      return "Family Plan 2.5 TB";
    case SubscriptionTier.FAMILY_7_5TB:
      return "Family Plan 7.5 TB";
    case SubscriptionTier.FAMILY_12TB:
    case SubscriptionTier.PRO:
      return "Family Plan 12 TB";
    default:
      return "Family Plan";
    }
  }

  return "Unknown";
}

/**
 * Get monthly price for a plan
 */
export function getMonthlyPrice(
  plan: SubscriptionPlan,
  tier?: SubscriptionTier
): number {
  if (plan === SubscriptionPlan.FREE) {
    return PLAN_PRICING.free.monthly;
  }

  if (plan === SubscriptionPlan.INDIVIDUAL && tier === SubscriptionTier.PLUS) {
    return PLAN_PRICING.individual.plus.monthly;
  }

  if (plan === SubscriptionPlan.FAMILY && tier) {
    // Map tier to correct family key
    switch (tier) {
    case SubscriptionTier.FAMILY_2_5TB:
    case SubscriptionTier.LITE:
      return PLAN_PRICING.family.family_2_5tb.monthly;
    case SubscriptionTier.FAMILY_7_5TB:
      return PLAN_PRICING.family.family_7_5tb.monthly;
    case SubscriptionTier.FAMILY_12TB:
    case SubscriptionTier.PRO:
      return PLAN_PRICING.family.family_12tb.monthly;
    }
  }

  return 0;
}

/**
 * Get addon monthly price
 */
export function getAddonMonthlyPrice(addonType: keyof typeof ADDON_STORAGE): number {
  return ADDON_PRICING[addonType];
}
