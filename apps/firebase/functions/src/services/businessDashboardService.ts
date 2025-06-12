import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {createError, ErrorCode} from "../utils/errors";
import {subscriptionAnalyticsService} from "./subscriptionAnalyticsService";
import {technicalMonitoringService} from "./technicalMonitoringService";
import {conversionTrackingService} from "./conversionTrackingService";

/**
 * Comprehensive business dashboard service for Dynasty
 * Provides unified view of subscription, technical, and business metrics
 */

export interface DashboardWidget {
  id: string;
  title: string;
  type: "metric" | "chart" | "table" | "alert" | "trend";
  category: "revenue" | "growth" | "technical" | "conversion" | "alerts";
  priority: "high" | "medium" | "low";

  // Widget configuration
  config: {
    size: "small" | "medium" | "large" | "full-width";
    refreshInterval: number; // minutes
    timeRange: "1h" | "24h" | "7d" | "30d" | "90d" | "1y";
    showTrend: boolean;
    alertThreshold?: number;
  };

  // Data source
  dataSource: {
    service: string;
    method: string;
    parameters?: Record<string, any>;
  };

  // Display options
  display: {
    format: "number" | "currency" | "percentage" | "duration" | "count";
    precision?: number;
    prefix?: string;
    suffix?: string;
    color?: "green" | "red" | "yellow" | "blue" | "gray";
    icon?: string;
  };

  // Access control
  accessLevel: "admin" | "manager" | "viewer";
  visibleToRoles: string[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastDataUpdate?: Date;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  category: "executive" | "operations" | "technical" | "custom";

  // Layout configuration
  layout: {
    rows: number;
    columns: number;
    widgets: Array<{
      widgetId: string;
      position: { row: number; col: number; rowSpan: number; colSpan: number };
    }>;
  };

  // Access control
  accessLevel: "admin" | "manager" | "viewer";
  sharedWith: string[];
  isPublic: boolean;

  // Customization
  theme: "light" | "dark" | "auto";
  autoRefresh: boolean;
  refreshInterval: number; // minutes

  // Metadata
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastViewed?: Date;
  viewCount: number;
}

export interface DashboardData {
  dashboardId: string;
  widgets: Array<{
    widgetId: string;
    data: any;
    status: "success" | "loading" | "error";
    error?: string;
    lastUpdated: Date;
  }>;
  generatedAt: Date;
  cacheUntil: Date;
}

export interface SubscriptionOverviewData {
  // Key metrics
  totalActiveSubscriptions: number;
  monthlyRecurringRevenue: number;
  averageRevenuePerUser: number;
  churnRate: number;
  growthRate: number;

  // Trends (30-day)
  trends: {
    mrr: Array<{ date: string; value: number }>;
    subscriptions: Array<{ date: string; value: number }>;
    churn: Array<{ date: string; value: number }>;
    arpu: Array<{ date: string; value: number }>;
  };

  // Plan breakdown
  planBreakdown: Array<{
    plan: string;
    tier?: string;
    count: number;
    revenue: number;
    percentage: number;
  }>;

  // Geographic distribution
  geography: Array<{
    country: string;
    subscriptions: number;
    revenue: number;
  }>;

  // Recent activity
  recentActivity: Array<{
    type: "new_subscription" | "cancellation" | "upgrade" | "downgrade";
    timestamp: Date;
    details: any;
  }>;
}

export interface TechnicalHealthData {
  // System status
  overallHealth: "excellent" | "good" | "warning" | "critical";
  uptime: number;

  // Performance metrics
  apiPerformance: {
    averageResponseTime: number;
    errorRate: number;
    requestVolume: number;
    slowestEndpoints: Array<{ endpoint: string; time: number }>;
  };

  // Webhook performance
  webhookPerformance: {
    successRate: number;
    averageProcessingTime: number;
    failureRate: number;
    retryRate: number;
  };

  // Storage performance
  storagePerformance: {
    averageCalculationTime: number;
    errorRate: number;
    largestCalculations: Array<{ userId: string; bytes: number; time: number }>;
  };

  // Active alerts
  activeAlerts: Array<{
    severity: string;
    message: string;
    triggeredAt: Date;
  }>;

