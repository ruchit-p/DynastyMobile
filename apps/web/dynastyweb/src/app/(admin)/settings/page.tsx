'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Settings, Shield, Bell, Database, AlertTriangle, Save } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { AdminConfig } from '@/types/admin';

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  
  // Configuration state
  const [config, setConfig] = useState<AdminConfig>({
    maintenanceMode: false,
    maintenanceMessage: '',
    registrationEnabled: true,
    inviteOnly: false,
    maxUsersPerFamily: 50,
    maxStoragePerUserGB: 10,
    emailNotificationsEnabled: true,
    smsNotificationsEnabled: true,
    aiModerationEnabled: false,
    autoBackupEnabled: true,
    featureFlags: {
      newDashboard: false,
      advancedAnalytics: false,
      betaFeatures: false,
    },
  });

  // Security settings
  const [allowedIPs, setAllowedIPs] = useState('');
  const [require2FA, setRequire2FA] = useState(true);
  const [sessionDuration, setSessionDuration] = useState('3600');

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      // In production, this would call a Firebase function to save settings
      // For now, we'll simulate it
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: 'Settings Saved',
        description: 'Your configuration changes have been saved successfully.',
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Settings</h1>
        <p className="text-gray-600">Configure system settings and security options</p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">
            <Settings className="mr-2 h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="mr-2 h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="features">
            <Database className="mr-2 h-4 w-4" />
            Features
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Configuration</CardTitle>
              <CardDescription>
                General system settings and maintenance options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="maintenance">Maintenance Mode</Label>
                  <p className="text-sm text-gray-500">
                    Disable access for non-admin users
                  </p>
                </div>
                <Switch
                  id="maintenance"
                  checked={config.maintenanceMode}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, maintenanceMode: checked })
                  }
                />
              </div>

              {config.maintenanceMode && (
                <div className="space-y-2">
                  <Label htmlFor="maintenance-message">Maintenance Message</Label>
                  <Textarea
                    id="maintenance-message"
                    placeholder="We're currently performing maintenance..."
                    value={config.maintenanceMessage}
                    onChange={(e) => 
                      setConfig({ ...config, maintenanceMessage: e.target.value })
                    }
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="registration">Registration Enabled</Label>
                  <p className="text-sm text-gray-500">
                    Allow new users to sign up
                  </p>
                </div>
                <Switch
                  id="registration"
                  checked={config.registrationEnabled}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, registrationEnabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="invite-only">Invite Only Mode</Label>
                  <p className="text-sm text-gray-500">
                    Require invitation to join
                  </p>
                </div>
                <Switch
                  id="invite-only"
                  checked={config.inviteOnly}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, inviteOnly: checked })
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="max-users">Max Users per Family</Label>
                  <Input
                    id="max-users"
                    type="number"
                    value={config.maxUsersPerFamily}
                    onChange={(e) => 
                      setConfig({ ...config, maxUsersPerFamily: parseInt(e.target.value) })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-storage">Max Storage per User (GB)</Label>
                  <Input
                    id="max-storage"
                    type="number"
                    value={config.maxStoragePerUserGB}
                    onChange={(e) => 
                      setConfig({ ...config, maxStoragePerUserGB: parseInt(e.target.value) })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Configure admin access and security policies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="allowed-ips">Allowed IP Addresses</Label>
                <Textarea
                  id="allowed-ips"
                  placeholder="192.168.1.1&#10;10.0.0.0/24&#10;Leave empty to allow all"
                  value={allowedIPs}
                  onChange={(e) => setAllowedIPs(e.target.value)}
                  rows={4}
                />
                <p className="text-sm text-gray-500">
                  One IP address or CIDR range per line
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="require-2fa">Require 2FA for Admins</Label>
                  <p className="text-sm text-gray-500">
                    Enforce two-factor authentication
                  </p>
                </div>
                <Switch
                  id="require-2fa"
                  checked={require2FA}
                  onCheckedChange={setRequire2FA}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="session-duration">Session Duration (seconds)</Label>
                <Input
                  id="session-duration"
                  type="number"
                  value={sessionDuration}
                  onChange={(e) => setSessionDuration(e.target.value)}
                />
                <p className="text-sm text-gray-500">
                  How long admin sessions remain active
                </p>
              </div>
            </CardContent>
          </Card>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Changing security settings will require all admins to re-authenticate.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>
                Configure system notifications and alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-notifications">Email Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Send system emails to users
                  </p>
                </div>
                <Switch
                  id="email-notifications"
                  checked={config.emailNotificationsEnabled}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, emailNotificationsEnabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sms-notifications">SMS Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Send SMS messages to users
                  </p>
                </div>
                <Switch
                  id="sms-notifications"
                  checked={config.smsNotificationsEnabled}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, smsNotificationsEnabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="ai-moderation">AI Content Moderation</Label>
                  <p className="text-sm text-gray-500">
                    Automatically scan content for violations
                  </p>
                </div>
                <Switch
                  id="ai-moderation"
                  checked={config.aiModerationEnabled}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, aiModerationEnabled: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>
                Enable or disable specific features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="new-dashboard">New Dashboard UI</Label>
                  <p className="text-sm text-gray-500">
                    Enable redesigned dashboard for users
                  </p>
                </div>
                <Switch
                  id="new-dashboard"
                  checked={config.featureFlags.newDashboard}
                  onCheckedChange={(checked) => 
                    setConfig({ 
                      ...config, 
                      featureFlags: { ...config.featureFlags, newDashboard: checked }
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="advanced-analytics">Advanced Analytics</Label>
                  <p className="text-sm text-gray-500">
                    Enable detailed usage analytics
                  </p>
                </div>
                <Switch
                  id="advanced-analytics"
                  checked={config.featureFlags.advancedAnalytics}
                  onCheckedChange={(checked) => 
                    setConfig({ 
                      ...config, 
                      featureFlags: { ...config.featureFlags, advancedAnalytics: checked }
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="beta-features">Beta Features</Label>
                  <p className="text-sm text-gray-500">
                    Allow users to access beta features
                  </p>
                </div>
                <Switch
                  id="beta-features"
                  checked={config.featureFlags.betaFeatures}
                  onCheckedChange={(checked) => 
                    setConfig({ 
                      ...config, 
                      featureFlags: { ...config.featureFlags, betaFeatures: checked }
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-backup">Automatic Backups</Label>
                  <p className="text-sm text-gray-500">
                    Daily automated database backups
                  </p>
                </div>
                <Switch
                  id="auto-backup"
                  checked={config.autoBackupEnabled}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, autoBackupEnabled: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          size="lg"
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}