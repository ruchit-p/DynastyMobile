import {Timestamp} from "firebase-admin/firestore";

// Subscription Plan Types
export enum SubscriptionPlan {
  FREE = "free",
  INDIVIDUAL = "individual",
  FAMILY = "family",
}

// Subscription Tiers
export enum SubscriptionTier {
  // Individual Plan tier
  PLUS = "plus",

  // Family Plan tiers
  FAMILY_2_5TB = "family_2_5tb",
  FAMILY_7_5TB = "family_7_5tb",
  FAMILY_12TB = "family_12tb",

  // Legacy tier names for backward compatibility
  LITE = "lite",
  PRO = "pro",
}

// Subscription Status
export enum SubscriptionStatus {
  ACTIVE = "active",
  PAST_DUE = "past_due",
  CANCELED = "canceled",
  INCOMPLETE = "incomplete",
  INCOMPLETE_EXPIRED = "incomplete_expired",
  TRIALING = "trialing",
  PAUSED = "paused",
  UNPAID = "unpaid",
  SUSPENDED = "suspended", // Added for payment failure recovery
}

// Grace Period Status
export enum GracePeriodStatus {
  ACTIVE = "active",
  EXPIRED = "expired",
  CLEARED = "cleared",
}

// Grace Period Information
export interface GracePeriod {
  status: GracePeriodStatus;
  type: "paymentFailed" | "subscriptionExpired" | "paymentMethodExpired";
  startedAt: Timestamp;
  endsAt: Timestamp;
  reason: string;
  paymentFailureId?: string;
}

// Payment Failure Record
export interface PaymentFailureRecord {
  id: string;
  subscriptionId: string;
  userId: string;
  stripeCustomerId: string;
  paymentIntentId?: string;
  errorCode: string;
  errorMessage: string;
  errorType?: string;
  declineCode?: string;
  amount: number;
  currency: string;
  attemptCount: number;
  resolved: boolean;
  createdAt: Timestamp;
  lastAttemptAt: Timestamp;
  resolvedAt?: Timestamp;
  lastFourDigits?: string;
}

// Storage Addon Types - updated for pricing matrix
export interface SubscriptionAddon {
  id?: string;
  type: "storage_1tb" | "storage_2tb" | "storage_5tb" | "storage_20tb";
  name?: string;
  storageGB?: number;
  priceMonthly?: number;
  stripeProductId?: string;
  stripePriceId?: string;
  addedAt?: Timestamp;
  status: "active" | "canceled";
}

// Family Plan Member
export interface FamilyPlanMember {
  userId: string;
  email: string;
  displayName: string;
  role?: "owner" | "member";
  joinedAt?: Timestamp;
  addedAt?: Timestamp;
  addedBy?: string;
  invitedAt?: Timestamp;
  invitedBy?: string;
  storageUsedBytes?: number;
  status: "active" | "invited" | "removed";
  acceptedAt?: Timestamp;
  removedAt?: Timestamp;
  removedBy?: string;
  removalReason?: string;
}

// Audit Log Entry
export enum AuditAction {
  SUBSCRIPTION_CREATED = "subscription_created",
  SUBSCRIPTION_UPDATED = "subscription_updated",
  SUBSCRIPTION_CANCELED = "subscription_canceled",
  SUBSCRIPTION_REACTIVATED = "subscription_reactivated",
  FAMILY_MEMBER_ADDED = "family_member_added",
  FAMILY_MEMBER_REMOVED = "family_member_removed",
  ADDON_ADDED = "addon_added",
  ADDON_REMOVED = "addon_removed",
  PAYMENT_SUCCEEDED = "payment_succeeded",
  PAYMENT_FAILED = "payment_failed",
}

export interface AuditLogEntry {
  action: AuditAction;
  performedBy: string;
  timestamp: Timestamp;
  details?: Record<string, any>;
}

