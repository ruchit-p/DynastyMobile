'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3, Database, Download, Upload, CheckCircle, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createFirebaseClient } from '@/lib/functions-client';
import { functions } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import StorageUtils from '@/utils/storageUtils';

interface B2Metrics {
  uploadSuccess: number;
  uploadFailure: number;
  downloadSuccess: number;
  downloadFailure: number;
  deleteSuccess: number;
  deleteFailure: number;
  copySuccess: number;
  copyFailure: number;
  totalBandwidth: number;
  totalRequests: number;
  averageLatency: number;
  checksumVerifications: number;
  checksumFailures: number;
}

interface B2MigrationMetrics {
  totalMigrations: number;
  migrationFirebaseSuccess: number;
  migrationFirebaseFailure: number;
  migrationR2Success: number;
  migrationR2Failure: number;
  totalMigratedBytes: number;
  averageMigrationTime: number;
  checksumVerifications: number;
}

interface PerformanceComparison {
  b2: B2Metrics | null;
  r2: any | null;
  firebase: any | null;
}

interface RecentError {
  id: string;
  operation: string;
  error: string;
  userId?: string;
  bucket?: string;
  timestamp: Date;
  retryAttempt?: number;
}

export function B2MonitoringDashboard() {
  const [metrics, setMetrics] = useState<B2Metrics | null>(null);
  const [migrationMetrics, setMigrationMetrics] = useState<B2MigrationMetrics | null>(null);
  const [comparison, setComparison] = useState<PerformanceComparison | null>(null);
  const [recentErrors, setRecentErrors] = useState<RecentError[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const functionsClient = createFirebaseClient(functions);
  const { toast } = useToast();

  // Load B2 metrics
  const loadMetrics = async (date?: string) => {
    try {
      setLoading(true);
      
      // Get B2 metrics
      const metricsResult = await functionsClient.callFunction('getB2Metrics', { date });
      setMetrics(metricsResult.data as B2Metrics);

      // Get migration metrics
      const migrationResult = await functionsClient.callFunction('getB2MigrationMetrics', { date });
      setMigrationMetrics(migrationResult.data as B2MigrationMetrics);

      // Get performance comparison
      const comparisonResult = await functionsClient.callFunction('getB2PerformanceComparison', { date });
      setComparison(comparisonResult.data as PerformanceComparison);

      // Get recent errors
      const errorsResult = await functionsClient.callFunction('getB2RecentErrors', { limit: 10 });
      setRecentErrors(errorsResult.data as RecentError[]);

    } catch (error) {
      console.error('Failed to load B2 metrics:', error);
      toast({
        title: 'Failed to Load Metrics',
        description: 'Could not retrieve B2 monitoring data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Get success rate
  const getSuccessRate = async () => {
    try {
      const result = await functionsClient.callFunction('getB2SuccessRate', { date: selectedDate });
      return result.data as {
        date: string;
        totalOperations: number;
        successfulOperations: number;
        successRate: number;
        errorRate: number;
      };
    } catch (error) {
      console.error('Failed to get success rate:', error);
      return null;
    }
  };

  useEffect(() => {
    loadMetrics(selectedDate);
  }, [selectedDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Loading B2 metrics...</p>
        </div>
      </div>
    );
  }

  const totalOperations = metrics ? 
    metrics.uploadSuccess + metrics.uploadFailure + 
    metrics.downloadSuccess + metrics.downloadFailure + 
    metrics.deleteSuccess + metrics.deleteFailure +
    metrics.copySuccess + metrics.copyFailure : 0;

  const successfulOperations = metrics ?
    metrics.uploadSuccess + metrics.downloadSuccess + 
    metrics.deleteSuccess + metrics.copySuccess : 0;

  const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">B2 Storage Monitoring</h2>
          <p className="text-muted-foreground">
            Backblaze B2 performance and usage analytics
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border rounded-md"
          />
          <Button onClick={() => loadMetrics(selectedDate)} size="sm">
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Operations</p>
              <p className="text-2xl font-bold">{totalOperations.toLocaleString()}</p>
            </div>
            <Database className="h-8 w-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
              <p className="text-2xl font-bold">{successRate.toFixed(1)}%</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
          <Progress value={successRate} className="mt-2" />
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Bandwidth</p>
              <p className="text-2xl font-bold">
                {StorageUtils.formatFileSize(metrics?.totalBandwidth || 0)}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Avg Latency</p>
              <p className="text-2xl font-bold">{(metrics?.averageLatency || 0).toFixed(0)}ms</p>
            </div>
            <Clock className="h-8 w-8 text-orange-500" />
          </div>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="operations" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="migration">Migration</TabsTrigger>
          <TabsTrigger value="comparison">Comparison</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>

        {/* Operations Tab */}
        <TabsContent value="operations" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upload Operations */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center">
                <Upload className="h-5 w-5 mr-2" />
                Upload Operations
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Successful:</span>
                  <Badge variant="outline" className="text-green-600">
                    {metrics?.uploadSuccess || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Failed:</span>
                  <Badge variant="outline" className="text-red-600">
                    {metrics?.uploadFailure || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Success Rate:</span>
                  <span className="font-medium">
                    {metrics && (metrics.uploadSuccess + metrics.uploadFailure) > 0 ?
                      ((metrics.uploadSuccess / (metrics.uploadSuccess + metrics.uploadFailure)) * 100).toFixed(1) :
                      0
                    }%
                  </span>
                </div>
              </div>
            </Card>

            {/* Download Operations */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center">
                <Download className="h-5 w-5 mr-2" />
                Download Operations
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Successful:</span>
                  <Badge variant="outline" className="text-green-600">
                    {metrics?.downloadSuccess || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Failed:</span>
                  <Badge variant="outline" className="text-red-600">
                    {metrics?.downloadFailure || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Success Rate:</span>
                  <span className="font-medium">
                    {metrics && (metrics.downloadSuccess + metrics.downloadFailure) > 0 ?
                      ((metrics.downloadSuccess / (metrics.downloadSuccess + metrics.downloadFailure)) * 100).toFixed(1) :
                      0
                    }%
                  </span>
                </div>
              </div>
            </Card>

            {/* Checksum Operations */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center">
                <CheckCircle className="h-5 w-5 mr-2" />
                Checksum Verification
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Verified:</span>
                  <Badge variant="outline" className="text-green-600">
                    {metrics?.checksumVerifications || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Failed:</span>
                  <Badge variant="outline" className="text-red-600">
                    {metrics?.checksumFailures || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Success Rate:</span>
                  <span className="font-medium">
                    {metrics && (metrics.checksumVerifications + metrics.checksumFailures) > 0 ?
                      ((metrics.checksumVerifications / (metrics.checksumVerifications + metrics.checksumFailures)) * 100).toFixed(1) :
                      0
                    }%
                  </span>
                </div>
              </div>
            </Card>

            {/* Copy Operations */}
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center">
                <Database className="h-5 w-5 mr-2" />
                Copy Operations
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Successful:</span>
                  <Badge variant="outline" className="text-green-600">
                    {metrics?.copySuccess || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Failed:</span>
                  <Badge variant="outline" className="text-red-600">
                    {metrics?.copyFailure || 0}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Success Rate:</span>
                  <span className="font-medium">
                    {metrics && (metrics.copySuccess + metrics.copyFailure) > 0 ?
                      ((metrics.copySuccess / (metrics.copySuccess + metrics.copyFailure)) * 100).toFixed(1) :
                      0
                    }%
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Migration Tab */}
        <TabsContent value="migration" className="space-y-6">
          {migrationMetrics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Migration Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Total Migrations:</span>
                    <span className="font-medium">{migrationMetrics.totalMigrations}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Data Migrated:</span>
                    <span className="font-medium">
                      {StorageUtils.formatFileSize(migrationMetrics.totalMigratedBytes)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Time:</span>
                    <span className="font-medium">{migrationMetrics.averageMigrationTime.toFixed(1)}s</span>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold mb-4">From Firebase</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Successful:</span>
                    <Badge variant="outline" className="text-green-600">
                      {migrationMetrics.migrationFirebaseSuccess}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Failed:</span>
                    <Badge variant="outline" className="text-red-600">
                      {migrationMetrics.migrationFirebaseFailure}
                    </Badge>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold mb-4">From R2</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Successful:</span>
                    <Badge variant="outline" className="text-green-600">
                      {migrationMetrics.migrationR2Success}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Failed:</span>
                    <Badge variant="outline" className="text-red-600">
                      {migrationMetrics.migrationR2Failure}
                    </Badge>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <Card className="p-6">
              <p className="text-muted-foreground text-center">
                No migration data available for selected date
              </p>
            </Card>
          )}
        </TabsContent>

        {/* Comparison Tab */}
        <TabsContent value="comparison" className="space-y-6">
          {comparison ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6">
                <h3 className="font-semibold mb-4 text-blue-600">Backblaze B2</h3>
                {comparison.b2 ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Requests:</span>
                      <span>{comparison.b2.totalRequests}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Bandwidth:</span>
                      <span>{StorageUtils.formatFileSize(comparison.b2.totalBandwidth)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg Latency:</span>
                      <span>{comparison.b2.averageLatency.toFixed(0)}ms</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No data available</p>
                )}
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold mb-4 text-orange-600">Cloudflare R2</h3>
                {comparison.r2 ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Requests:</span>
                      <span>{comparison.r2.totalRequests || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Bandwidth:</span>
                      <span>{StorageUtils.formatFileSize(comparison.r2.totalBandwidth || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg Latency:</span>
                      <span>{(comparison.r2.averageLatency || 0).toFixed(0)}ms</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No data available</p>
                )}
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold mb-4 text-green-600">Firebase Storage</h3>
                <p className="text-muted-foreground text-sm">
                  Firebase metrics not yet implemented
                </p>
              </Card>
            </div>
          ) : (
            <Card className="p-6">
              <p className="text-muted-foreground text-center">
                No comparison data available
              </p>
            </Card>
          )}
        </TabsContent>

        {/* Errors Tab */}
        <TabsContent value="errors" className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold mb-4 flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-red-500" />
              Recent Errors ({recentErrors.length})
            </h3>
            
            {recentErrors.length > 0 ? (
              <div className="space-y-3">
                {recentErrors.map((error) => (
                  <div key={error.id} className="border rounded-lg p-4 bg-red-50 border-red-200">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="outline" className="text-red-600">
                        {error.operation}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(error.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-red-700 mb-2">{error.error}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Bucket: {error.bucket || 'N/A'}</span>
                      {error.retryAttempt && (
                        <span>Retry attempt: {error.retryAttempt}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No recent errors found
              </p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default B2MonitoringDashboard;