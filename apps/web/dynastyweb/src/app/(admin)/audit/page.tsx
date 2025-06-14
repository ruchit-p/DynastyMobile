'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileText, Search, Download, Filter } from 'lucide-react';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { sanitizeUserInput, sanitizeUserId } from '@/utils/inputSanitization';
import type { AdminAuditLog } from '@/types/admin';

const ACTION_LABELS: Record<string, string> = {
  GRANT_ADMIN: 'Admin Granted',
  REVOKE_ADMIN: 'Admin Revoked',
  ADMIN_ACCESS_VERIFIED: 'Admin Access',
  ADMIN_LOGIN: 'Admin Login',
  ADMIN_LOGOUT: 'Admin Logout',
  USER_MODIFIED: 'User Modified',
  USER_SUSPENDED: 'User Suspended',
  USER_REACTIVATED: 'User Reactivated',
  SUBSCRIPTION_MODIFIED: 'Subscription Changed',
  CONTENT_MODERATED: 'Content Moderated',
  SYSTEM_CONFIG_CHANGED: 'Config Changed',
  FEATURE_FLAG_TOGGLED: 'Feature Flag Toggle',
  INITIAL_ADMIN_SETUP: 'Initial Admin Setup',
};

const ACTION_COLORS: Record<string, string> = {
  GRANT_ADMIN: 'bg-green-100 text-green-800',
  REVOKE_ADMIN: 'bg-red-100 text-red-800',
  ADMIN_LOGIN: 'bg-blue-100 text-blue-800',
  ADMIN_LOGOUT: 'bg-gray-100 text-gray-800',
  USER_SUSPENDED: 'bg-red-100 text-red-800',
  USER_REACTIVATED: 'bg-green-100 text-green-800',
  SUBSCRIPTION_MODIFIED: 'bg-purple-100 text-purple-800',
};

export default function AuditLogsPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [hasMore, setHasMore] = useState(true);
  const [lastDocId, setLastDocId] = useState<string | null>(null);

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async (loadMore = false) => {
    try {
      setIsLoading(true);
      
      const getAdminAuditLogs = httpsCallable(functions, 'getAdminAuditLogs');
      const result = await getAdminAuditLogs({
        limit: 50,
        startAfter: loadMore ? lastDocId : null,
      });
      
      const data = result.data as any;
      
      if (data.success) {
        if (loadMore) {
          setLogs([...logs, ...data.logs]);
        } else {
          setLogs(data.logs);
        }
        setHasMore(data.hasMore);
        setLastDocId(data.lastDocId);
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load audit logs',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const exportLogs = () => {
    const csvContent = [
      ['Timestamp', 'Action', 'Performed By', 'Target User', 'IP Address', 'User Agent'],
      ...filteredLogs.map(log => [
        format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        log.action,
        log.performedBy,
        log.targetUserId || '',
        log.metadata?.ip || '',
        log.metadata?.userAgent || '',
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = searchQuery === '' || 
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.performedBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.targetUserId && log.targetUserId.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    
    return matchesSearch && matchesAction;
  });

  if (isLoading && logs.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit Logs</h1>
          <p className="text-gray-600">Track all administrative actions and changes</p>
        </div>
        <Button onClick={exportLogs} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>
                Showing {filteredLogs.length} of {logs.length} entries
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[250px]"
                />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {Object.entries(ACTION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredLogs.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No audit logs found</p>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="secondary"
                          className={ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-800'}
                        >
                          {ACTION_LABELS[log.action] || log.action}
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">Performed by:</span>{' '}
                        <span className="text-gray-700">{sanitizeUserId(log.performedBy)}</span>
                        {log.targetUserId && (
                          <>
                            <span className="mx-2 text-gray-400">→</span>
                            <span className="font-medium">Target:</span>{' '}
                            <span className="text-gray-700">{sanitizeUserId(log.targetUserId)}</span>
                          </>
                        )}
                      </div>
                      {log.metadata && (
                        <div className="text-xs text-gray-500">
                          {log.metadata.ip && <span>IP: {log.metadata.ip}</span>}
                          {log.metadata.reason && (
                            <span className="ml-4">Reason: {sanitizeUserInput(log.metadata.reason)}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      <FileText className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {hasMore && (
            <div className="mt-6 text-center">
              <Button
                variant="outline"
                onClick={() => loadAuditLogs(true)}
                disabled={isLoading}
              >
                Load More
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}