// Storage Allocation
export interface StorageAllocation {
  basePlanGB: number;
  addonGB: number;
  referralBonusGB: number;
  totalGB: number;
  usedBytes: number;
  availableBytes: number;
  lastCalculated: Timestamp;
}

// Referral Information
export interface ReferralInfo {
  referralCode: string;
  referredBy?: string;
  referredUsers: string[];
  totalReferrals: number;
  activeReferrals: number;
  storageEarnedGB: number;
  lastReferralAt?: Timestamp;
}

// Main Subscription Document
export interface Subscription {
  // Document ID (same as user ID for easy lookup)
  id: string;

  // User reference
  userId: string;
  userEmail: string;

  // Plan details
  plan: SubscriptionPlan;
  tier?: SubscriptionTier; // Only for Individual plan
  status: SubscriptionStatus;

  // Stripe references
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  stripeProductId?: string;
  stripePriceId?: string;

  // Subscription dates
  startDate: Timestamp;
  currentPeriodStart: Timestamp;
  currentPeriodEnd: Timestamp;
  canceledAt?: Timestamp;
  cancelAtPeriodEnd: boolean;
  endedAt?: Timestamp;
  trialEnd?: Timestamp;

  // Billing
  priceMonthly: number;
  amount: number; // Added for payment recovery
  currency: string;
  lastPaymentStatus: "succeeded" | "failed" | "pending";
  lastPaymentAt?: Timestamp;
  nextPaymentAt?: Timestamp;
  paymentMethodLast4?: string;
  paymentMethodType?: string;
  lastPaymentError?: {
    code: string;
    message: string;
    occurredAt: Timestamp;
  };

  // Grace Period
  gracePeriod?: GracePeriod;

  // Suspension details
  suspendedAt?: Timestamp;
  suspensionReason?: string;
  reactivatedAt?: Timestamp;

  // Display name for plan
  planDisplayName: string;

  // Storage
  storageAllocation: StorageAllocation;

  // Addons (only for Individual plan)
  addons: SubscriptionAddon[];

  // Family plan specific
  familyMembers?: FamilyPlanMember[];
  familyMemberLimit?: number;

  // Referrals
  referralInfo?: ReferralInfo;

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastModifiedBy: string;
  interval?: "month" | "year";
  cancelReason?: string;
  auditLog?: AuditLogEntry[];
  metadata?: Record<string, any>;

  // Features flags
  features: {
    unlimitedPhotos: boolean;
    videoUpload: boolean;
    audioRecording: boolean;
    documentScanning: boolean;
    aiFeatures: boolean;
    advancedSharing: boolean;
    prioritySupport: boolean;
  };
}

// Subscription History Entry (for audit trail)
export interface SubscriptionHistoryEntry {
  id: string;
  subscriptionId: string;
  userId: string;
  action: "created" | "upgraded" | "downgraded" | "canceled" | "reactivated" |
          "addon_added" | "addon_removed" | "payment_failed" | "payment_succeeded" |
          "family_member_added" | "family_member_removed";
  previousState?: Partial<Subscription>;
  newState?: Partial<Subscription>;
  metadata?: Record<string, any>;
  performedBy: string; // User ID or "system"
  performedAt: Timestamp;
  stripeEventId?: string;
}

// Referral Document
export interface Referral {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  referralCode: string;
  status: "pending" | "completed" | "expired" | "invalid";
  createdAt: Timestamp;
  completedAt?: Timestamp;
  expiresAt: Timestamp;
  storageRewardGB: number;
  rewardApplied: boolean;
  metadata?: {
    campaign?: string;
    source?: string;
  };
}

// Plan pricing configuration
export interface PlanPricing {
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  priceMonthly: number;
  currency: string;
  storageGB: number;
  familyMemberLimit?: number;
  features: string[];
  stripeProductId: string;
  stripePriceId: string;
}

// Stripe webhook event types we handle
export type StripeWebhookEvent =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.payment_failed"
  | "invoice.payment_succeeded"
  | "customer.updated"
  | "payment_method.attached"
  | "payment_method.detached";
