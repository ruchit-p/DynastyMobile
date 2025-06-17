'use client';

import React, { useEffect, useState } from 'react';
import { vaultSDKService } from '@/services/VaultSDKService';
import { vaultService } from '@/services/VaultService';
import { useFeatureFlags } from '@/lib/feature-flags';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Shield, Share2, AlertTriangle, HardDrive, Zap } from 'lucide-react';
import { format } from 'date-fns';

interface EncryptionStats {
  encryption: {
    totalItems: number;
    encryptedItems: number;
    encryptionPercentage: string;
    totalSize: number;
    encryptedSize: number;
    encryptedSizePercentage: string;
    keyUsage: Array<{ keyId: string; itemCount: number }>;
  };
  keyRotation: {
    lastRotation: Date | null;
    rotationCount: number;
    history: Array<{ rotatedAt: Date; oldKeyId: string; newKeyId: string; itemsUpdated: number; }>;
  };
  shareLinks: {
    active: number;
    expired: number;
    totalAccessCount: number;
  };
}

interface KeyRotationStatus {
  hasVaultKey: boolean;
  currentKeyId?: string;
  requiresRotation: boolean;
  lastRotation: number | null;
  nextRotationDue: string | null;
  hasItemsWithOldKeys?: boolean;
  recommendations?: Array<{
    priority: 'high' | 'medium' | 'low';
    message: string;
    action: string;
  }>;
}

interface ShareLinkAnalytics {
  summary: {
    totalShareLinks: number;
    totalAccesses: number;
    activeLinks: number;
    passwordProtectedLinks: number;
  };
  dailyAnalytics: Array<{
    date: string;
    created: number;
    accessed: number;
    uniqueAccessors: number;
  }>;
  topAccessedItems: Array<{
    itemId: string;
    accessCount: number;
  }>;
  recentShares: Array<{ itemId: string; createdAt: Date; accessCount: number; }>;
}

interface SystemStats {
  stats: {
    users: {
      total: number;
      withVaultEncryption: number;
      withActiveKeys: number;
    };
    items: {
      total: number;
      encrypted: number;
      unencrypted: number;
      totalSize: number;
      encryptedSize: number;
    };
    keys: {
      total: number;
      rotatedLastMonth: number;
      overdue: number;
    };
    shareLinks: {
      total: number;
      active: number;
      expired: number;
      passwordProtected: number;
    };
    storage: {
      firebase: { count: number; size: number };
      r2: { count: number; size: number };
    };
  };
  summary: {
    encryptionAdoption: string;
    itemEncryptionRate: string;
    sizeEncryptionRate: string;
    keyRotationCompliance: string;
    r2MigrationProgress: string;
  };
}

