export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  totalFamilies: number;
  totalStories: number;
  totalEvents: number;
  totalVaultItems: number;
  storageUsedGB: number;
  activeSubscriptions: number;
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
}

export interface UserAdminView {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
  familyTreeId?: string;
  familyTreeName?: string;
  subscriptionStatus?: 'active' | 'inactive' | 'canceled' | 'past_due';
  subscriptionPlan?: string;
  storageUsedMB: number;
  isAdmin: boolean;
  isSuspended: boolean;
  suspendedReason?: string;
  vaultItemCount: number;
  storyCount: number;
  eventCount: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  services: {
    firebase: 'up' | 'down';
    stripe: 'up' | 'down';
    storage: 'up' | 'down';
    email: 'up' | 'down';
    sms: 'up' | 'down';
  };
  errorRate: number;
  avgResponseTime: number;
  activeUsers: number;
  queuedJobs: number;
}

export interface AdminConfig {
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  registrationEnabled: boolean;
  inviteOnly: boolean;
  maxUsersPerFamily: number;
  maxStoragePerUserGB: number;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  aiModerationEnabled: boolean;
  autoBackupEnabled: boolean;
  featureFlags: Record<string, boolean>;
}

export interface ContentModerationItem {
  id: string;
  type: 'story' | 'event' | 'comment' | 'vault_item';
  contentId: string;
  reportedBy: string;
  reportedAt: Date;
  reason: string;
  status: 'pending' | 'reviewed' | 'removed' | 'approved';
  reviewedBy?: string;
  reviewedAt?: Date;
  action?: string;
  contentPreview?: string;
}

export interface AdminAuditLog {
  id: string;
  action: string;
  targetUserId?: string;
  performedBy: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AdminNotification {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  metadata?: Record<string, any>;
}