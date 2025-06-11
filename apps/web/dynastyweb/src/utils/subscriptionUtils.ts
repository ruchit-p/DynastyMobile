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
  const result = await getFunctionsClient().callFunction('createCheckoutSession', params);
  return result.data as { sessionId: string; url: string };
}

/**
 * Get subscription details for the current user
 */
export async function getSubscriptionDetails() {
  const result = await getFunctionsClient().callFunction('getSubscriptionStatus', {});
  return result.data as { subscription: SubscriptionDetails | null };
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
    {
      plan: SubscriptionPlan.INDIVIDUAL,
      tier: SubscriptionTier.BASIC,
      monthlyPrice: 9.99,
      yearlyPrice: 99,
      storageGB: 50,
      features: [
        "50GB storage",
        "Unlimited family members",
        "HD photo & video sharing",
        "Advanced family tree features",
        "Private stories & journals",
        "Collaborative albums",
        "Priority support",
        "No ads"
      ]
    },
    {
      plan: SubscriptionPlan.INDIVIDUAL,
      tier: SubscriptionTier.PREMIUM,
      monthlyPrice: 19.99,
      yearlyPrice: 199,
      storageGB: 200,
      recommended: true,
      features: [
        "200GB storage",
        "Everything in Basic",
        "4K video support",
        "AI-powered photo organization",
        "Advanced privacy controls",
        "Family history reports",
        "Professional printing discounts",
        "Early access to new features"
      ]
    },
    {
      plan: SubscriptionPlan.FAMILY,
      monthlyPrice: 29.99,
      yearlyPrice: 299,
      storageGB: 500,
      familyMembers: 6,
      features: [
        "500GB shared storage",
        "Up to 6 premium accounts",
        "Everything in Premium",
        "Family vault for documents",
        "Shared family calendar",
        "Family group chat",
        "Admin controls",
        "Bulk export tools",
        "Dedicated account manager"
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