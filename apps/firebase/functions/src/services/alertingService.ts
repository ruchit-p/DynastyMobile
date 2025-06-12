import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { subscriptionAnalyticsService } from './subscriptionAnalyticsService';
import { technicalMonitoringService } from './technicalMonitoringService';

/**
 * Comprehensive alerting service for Dynasty Stripe integration
 * Monitors business and technical metrics, triggers alerts based on thresholds
 */

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  category: 'business' | 'technical' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;

  // Alert conditions
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'contains' | 'not_contains';
  threshold: number | string;
  evaluationWindow: number; // minutes

  // Alert behavior
  cooldownPeriod: number; // minutes
  maxAlertsPerDay: number;
  escalationRules?: EscalationRule[];

  // Notification settings
  notificationChannels: AlertChannel[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastTriggered?: Date;
  triggerCount: number;
}

export interface EscalationRule {
  afterMinutes: number;
  channels: AlertChannel[];
  severity: 'medium' | 'high' | 'critical';
}

export interface AlertChannel {
  type: 'email' | 'slack' | 'webhook' | 'sms' | 'discord';
  target: string; // email address, webhook URL, etc.
  enabled: boolean;
  metadata?: Record<string, any>;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  category: 'business' | 'technical' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'acknowledged' | 'resolved' | 'suppressed';

  // Alert details
  title: string;
  description: string;
  metric: string;
  currentValue: number | string;
  threshold: number | string;

  // Context data
  contextData: Record<string, any>;

  // Timeline
  triggeredAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  acknowledgedBy?: string;
  resolvedBy?: string;

  // Notifications
  notificationsSent: Array<{
    channel: string;
    sentAt: Date;
    status: 'sent' | 'failed';
    error?: string;
  }>;

  // Escalations
  escalations: Array<{
    level: number;
    triggeredAt: Date;
    channels: string[];
  }>;
}

export interface AlertingMetrics {
  period: { start: Date; end: Date };
  totalAlerts: number;
  alertsByCategory: Record<string, number>;
  alertsBySeverity: Record<string, number>;
  responseMetrics: {
    averageAcknowledgmentTime: number;
    averageResolutionTime: number;
    acknowledgedPercentage: number;
    resolvedPercentage: number;
  };
  topAlerts: Array<{
    ruleName: string;
    count: number;
    category: string;
  }>;
  escalationMetrics: {
    totalEscalations: number;
    escalationsByLevel: Record<number, number>;
  };
}

export class AlertingService {
  private db = getFirestore();
  private readonly ALERT_RULES_COLLECTION = 'alertRules';
  private readonly ALERTS_COLLECTION = 'alerts';

