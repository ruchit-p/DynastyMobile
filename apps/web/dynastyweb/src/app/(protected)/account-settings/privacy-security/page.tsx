"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Fingerprint, Key, Trash, Loader2, Shield, Lock, Database } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useToast } from "@/components/ui/use-toast"
import { doc, deleteDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { deleteUser } from "firebase/auth"
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog"
import { SettingsManager, type PrivacySettings } from "@/utils/settingsManager"

export default function PrivacySecurityPage() {
  const router = useRouter()
  const { currentUser, firestoreUser, signOut } = useAuth()
  const { toast } = useToast()
  const [settings, setSettings] = useState<PrivacySettings>({
    locationEnabled: true,
    strictPrivacy: false,
    dataRetention: "1year",
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      if (!currentUser?.uid) return

      try {
        const settingsManager = SettingsManager.getInstance()
        const userSettings = await settingsManager.loadSettings(currentUser.uid)
        setSettings(userSettings.privacy)
      } catch (error) {
        console.error("Error loading privacy settings:", error)
        toast({
          title: "Error",
          description: "Failed to load privacy settings. Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadSettings()
  }, [currentUser?.uid, toast])

  const handleToggle = (key: keyof PrivacySettings) => {
    if (key === "locationEnabled" || key === "strictPrivacy") {
      setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
    }
  }

  const handleDataRetentionChange = (value: PrivacySettings["dataRetention"]) => {
    setSettings((prev) => ({ ...prev, dataRetention: value }))
  }

  const handleSave = async () => {
    if (!currentUser?.uid) return

    try {
      setIsSaving(true)
      const settingsManager = SettingsManager.getInstance()
      await settingsManager.saveSettings(currentUser.uid, {
        notifications: (await settingsManager.loadSettings(currentUser.uid)).notifications,
        privacy: settings,
      })

      toast({
        title: "Success",
        description: "Your privacy settings have been updated.",
      })
    } catch (error) {
      console.error("Error saving privacy settings:", error)
      toast({
        title: "Error",
        description: "Failed to save privacy settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!currentUser || !firestoreUser) return

    try {
      setIsDeleting(true)

      // Delete user document from Firestore
      await deleteDoc(doc(db, "users", currentUser.uid))

      // Delete user from Firebase Auth
      await deleteUser(currentUser)

      // Log out the user
      await signOut()

      toast({
        title: "Account Deleted",
        description: "Your account has been permanently deleted.",
      })

      // Redirect to home page
      router.push("/")
    } catch (error) {
      console.error("Error deleting account:", error)
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again.",
        variant: "destructive",
      })
      setIsDeleting(false)
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
      <h1 className="text-2xl font-bold mb-6 text-[#0A5C36]">Privacy & Security</h1>
      
      <div className="space-y-8">
        {/* Privacy section */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">Privacy</h2>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-[#F9FAFB] p-2 rounded-lg">
                <Fingerprint className="h-5 w-5 text-[#0A5C36]" />
              </div>
              <div>
                <Label htmlFor="location-services" className="text-base">
                  Location Services
                </Label>
                <p className="text-xs text-gray-500 mt-1">Allow the app to access your location</p>
              </div>
            </div>
            <Switch
              id="location-services"
              checked={settings.locationEnabled}
              onCheckedChange={() => handleToggle("locationEnabled")}
              useGoldColor
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-[#F9FAFB] p-2 rounded-lg">
                <Shield className="h-5 w-5 text-[#0A5C36]" />
              </div>
              <div>
                <Label htmlFor="privacy-mode" className="text-base">
                  Privacy Mode
                </Label>
                <p className="text-xs text-gray-500 mt-1">Enable stricter privacy settings</p>
              </div>
            </div>
            <Switch
              id="privacy-mode"
              checked={settings.strictPrivacy}
              onCheckedChange={() => handleToggle("strictPrivacy")}
              useGoldColor
            />
          </div>
        </div>

        {/* Data retention section */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">Data Retention</h2>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-[#F9FAFB] p-2 rounded-lg">
                <Database className="h-5 w-5 text-[#0A5C36]" />
              </div>
              <div>
                <Label htmlFor="data-retention" className="text-base">
                  Data Retention Period
                </Label>
                <p className="text-xs text-gray-500 mt-1">How long we keep your data</p>
              </div>
            </div>
            <div className="w-40">
              <Select onValueChange={handleDataRetentionChange} value={settings.dataRetention}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30days">30 days</SelectItem>
                  <SelectItem value="90days">90 days</SelectItem>
                  <SelectItem value="1year">1 year</SelectItem>
                  <SelectItem value="forever">Forever</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Security section */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2">Security</h2>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-[#F9FAFB] p-2 rounded-lg">
                <Lock className="h-5 w-5 text-[#0A5C36]" />
              </div>
              <div>
                <Label className="text-base">Password</Label>
                <p className="text-xs text-gray-500 mt-1">Change your account password</p>
              </div>
            </div>
            <Button variant="gold" onClick={() => setShowChangePasswordDialog(true)}>
              <Key className="h-4 w-4 mr-2" />
              Change
            </Button>
          </div>

          {/* Two-factor auth section */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-[#F9FAFB] p-2 rounded-lg">
                <Shield className="h-5 w-5 text-[#0A5C36]" />
              </div>
              <div>
                <Label className="text-base">Phone Verification</Label>
                <p className="text-xs text-gray-500 mt-1">
                  {firestoreUser?.phoneNumber 
                    ? firestoreUser?.phoneNumberVerified
                      ? `Your phone number ${firestoreUser.phoneNumber} is verified`
                      : "Verify your phone number to enhance account security" 
                    : "Add a phone number to enable verification"}
                </p>
              </div>
            </div>
            <Button 
              variant={firestoreUser?.phoneNumberVerified ? "outline" : "gold"}
              onClick={() => router.push("/account-settings/personal-information")}
            >
              {firestoreUser?.phoneNumberVerified 
                ? "Manage" 
                : firestoreUser?.phoneNumber 
                  ? "Verify Now" 
                  : "Add Number"}
            </Button>
          </div>
        </div>

        {/* Danger Zone section */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium border-b pb-2 text-red-600">Danger Zone</h2>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-red-50 p-2 rounded-lg">
                <Trash className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <Label className="text-base">Delete Account</Label>
                <p className="text-xs text-gray-500 mt-1">Permanently delete your account and data</p>
              </div>
            </div>
            <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              Delete Account
            </Button>
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

      <ChangePasswordDialog
        open={showChangePasswordDialog}
        onOpenChange={setShowChangePasswordDialog}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your account and remove your data from our
              servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <Label htmlFor="delete-confirmation" className="text-sm font-medium">
              Type &quot;DELETE&quot; to confirm
            </Label>
            <Input
              id="delete-confirmation"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="mt-1"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleteConfirmation !== "DELETE" || isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isDeleting ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
} 