export default function VaultMonitoringDashboard({ isAdmin = false }: { isAdmin?: boolean }) {
  const { useVaultSDK: useSDK } = useFeatureFlags();
  const [encryptionStats, setEncryptionStats] = useState<EncryptionStats | null>(null);
  const [keyRotationStatus, setKeyRotationStatus] = useState<KeyRotationStatus | null>(null);
  const [shareLinkAnalytics, setShareLinkAnalytics] = useState<ShareLinkAnalytics | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [sdkLimitations, setSdkLimitations] = useState<string[]>([]);

  // Initialize vault service based on feature flags
  const activeVaultService = useSDK ? vaultSDKService : vaultService;

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);
        setSdkLimitations([]);

        // Load user-specific stats with fallback handling
        const limitations = [];

        // Load encryption stats
        let encStats;
        if (typeof activeVaultService.getEncryptionStats === 'function') {
          encStats = await activeVaultService.getEncryptionStats();
        } else {
          limitations.push('Encryption statistics not available with SDK');
          encStats = await vaultSDKService.getEncryptionStats();
        }

        // Load key rotation status
        let keyStatus;
        if (typeof activeVaultService.getKeyRotationStatus === 'function') {
          keyStatus = await activeVaultService.getKeyRotationStatus();
        } else {
          limitations.push('Key rotation status not available with SDK');
          keyStatus = await vaultSDKService.getKeyRotationStatus();
        }

        // Load share analytics
        let shareAnalytics;
        if (typeof activeVaultService.getShareLinkAnalytics === 'function') {
          shareAnalytics = await activeVaultService.getShareLinkAnalytics();
        } else {
          limitations.push('Share link analytics not available with SDK');
          shareAnalytics = await vaultSDKService.getShareLinkAnalytics();
        }

        setEncryptionStats(encStats);
        setKeyRotationStatus(keyStatus);
        setShareLinkAnalytics(shareAnalytics);
        setSdkLimitations(limitations);

        // Load admin stats if user is admin
        if (isAdmin) {
          try {
            // System stats always use legacy service for now
            const sysStats = await vaultSDKService.getSystemVaultStats();
            setSystemStats(sysStats);
            if (useSDK) {
              limitations.push('System statistics using legacy service');
              setSdkLimitations([...limitations]);
            }
          } catch (err) {
            console.error('Failed to load system stats:', err);
          }
        }
      } catch (err) {
        setError('Failed to load monitoring data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    loadDashboardData();
  }, [isAdmin, useSDK, activeVaultService]);


  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      case 'low': return 'default';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* SDK Status Header */}
      {useSDK && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Zap className="h-4 w-4 text-blue-500" />
          <span className="text-blue-700 font-medium">Using Vault SDK v2</span>
          {sdkLimitations.length > 0 && (
            <span className="text-blue-600 text-sm">
              • Some features use legacy service
            </span>
          )}
        </div>
      )}

      {/* SDK Limitations Alert */}
      {sdkLimitations.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Feature Limitations</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1">
              {sdkLimitations.map((limitation, idx) => (
                <li key={idx} className="text-sm">• {limitation}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            Overview
            {useSDK && <Zap className="h-3 w-3 ml-1 text-blue-500" />}
          </TabsTrigger>
          <TabsTrigger value="keys">Key Management</TabsTrigger>
          <TabsTrigger value="sharing">Share Analytics</TabsTrigger>
          {isAdmin && <TabsTrigger value="system">System Stats</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Encryption Overview */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Encryption Coverage</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {encryptionStats?.encryption.encryptionPercentage}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {encryptionStats?.encryption.encryptedItems} of {encryptionStats?.encryption.totalItems} items
                </p>
                <Progress 
                  value={parseFloat(encryptionStats?.encryption.encryptionPercentage || '0')} 
                  className="mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Encrypted Size</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {encryptionStats?.encryption.encryptedSizePercentage}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(encryptionStats?.encryption.encryptedSize || 0)} of{' '}
                  {formatBytes(encryptionStats?.encryption.totalSize || 0)}
                </p>
                <Progress 
                  value={parseFloat(encryptionStats?.encryption.encryptedSizePercentage || '0')} 
                  className="mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Share Links</CardTitle>
                <Share2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {encryptionStats?.shareLinks.active}
                </div>
                <p className="text-xs text-muted-foreground">
                  {encryptionStats?.shareLinks.totalAccessCount} total accesses
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Key Rotation Alerts */}
          {keyRotationStatus?.recommendations && keyRotationStatus.recommendations.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Security Recommendations</AlertTitle>
              <AlertDescription className="space-y-2 mt-2">
                {keyRotationStatus.recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Badge variant={getPriorityColor(rec.priority)}>
                      {rec.priority}
                    </Badge>
                    <span>{rec.message}</span>
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="keys" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Key Rotation Status</CardTitle>
                <CardDescription>Vault encryption key management</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Current Key ID</span>
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {keyRotationStatus?.currentKeyId?.slice(-8) || 'None'}
                  </code>
                </div>
                
                <div className="flex items-center justify-between">
                  <span>Rotation Required</span>
                  {keyRotationStatus?.requiresRotation ? (
                    <Badge variant="destructive">Yes</Badge>
                  ) : (
                    <Badge variant="success">No</Badge>
                  )}
                </div>

                {keyRotationStatus?.lastRotation && (
                  <div className="flex items-center justify-between">
                    <span>Last Rotation</span>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(keyRotationStatus.lastRotation), 'PPP')}
                    </span>
                  </div>
                )}

                {keyRotationStatus?.nextRotationDue && (
                  <div className="flex items-center justify-between">
                    <span>Next Rotation Due</span>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(keyRotationStatus.nextRotationDue), 'PPP')}
                    </span>
                  </div>
                )}

                {keyRotationStatus?.hasItemsWithOldKeys && (
                  <Alert variant="warning">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Some items are encrypted with old keys and need re-encryption
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Key Usage Distribution</CardTitle>
                <CardDescription>Items per encryption key</CardDescription>
              </CardHeader>
              <CardContent>
                {encryptionStats?.encryption.keyUsage && encryptionStats.encryption.keyUsage.length > 0 ? (
                  <div className="space-y-2">
                    {encryptionStats.encryption.keyUsage.map((usage, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <code className="text-sm">{usage.keyId.slice(-8)}</code>
                        <span className="text-sm text-muted-foreground">
                          {usage.itemCount} items
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No encrypted items</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sharing" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Total Links</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {shareLinkAnalytics?.summary.totalShareLinks || 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Active Links</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {shareLinkAnalytics?.summary.activeLinks || 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Total Accesses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {shareLinkAnalytics?.summary.totalAccesses || 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Password Protected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {shareLinkAnalytics?.summary.passwordProtectedLinks || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Share Link Activity Chart */}
          {shareLinkAnalytics?.dailyAnalytics && shareLinkAnalytics.dailyAnalytics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Share Link Activity (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={shareLinkAnalytics.dailyAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => format(new Date(date), 'MMM d')}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(date) => format(new Date(date as string), 'PPP')}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="created" 
                      stroke="#8884d8" 
                      name="Links Created"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="accessed" 
                      stroke="#82ca9d" 
                      name="Access Count"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {isAdmin && systemStats && (
          <TabsContent value="system" className="space-y-4 mt-4">
            {/* System-wide Statistics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Encryption Adoption</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {systemStats.summary.encryptionAdoption}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {systemStats.stats.users.withVaultEncryption} of {systemStats.stats.users.total} users
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Item Encryption</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {systemStats.summary.itemEncryptionRate}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {systemStats.stats.items.encrypted} of {systemStats.stats.items.total} items
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Key Compliance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {systemStats.summary.keyRotationCompliance}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {systemStats.stats.keys.overdue} overdue
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">R2 Migration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {systemStats.summary.r2MigrationProgress}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {systemStats.stats.storage.r2.count} items migrated
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Share Links</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {systemStats.stats.shareLinks.active}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {systemStats.stats.shareLinks.passwordProtected} protected
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Storage Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Storage Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart 
                    data={[
                      {
                        name: 'Firebase Storage',
                        count: systemStats.stats.storage.firebase.count,
                        size: systemStats.stats.storage.firebase.size
                      },
                      {
                        name: 'Cloudflare R2',
                        count: systemStats.stats.storage.r2.count,
                        size: systemStats.stats.storage.r2.size
                      }
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                    <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                    <Tooltip 
                      formatter={(value: number | string, name: string) => {
                        if (name === 'Size') {
                          return formatBytes(Number(value));
                        }
                        return value;
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="count" fill="#8884d8" name="Item Count" />
                    <Bar yAxisId="right" dataKey="size" fill="#82ca9d" name="Size" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}