  // Trends
  trends: {
    responseTime: Array<{ timestamp: Date; value: number }>;
    errorRate: Array<{ timestamp: Date; value: number }>;
    webhookSuccess: Array<{ timestamp: Date; value: number }>;
  };
}

export interface ConversionFunnelData {
  // Funnel metrics
  funnelSteps: {
    pricingPageViews: number;
    checkoutInitiated: number;
    paymentSubmitted: number;
    subscriptionsCreated: number;
  };

  // Conversion rates
  conversionRates: {
    pricingToCheckout: number;
    checkoutToSubscription: number;
    overallConversion: number;
  };

  // Drop-off analysis
  dropOffPoints: Array<{
    stage: string;
    dropOffRate: number;
    count: number;
  }>;

  // Device/source breakdown
  segmentation: {
    byDevice: Record<string, { sessions: number; conversions: number; rate: number }>;
    bySource: Record<string, { sessions: number; conversions: number; rate: number }>;
  };

  // Time analysis
  averageTimeToConvert: number;

  // Trends
  trends: {
    conversionRate: Array<{ date: string; value: number }>;
    volume: Array<{ date: string; sessions: number; conversions: number }>;
  };
}

export class BusinessDashboardService {
  private db = getFirestore();
  private readonly DASHBOARDS_COLLECTION = "dashboards";
  private readonly DASHBOARD_WIDGETS_COLLECTION = "dashboardWidgets";
  private readonly DASHBOARD_DATA_COLLECTION = "dashboardData";

  // Cache configuration
  private readonly CACHE_DURATION = {
    realtime: 1, // 1 minute
    frequent: 5, // 5 minutes
    standard: 15, // 15 minutes
    slow: 60, // 1 hour
  };

  /**
   * Initialize default dashboards and widgets
   */
  async initializeDefaultDashboards(adminUserId: string): Promise<void> {
    try {
      logger.info("Initializing default dashboards");

      // Create default widgets
      await this.createDefaultWidgets();

      // Create default dashboards
      await this.createExecutiveDashboard(adminUserId);
      await this.createOperationsDashboard(adminUserId);
      await this.createTechnicalDashboard(adminUserId);

      logger.info("Default dashboards initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize default dashboards", {error});
      throw error;
    }
  }

