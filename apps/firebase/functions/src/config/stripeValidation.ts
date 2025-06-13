import {z} from "zod";

// Zod schemas for Stripe operations
export const CreateCheckoutSessionSchema = z.object({
  plan: z.enum(["free", "individual", "family"]),
  tier: z.enum(["plus", "family_2_5tb", "family_7_5tb", "family_12tb"]).optional(),
  interval: z.enum(["month", "year"]).optional(),
  addons: z.array(z.string()).optional(),
  referralCode: z.string().optional(),
  familyMemberIds: z.array(z.string()).optional(),
  allowPromotionCodes: z.boolean().optional(),
});

export const UpdateSubscriptionSchema = z.object({
  plan: z.enum(["free", "individual", "family"]).optional(),
  tier: z.enum(["plus", "family_2_5tb", "family_7_5tb", "family_12tb"]).optional(),
  addons: z.array(z.string()).optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
  prorationBehavior: z.enum(["create_prorations", "none", "always_invoice"]).optional(),
});

export const AddFamilyMemberSchema = z.object({
  memberId: z.string(),
  memberEmail: z.string().email(),
  memberName: z.string(),
});

export const RemoveFamilyMemberSchema = z.object({
  memberId: z.string(),
  reason: z.string().optional(),
});

export const CreateCustomerPortalSchema = z.object({
  returnUrl: z.string().url(),
});

// Phase 2: Enhanced Checkout Schema
export const EnhancedCreateCheckoutSessionSchema = z.object({
  plan: z.enum(["free", "individual", "family"]),
  tier: z.enum(["plus", "family_2_5tb", "family_7_5tb", "family_12tb"]).optional(),
  interval: z.enum(["month", "year"]),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  addons: z.array(z.enum(["storage_1tb", "storage_2tb", "storage_5tb", "storage_20tb"])).optional(),
  referralCode: z.string().min(1).max(50).optional(),
  familyMemberIds: z.array(z.string()).max(5).optional(), // Max 5 additional members
  couponCode: z.string().optional(),
  allowPromotionCodes: z.boolean().optional(),
});

// Phase 2: Family Plan Schemas
export const AddFamilyMemberEnhancedSchema = z.object({
  subscriptionId: z.string(),
  memberId: z.string(),
  memberEmail: z.string().email(),
  memberName: z.string().min(1).max(100),
  skipFamilyTreeVerification: z.boolean().optional(),
  sendInvitationEmail: z.boolean().optional(),
});

export const RemoveFamilyMemberEnhancedSchema = z.object({
  subscriptionId: z.string(),
  memberId: z.string(),
  reason: z.string().max(500).optional(),
  gracePeriodDays: z.number().min(0).max(30).optional(),
  notifyMember: z.boolean().optional(),
});

export const AcceptFamilyInvitationSchema = z.object({
  invitationId: z.string(),
});

export const DeclineFamilyInvitationSchema = z.object({
  invitationId: z.string(),
  reason: z.string().max(200).optional(),
});

// Phase 2: Addon Management Schemas
export const PurchaseAddonSchema = z.object({
  subscriptionId: z.string(),
  addonType: z.enum(["storage_1tb", "storage_2tb", "storage_5tb", "storage_20tb"]),
  prorationBehavior: z.enum(["create_prorations", "none", "always_invoice"]).optional(),
  effectiveDate: z.enum(["immediate", "next_billing_cycle"]).optional(),
});

export const RemoveAddonSchema = z.object({
  subscriptionId: z.string(),
  addonId: z.string(),
  prorationBehavior: z.enum(["create_prorations", "none", "always_invoice"]).optional(),
  effectiveDate: z.enum(["immediate", "end_of_billing_period"]).optional(),
  reason: z.string().max(200).optional(),
});

export const CheckAddonEligibilitySchema = z.object({
  subscriptionId: z.string(),
  addonType: z.enum(["storage_1tb", "storage_2tb", "storage_5tb", "storage_20tb"]),
});

// Plan Upgrade/Downgrade Schema
export const UpgradeDowngradeSubscriptionSchema = z.object({
  subscriptionId: z.string(),
  newPlan: z.enum(["individual", "family"]),
  newTier: z.enum(["plus", "family_2_5tb", "family_7_5tb", "family_12tb"]).optional(),
  prorationBehavior: z.enum(["create_prorations", "none", "always_invoice"]).optional(),
  effectiveDate: z.enum(["immediate", "next_billing_cycle"]).optional(),
});

// Storage Report Schema
export const GenerateStorageReportSchema = z.object({
  subscriptionId: z.string(),
  includeProjections: z.boolean().optional(),
  includeMemberBreakdown: z.boolean().optional(),
});

// Referral System Schemas
export const GenerateReferralCodeSchema = z.object({});

export const ValidateReferralCodeSchema = z.object({
  referralCode: z.string().min(1, "Referral code is required"),
});

export const CreateReferralSchema = z.object({
  referralCode: z.string().min(1, "Referral code is required"),
  metadata: z.object({
    campaign: z.string().optional(),
    source: z.string().optional(),
  }).optional(),
});

export const GetReferralStatsSchema = z.object({});

export const GetReferralInfoSchema = z.object({});
