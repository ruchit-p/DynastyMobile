import {logger} from "firebase-functions/v2";
import {SESService} from "./sesService";
import {
  SubscriptionPlan,
  SubscriptionTier,
  SubscriptionAddon,
} from "../types/subscription";
import {defineSecret} from "firebase-functions/params";

// Define secrets for AWS SES configuration
const awsAccessKeyId = defineSecret("AWS_ACCESS_KEY_ID");
const awsSecretAccessKey = defineSecret("AWS_SECRET_ACCESS_KEY");
const awsRegion = defineSecret("AWS_REGION");

/**
 * Email templates for subscription-related emails
 */
export enum SubscriptionEmailTemplate {
  CHECKOUT_STARTED = "dynasty-checkout-started",
  SUBSCRIPTION_CONFIRMED = "dynasty-subscription-confirmed",
  SUBSCRIPTION_RENEWED = "dynasty-subscription-renewed",
  SUBSCRIPTION_CANCELLED = "dynasty-subscription-cancelled",
  SUBSCRIPTION_EXPIRED = "dynasty-subscription-expired",
  PAYMENT_FAILED = "dynasty-payment-failed",
  FAMILY_MEMBER_ADDED = "dynasty-family-member-added",
  FAMILY_MEMBER_REMOVED = "dynasty-family-member-removed",
  FAMILY_MEMBER_INVITE = "dynasty-family-member-invite",
  ADDON_ACTIVATED = "dynasty-addon-activated",
  ADDON_REMOVED = "dynasty-addon-removed",
}

interface CheckoutEmailData {
  to: string;
  sessionId: string;
  checkoutUrl: string;
  planName: string;
  interval: string;
  price: string;
}

interface SubscriptionEmailData {
  to: string;
  userName?: string;
  planName: string;
  interval: string;
  price: string;
  nextBillingDate?: string;
  features?: string[];
}

interface FamilyMemberEmailData {
  to: string;
  memberName: string;
  ownerName: string;
  action: "added" | "removed" | "invited";
  inviteLink?: string;
}

interface AddonEmailData {
  to: string;
  addonName: string;
  addonType: string;
  price: string;
  action: "activated" | "removed";
}

/**
 * Service for sending subscription-related emails
 */
export class SubscriptionEmailService {
  private sesService: SESService | null = null;
  private initialized = false;

  /**
   * Initialize SES service with configuration
   */
  private async initializeSES(): Promise<void> {
    if (this.initialized) return;

    try {
      const region = awsRegion.value() || "us-east-1";
      const fromEmail = process.env.SES_FROM_EMAIL || "noreply@dynastyapp.com";
      const fromName = process.env.SES_FROM_NAME || "Dynasty";

      this.sesService = new SESService({
        region,
        accessKeyId: process.env.NODE_ENV === "production" ? undefined : awsAccessKeyId.value(),
        secretAccessKey: process.env.NODE_ENV === "production" ? undefined : awsSecretAccessKey.value(),
        fromEmail,
        fromName,
      });

      this.initialized = true;
    } catch (error) {
      logger.error("Failed to initialize SES service", {error});
      throw error;
    }
  }

  /**
   * Send checkout confirmation email
   */
  async sendCheckoutConfirmation(data: CheckoutEmailData): Promise<void> {
    await this.initializeSES();
    
    if (!this.sesService) {
      logger.error("SES service not initialized");
      return;
    }

    try {
      await this.sesService.sendTemplatedEmail({
        to: data.to,
        template: SubscriptionEmailTemplate.CHECKOUT_STARTED,
        templateData: {
          checkoutUrl: data.checkoutUrl,
          planName: data.planName,
          interval: data.interval,
          price: data.price,
          sessionId: data.sessionId,
        },
        emailType: "transactional",
        allowSuppressionOverride: true,
      });

      logger.info("Checkout confirmation email sent", {
        to: data.to,
        sessionId: data.sessionId,
      });
    } catch (error) {
      logger.error("Failed to send checkout confirmation email", {
        to: data.to,
        error,
      });
      throw error;
    }
  }