  // Default alert rules for Stripe integration
  private readonly DEFAULT_ALERT_RULES: Partial<AlertRule>[] = [
    // Business metric alerts
    {
      name: 'High Churn Rate',
      description: 'Monthly churn rate exceeds 5%',
      category: 'business',
      severity: 'high',
      metric: 'churn_rate',
      operator: '>',
      threshold: 5,
      evaluationWindow: 60,
      cooldownPeriod: 240,
      maxAlertsPerDay: 3,
    },
    {
      name: 'Revenue Drop',
      description: 'MRR decreased by more than 10% month-over-month',
      category: 'business',
      severity: 'critical',
      metric: 'mrr_change',
      operator: '<',
      threshold: -10,
      evaluationWindow: 60,
      cooldownPeriod: 60,
      maxAlertsPerDay: 2,
    },
    {
      name: 'Low Conversion Rate',
      description: 'Checkout conversion rate below 2%',
      category: 'business',
      severity: 'medium',
      metric: 'conversion_rate',
      operator: '<',
      threshold: 2,
      evaluationWindow: 120,
      cooldownPeriod: 180,
      maxAlertsPerDay: 4,
    },

    // Technical alerts
    {
      name: 'Webhook Failures',
      description: 'Webhook failure rate exceeds 5%',
      category: 'technical',
      severity: 'high',
      metric: 'webhook_failure_rate',
      operator: '>',
      threshold: 5,
      evaluationWindow: 30,
      cooldownPeriod: 60,
      maxAlertsPerDay: 5,
    },
    {
      name: 'Slow API Response',
      description: 'API P95 response time exceeds 2 seconds',
      category: 'technical',
      severity: 'medium',
      metric: 'api_p95_response_time',
      operator: '>',
      threshold: 2000,
      evaluationWindow: 15,
      cooldownPeriod: 30,
      maxAlertsPerDay: 10,
    },
    {
      name: 'High Error Rate',
      description: 'API error rate exceeds 5%',
      category: 'technical',
      severity: 'high',
      metric: 'api_error_rate',
      operator: '>',
      threshold: 5,
      evaluationWindow: 15,
      cooldownPeriod: 30,
      maxAlertsPerDay: 8,
    },
    {
      name: 'Storage Calculation Timeout',
      description: 'Storage calculations taking longer than 10 seconds',
      category: 'technical',
      severity: 'medium',
      metric: 'storage_calc_time',
      operator: '>',
      threshold: 10000,
      evaluationWindow: 30,
      cooldownPeriod: 60,
      maxAlertsPerDay: 6,
    },

    // Security alerts
    {
      name: 'Unusual Payment Failures',
      description: 'Payment failure rate exceeds 20%',
      category: 'security',
      severity: 'high',
      metric: 'payment_failure_rate',
      operator: '>',
      threshold: 20,
      evaluationWindow: 30,
      cooldownPeriod: 60,
      maxAlertsPerDay: 3,
    },
    {
      name: 'Suspicious Signup Activity',
      description: 'Unusual spike in trial signups',
      category: 'security',
      severity: 'medium',
      metric: 'trial_signup_rate',
      operator: '>',
      threshold: 200, // 200% of normal rate
      evaluationWindow: 60,
      cooldownPeriod: 120,
      maxAlertsPerDay: 2,
    },
  ];

  /**
   * Initialize alerting service with default rules
   */
  async initializeDefaultAlertRules(adminUserId: string): Promise<void> {
    try {
      logger.info('Initializing default alert rules');

      const defaultChannels: AlertChannel[] = [
        {
          type: 'email',
          target: 'admin@mydynastyapp.com',
          enabled: true,
        },
        // Add more channels as needed
      ];

      for (const ruleData of this.DEFAULT_ALERT_RULES) {
        const ruleId = `default_${ruleData.name?.toLowerCase().replace(/\s+/g, '_')}`;

        const rule: AlertRule = {
          id: ruleId,
          name: ruleData.name!,
          description: ruleData.description!,
          category: ruleData.category!,
          severity: ruleData.severity!,
          enabled: true,
          metric: ruleData.metric!,
          operator: ruleData.operator!,
          threshold: ruleData.threshold!,
          evaluationWindow: ruleData.evaluationWindow!,
          cooldownPeriod: ruleData.cooldownPeriod!,
          maxAlertsPerDay: ruleData.maxAlertsPerDay!,
          notificationChannels: defaultChannels,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: adminUserId,
          triggerCount: 0,
        };

        await this.createOrUpdateAlertRule(rule);
      }

      logger.info('Default alert rules initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize default alert rules', { error });
      throw error;
    }
  }

  /**
   * Create or update an alert rule
   */
  async createOrUpdateAlertRule(rule: AlertRule): Promise<void> {
    try {
      await this.db
        .collection(this.ALERT_RULES_COLLECTION)
        .doc(rule.id)
        .set({
          ...rule,
          createdAt: Timestamp.fromDate(rule.createdAt),
          updatedAt: Timestamp.fromDate(rule.updatedAt),
          lastTriggered: rule.lastTriggered ? Timestamp.fromDate(rule.lastTriggered) : null,
        });

      logger.info('Alert rule created/updated', {
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        severity: rule.severity,
      });
    } catch (error) {
      logger.error('Failed to create/update alert rule', { error, ruleId: rule.id });
      throw error;
    }
  }

