import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { createError, ErrorCode } from '../utils/errors';

/**
 * Comprehensive conversion tracking service for Dynasty Stripe integration
 * Tracks user journey: pricing page → checkout → payment → subscription
 */

export interface ConversionEvent {
  id?: string;
  sessionId: string;
  userId?: string;
  eventType: ConversionEventType;
  timestamp: Date;

  // Event context
  deviceInfo: {
    userAgent?: string;
    deviceType: 'desktop' | 'mobile' | 'tablet';
    browser?: string;
    os?: string;
    screenResolution?: string;
  };

  // User context
  userContext: {
    isReturningUser: boolean;
    accountAge?: number; // days since registration
    previousSubscriptions?: number;
    referralSource?: string;
    utmParameters?: {
      source?: string;
      medium?: string;
      campaign?: string;
      term?: string;
      content?: string;
    };
  };

  // Page/product context
  pageContext: {
    path: string;
    referrer?: string;
    planViewed?: string;
    tierViewed?: string;
    priceDisplayed?: number;
    experimentVariant?: string; // A/B testing
  };

  // Conversion-specific data
  conversionData?: {
    planSelected?: string;
    tierSelected?: string;
    interval?: 'month' | 'year';
    amount?: number;
    currency?: string;
    discountApplied?: string;
    checkoutSessionId?: string;
    subscriptionId?: string;
    errorCode?: string;
    errorMessage?: string;
  };

  // Metadata
  metadata?: Record<string, any>;
}

export enum ConversionEventType {
  // Top of funnel
  PRICING_PAGE_VIEW = 'pricing_page_view',
  PLAN_HOVER = 'plan_hover',
  PLAN_CLICK = 'plan_click',
  FAQ_EXPANSION = 'faq_expansion',
  FEATURE_COMPARISON = 'feature_comparison',

  // Checkout initiation
  CHECKOUT_BUTTON_CLICK = 'checkout_button_click',
  CHECKOUT_SESSION_START = 'checkout_session_start',
  CHECKOUT_FORM_VIEW = 'checkout_form_view',

  // Checkout process
  EMAIL_ENTERED = 'email_entered',
  PAYMENT_METHOD_SELECTION = 'payment_method_selection',
  BILLING_INFO_ENTERED = 'billing_info_entered',
  DISCOUNT_CODE_APPLIED = 'discount_code_applied',
  TERMS_ACCEPTED = 'terms_accepted',

  // Checkout completion
  PAYMENT_SUBMITTED = 'payment_submitted',
  PAYMENT_PROCESSING = 'payment_processing',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',

  // Subscription creation
  SUBSCRIPTION_CREATED = 'subscription_created',
  WELCOME_EMAIL_SENT = 'welcome_email_sent',
  ONBOARDING_STARTED = 'onboarding_started',

  // Abandonment points
  PRICING_PAGE_EXIT = 'pricing_page_exit',
  CHECKOUT_ABANDONMENT = 'checkout_abandonment',
  PAYMENT_TIMEOUT = 'payment_timeout',

  // Post-conversion
  FIRST_LOGIN = 'first_login',
  FEATURE_DISCOVERY = 'feature_discovery',
  TRIAL_CONVERSION = 'trial_conversion',
}

export interface ConversionFunnel {
  period: { start: Date; end: Date };
  totalSessions: number;

  // Funnel metrics
  funnelSteps: {
    pricingPageViews: number;
    checkoutInitiated: number;
    paymentMethodAdded: number;
    paymentSubmitted: number;
    subscriptionsCreated: number;
    onboardingCompleted: number;
  };

  // Conversion rates
  conversionRates: {
    pricingToCheckout: number;
    checkoutToPayment: number;
    paymentToSubscription: number;
    subscriptionToOnboarding: number;
    overallConversion: number;
  };

  // Drop-off analysis
  dropOffPoints: {
    step: string;
    entrances: number;
    exits: number;
    dropOffRate: number;
  }[];

  // Segmentation
  segmentedConversions: {
    byDevice: Record<string, { sessions: number; conversions: number; rate: number }>;
    bySource: Record<string, { sessions: number; conversions: number; rate: number }>;
    byPlan: Record<string, { views: number; conversions: number; rate: number }>;
    byUserType: Record<string, { sessions: number; conversions: number; rate: number }>;
  };

  // Time analysis
  timeAnalysis: {
    averageTimeToConvert: number; // minutes
    timeDistribution: { range: string; count: number }[];
    seasonalTrends: { hour: number; conversions: number }[];
  };
}

