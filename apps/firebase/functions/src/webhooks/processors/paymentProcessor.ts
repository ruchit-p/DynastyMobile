import {logger} from "firebase-functions/v2";
import Stripe from "stripe";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {WebhookProcessorResult} from "../stripeWebhookHandler";
import {SubscriptionService} from "../../services/subscriptionService";
import {SubscriptionStatus} from "../../types/subscription";

export class PaymentWebhookProcessor {
  private db = getFirestore();
  private subscriptionService: SubscriptionService;

  constructor() {
    this.subscriptionService = new SubscriptionService();
  }

  /**
   * Process payment-related webhook events
   */
  async processEvent(event: Stripe.Event): Promise<WebhookProcessorResult> {
    try {
      const invoice = event.data.object as Stripe.Invoice;

      switch (event.type) {
      case "invoice.payment_succeeded":
        return await this.handlePaymentSucceeded(invoice);

      case "invoice.payment_failed":
        return await this.handlePaymentFailed(invoice);

      case "invoice.payment_action_required":
        return await this.handlePaymentActionRequired(invoice);

      case "invoice.upcoming":
        return await this.handleUpcomingInvoice(invoice);

      case "invoice.finalized":
        return await this.handleInvoiceFinalized(invoice);

      default:
        return {
          success: true,
          message: `Unhandled payment event: ${event.type}`,
        };
      }
    } catch (error) {
      logger.error("Payment webhook processing error", {
        eventType: event.type,
        eventId: event.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<WebhookProcessorResult> {
    try {
      const subscriptionId = typeof (invoice as any).subscription === "string" ?
        (invoice as any).subscription :
        (invoice as any).subscription?.id;

      if (!subscriptionId) {
        // One-time payment, not a subscription
        return {
          success: true,
          message: "One-time payment processed",
        };
      }

      // Create payment record
      await this.createPaymentRecord({
        invoiceId: invoice.id!,
        subscriptionId: subscriptionId!,
        customerId: typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id || ""),
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: "succeeded",
        paidAt: invoice.status_transitions.paid_at ?
          new Date(invoice.status_transitions.paid_at * 1000) :
          new Date(),
      });

      // Update subscription if it was past due
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (subscription && subscription.status === SubscriptionStatus.PAST_DUE) {
        await this.subscriptionService.updateSubscription({
          subscriptionId: subscriptionId!,
          status: SubscriptionStatus.ACTIVE,
        });
      }

      // Send payment confirmation notification
      if (subscription) {
        await this.db.collection("notifications").add({
          userId: subscription.userId,
          type: "payment_succeeded",
          title: "Payment successful",
          message: `Your payment of ${this.formatAmount(invoice.amount_paid, invoice.currency)} has been processed successfully.`,
          data: {
            invoiceId: invoice.id!,
            amount: invoice.amount_paid,
            currency: invoice.currency,
          },
          read: false,
          createdAt: Timestamp.now(),
        });
      }

      logger.info("Payment succeeded", {
        invoiceId: invoice.id!,
        subscriptionId: subscriptionId!,
        amount: invoice.amount_paid,
      });

      return {
        success: true,
        message: "Payment processed successfully",
      };
    } catch (error) {
      logger.error("Failed to handle payment succeeded", {
        invoiceId: invoice.id!,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<WebhookProcessorResult> {
    try {
      const subscriptionId = typeof (invoice as any).subscription === "string" ?
        (invoice as any).subscription :
        (invoice as any).subscription?.id;

      if (!subscriptionId) {
        return {
          success: true,
          message: "One-time payment failure handled",
        };
      }

      const attemptCount = invoice.attempt_count;

      // Create payment record
      await this.createPaymentRecord({
        invoiceId: invoice.id!,
        subscriptionId: subscriptionId!,
        customerId: typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id || ""),
        amount: invoice.amount_due,
        currency: invoice.currency,
        status: "failed",
        failureReason: invoice.last_finalization_error?.message,
        attemptCount,
      });

      // Get subscription
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) {
        logger.error("Subscription not found for failed payment", {subscriptionId});
        return {
          success: false,
          error: new Error("Subscription not found"),
        };
      }

      // Update subscription status based on retry attempts
      if (attemptCount >= 3) {
        // After 3 attempts, mark as unpaid
        await this.subscriptionService.updateSubscription({
          subscriptionId: subscriptionId!,
          status: SubscriptionStatus.UNPAID,
        });
      } else {
        // Mark as past due for first few attempts
        await this.subscriptionService.updateSubscription({
          subscriptionId: subscriptionId!,
          status: SubscriptionStatus.PAST_DUE,
        });
      }

      // Send payment failure notification
      await this.db.collection("notifications").add({
        userId: subscription.userId,
        type: "payment_failed",
        title: "Payment failed",
        message: attemptCount >= 3 ?
          "Your subscription has been suspended due to payment failures. Please update your payment method." :
          `Payment failed. We'll retry in ${this.getRetryTimeframe(attemptCount)}. Please ensure your payment method is valid.`,
        data: {
          invoiceId: invoice.id!,
          amount: invoice.amount_due,
          currency: invoice.currency,
          attemptCount,
          nextRetry: invoice.next_payment_attempt ?
            new Date(invoice.next_payment_attempt * 1000) :
            null,
        },
        priority: "high",
        read: false,
        createdAt: Timestamp.now(),
      });

      logger.warn("Payment failed", {
        invoiceId: invoice.id!,
        subscriptionId: subscriptionId!,
        attemptCount,
      });

      return {
        success: true,
        message: "Payment failure handled",
      };
    } catch (error) {
      logger.error("Failed to handle payment failed", {
        invoiceId: invoice.id!,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle payment action required (3D Secure, etc.)
   */
  private async handlePaymentActionRequired(invoice: Stripe.Invoice): Promise<WebhookProcessorResult> {
    try {
      const subscriptionId = typeof (invoice as any).subscription === "string" ?
        (invoice as any).subscription :
        (invoice as any).subscription?.id;

      if (!subscriptionId) {
        return {
          success: true,
          message: "Payment action required handled",
        };
      }

      const subscription = await this.subscriptionService.getSubscription(subscriptionId);

      if (!subscription) {
        return {
          success: false,
          error: new Error("Subscription not found"),
        };
      }

      // Send notification to complete payment
      await this.db.collection("notifications").add({
        userId: subscription.userId,
        type: "payment_action_required",
        title: "Action required for payment",
        message: "Your payment requires additional verification. Please complete the payment process to continue your subscription.",
        data: {
          invoiceId: invoice.id!,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
        },
        priority: "high",
        read: false,
        createdAt: Timestamp.now(),
      });

      logger.info("Payment action required", {
        invoiceId: invoice.id!,
        subscriptionId: subscriptionId!,
      });

      return {
        success: true,
        message: "Payment action notification sent",
      };
    } catch (error) {
      logger.error("Failed to handle payment action required", {
        invoiceId: invoice.id!,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle upcoming invoice (send reminder)
   */
  private async handleUpcomingInvoice(invoice: Stripe.Invoice): Promise<WebhookProcessorResult> {
    try {
      const subscriptionId = typeof (invoice as any).subscription === "string" ?
        (invoice as any).subscription :
        (invoice as any).subscription?.id;

      if (!subscriptionId) {
        return {
          success: true,
          message: "Upcoming invoice handled",
        };
      }

      const subscription = await this.subscriptionService.getSubscription(subscriptionId);

      if (!subscription) {
        return {
          success: false,
          error: new Error("Subscription not found"),
        };
      }

      // Calculate days until payment
      const daysUntilPayment = Math.ceil(
        ((invoice.next_payment_attempt || 0) * 1000 - Date.now()) / (1000 * 60 * 60 * 24)
      );

      // Send upcoming payment notification
      await this.db.collection("notifications").add({
        userId: subscription.userId,
        type: "upcoming_payment",
        title: "Upcoming payment",
        message: `Your next payment of ${this.formatAmount(invoice.amount_due, invoice.currency)} will be processed in ${daysUntilPayment} days.`,
        data: {
          invoiceId: invoice.id!,
          amount: invoice.amount_due,
          currency: invoice.currency,
          paymentDate: invoice.next_payment_attempt ?
            new Date(invoice.next_payment_attempt * 1000) :
            null,
        },
        read: false,
        createdAt: Timestamp.now(),
      });

      logger.info("Upcoming invoice notification sent", {
        invoiceId: invoice.id!,
        subscriptionId: subscriptionId!,
        daysUntilPayment,
      });

      return {
        success: true,
        message: "Upcoming invoice notification sent",
      };
    } catch (error) {
      logger.error("Failed to handle upcoming invoice", {
        invoiceId: invoice.id!,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle invoice finalized
   */
  private async handleInvoiceFinalized(invoice: Stripe.Invoice): Promise<WebhookProcessorResult> {
    try {
      logger.info("Invoice finalized", {
        invoiceId: invoice.id!,
        subscriptionId: (invoice as any).subscription,
      });

      // Store invoice details for record keeping
      const finalSubscriptionId = typeof (invoice as any).subscription === "string" ?
        (invoice as any).subscription :
        (invoice as any).subscription?.id;
      if (finalSubscriptionId) {
        await this.db.collection("invoices").doc(invoice.id!).set({
          invoiceId: invoice.id!,
          subscriptionId: finalSubscriptionId!,
          customerId: invoice.customer,
          amount: invoice.amount_due,
          currency: invoice.currency,
          status: invoice.status,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
          invoicePdf: invoice.invoice_pdf,
          periodStart: invoice.period_start ?
            Timestamp.fromDate(new Date(invoice.period_start * 1000)) :
            null,
          periodEnd: invoice.period_end ?
            Timestamp.fromDate(new Date(invoice.period_end * 1000)) :
            null,
          createdAt: Timestamp.now(),
        });
      }

      return {
        success: true,
        message: "Invoice finalized and stored",
      };
    } catch (error) {
      logger.error("Failed to handle invoice finalized", {
        invoiceId: invoice.id!,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Create payment record in database
   */
  private async createPaymentRecord(data: {
    invoiceId: string;
    subscriptionId: string;
    customerId: string;
    amount: number;
    currency: string;
    status: "succeeded" | "failed";
    paidAt?: Date;
    failureReason?: string;
    attemptCount?: number;
  }): Promise<void> {
    await this.db.collection("payments").add({
      ...data,
      paidAt: data.paidAt ? Timestamp.fromDate(data.paidAt) : null,
      createdAt: Timestamp.now(),
    });
  }

  /**
   * Format amount for display
   */
  private formatAmount(amountInCents: number, currency: string): string {
    const amount = amountInCents / 100;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  }

  /**
   * Get retry timeframe based on attempt count
   */
  private getRetryTimeframe(attemptCount: number): string {
    switch (attemptCount) {
    case 1:
      return "3 days";
    case 2:
      return "5 days";
    case 3:
      return "7 days";
    default:
      return "a few days";
    }
  }
}