  /**
   * Send subscription confirmation email
   */
  async sendSubscriptionConfirmation(data: SubscriptionEmailData): Promise<void> {
    await this.initializeSES();
    
    if (!this.sesService) {
      logger.error("SES service not initialized");
      return;
    }

    try {
      await this.sesService.sendTemplatedEmail({
        to: data.to,
        template: SubscriptionEmailTemplate.SUBSCRIPTION_CONFIRMED,
        templateData: {
          userName: data.userName || "Valued Customer",
          planName: data.planName,
          interval: data.interval,
          price: data.price,
          nextBillingDate: data.nextBillingDate,
          features: data.features?.join(", ") || "",
        },
        emailType: "transactional",
        allowSuppressionOverride: true,
      });

      logger.info("Subscription confirmation email sent", {to: data.to});
    } catch (error) {
      logger.error("Failed to send subscription confirmation email", {
        to: data.to,
        error,
      });
      throw error;
    }
  }

  /**
   * Send family member notification email
   */
  async sendFamilyMemberNotification(data: FamilyMemberEmailData): Promise<void> {
    await this.initializeSES();
    
    if (!this.sesService) {
      logger.error("SES service not initialized");
      return;
    }

    const template = data.action === "invited" 
      ? SubscriptionEmailTemplate.FAMILY_MEMBER_INVITE
      : data.action === "added"
      ? SubscriptionEmailTemplate.FAMILY_MEMBER_ADDED
      : SubscriptionEmailTemplate.FAMILY_MEMBER_REMOVED;

    try {
      await this.sesService.sendTemplatedEmail({
        to: data.to,
        template,
        templateData: {
          memberName: data.memberName,
          ownerName: data.ownerName,
          inviteLink: data.inviteLink || "",
        },
        emailType: "transactional",
        allowSuppressionOverride: true,
      });

      logger.info("Family member notification email sent", {
        to: data.to,
        action: data.action,
      });
    } catch (error) {
      logger.error("Failed to send family member notification email", {
        to: data.to,
        action: data.action,
        error,
      });
      throw error;
    }
  }

  /**
   * Send addon notification email
   */
  async sendAddonNotification(data: AddonEmailData): Promise<void> {
    await this.initializeSES();
    
    if (!this.sesService) {
      logger.error("SES service not initialized");
      return;
    }

    const template = data.action === "activated"
      ? SubscriptionEmailTemplate.ADDON_ACTIVATED
      : SubscriptionEmailTemplate.ADDON_REMOVED;

    try {
      await this.sesService.sendTemplatedEmail({
        to: data.to,
        template,
        templateData: {
          addonName: data.addonName,
          addonType: data.addonType,
          price: data.price,
        },
        emailType: "transactional",
        allowSuppressionOverride: true,
      });

      logger.info("Addon notification email sent", {
        to: data.to,
        action: data.action,
      });
    } catch (error) {
      logger.error("Failed to send addon notification email", {
        to: data.to,
        action: data.action,
        error,
      });
      throw error;
    }
  }

  /**
   * Get plan display name
   */
  private getPlanDisplayName(plan: SubscriptionPlan, tier?: SubscriptionTier): string {
    if (plan === SubscriptionPlan.INDIVIDUAL) {
      return tier === SubscriptionTier.PREMIUM ? "Individual Premium" : "Individual Basic";
    } else if (plan === SubscriptionPlan.FAMILY) {
      return tier === SubscriptionTier.PREMIUM ? "Family Premium" : "Family Basic";
    }
    return "Free";
  }

  /**
   * Format price for display
   */
  private formatPrice(amount: number, interval: string): string {
    const price = (amount / 100).toFixed(2);
    return `$${price}/${interval === "year" ? "year" : "month"}`;
  }

  /**
   * Get plan features list
   */
  private getPlanFeatures(plan: SubscriptionPlan, tier?: SubscriptionTier): string[] {
    const features = [];
    
    if (plan === SubscriptionPlan.INDIVIDUAL) {
      features.push("5GB storage", "Unlimited family members", "Premium features");
      if (tier === SubscriptionTier.PREMIUM) {
        features.push("50GB storage", "Priority support", "Advanced analytics");
      }
    } else if (plan === SubscriptionPlan.FAMILY) {
      features.push("10GB shared storage", "Up to 10 members", "Family collaboration");
      if (tier === SubscriptionTier.PREMIUM) {
        features.push("100GB shared storage", "Up to 50 members", "Priority support");
      }
    }
    
    return features;
  }
}