export interface AbandonmentAnalysis {
  totalAbandonments: number;
  abandonmentPoints: {
    stage: string;
    count: number;
    percentage: number;
    commonReasons: string[];
  }[];
  recoveryOpportunities: {
    stage: string;
    recoverable: number;
    emailCampaigns: string[];
    expectedRecoveryRate: number;
  }[];
  cohortAnalysis: {
    userType: string;
    abandonmentRate: number;
    primaryReasons: string[];
  }[];
}

export class ConversionTrackingService {
  private db = getFirestore();
  private readonly CONVERSION_EVENTS_COLLECTION = 'conversionEvents';
  private readonly CONVERSION_SESSIONS_COLLECTION = 'conversionSessions';
  private readonly CONVERSION_FUNNELS_COLLECTION = 'conversionFunnels';

  /**
   * Track a conversion event
   */
  async trackConversionEvent(event: ConversionEvent): Promise<void> {
    try {
      // Generate event ID if not provided
      if (!event.id) {
        event.id = `${event.sessionId}_${event.eventType}_${Date.now()}`;
      }

      // Store the event
      await this.db
        .collection(this.CONVERSION_EVENTS_COLLECTION)
        .doc(event.id)
        .set({
          ...event,
          timestamp: Timestamp.fromDate(event.timestamp),
        });

      // Update session progress
      await this.updateSessionProgress(event);

      // Check for conversion completion
      if (this.isConversionEvent(event.eventType)) {
        await this.markSessionAsConverted(event);
      }

      // Check for abandonment
      if (this.isAbandonmentEvent(event.eventType)) {
        await this.markSessionAsAbandoned(event);
      }

      logger.info('Conversion event tracked', {
        sessionId: event.sessionId,
        eventType: event.eventType,
        userId: event.userId,
        deviceType: event.deviceInfo.deviceType,
      });
    } catch (error) {
      logger.error('Failed to track conversion event', {
        error,
        sessionId: event.sessionId,
        eventType: event.eventType,
      });
      throw error;
    }
  }

  /**
   * Create or update conversion session
   */
  async createConversionSession(sessionId: string, initialEvent: ConversionEvent): Promise<void> {
    try {
      const sessionData = {
        sessionId,
        userId: initialEvent.userId,
        startTime: Timestamp.fromDate(initialEvent.timestamp),
        lastActivity: Timestamp.fromDate(initialEvent.timestamp),
        deviceInfo: initialEvent.deviceInfo,
        userContext: initialEvent.userContext,
        status: 'active' as const,
        eventsCount: 1,
        currentStage: this.getStageFromEvent(initialEvent.eventType),
        planInterest: initialEvent.pageContext.planViewed,
        tierInterest: initialEvent.pageContext.tierViewed,
        utmParameters: initialEvent.userContext.utmParameters,
        experimentVariant: initialEvent.pageContext.experimentVariant,
        converted: false,
        abandoned: false,
        conversionData: null,
        updatedAt: Timestamp.now(),
      };

      await this.db.collection(this.CONVERSION_SESSIONS_COLLECTION).doc(sessionId).set(sessionData);

      logger.info('Conversion session created', {
        sessionId,
        userId: initialEvent.userId,
        stage: sessionData.currentStage,
      });
    } catch (error) {
      logger.error('Failed to create conversion session', {
        error,
        sessionId,
      });
      throw error;
    }
  }

  /**
   * Update session progress based on event
   */
  private async updateSessionProgress(event: ConversionEvent): Promise<void> {
    const sessionRef = this.db.collection(this.CONVERSION_SESSIONS_COLLECTION).doc(event.sessionId);

    const updates: any = {
      lastActivity: Timestamp.fromDate(event.timestamp),
      eventsCount: FieldValue.increment(1),
      currentStage: this.getStageFromEvent(event.eventType),
      updatedAt: Timestamp.now(),
    };

    // Update plan/tier interest if provided
    if (event.pageContext.planViewed) {
      updates.planInterest = event.pageContext.planViewed;
    }
    if (event.pageContext.tierViewed) {
      updates.tierInterest = event.pageContext.tierViewed;
    }

    // Update conversion data if provided
    if (event.conversionData) {
      updates.conversionData = event.conversionData;
    }

    await sessionRef.update(updates);
  }

