import {logger} from "firebase-functions/v2";
import Stripe from "stripe";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {WebhookProcessorResult} from "../stripeWebhookHandler";

export class CustomerWebhookProcessor {
  private db = getFirestore();

  /**
   * Process customer-related webhook events
   */
  async processEvent(event: Stripe.Event): Promise<WebhookProcessorResult> {
    try {
      const customer = event.data.object as Stripe.Customer;

      switch (event.type) {
      case "customer.created":
        return await this.handleCustomerCreated(customer);

      case "customer.updated":
        return await this.handleCustomerUpdated(customer);

      case "customer.deleted":
        return await this.handleCustomerDeleted(customer);

      default:
        return {
          success: true,
          message: `Unhandled customer event: ${event.type}`,
        };
      }
    } catch (error) {
      logger.error("Customer webhook processing error", {
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
   * Process payment method events
   */
  async processPaymentMethodEvent(event: Stripe.Event): Promise<WebhookProcessorResult> {
    try {
      const paymentMethod = event.data.object as Stripe.PaymentMethod;

      switch (event.type) {
      case "payment_method.attached":
        return await this.handlePaymentMethodAttached(paymentMethod);

      case "payment_method.detached":
        return await this.handlePaymentMethodDetached(paymentMethod);

      case "payment_method.updated":
        return await this.handlePaymentMethodUpdated(paymentMethod);

      default:
        return {
          success: true,
          message: `Unhandled payment method event: ${event.type}`,
        };
      }
    } catch (error) {
      logger.error("Payment method webhook processing error", {
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
   * Handle customer created
   */
  private async handleCustomerCreated(customer: Stripe.Customer): Promise<WebhookProcessorResult> {
    try {
      const userId = customer.metadata.userId || customer.metadata.firebaseUid;

      if (!userId) {
        logger.warn("Customer created without userId", {
          customerId: customer.id,
        });
        return {
          success: true,
          message: "Customer created but no userId to link",
        };
      }

      // Update user document with Stripe customer ID
      await this.db.collection("users").doc(userId).update({
        stripeCustomerId: customer.id,
        updatedAt: Timestamp.now(),
      });

      logger.info("Customer created and linked", {
        customerId: customer.id,
        userId,
      });

      return {
        success: true,
        message: "Customer created successfully",
      };
    } catch (error) {
      logger.error("Failed to handle customer created", {
        customerId: customer.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle customer updated
   */
  private async handleCustomerUpdated(customer: Stripe.Customer): Promise<WebhookProcessorResult> {
    try {
      const userId = customer.metadata.userId || customer.metadata.firebaseUid;

      if (!userId) {
        return {
          success: true,
          message: "Customer updated but no userId to update",
        };
      }

      // Update relevant customer information
      const updates: any = {
        updatedAt: Timestamp.now(),
      };

      // Update email if changed
      if (customer.email) {
        const userDoc = await this.db.collection("users").doc(userId).get();
        const currentEmail = userDoc.data()?.email;

        if (currentEmail !== customer.email) {
          logger.warn("Customer email differs from user email", {
            customerId: customer.id,
            customerEmail: customer.email,
            userEmail: currentEmail,
          });
          // Note: We don't update the email automatically as it might
          // need additional verification
        }
      }

      // Store payment method info if available
      if (customer.invoice_settings?.default_payment_method) {
        updates.defaultPaymentMethod = customer.invoice_settings.default_payment_method;
      }

      await this.db.collection("users").doc(userId).update(updates);

      logger.info("Customer updated", {
        customerId: customer.id,
        userId,
      });

      return {
        success: true,
        message: "Customer updated successfully",
      };
    } catch (error) {
      logger.error("Failed to handle customer updated", {
        customerId: customer.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle customer deleted
   */
  private async handleCustomerDeleted(customer: Stripe.Customer): Promise<WebhookProcessorResult> {
    try {
      const userId = customer.metadata.userId || customer.metadata.firebaseUid;

      if (!userId) {
        return {
          success: true,
          message: "Customer deleted but no userId to update",
        };
      }

      // Remove Stripe customer ID from user
      await this.db.collection("users").doc(userId).update({
        stripeCustomerId: null,
        defaultPaymentMethod: null,
        updatedAt: Timestamp.now(),
      });

      logger.info("Customer deleted", {
        customerId: customer.id,
        userId,
      });

      return {
        success: true,
        message: "Customer deleted successfully",
      };
    } catch (error) {
      logger.error("Failed to handle customer deleted", {
        customerId: customer.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle payment method attached
   */
  private async handlePaymentMethodAttached(
    paymentMethod: Stripe.PaymentMethod
  ): Promise<WebhookProcessorResult> {
    try {
      if (!paymentMethod.customer) {
        return {
          success: true,
          message: "Payment method not attached to customer",
        };
      }

      const customerId = paymentMethod.customer as string;

      // Store payment method information
      await this.db.collection("paymentMethods").doc(paymentMethod.id).set({
        paymentMethodId: paymentMethod.id,
        customerId,
        type: paymentMethod.type,
        card: paymentMethod.card ? {
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          expMonth: paymentMethod.card.exp_month,
          expYear: paymentMethod.card.exp_year,
        } : null,
        createdAt: Timestamp.now(),
      });

      // Get user ID from customer
      const customerSnapshot = await this.db.collection("users")
        .where("stripeCustomerId", "==", customerId)
        .limit(1)
        .get();

      if (!customerSnapshot.empty) {
        const userId = customerSnapshot.docs[0].id;

        // Send notification about new payment method
        await this.db.collection("notifications").add({
          userId,
          type: "payment_method_added",
          title: "Payment method added",
          message: `A new ${paymentMethod.type} ending in ${paymentMethod.card?.last4} has been added to your account.`,
          data: {
            paymentMethodId: paymentMethod.id,
            type: paymentMethod.type,
            last4: paymentMethod.card?.last4,
          },
          read: false,
          createdAt: Timestamp.now(),
        });
      }

      logger.info("Payment method attached", {
        paymentMethodId: paymentMethod.id,
        customerId,
      });

      return {
        success: true,
        message: "Payment method attached successfully",
      };
    } catch (error) {
      logger.error("Failed to handle payment method attached", {
        paymentMethodId: paymentMethod.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle payment method detached
   */
  private async handlePaymentMethodDetached(
    paymentMethod: Stripe.PaymentMethod
  ): Promise<WebhookProcessorResult> {
    try {
      // Mark payment method as detached
      const paymentMethodRef = this.db.collection("paymentMethods").doc(paymentMethod.id);
      const doc = await paymentMethodRef.get();

      if (doc.exists) {
        await paymentMethodRef.update({
          detachedAt: Timestamp.now(),
          status: "detached",
        });
      }

      logger.info("Payment method detached", {
        paymentMethodId: paymentMethod.id,
      });

      return {
        success: true,
        message: "Payment method detached successfully",
      };
    } catch (error) {
      logger.error("Failed to handle payment method detached", {
        paymentMethodId: paymentMethod.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Handle payment method updated
   */
  private async handlePaymentMethodUpdated(
    paymentMethod: Stripe.PaymentMethod
  ): Promise<WebhookProcessorResult> {
    try {
      const paymentMethodRef = this.db.collection("paymentMethods").doc(paymentMethod.id);
      const doc = await paymentMethodRef.get();

      if (doc.exists) {
        const updates: any = {
          updatedAt: Timestamp.now(),
        };

        // Update card details if changed
        if (paymentMethod.card) {
          updates.card = {
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            expMonth: paymentMethod.card.exp_month,
            expYear: paymentMethod.card.exp_year,
          };
        }

        await paymentMethodRef.update(updates);
      }

      logger.info("Payment method updated", {
        paymentMethodId: paymentMethod.id,
      });

      return {
        success: true,
        message: "Payment method updated successfully",
      };
    } catch (error) {
      logger.error("Failed to handle payment method updated", {
        paymentMethodId: paymentMethod.id,
        error,
      });
      return {
        success: false,
        error: error as Error,
      };
    }
  }
}
