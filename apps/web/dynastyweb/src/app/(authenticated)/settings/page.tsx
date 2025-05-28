'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FontSizeSettings } from '@/components/FontSizeSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="mr-4"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      <div className="space-y-6">
        {/* Accessibility Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Accessibility</h2>
          <FontSizeSettings />
        </div>

        <Separator />

        {/* Account Settings */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Account</h2>
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>
                  Update your personal information and preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={() => router.push('/profile/edit')}>
                  Edit Profile
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Manage how you receive updates and alerts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={() => router.push('/settings/notifications')}>
                  Manage Notifications
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Privacy Settings</CardTitle>
                <CardDescription>
                  Control your privacy and data sharing preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={() => router.push('/settings/privacy')}>
                  Privacy Settings
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>
                  Manage your account security and authentication
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={() => router.push('/settings/security')}>
                  Security Settings
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />

        {/* About Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">About</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2 text-sm text-gray-600">
                <p>Dynasty App v1.0.0</p>
                <p>© 2024 Dynasty. All rights reserved.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}