  /**
   * Mark session as converted
   */
  private async markSessionAsConverted(event: ConversionEvent): Promise<void> {
    const sessionRef = this.db.collection(this.CONVERSION_SESSIONS_COLLECTION).doc(event.sessionId);

    await sessionRef.update({
      converted: true,
      conversionTime: Timestamp.fromDate(event.timestamp),
      conversionData: event.conversionData,
      status: 'converted',
      updatedAt: Timestamp.now(),
    });

    logger.info('Session marked as converted', {
      sessionId: event.sessionId,
      subscriptionId: event.conversionData?.subscriptionId,
    });
  }

  /**
   * Mark session as abandoned
   */
  private async markSessionAsAbandoned(event: ConversionEvent): Promise<void> {
    const sessionRef = this.db.collection(this.CONVERSION_SESSIONS_COLLECTION).doc(event.sessionId);

    await sessionRef.update({
      abandoned: true,
      abandonmentTime: Timestamp.fromDate(event.timestamp),
      abandonmentStage: this.getStageFromEvent(event.eventType),
      status: 'abandoned',
      updatedAt: Timestamp.now(),
    });

    logger.info('Session marked as abandoned', {
      sessionId: event.sessionId,
      stage: this.getStageFromEvent(event.eventType),
    });
  }

  /**
   * Calculate conversion funnel metrics
   */
  async calculateConversionFunnel(startDate: Date, endDate: Date): Promise<ConversionFunnel> {
    try {
      logger.info('Calculating conversion funnel metrics', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      // Get all conversion events in the period
      const eventsSnapshot = await this.db
        .collection(this.CONVERSION_EVENTS_COLLECTION)
        .where('timestamp', '>=', Timestamp.fromDate(startDate))
        .where('timestamp', '<=', Timestamp.fromDate(endDate))
        .get();

      const events = eventsSnapshot.docs.map(doc => doc.data()) as ConversionEvent[];

      // Get all sessions in the period
      const sessionsSnapshot = await this.db
        .collection(this.CONVERSION_SESSIONS_COLLECTION)
        .where('startTime', '>=', Timestamp.fromDate(startDate))
        .where('startTime', '<=', Timestamp.fromDate(endDate))
        .get();

      const sessions = sessionsSnapshot.docs.map(doc => doc.data());

      // Calculate funnel steps
      const funnelSteps = this.calculateFunnelSteps(events);

      // Calculate conversion rates
      const conversionRates = this.calculateConversionRates(funnelSteps);

      // Analyze drop-off points
      const dropOffPoints = this.analyzeDropOffPoints(events, sessions);

      // Segment conversions
      const segmentedConversions = this.segmentConversions(events, sessions);

      // Analyze timing
      const timeAnalysis = this.analyzeConversionTiming(sessions.filter(s => s.converted));

      const funnel: ConversionFunnel = {
        period: { start: startDate, end: endDate },
        totalSessions: sessions.length,
        funnelSteps,
        conversionRates,
        dropOffPoints,
        segmentedConversions,
        timeAnalysis,
      };

      // Store funnel analysis
      await this.storeFunnelAnalysis(funnel);

      return funnel;
    } catch (error) {
      logger.error('Failed to calculate conversion funnel', { error });
      throw createError(ErrorCode.INTERNAL, 'Failed to calculate conversion funnel');
    }
  }

  /**
   * Calculate funnel step metrics
   */
  private calculateFunnelSteps(events: ConversionEvent[]): any {
    const stepCounts = {
      pricingPageViews: 0,
      checkoutInitiated: 0,
      paymentMethodAdded: 0,
      paymentSubmitted: 0,
      subscriptionsCreated: 0,
      onboardingCompleted: 0,
    };

    // Use Set to count unique sessions per step
    const uniqueSessions = {
      pricingPageViews: new Set<string>(),
      checkoutInitiated: new Set<string>(),
      paymentMethodAdded: new Set<string>(),
      paymentSubmitted: new Set<string>(),
      subscriptionsCreated: new Set<string>(),
      onboardingCompleted: new Set<string>(),
    };

    events.forEach(event => {
      switch (event.eventType) {
        case ConversionEventType.PRICING_PAGE_VIEW:
          uniqueSessions.pricingPageViews.add(event.sessionId);
          break;
        case ConversionEventType.CHECKOUT_SESSION_START:
          uniqueSessions.checkoutInitiated.add(event.sessionId);
          break;
        case ConversionEventType.PAYMENT_METHOD_SELECTION:
          uniqueSessions.paymentMethodAdded.add(event.sessionId);
          break;
        case ConversionEventType.PAYMENT_SUBMITTED:
          uniqueSessions.paymentSubmitted.add(event.sessionId);
          break;
        case ConversionEventType.SUBSCRIPTION_CREATED:
          uniqueSessions.subscriptionsCreated.add(event.sessionId);
          break;
        case ConversionEventType.ONBOARDING_STARTED:
          uniqueSessions.onboardingCompleted.add(event.sessionId);
          break;
      }
    });

    // Convert sets to counts
    Object.keys(stepCounts).forEach(step => {
      stepCounts[step as keyof typeof stepCounts] =
        uniqueSessions[step as keyof typeof uniqueSessions].size;
    });

    return stepCounts;
  }

  /**
   * Calculate conversion rates between steps
   */
  private calculateConversionRates(funnelSteps: any): any {
    const {
      pricingPageViews,
      checkoutInitiated,
      paymentMethodAdded,
      paymentSubmitted,
      subscriptionsCreated,
      onboardingCompleted,
    } = funnelSteps;

    return {
      pricingToCheckout: pricingPageViews > 0 ? (checkoutInitiated / pricingPageViews) * 100 : 0,
      checkoutToPayment: checkoutInitiated > 0 ? (paymentMethodAdded / checkoutInitiated) * 100 : 0,
      paymentToSubscription:
        paymentSubmitted > 0 ? (subscriptionsCreated / paymentSubmitted) * 100 : 0,
      subscriptionToOnboarding:
        subscriptionsCreated > 0 ? (onboardingCompleted / subscriptionsCreated) * 100 : 0,
      overallConversion: pricingPageViews > 0 ? (subscriptionsCreated / pricingPageViews) * 100 : 0,
    };
  }

  /**
   * Analyze drop-off points in the funnel
   */
  private analyzeDropOffPoints(events: ConversionEvent[], sessions: any[]): any[] {
    const stages = ['pricing', 'checkout', 'payment', 'subscription', 'onboarding'];
    const dropOffPoints: any[] = [];

    stages.forEach(stage => {
      const entrances = sessions.filter(s => this.sessionReachedStage(s, stage)).length;

      const exits = sessions.filter(s => s.abandoned && s.abandonmentStage === stage).length;

      dropOffPoints.push({
        step: stage,
        entrances,
        exits,
        dropOffRate: entrances > 0 ? (exits / entrances) * 100 : 0,
      });
    });

    return dropOffPoints;
  }

  /**
   * Segment conversions by various dimensions
   */
  private segmentConversions(events: ConversionEvent[], sessions: any[]): any {
    // Segment by device type
    const byDevice: Record<string, any> = {};
    const bySource: Record<string, any> = {};
    const byPlan: Record<string, any> = {};
    const byUserType: Record<string, any> = {};

    sessions.forEach(session => {
      // Device segmentation
      const device = session.deviceInfo?.deviceType || 'unknown';
      if (!byDevice[device]) {
        byDevice[device] = { sessions: 0, conversions: 0, rate: 0 };
      }
      byDevice[device].sessions++;
      if (session.converted) byDevice[device].conversions++;

      // Source segmentation
      const source = session.utmParameters?.source || 'direct';
      if (!bySource[source]) {
        bySource[source] = { sessions: 0, conversions: 0, rate: 0 };
      }
      bySource[source].sessions++;
      if (session.converted) bySource[source].conversions++;

      // Plan segmentation
      const plan = session.planInterest || 'unknown';
      if (!byPlan[plan]) {
        byPlan[plan] = { views: 0, conversions: 0, rate: 0 };
      }
      byPlan[plan].views++;
      if (session.converted) byPlan[plan].conversions++;

      // User type segmentation
      const userType = session.userContext?.isReturningUser ? 'returning' : 'new';
      if (!byUserType[userType]) {
        byUserType[userType] = { sessions: 0, conversions: 0, rate: 0 };
      }
      byUserType[userType].sessions++;
      if (session.converted) byUserType[userType].conversions++;
    });

    // Calculate rates
    Object.keys(byDevice).forEach(device => {
      byDevice[device].rate =
        byDevice[device].sessions > 0
          ? (byDevice[device].conversions / byDevice[device].sessions) * 100
          : 0;
    });

    Object.keys(bySource).forEach(source => {
      bySource[source].rate =
        bySource[source].sessions > 0
          ? (bySource[source].conversions / bySource[source].sessions) * 100
          : 0;
    });

    Object.keys(byPlan).forEach(plan => {
      byPlan[plan].rate =
        byPlan[plan].views > 0 ? (byPlan[plan].conversions / byPlan[plan].views) * 100 : 0;
    });

    Object.keys(byUserType).forEach(userType => {
      byUserType[userType].rate =
        byUserType[userType].sessions > 0
          ? (byUserType[userType].conversions / byUserType[userType].sessions) * 100
          : 0;
    });

    return { byDevice, bySource, byPlan, byUserType };
  }

  /**
   * Analyze conversion timing patterns
   */
  private analyzeConversionTiming(convertedSessions: any[]): any {
    if (convertedSessions.length === 0) {
      return {
        averageTimeToConvert: 0,
        timeDistribution: [],
        seasonalTrends: [],
      };
    }

    // Calculate conversion times
    const conversionTimes = convertedSessions.map(session => {
      const startTime = session.startTime.toDate();
      const conversionTime = session.conversionTime.toDate();
      return (conversionTime.getTime() - startTime.getTime()) / (1000 * 60); // minutes
    });

    const averageTimeToConvert =
      conversionTimes.reduce((sum, time) => sum + time, 0) / conversionTimes.length;

    // Time distribution
    const timeDistribution = [
      { range: '0-5 min', count: conversionTimes.filter(t => t <= 5).length },
      { range: '5-15 min', count: conversionTimes.filter(t => t > 5 && t <= 15).length },
      { range: '15-30 min', count: conversionTimes.filter(t => t > 15 && t <= 30).length },
      { range: '30-60 min', count: conversionTimes.filter(t => t > 30 && t <= 60).length },
      { range: '1+ hour', count: conversionTimes.filter(t => t > 60).length },
    ];

    // Seasonal trends (by hour of day)
    const seasonalTrends: any[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const conversions = convertedSessions.filter(
        session => session.conversionTime.toDate().getHours() === hour
      ).length;
      seasonalTrends.push({ hour, conversions });
    }

    return {
      averageTimeToConvert,
      timeDistribution,
      seasonalTrends,
    };
  }

  /**
   * Store funnel analysis for historical tracking
   */
  private async storeFunnelAnalysis(funnel: ConversionFunnel): Promise<void> {
    const docId = `${funnel.period.start.getFullYear()}-${
      funnel.period.start.getMonth() + 1
    }-${funnel.period.start.getDate()}`;

    await this.db
      .collection(this.CONVERSION_FUNNELS_COLLECTION)
      .doc(docId)
      .set({
        ...funnel,
        period: {
          start: Timestamp.fromDate(funnel.period.start),
          end: Timestamp.fromDate(funnel.period.end),
        },
        calculatedAt: Timestamp.now(),
      });
  }

  // Helper methods
  private isConversionEvent(eventType: ConversionEventType): boolean {
    return [
      ConversionEventType.SUBSCRIPTION_CREATED,
      ConversionEventType.TRIAL_CONVERSION,
    ].includes(eventType);
  }

  private isAbandonmentEvent(eventType: ConversionEventType): boolean {
    return [
      ConversionEventType.PRICING_PAGE_EXIT,
      ConversionEventType.CHECKOUT_ABANDONMENT,
      ConversionEventType.PAYMENT_TIMEOUT,
    ].includes(eventType);
  }

  private getStageFromEvent(eventType: ConversionEventType): string {
    if (
      [
        ConversionEventType.PRICING_PAGE_VIEW,
        ConversionEventType.PLAN_HOVER,
        ConversionEventType.PLAN_CLICK,
      ].includes(eventType)
    ) {
      return 'pricing';
    }
    if (
      [
        ConversionEventType.CHECKOUT_BUTTON_CLICK,
        ConversionEventType.CHECKOUT_SESSION_START,
      ].includes(eventType)
    ) {
      return 'checkout';
    }
    if (
      [ConversionEventType.PAYMENT_SUBMITTED, ConversionEventType.PAYMENT_PROCESSING].includes(
        eventType
      )
    ) {
      return 'payment';
    }
    if ([ConversionEventType.SUBSCRIPTION_CREATED].includes(eventType)) {
      return 'subscription';
    }
    if ([ConversionEventType.ONBOARDING_STARTED].includes(eventType)) {
      return 'onboarding';
    }
    return 'unknown';
  }

  private sessionReachedStage(session: any, stage: string): boolean {
    const stageOrder = ['pricing', 'checkout', 'payment', 'subscription', 'onboarding'];
    const sessionStageIndex = stageOrder.indexOf(session.currentStage);
    const targetStageIndex = stageOrder.indexOf(stage);
    return sessionStageIndex >= targetStageIndex;
  }
}

// Export singleton instance
export const conversionTrackingService = new ConversionTrackingService();