  /**
   * Create default dashboard widgets
   */
  private async createDefaultWidgets(): Promise<void> {
    const defaultWidgets: Partial<DashboardWidget>[] = [
      // Revenue metrics
      {
        id: "widget_mrr",
        title: "Monthly Recurring Revenue",
        type: "metric",
        category: "revenue",
        priority: "high",
        config: {
          size: "medium",
          refreshInterval: this.CACHE_DURATION.frequent,
          timeRange: "30d",
          showTrend: true,
          alertThreshold: -10, // Alert if MRR drops by 10%
        },
        dataSource: {
          service: "subscriptionAnalytics",
          method: "calculateSubscriptionMetrics",
        },
        display: {
          format: "currency",
          precision: 0,
          color: "green",
          icon: "dollar-sign",
        },
        accessLevel: "manager",
        visibleToRoles: ["admin", "manager"],
      },

      {
        id: "widget_active_subs",
        title: "Active Subscriptions",
        type: "metric",
        category: "growth",
        priority: "high",
        config: {
          size: "small",
          refreshInterval: this.CACHE_DURATION.frequent,
          timeRange: "30d",
          showTrend: true,
        },
        dataSource: {
          service: "subscriptionAnalytics",
          method: "getActiveSubscriptionCount",
        },
        display: {
          format: "count",
          color: "blue",
          icon: "users",
        },
        accessLevel: "viewer",
        visibleToRoles: ["admin", "manager", "viewer"],
      },

      {
        id: "widget_churn_rate",
        title: "Churn Rate",
        type: "metric",
        category: "growth",
        priority: "high",
        config: {
          size: "small",
          refreshInterval: this.CACHE_DURATION.standard,
          timeRange: "30d",
          showTrend: true,
          alertThreshold: 5, // Alert if churn > 5%
        },
        dataSource: {
          service: "subscriptionAnalytics",
          method: "calculateChurnRate",
        },
        display: {
          format: "percentage",
          precision: 1,
          color: "red",
          icon: "trending-down",
        },
        accessLevel: "manager",
        visibleToRoles: ["admin", "manager"],
      },

      // Technical metrics
      {
        id: "widget_api_health",
        title: "API Health",
        type: "metric",
        category: "technical",
        priority: "high",
        config: {
          size: "small",
          refreshInterval: this.CACHE_DURATION.realtime,
          timeRange: "1h",
          showTrend: true,
          alertThreshold: 95, // Alert if health < 95%
        },
        dataSource: {
          service: "technicalMonitoring",
          method: "calculateHealthScore",
        },
        display: {
          format: "percentage",
          precision: 1,
          color: "green",
          icon: "server",
        },
        accessLevel: "viewer",
        visibleToRoles: ["admin", "manager", "viewer"],
      },

      {
        id: "widget_response_time",
        title: "API Response Time",
        type: "metric",
        category: "technical",
        priority: "medium",
        config: {
          size: "small",
          refreshInterval: this.CACHE_DURATION.frequent,
          timeRange: "1h",
          showTrend: true,
          alertThreshold: 2000, // Alert if > 2 seconds
        },
        dataSource: {
          service: "technicalMonitoring",
          method: "getAverageResponseTime",
        },
        display: {
          format: "duration",
          suffix: "ms",
          color: "blue",
          icon: "clock",
        },
        accessLevel: "viewer",
        visibleToRoles: ["admin", "manager", "viewer"],
      },

      // Conversion metrics
      {
        id: "widget_conversion_rate",
        title: "Overall Conversion Rate",
        type: "metric",
        category: "conversion",
        priority: "high",
        config: {
          size: "small",
          refreshInterval: this.CACHE_DURATION.standard,
          timeRange: "7d",
          showTrend: true,
          alertThreshold: 2, // Alert if < 2%
        },
        dataSource: {
          service: "conversionTracking",
          method: "getOverallConversionRate",
        },
        display: {
          format: "percentage",
          precision: 1,
          color: "green",
          icon: "trending-up",
        },
        accessLevel: "manager",
        visibleToRoles: ["admin", "manager"],
      },

      // Charts and tables
      {
        id: "widget_revenue_chart",
        title: "Revenue Trend",
        type: "chart",
        category: "revenue",
        priority: "high",
        config: {
          size: "large",
          refreshInterval: this.CACHE_DURATION.standard,
          timeRange: "30d",
          showTrend: false,
        },
        dataSource: {
          service: "subscriptionAnalytics",
          method: "getRevenueTrend",
        },
        display: {
          format: "currency",
          color: "green",
        },
        accessLevel: "manager",
        visibleToRoles: ["admin", "manager"],
      },

      {
        id: "widget_conversion_funnel",
        title: "Conversion Funnel",
        type: "chart",
        category: "conversion",
        priority: "medium",
        config: {
          size: "large",
          refreshInterval: this.CACHE_DURATION.standard,
          timeRange: "7d",
          showTrend: false,
        },
        dataSource: {
          service: "conversionTracking",
          method: "getFunnelChart",
        },
        display: {
          format: "percentage",
          color: "blue",
        },
        accessLevel: "manager",
        visibleToRoles: ["admin", "manager"],
      },

      {
        id: "widget_active_alerts",
        title: "Active Alerts",
        type: "table",
        category: "alerts",
        priority: "high",
        config: {
          size: "medium",
          refreshInterval: this.CACHE_DURATION.realtime,
          timeRange: "24h",
          showTrend: false,
        },
        dataSource: {
          service: "alerting",
          method: "getActiveAlerts",
        },
        display: {
          format: "count",
          color: "red",
          icon: "alert-triangle",
        },
        accessLevel: "viewer",
        visibleToRoles: ["admin", "manager", "viewer"],
      },
    ];

    // Create widgets
    for (const widgetData of defaultWidgets) {
      const widget: DashboardWidget = {
        ...widgetData,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as DashboardWidget;

      await this.createWidget(widget);
    }
  }

  /**
   * Create executive dashboard
   */
  private async createExecutiveDashboard(adminUserId: string): Promise<void> {
    const dashboard: Dashboard = {
      id: "dashboard_executive",
      name: "Executive Dashboard",
      description: "High-level business metrics and KPIs",
      category: "executive",
      layout: {
        rows: 3,
        columns: 4,
        widgets: [
          {widgetId: "widget_mrr", position: {row: 0, col: 0, rowSpan: 1, colSpan: 1}},
          {widgetId: "widget_active_subs", position: {row: 0, col: 1, rowSpan: 1, colSpan: 1}},
          {widgetId: "widget_churn_rate", position: {row: 0, col: 2, rowSpan: 1, colSpan: 1}},
          {
            widgetId: "widget_conversion_rate",
            position: {row: 0, col: 3, rowSpan: 1, colSpan: 1},
          },
          {
            widgetId: "widget_revenue_chart",
            position: {row: 1, col: 0, rowSpan: 1, colSpan: 2},
          },
          {
            widgetId: "widget_conversion_funnel",
            position: {row: 1, col: 2, rowSpan: 1, colSpan: 2},
          },
          {
            widgetId: "widget_active_alerts",
            position: {row: 2, col: 0, rowSpan: 1, colSpan: 4},
          },
        ],
      },
      accessLevel: "manager",
      sharedWith: [],
      isPublic: false,
      theme: "light",
      autoRefresh: true,
      refreshInterval: 5,
      createdBy: adminUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      viewCount: 0,
    };

    await this.createDashboard(dashboard);
  }

  /**
   * Create operations dashboard
   */
  private async createOperationsDashboard(adminUserId: string): Promise<void> {
    const dashboard: Dashboard = {
      id: "dashboard_operations",
      name: "Operations Dashboard",
      description: "Operational metrics and system health",
      category: "operations",
      layout: {
        rows: 3,
        columns: 4,
        widgets: [
          {widgetId: "widget_active_subs", position: {row: 0, col: 0, rowSpan: 1, colSpan: 1}},
          {widgetId: "widget_api_health", position: {row: 0, col: 1, rowSpan: 1, colSpan: 1}},
          {
            widgetId: "widget_response_time",
            position: {row: 0, col: 2, rowSpan: 1, colSpan: 1},
          },
          {
            widgetId: "widget_conversion_rate",
            position: {row: 0, col: 3, rowSpan: 1, colSpan: 1},
          },
          {
            widgetId: "widget_conversion_funnel",
            position: {row: 1, col: 0, rowSpan: 1, colSpan: 2},
          },
          {
            widgetId: "widget_revenue_chart",
            position: {row: 1, col: 2, rowSpan: 1, colSpan: 2},
          },
          {
            widgetId: "widget_active_alerts",
            position: {row: 2, col: 0, rowSpan: 1, colSpan: 4},
          },
        ],
      },
      accessLevel: "viewer",
      sharedWith: [],
      isPublic: true,
      theme: "light",
      autoRefresh: true,
      refreshInterval: 2,
      createdBy: adminUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      viewCount: 0,
    };

    await this.createDashboard(dashboard);
  }

  /**
   * Create technical dashboard
   */
  private async createTechnicalDashboard(adminUserId: string): Promise<void> {
    const dashboard: Dashboard = {
      id: "dashboard_technical",
      name: "Technical Dashboard",
      description: "System performance and technical metrics",
      category: "technical",
      layout: {
        rows: 2,
        columns: 4,
        widgets: [
          {widgetId: "widget_api_health", position: {row: 0, col: 0, rowSpan: 1, colSpan: 1}},
          {
            widgetId: "widget_response_time",
            position: {row: 0, col: 1, rowSpan: 1, colSpan: 1},
          },
          {
            widgetId: "widget_active_alerts",
            position: {row: 1, col: 0, rowSpan: 1, colSpan: 4},
          },
        ],
      },
      accessLevel: "viewer",
      sharedWith: [],
      isPublic: true,
      theme: "dark",
      autoRefresh: true,
      refreshInterval: 1,
      createdBy: adminUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      viewCount: 0,
    };

    await this.createDashboard(dashboard);
  }

  /**
   * Create a dashboard widget
   */
  async createWidget(widget: DashboardWidget): Promise<void> {
    await this.db
      .collection(this.DASHBOARD_WIDGETS_COLLECTION)
      .doc(widget.id)
      .set({
        ...widget,
        createdAt: Timestamp.fromDate(widget.createdAt),
        updatedAt: Timestamp.fromDate(widget.updatedAt),
        lastDataUpdate: widget.lastDataUpdate ? Timestamp.fromDate(widget.lastDataUpdate) : null,
      });
  }

  /**
   * Create a dashboard
   */
  async createDashboard(dashboard: Dashboard): Promise<void> {
    await this.db
      .collection(this.DASHBOARDS_COLLECTION)
      .doc(dashboard.id)
      .set({
        ...dashboard,
        createdAt: Timestamp.fromDate(dashboard.createdAt),
        updatedAt: Timestamp.fromDate(dashboard.updatedAt),
        lastViewed: dashboard.lastViewed ? Timestamp.fromDate(dashboard.lastViewed) : null,
      });
  }

  /**
   * Get dashboard data with caching
   */
  async getDashboardData(dashboardId: string, userId: string): Promise<DashboardData> {
    try {
      // Check cache first
      const cachedData = await this.getCachedDashboardData(dashboardId);
      if (cachedData && cachedData.cacheUntil > new Date()) {
        return cachedData;
      }

      // Get dashboard configuration
      const dashboard = await this.getDashboard(dashboardId);
      if (!dashboard) {
        throw createError(ErrorCode.NOT_FOUND, "Dashboard not found");
      }

      // Check access permissions
      if (!this.hasAccess(dashboard, userId)) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Access denied to dashboard");
      }

      // Get widget data
      const widgetData = await this.loadWidgetData(dashboard);

      const dashboardData: DashboardData = {
        dashboardId,
        widgets: widgetData,
        generatedAt: new Date(),
        cacheUntil: new Date(Date.now() + this.CACHE_DURATION.frequent * 60 * 1000),
      };

      // Cache the data
      await this.cacheDashboardData(dashboardData);

      // Update dashboard view stats
      await this.updateDashboardViews(dashboardId);

      return dashboardData;
    } catch (error) {
      logger.error("Failed to get dashboard data", {error, dashboardId, userId});
      throw error;
    }
  }