  /**
   * Evaluate all enabled alert rules
   */
  async evaluateAlertRules(): Promise<Alert[]> {
    try {
      logger.info('Starting alert rule evaluation');

      // Get all enabled alert rules
      const rulesSnapshot = await this.db
        .collection(this.ALERT_RULES_COLLECTION)
        .where('enabled', '==', true)
        .get();

      const rules = rulesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as AlertRule[];

      const triggeredAlerts: Alert[] = [];

      // Evaluate each rule
      for (const rule of rules) {
        try {
          const shouldTrigger = await this.evaluateRule(rule);

          if (shouldTrigger.trigger) {
            // Check cooldown period
            const canTrigger = await this.checkCooldownPeriod(rule);

            if (canTrigger) {
              const alert = await this.triggerAlert(rule, shouldTrigger.context);
              triggeredAlerts.push(alert);
            }
          }
        } catch (error) {
          logger.error('Failed to evaluate alert rule', {
            error,
            ruleId: rule.id,
            ruleName: rule.name,
          });
        }
      }

      logger.info('Alert rule evaluation completed', {
        rulesEvaluated: rules.length,
        alertsTriggered: triggeredAlerts.length,
      });

      return triggeredAlerts;
    } catch (error) {
      logger.error('Failed to evaluate alert rules', { error });
      throw error;
    }
  }

