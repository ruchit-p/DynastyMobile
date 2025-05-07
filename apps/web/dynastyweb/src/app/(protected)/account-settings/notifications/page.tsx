"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Bell, Mail, MessageSquare, UserPlus, Calendar, Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useToast } from "@/components/ui/use-toast"
import { SettingsManager, type NotificationSettings } from "@/utils/settingsManager"

export default function NotificationsPage() {
  const { currentUser } = useAuth()
  const { toast } = useToast()
  const [settings, setSettings] = useState<NotificationSettings>({
    pushEnabled: true,
    emailEnabled: true,
    newMessageEnabled: true,
    friendRequestsEnabled: true,
    eventRemindersEnabled: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      if (!currentUser?.uid) return

      try {
        const settingsManager = SettingsManager.getInstance()
        const userSettings = await settingsManager.loadSettings(currentUser.uid)
        setSettings(userSettings.notifications)
      } catch (error) {
        console.error("Error loading notification settings:", error)
        toast({
          title: "Error",
          description: "Failed to load notification settings. Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadSettings()
  }, [currentUser?.uid, toast])

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSave = async () => {
    if (!currentUser?.uid) return

    try {
      setIsSaving(true)
      const settingsManager = SettingsManager.getInstance()
      await settingsManager.saveSettings(currentUser.uid, {
        notifications: settings,
        privacy: (await settingsManager.loadSettings(currentUser.uid)).privacy,
      })

      toast({
        title: "Success",
        description: "Your notification settings have been updated.",
      })
    } catch (error) {
      console.error("Error saving notification settings:", error)
      toast({
        title: "Error",
        description: "Failed to save notification settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0A5C36]" />
      </div>
    )
  }

  return (
    <>
      <h1 className="text-2xl font-bold mb-6 text-[#0A5C36]">Notification Preferences</h1>
      
      <div className="space-y-8">
        <div className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">Notification Channels</h2>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-[#F9FAFB] p-2 rounded-lg">
                <Bell className="h-5 w-5 text-[#0A5C36]" />
              </div>
              <Label htmlFor="push-notifications" className="text-base">
                Push Notifications
              </Label>
            </div>
            <Switch
              id="push-notifications"
              checked={settings.pushEnabled}
              onCheckedChange={() => handleToggle("pushEnabled")}
              useGoldColor
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-[#F9FAFB] p-2 rounded-lg">
                <Mail className="h-5 w-5 text-[#0A5C36]" />
              </div>
              <Label htmlFor="email-notifications" className="text-base">
                Email Notifications
              </Label>
            </div>
            <Switch
              id="email-notifications"
              checked={settings.emailEnabled}
              onCheckedChange={() => handleToggle("emailEnabled")}
              useGoldColor
            />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">Notification Types</h2>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-[#F9FAFB] p-2 rounded-lg">
                <MessageSquare className="h-5 w-5 text-[#0A5C36]" />
              </div>
              <div>
                <Label htmlFor="message-notifications" className="text-base">
                  New Messages
                </Label>
                <p className="text-xs text-gray-500 mt-1">Receive notifications for new family messages</p>
              </div>
            </div>
            <Switch
              id="message-notifications"
              checked={settings.newMessageEnabled}
              onCheckedChange={() => handleToggle("newMessageEnabled")}
              useGoldColor
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-[#F9FAFB] p-2 rounded-lg">
                <UserPlus className="h-5 w-5 text-[#0A5C36]" />
              </div>
              <div>
                <Label htmlFor="request-notifications" className="text-base">
                  Friend Requests
                </Label>
                <p className="text-xs text-gray-500 mt-1">Receive notifications for family connection requests</p>
              </div>
            </div>
            <Switch
              id="request-notifications"
              checked={settings.friendRequestsEnabled}
              onCheckedChange={() => handleToggle("friendRequestsEnabled")}
              useGoldColor
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-[#F9FAFB] p-2 rounded-lg">
                <Calendar className="h-5 w-5 text-[#0A5C36]" />
              </div>
              <div>
                <Label htmlFor="event-notifications" className="text-base">
                  Event Reminders
                </Label>
                <p className="text-xs text-gray-500 mt-1">Receive reminders for upcoming family events</p>
              </div>
            </div>
            <Switch
              id="event-notifications"
              checked={settings.eventRemindersEnabled}
              onCheckedChange={() => handleToggle("eventRemindersEnabled")}
              useGoldColor
            />
          </div>
        </div>
        
        <div className="pt-4 flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            variant="gold"
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </>
  )
} 