  /**
   * Load data for all widgets in a dashboard
   */
  private async loadWidgetData(dashboard: Dashboard): Promise<any[]> {
    const widgetPromises = dashboard.layout.widgets.map(async (layoutWidget) => {
      try {
        const widget = await this.getWidget(layoutWidget.widgetId);
        if (!widget) {
          return {
            widgetId: layoutWidget.widgetId,
            data: null,
            status: "error",
            error: "Widget not found",
            lastUpdated: new Date(),
          };
        }

        const data = await this.loadSingleWidgetData(widget);
        return {
          widgetId: layoutWidget.widgetId,
          data,
          status: "success",
          error: undefined,
          lastUpdated: new Date(),
        };
      } catch (error) {
        logger.error("Failed to load widget data", {
          error,
          widgetId: layoutWidget.widgetId,
        });

        return {
          widgetId: layoutWidget.widgetId,
          data: null,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          lastUpdated: new Date(),
        };
      }
    });

    return Promise.all(widgetPromises);
  }

  /**
   * Load data for a single widget
   */
  private async loadSingleWidgetData(widget: DashboardWidget): Promise<any> {
    const {service, method} = widget.dataSource;
    const timeRange = this.parseTimeRange(widget.config.timeRange);

    switch (service) {
    case "subscriptionAnalytics":
      return await this.loadSubscriptionAnalyticsData(method, timeRange);

    case "technicalMonitoring":
      return await this.loadTechnicalMonitoringData(method, timeRange);

    case "conversionTracking":
      return await this.loadConversionTrackingData(method, timeRange);

    case "alerting":
      return await this.loadAlertingData(method);

    default:
      throw new Error(`Unknown data service: ${service}`);
    }
  }

