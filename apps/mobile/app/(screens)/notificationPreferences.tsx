import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { Typography } from '../../constants/Typography';
import AppHeader from '../../components/ui/AppHeader';
import IconButton, { IconSet } from '../../components/ui/IconButton';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { getNotificationService } from '../../src/services/NotificationService';
import Button from '../../components/ui/Button';
import { logger } from '../../src/services/LoggingService';

interface PreferenceItem {
  key: keyof NotificationPreferences;
  title: string;
  description: string;
  icon: string;
}

interface NotificationPreferences {
  enabled: boolean;
  stories: boolean;
  comments: boolean;
  events: boolean;
  messages: boolean;
  family: boolean;
  system: boolean;
}

const preferenceItems: PreferenceItem[] = [
  {
    key: 'stories',
    title: 'Stories',
    description: 'New stories and likes on your stories',
    icon: 'book-outline',
  },
  {
    key: 'comments',
    title: 'Comments',
    description: 'Comments and replies on your posts',
    icon: 'chatbubble-outline',
  },
  {
    key: 'events',
    title: 'Events',
    description: 'Event invitations, updates, and reminders',
    icon: 'calendar-outline',
  },
  {
    key: 'messages',
    title: 'Messages',
    description: 'Direct messages from family members',
    icon: 'mail-outline',
  },
  {
    key: 'family',
    title: 'Family Updates',
    description: 'Family tree changes and invitations',
    icon: 'people-outline',
  },
  {
    key: 'system',
    title: 'System Notifications',
    description: 'Important app updates and announcements',
    icon: 'megaphone-outline',
  },
];

const NotificationPreferencesScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    enabled: true,
    stories: true,
    comments: true,
    events: true,
    messages: true,
    family: true,
    system: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalPreferences, setOriginalPreferences] = useState<NotificationPreferences | null>(null);

  const { handleError, withErrorHandling } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Notification Preferences Error',
    trackCurrentScreen: true,
  });

  const notificationService = getNotificationService();

  const loadPreferences = useCallback(withErrorHandling(async () => {
    try {
      setIsLoading(true);
      const prefs = await notificationService.getNotificationPreferences();
      setPreferences(prefs);
      setOriginalPreferences(prefs);
      
      // Check if notifications are enabled at system level
      const systemEnabled = await notificationService.areNotificationsEnabled();
      if (!systemEnabled && prefs.enabled) {
        // User has disabled notifications at system level
        Alert.alert(
          'Notifications Disabled',
          'You have disabled notifications for Dynasty in your device settings. To receive notifications, please enable them in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => {
              // This would open system settings on a real device
              logger.debug('Open system settings');
            }},
          ]
        );
      }
    } catch (error) {
      handleError(error, {
        action: 'loadPreferences',
      });
    } finally {
      setIsLoading(false);
    }
  }), [handleError, notificationService]);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleToggle = (key: keyof NotificationPreferences) => {
    const newPreferences = { ...preferences };
    
    if (key === 'enabled') {
      // If toggling master switch, update all preferences
      const newValue = !preferences.enabled;
      Object.keys(newPreferences).forEach((k) => {
        newPreferences[k as keyof NotificationPreferences] = newValue;
      });
    } else {
      // Toggle individual preference
      newPreferences[key] = !preferences[key];
      
      // If turning on an individual preference, ensure master is on
      if (!preferences[key] && !preferences.enabled) {
        newPreferences.enabled = true;
      }
      
      // If all individual preferences are off, turn off master
      const allOff = !newPreferences.stories && 
                     !newPreferences.comments && 
                     !newPreferences.events && 
                     !newPreferences.messages && 
                     !newPreferences.family && 
                     !newPreferences.system;
      if (allOff) {
        newPreferences.enabled = false;
      }
    }
    
    setPreferences(newPreferences);
    setHasChanges(JSON.stringify(newPreferences) !== JSON.stringify(originalPreferences));
  };

  const savePreferences = withErrorHandling(async () => {
    try {
      setIsSaving(true);
      await notificationService.updateNotificationPreferences(preferences);
      setOriginalPreferences(preferences);
      setHasChanges(false);
      
      Alert.alert(
        'Success',
        'Your notification preferences have been updated.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      handleError(error, {
        action: 'savePreferences',
      });
      Alert.alert(
        'Error',
        'Failed to save preferences. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSaving(false);
    }
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <AppHeader
          title="Notification Preferences"
          headerLeft={() => (
            <IconButton
              iconName="arrow-back"
              iconSet={IconSet.Ionicons}
              size={28}
              color={Colors.light.primary}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
            />
          )}
        />
      ),
    });
  }, [navigation, router]);

  const renderPreferenceItem = (item: PreferenceItem) => (
    <View key={item.key} style={styles.preferenceItem}>
      <View style={styles.preferenceContent}>
        <View style={styles.preferenceIcon}>
          <IconButton
            iconName={item.icon}
            iconSet={IconSet.Ionicons}
            size={24}
            color={Colors.light.icon.secondary}
            onPress={() => {}}
            disabled
          />
        </View>
        <View style={styles.preferenceText}>
          <Text style={styles.preferenceTitle}>{item.title}</Text>
          <Text style={styles.preferenceDescription}>{item.description}</Text>
        </View>
      </View>
      <Switch
        value={preferences[item.key]}
        onValueChange={() => handleToggle(item.key)}
        trackColor={{ 
          false: Colors.light.background.tertiary, 
          true: Colors.light.primary + '50' 
        }}
        thumbColor={preferences[item.key] ? Colors.light.primary : Colors.light.icon.tertiary}
        disabled={!preferences.enabled && item.key !== 'enabled'}
      />
    </View>
  );

  if (isLoading) {
    return (
      <ErrorBoundary screenName="NotificationPreferencesScreen">
        <View style={[styles.container, styles.centerContainer]}>
          <Text style={styles.loadingText}>Loading preferences...</Text>
        </View>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="NotificationPreferencesScreen">
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Master Switch */}
        <View style={styles.section}>
          <View style={styles.masterSwitch}>
            <View style={styles.preferenceContent}>
              <Text style={styles.masterTitle}>Enable Notifications</Text>
              <Text style={styles.masterDescription}>
                Turn on to receive push notifications from Dynasty
              </Text>
            </View>
            <Switch
              value={preferences.enabled}
              onValueChange={() => handleToggle('enabled')}
              trackColor={{ 
                false: Colors.light.background.tertiary, 
                true: Colors.light.primary + '50' 
              }}
              thumbColor={preferences.enabled ? Colors.light.primary : Colors.light.icon.tertiary}
            />
          </View>
        </View>

        {/* Individual Preferences */}
        <View style={[styles.section, !preferences.enabled && styles.disabledSection]}>
          <Text style={styles.sectionTitle}>Notification Types</Text>
          {preferenceItems.map(renderPreferenceItem)}
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoText}>
            You can customize which types of notifications you receive. 
            Dynasty will only send you notifications for the categories you enable.
          </Text>
        </View>

        {/* Save Button */}
        {hasChanges && (
          <View style={styles.saveButtonContainer}>
            <Button
              label="Save Preferences"
              onPress={savePreferences}
              variant="primary"
              loading={isSaving}
              disabled={isSaving}
            />
          </View>
        )}
      </ScrollView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background.primary,
  },
  contentContainer: {
    paddingBottom: Spacing.xxl,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...Typography.styles.bodyLarge,
    color: Colors.light.text.secondary,
  },
  section: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.light.background.primary,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border.default,
  },
  disabledSection: {
    opacity: 0.6,
  },
  sectionTitle: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.light.background.secondary,
  },
  masterSwitch: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  masterTitle: {
    ...Typography.styles.heading5,
    color: Colors.light.text.primary,
    marginBottom: Spacing.xxs,
  },
  masterDescription: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.secondary,
  },
  preferenceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border.light,
  },
  preferenceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  preferenceIcon: {
    marginRight: Spacing.md,
  },
  preferenceText: {
    flex: 1,
    marginRight: Spacing.md,
  },
  preferenceTitle: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.primary,
    marginBottom: Spacing.xxs,
  },
  preferenceDescription: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.secondary,
  },
  infoSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  infoText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.tertiary,
    textAlign: 'center',
  },
  saveButtonContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
});

export default NotificationPreferencesScreen;