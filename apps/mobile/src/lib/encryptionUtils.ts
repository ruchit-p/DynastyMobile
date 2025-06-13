import { getFirebaseDb, getFirebaseAuth } from './firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../services/LoggingService';

export interface EncryptionSettings {
  encryptStories: boolean;
  encryptEvents: boolean;
  encryptVault: boolean;
  encryptAllMedia: boolean;
}

const DEFAULT_SETTINGS: EncryptionSettings = {
  encryptStories: false,
  encryptEvents: false,
  encryptVault: true, // Vault should be encrypted by default
  encryptAllMedia: false,
};

const ENCRYPTION_SETTINGS_KEY = '@dynasty_encryption_settings';

/**
 * Get user's encryption settings
 */
export async function getEncryptionSettings(): Promise<EncryptionSettings> {
  try {
    // First try local storage for quick access
    const localSettings = await AsyncStorage.getItem(ENCRYPTION_SETTINGS_KEY);
    if (localSettings) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localSettings) };
    }

    // If not in local storage, fetch from Firebase
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) {
      return DEFAULT_SETTINGS;
    }

    const db = getFirebaseDb();
    const settingsDoc = await db.collection('users').doc(userId)
      .collection('settings').doc('encryption').get();

    if (settingsDoc.exists) {
      const settings = settingsDoc.data() as EncryptionSettings;
      // Cache locally
      await AsyncStorage.setItem(ENCRYPTION_SETTINGS_KEY, JSON.stringify(settings));
      return { ...DEFAULT_SETTINGS, ...settings };
    }

    return DEFAULT_SETTINGS;
  } catch (error) {
    logger.error('Failed to get encryption settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Update user's encryption settings
 */
export async function updateEncryptionSettings(
  settings: Partial<EncryptionSettings>
): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    const db = getFirebaseDb();
    const updatedSettings = { ...DEFAULT_SETTINGS, ...settings };

    // Update in Firebase
    await db.collection('users').doc(userId)
      .collection('settings').doc('encryption')
      .set(updatedSettings, { merge: true });

    // Update local cache
    await AsyncStorage.setItem(ENCRYPTION_SETTINGS_KEY, JSON.stringify(updatedSettings));
  } catch (error) {
    logger.error('Failed to update encryption settings:', error);
    throw error;
  }
}

/**
 * Check if encryption is enabled for stories
 */
export async function shouldEncryptStories(): Promise<boolean> {
  const settings = await getEncryptionSettings();
  return settings.encryptStories || settings.encryptAllMedia;
}

/**
 * Check if encryption is enabled for events
 */
export async function shouldEncryptEvents(): Promise<boolean> {
  const settings = await getEncryptionSettings();
  return settings.encryptEvents || settings.encryptAllMedia;
}

/**
 * Check if encryption is enabled for vault
 */
export async function shouldEncryptVault(): Promise<boolean> {
  const settings = await getEncryptionSettings();
  return settings.encryptVault || settings.encryptAllMedia;
}

/**
 * Clear cached encryption settings
 */
export async function clearEncryptionSettingsCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ENCRYPTION_SETTINGS_KEY);
  } catch (error) {
    logger.error('Failed to clear encryption settings cache:', error);
  }
}