  /**
   * Evaluate a specific alert rule
   */
  private async evaluateRule(rule: AlertRule): Promise<{ trigger: boolean; context?: any }> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - rule.evaluationWindow * 60 * 1000);

    try {
      switch (rule.metric) {
        case 'churn_rate':
          return await this.evaluateChurnRate(rule, startTime, endTime);

        case 'mrr_change':
          return await this.evaluateMRRChange(rule, startTime, endTime);

        case 'conversion_rate':
          return await this.evaluateConversionRate();

        case 'webhook_failure_rate':
          return await this.evaluateWebhookFailureRate(rule, startTime, endTime);

        case 'api_p95_response_time':
        case 'api_error_rate':
          return await this.evaluateAPIMetrics(rule, startTime, endTime);

        case 'storage_calc_time':
          return await this.evaluateStorageCalculationTime();

        case 'payment_failure_rate':
          return await this.evaluatePaymentFailureRate();

        default:
          logger.warn('Unknown metric for alert rule', {
            ruleId: rule.id,
            metric: rule.metric,
          });
          return { trigger: false };
      }
    } catch (error) {
      logger.error('Failed to evaluate rule metric', {
        error,
        ruleId: rule.id,
        metric: rule.metric,
      });
      return { trigger: false };
    }
  }

  /**
   * Evaluate churn rate metric
   */
  private async evaluateChurnRate(
    rule: AlertRule,
    startTime: Date,
    endTime: Date
  ): Promise<{ trigger: boolean; context?: any }> {
    const metrics = await subscriptionAnalyticsService.calculateSubscriptionMetrics(
      startTime,
      endTime
    );
    const currentValue = metrics.churnRate;

    const trigger = this.compareValues(currentValue, rule.operator, rule.threshold as number);

    return {
      trigger,
      context: {
        currentValue,
        threshold: rule.threshold,
        period: { start: startTime, end: endTime },
        additionalData: {
          totalSubscriptions: metrics.totalActiveSubscriptions,
          churnedSubscriptions: metrics.totalCanceledSubscriptions,
        },
      },
    };
  }

  /**
   * Evaluate MRR change metric
   */
  private async evaluateMRRChange(
    rule: AlertRule,
    startTime: Date,
    endTime: Date
  ): Promise<{ trigger: boolean; context?: any }> {
    // Get current period metrics
    const currentMetrics = await subscriptionAnalyticsService.calculateSubscriptionMetrics(
      startTime,
      endTime
    );

    // Get previous period metrics for comparison
    const previousStart = new Date(startTime.getTime() - (endTime.getTime() - startTime.getTime()));
    const previousEnd = startTime;
    const previousMetrics = await subscriptionAnalyticsService.calculateSubscriptionMetrics(
      previousStart,
      previousEnd
    );

    const changePercent =
      previousMetrics.monthlyRecurringRevenue > 0
        ? ((currentMetrics.monthlyRecurringRevenue - previousMetrics.monthlyRecurringRevenue) /
            previousMetrics.monthlyRecurringRevenue) *
          100
        : 0;

    const trigger = this.compareValues(changePercent, rule.operator, rule.threshold as number);

    return {
      trigger,
      context: {
        currentValue: changePercent,
        threshold: rule.threshold,
        currentMRR: currentMetrics.monthlyRecurringRevenue,
        previousMRR: previousMetrics.monthlyRecurringRevenue,
        period: { start: startTime, end: endTime },
      },
    };
  }

  /**
   * Evaluate technical metrics (webhooks, API, etc.)
   */
  private async evaluateWebhookFailureRate(
    rule: AlertRule,
    startTime: Date,
    endTime: Date
  ): Promise<{ trigger: boolean; context?: any }> {
    const healthMetrics = await technicalMonitoringService.generateTechnicalHealthReport(
      startTime,
      endTime
    );
    const failureRate = 100 - healthMetrics.webhookMetrics.successRate;

    const trigger = this.compareValues(failureRate, rule.operator, rule.threshold as number);

    return {
      trigger,
      context: {
        currentValue: failureRate,
        threshold: rule.threshold,
        totalWebhooks: healthMetrics.webhookMetrics.totalProcessed,
        period: { start: startTime, end: endTime },
      },
    };
  }

  /**
   * Evaluate API metrics
   */
  private async evaluateAPIMetrics(
    rule: AlertRule,
    startTime: Date,
    endTime: Date
  ): Promise<{ trigger: boolean; context?: any }> {
    const healthMetrics = await technicalMonitoringService.generateTechnicalHealthReport(
      startTime,
      endTime
    );

    let currentValue: number;
    let additionalContext: any = {};

    if (rule.metric === 'api_p95_response_time') {
      currentValue = healthMetrics.apiMetrics.p95ResponseTime;
      additionalContext = {
        averageResponseTime: healthMetrics.apiMetrics.averageResponseTime,
        totalRequests: healthMetrics.apiMetrics.totalRequests,
      };
    } else {
      // api_error_rate
      currentValue = healthMetrics.apiMetrics.errorRate;
      additionalContext = {
        totalRequests: healthMetrics.apiMetrics.totalRequests,
        statusCodeBreakdown: healthMetrics.apiMetrics.statusCodeBreakdown,
      };
    }

    const trigger = this.compareValues(currentValue, rule.operator, rule.threshold as number);

    return {
      trigger,
      context: {
        currentValue,
        threshold: rule.threshold,
        period: { start: startTime, end: endTime },
        ...additionalContext,
      },
    };
  }

  /**
   * Helper method to compare values based on operator
   */
  private compareValues(
    value: number | string,
    operator: string,
    threshold: number | string
  ): boolean {
    switch (operator) {
      case '>':
        return (value as number) > (threshold as number);
      case '<':
        return (value as number) < (threshold as number);
      case '>=':
        return (value as number) >= (threshold as number);
      case '<=':
        return (value as number) <= (threshold as number);
      case '==':
        return value === threshold;
      case '!=':
        return value !== threshold;
      case 'contains':
        return String(value).includes(String(threshold));
      case 'not_contains':
        return !String(value).includes(String(threshold));
      default:
        return false;
    }
  }

  /**
   * Check if alert can trigger based on cooldown period
   */
  private async checkCooldownPeriod(rule: AlertRule): Promise<boolean> {
    if (!rule.lastTriggered) return true;

    const cooldownEnd = new Date(rule.lastTriggered.getTime() + rule.cooldownPeriod * 60 * 1000);
    return new Date() > cooldownEnd;
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(rule: AlertRule, context: any): Promise<Alert> {
    const alertId = `alert_${rule.id}_${Date.now()}`;

    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      ruleName: rule.name,
      category: rule.category,
      severity: rule.severity,
      status: 'active',
      title: `${rule.name} Alert`,
      description: this.generateAlertDescription(rule, context),
      metric: rule.metric,
      currentValue: context.currentValue,
      threshold: context.threshold,
      contextData: context,
      triggeredAt: new Date(),
      notificationsSent: [],
      escalations: [],
    };

    // Store alert
    await this.db
      .collection(this.ALERTS_COLLECTION)
      .doc(alertId)
      .set({
        ...alert,
        triggeredAt: Timestamp.fromDate(alert.triggeredAt),
      });

    // Update rule's last triggered time
    await this.db
      .collection(this.ALERT_RULES_COLLECTION)
      .doc(rule.id)
      .update({
        lastTriggered: Timestamp.now(),
        triggerCount: FieldValue.increment(1),
      });

    // Send notifications
    await this.sendAlertNotifications(alert, rule.notificationChannels);

    logger.warn('Alert triggered', {
      alertId,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      currentValue: context.currentValue,
      threshold: context.threshold,
    });

    return alert;
  }

  /**
   * Generate alert description
   */
  private generateAlertDescription(rule: AlertRule, context: any): string {
    return `${rule.description}\n\nCurrent Value: ${context.currentValue}\nThreshold: ${context.threshold}\nTime Period: ${context.period?.start} to ${context.period?.end}`;
  }

  /**
   * Send alert notifications
   */
  private async sendAlertNotifications(alert: Alert, channels: AlertChannel[]): Promise<void> {
    for (const channel of channels.filter(c => c.enabled)) {
      try {
        await this.sendNotification(alert, channel);

        // Record successful notification
        await this.db
          .collection(this.ALERTS_COLLECTION)
          .doc(alert.id)
          .update({
            notificationsSent: FieldValue.arrayUnion({
              channel: channel.type,
              sentAt: Timestamp.now(),
              status: 'sent',
            }),
          });
      } catch (error) {
        logger.error('Failed to send alert notification', {
          error,
          alertId: alert.id,
          channel: channel.type,
        });

        // Record failed notification
        await this.db
          .collection(this.ALERTS_COLLECTION)
          .doc(alert.id)
          .update({
            notificationsSent: FieldValue.arrayUnion({
              channel: channel.type,
              sentAt: Timestamp.now(),
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            }),
          });
      }
    }
  }

  /**
   * Send notification to specific channel
   */
  private async sendNotification(alert: Alert, channel: AlertChannel): Promise<void> {
    // Implementation would depend on the channel type
    switch (channel.type) {
      case 'email':
        await this.sendEmailNotification(alert, channel);
        break;
      case 'slack':
        await this.sendSlackNotification(alert, channel);
        break;
      case 'webhook':
        await this.sendWebhookNotification(alert, channel);
        break;
      default:
        logger.warn('Unsupported notification channel', {
          channelType: channel.type,
          alertId: alert.id,
        });
    }
  }

  /**
   * Send email notification (implementation depends on email service)
   */
  private async sendEmailNotification(alert: Alert, channel: AlertChannel): Promise<void> {
    // This would integrate with your email service (SES, SendGrid, etc.)
    logger.info('Sending email notification', {
      alertId: alert.id,
      email: channel.target,
      subject: `${alert.severity.toUpperCase()}: ${alert.title}`,
    });
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(alert: Alert, channel: AlertChannel): Promise<void> {
    // This would integrate with Slack API
    logger.info('Sending Slack notification', {
      alertId: alert.id,
      webhook: channel.target,
    });
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(alert: Alert, channel: AlertChannel): Promise<void> {
    // This would send HTTP POST to webhook URL
    logger.info('Sending webhook notification', {
      alertId: alert.id,
      webhook: channel.target,
    });
  }

  // Additional methods for evaluating other metrics would be implemented similarly
  private async evaluateConversionRate(): Promise<{ trigger: boolean; context?: any }> {
    // Implementation for conversion rate evaluation
    return { trigger: false };
  }

  private async evaluateStorageCalculationTime(): Promise<{ trigger: boolean; context?: any }> {
    // Implementation for storage calculation time evaluation
    return { trigger: false };
  }

  private async evaluatePaymentFailureRate(): Promise<{ trigger: boolean; context?: any }> {
    // Implementation for payment failure rate evaluation
    return { trigger: false };
  }
}

// Export singleton instance
export const alertingService = new AlertingService();
