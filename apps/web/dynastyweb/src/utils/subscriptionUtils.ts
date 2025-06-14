import { functions } from '@/lib/firebase';
import { FirebaseFunctionsClient, createFirebaseClient } from '@/lib/functions-client';

// Firebase Functions client
let functionsClient: FirebaseFunctionsClient | null = null;

// Initialize the functions client
if (functions) {
  functionsClient = createFirebaseClient(functions);
}

function getFunctionsClient(): FirebaseFunctionsClient {
  if (!functionsClient) {
    throw new Error('Firebase Functions not initialized');
  }
  return functionsClient;
}

// Types
export enum SubscriptionPlan {
  FREE = 'free',
  INDIVIDUAL = 'individual',
  FAMILY = 'family'
}

export enum SubscriptionTier {
  // Updated to match server-side tiers
  PLUS = 'plus',
  FAMILY_2_5TB = 'family_2_5tb',
  FAMILY_7_5TB = 'family_7_5tb',
  FAMILY_12TB = 'family_12tb',

  // Legacy – kept for backward compatibility of deep links
  BASIC = 'basic',
  PREMIUM = 'premium',
  LEGACY = 'legacy'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  UNPAID = 'unpaid',
  CANCELED = 'canceled',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  TRIALING = 'trialing',
  PAUSED = 'paused'
}

export enum AddonType {
  EXTRA_STORAGE = 'extra_storage',
  PRIORITY_SUPPORT = 'priority_support',
  VIDEO_PROCESSING = 'video_processing'
}

export interface PricingInfo {
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  monthlyPrice: number;
  yearlyPrice: number;
  storageGB: number;
  familyMembers?: number;
  features: string[];
  recommended?: boolean;
}

export interface CheckoutSessionParams {
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  interval?: 'month' | 'year';
  addons?: AddonType[];
  referralCode?: string;
  familyMemberIds?: string[];
  mode?: 'hosted' | 'embedded'; // Add mode selection
}

export interface SubscriptionDetails {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  tier?: SubscriptionTier;
  status: SubscriptionStatus;
  interval: 'month' | 'year';
  currentPeriodEnd: Date;
  currentPeriodStart: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
  addons: AddonType[];
  familyMembers?: string[];
  stripeSubscriptionId: string;
  stripeCustomerId: string;
}

// API Functions

/**
 * Create a Stripe checkout session
 */
export async function createCheckoutSession(params: CheckoutSessionParams) {
  // Use enhanced checkout for embedded mode, basic checkout for hosted mode
  const functionName = params.mode === 'embedded' ? 'createEnhancedCheckoutSession' : 'createCheckoutSession';
  const result = await getFunctionsClient().callFunction(functionName, params);
  
  if (params.mode === 'embedded') {
    return result.data as { 
      sessionId: string; 
      clientSecret: string; 
      stripePublishableKey: string;
    };
  } else {
    return result.data as { sessionId: string; url: string };
  }
}

/**
 * Get subscription details for the current user
 */
export async function getSubscriptionDetails() {
  const result = await getFunctionsClient().callFunction('getSubscriptionStatus', {});
  return result.data as { 
    subscription: SubscriptionDetails | null;
    storage?: {
      totalGB: number;
      usedBytes: number;
      availableBytes: number;
      usagePercentage: number;
      breakdown?: {
        basePlanGB: number;
        addonGB: number;
        referralBonusGB: number;
      };
    };
  };
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(params: {
  cancelImmediately?: boolean;
  reason?: string;
  feedback?: string;
}) {
  const result = await getFunctionsClient().callFunction('cancelSubscription', params);
  return result.data as { success: boolean };
}

/**
 * Update subscription (upgrade/downgrade)
 */
export async function updateSubscription(params: {
  plan?: SubscriptionPlan;
  tier?: SubscriptionTier;
  addons?: AddonType[];
}) {
  const result = await getFunctionsClient().callFunction('updateSubscription', params);
  return result.data as { success: boolean };
}

/**
 * Reactivate a canceled subscription
 */
export async function reactivateSubscription() {
  const result = await getFunctionsClient().callFunction('reactivateSubscription', {});
  return result.data as { success: boolean };
}

/**
 * Create billing portal session
 */
export async function createBillingPortalSession() {
  const result = await getFunctionsClient().callFunction('createCustomerPortalSession', {});
  return result.data as { url: string };
}

/**
 * Get addon information
 */
export async function getAddonInfo() {
  const result = await getFunctionsClient().callFunction('getAvailableAddons', {});
  return result.data as { 
    addons: Array<{
      type: AddonType;
      name: string;
      description: string;
      monthlyPrice: number;
      yearlyPrice: number;
      features: string[];
    }> 
  };
}

/**
 * Get pricing information
 */
export function getPricingInfo(): PricingInfo[] {
  return [
    {
      plan: SubscriptionPlan.FREE,
      monthlyPrice: 0,
      yearlyPrice: 0,
      storageGB: 5,
      features: [
        "5GB storage",
        "Up to 10 family members",
        "Basic photo sharing",
        "Family tree visualization",
        "Event calendar",
        "Mobile app access"
      ]
    },
    // Individual Plus (1TB)
    {
      plan: SubscriptionPlan.INDIVIDUAL,
      tier: SubscriptionTier.PLUS,
      monthlyPrice: 8,
      yearlyPrice: 80, // 20% discount
      storageGB: 1000,
      recommended: true,
      features: [
        "1TB secure storage",
        "Unlimited family members",
        "4K photo & video support",
        "Advanced family tree features",
        "Private stories & journals",
        "Collaborative albums",
        "Priority support",
        "No ads"
      ]
    },
    // Family 2.5TB (base tier)
    {
      plan: SubscriptionPlan.FAMILY,
      tier: SubscriptionTier.FAMILY_2_5TB,
      monthlyPrice: 25,
      yearlyPrice: 250,
      storageGB: 2500,
      familyMembers: 5,
      features: [
        "2.5TB shared storage",
        "Up to 5 premium accounts",
        "Everything in Plus",
        "Family vault for documents",
        "Shared family calendar",
        "Family group chat",
        "Admin controls"
      ]
    },
    // Family 7.5TB (high tier)
    {
      plan: SubscriptionPlan.FAMILY,
      tier: SubscriptionTier.FAMILY_7_5TB,
      monthlyPrice: 60,
      yearlyPrice: 600,
      storageGB: 7500,
      familyMembers: 5,
      features: [
        "7.5TB shared storage",
        "Everything in 2.5TB plus",
        "Priority support",
        "Extended video length",
        "Early access to new features"
      ]
    },
    // Family 12TB (enterprise tier)
    {
      plan: SubscriptionPlan.FAMILY,
      tier: SubscriptionTier.FAMILY_12TB,
      monthlyPrice: 100,
      yearlyPrice: 1000,
      storageGB: 12000,
      familyMembers: 5,
      features: [
        "12TB shared storage",
        "Dedicated account manager",
        "Priority support",
        "Unlimited video length",
        "All enterprise features"
      ]
    }
  ];
}

/**
 * Format price for display
 */
export function formatPrice(price: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: price % 1 === 0 ? 0 : 2,
  }).format(price);
}

/**
 * Calculate savings percentage
 */
export function calculateSavings(monthlyPrice: number, yearlyPrice: number): number {
  const yearlyEquivalent = monthlyPrice * 12;
  const savings = yearlyEquivalent - yearlyPrice;
  return Math.round((savings / yearlyEquivalent) * 100);
}