  /**
   * Load subscription analytics data
   */
  private async loadSubscriptionAnalyticsData(
    method: string,
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    switch (method) {
    case "calculateSubscriptionMetrics":
      return await subscriptionAnalyticsService.calculateSubscriptionMetrics(
        timeRange.start,
        timeRange.end
      );

    default:
      throw new Error(`Unknown subscription analytics method: ${method}`);
    }
  }

  /**
   * Load technical monitoring data
   */
  private async loadTechnicalMonitoringData(
    method: string,
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    switch (method) {
    case "generateTechnicalHealthReport":
      return await technicalMonitoringService.generateTechnicalHealthReport(
        timeRange.start,
        timeRange.end
      );

    default:
      throw new Error(`Unknown technical monitoring method: ${method}`);
    }
  }

  /**
   * Load conversion tracking data
   */
  private async loadConversionTrackingData(
    method: string,
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    switch (method) {
    case "calculateConversionFunnel":
      return await conversionTrackingService.calculateConversionFunnel(
        timeRange.start,
        timeRange.end
      );

    default:
      throw new Error(`Unknown conversion tracking method: ${method}`);
    }
  }

  /**
   * Load alerting data
   */
  private async loadAlertingData(method: string): Promise<any> {
    switch (method) {
    case "getActiveAlerts":
      // This would be implemented in the alerting service
      return [];

    default:
      throw new Error(`Unknown alerting method: ${method}`);
    }
  }

