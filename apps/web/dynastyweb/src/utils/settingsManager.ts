import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"

export interface UserSettings {
  notifications: NotificationSettings
  privacy: PrivacySettings
}

export interface NotificationSettings {
  pushEnabled: boolean
  emailEnabled: boolean
  newMessageEnabled: boolean
  friendRequestsEnabled: boolean
  eventRemindersEnabled: boolean
}

export interface PrivacySettings {
  locationEnabled: boolean
  strictPrivacy: boolean
  dataRetention: "30days" | "90days" | "1year" | "forever"
}

const defaultSettings: UserSettings = {
  notifications: {
    pushEnabled: true,
    emailEnabled: true,
    newMessageEnabled: true,
    friendRequestsEnabled: true,
    eventRemindersEnabled: false,
  },
  privacy: {
    locationEnabled: true,
    strictPrivacy: false,
    dataRetention: "1year",
  },
}

export class SettingsManager {
  private static instance: SettingsManager
  private debounceTimeout: ReturnType<typeof setTimeout> | null = null
  private readonly debounceInterval = 500 // 500ms

  private constructor() {}

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager()
    }
    return SettingsManager.instance
  }

  async loadSettings(userId: string): Promise<UserSettings> {
    try {
      const docRef = doc(db, "userSettings", userId)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        return docSnap.data() as UserSettings
      }

      // If no settings exist, create default settings
      await this.saveSettings(userId, defaultSettings)
      return defaultSettings
    } catch (error) {
      console.error("Error loading settings:", error)
      return defaultSettings
    }
  }

  async saveSettings(userId: string, settings: UserSettings): Promise<void> {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout)
    }

    return new Promise((resolve, reject) => {
      this.debounceTimeout = setTimeout(async () => {
        try {
          const docRef = doc(db, "userSettings", userId)
          
          // Create a clean settings object for Firestore
          // This ensures we don't have any undefined values that could cause issues
          const cleanSettings = {
            notifications: {
              pushEnabled: settings.notifications.pushEnabled ?? defaultSettings.notifications.pushEnabled,
              emailEnabled: settings.notifications.emailEnabled ?? defaultSettings.notifications.emailEnabled,
              newMessageEnabled: settings.notifications.newMessageEnabled ?? defaultSettings.notifications.newMessageEnabled,
              friendRequestsEnabled: settings.notifications.friendRequestsEnabled ?? defaultSettings.notifications.friendRequestsEnabled,
              eventRemindersEnabled: settings.notifications.eventRemindersEnabled ?? defaultSettings.notifications.eventRemindersEnabled,
            },
            privacy: {
              locationEnabled: settings.privacy.locationEnabled ?? defaultSettings.privacy.locationEnabled,
              strictPrivacy: settings.privacy.strictPrivacy ?? defaultSettings.privacy.strictPrivacy,
              dataRetention: settings.privacy.dataRetention ?? defaultSettings.privacy.dataRetention,
            },
            updatedAt: serverTimestamp(),
          }
          
          await setDoc(docRef, cleanSettings)
          resolve()
        } catch (error) {
          console.error("Error saving settings:", error)
          reject(error)
        }
      }, this.debounceInterval)
    })
  }

  getDefaultSettings(): UserSettings {
    return { ...defaultSettings }
  }
} 