  // Helper methods
  private parseTimeRange(range: string): { start: Date; end: Date } {
    const end = new Date();
    let start: Date;

    switch (range) {
    case "1h":
      start = new Date(end.getTime() - 60 * 60 * 1000);
      break;
    case "24h":
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "1y":
      start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    }

    return {start, end};
  }

  private async getDashboard(dashboardId: string): Promise<Dashboard | null> {
    const doc = await this.db.collection(this.DASHBOARDS_COLLECTION).doc(dashboardId).get();
    if (!doc.exists) return null;

    const data = doc.data() as any;
    return {
      ...data,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
      lastViewed: data.lastViewed?.toDate(),
    } as Dashboard;
  }

  private async getWidget(widgetId: string): Promise<DashboardWidget | null> {
    const doc = await this.db.collection(this.DASHBOARD_WIDGETS_COLLECTION).doc(widgetId).get();
    if (!doc.exists) return null;

    const data = doc.data() as any;
    return {
      ...data,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
      lastDataUpdate: data.lastDataUpdate?.toDate(),
    } as DashboardWidget;
  }

  private async getCachedDashboardData(dashboardId: string): Promise<DashboardData | null> {
    const doc = await this.db.collection(this.DASHBOARD_DATA_COLLECTION).doc(dashboardId).get();
    if (!doc.exists) return null;

    const data = doc.data() as any;
    return {
      ...data,
      generatedAt: data.generatedAt.toDate(),
      cacheUntil: data.cacheUntil.toDate(),
      widgets: data.widgets.map((w: any) => ({
        ...w,
        lastUpdated: w.lastUpdated.toDate(),
      })),
    } as DashboardData;
  }

  private async cacheDashboardData(data: DashboardData): Promise<void> {
    await this.db
      .collection(this.DASHBOARD_DATA_COLLECTION)
      .doc(data.dashboardId)
      .set({
        ...data,
        generatedAt: Timestamp.fromDate(data.generatedAt),
        cacheUntil: Timestamp.fromDate(data.cacheUntil),
        widgets: data.widgets.map((w) => ({
          ...w,
          lastUpdated: Timestamp.fromDate(w.lastUpdated),
        })),
      });
  }

  private hasAccess(dashboard: Dashboard, userId: string): boolean {
    if (dashboard.isPublic) return true;
    if (dashboard.createdBy === userId) return true;
    if (dashboard.sharedWith.includes(userId)) return true;

    // Additional role-based access control would be implemented here
    return false;
  }

  private async updateDashboardViews(dashboardId: string): Promise<void> {
    await this.db.collection(this.DASHBOARDS_COLLECTION).doc(dashboardId).update({
      viewCount: Timestamp.now(),
      lastViewed: Timestamp.now(),
    });
  }
}

// Export singleton instance
export const businessDashboardService = new BusinessDashboardService();
