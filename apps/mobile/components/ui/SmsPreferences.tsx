import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Switch,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { useAuth } from '../../src/contexts/AuthContext';
import { callFirebaseFunction } from '../../src/lib/errorUtils';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import ValidatedInput from './ValidatedInput';
import Button from './Button';

interface SmsPreferences {
  enabled: boolean;
  familyInvites: boolean;
  eventInvites: boolean;
  eventReminders: boolean;
  eventUpdates: boolean;
  rsvpConfirmations: boolean;
  reminderTiming: number;
}

interface SmsPreferencesProps {
  onPhoneVerified?: () => void;
}

export default function SmsPreferences({ onPhoneVerified }: SmsPreferencesProps) {
  const { user, firestoreUser } = useAuth();
  const { handleError, withErrorHandling } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'SMS Preferences Error',
  });

  const [preferences, setPreferences] = useState<SmsPreferences>({
    enabled: false,
    familyInvites: true,
    eventInvites: true,
    eventReminders: true,
    eventUpdates: true,
    rsvpConfirmations: true,
    reminderTiming: 24,
  });

  const [phoneNumber, setPhoneNumber] = useState('');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = withErrorHandling(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Load from Firestore user data
      if (firestoreUser) {
        setPreferences(firestoreUser.smsPreferences || preferences);
        setPhoneNumber(firestoreUser.phoneNumber || '');
        setIsPhoneVerified(firestoreUser.phoneVerified || false);
      }
    } finally {
      setIsLoading(false);
    }
  });

  const handleSavePreferences = withErrorHandling(async () => {
    if (!user) return;

    // Check if phone is verified before enabling SMS
    if (preferences.enabled && !isPhoneVerified) {
      Alert.alert(
        'Phone Verification Required',
        'Please verify your phone number before enabling SMS notifications.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsSaving(true);
    try {
      await callFirebaseFunction('updateSmsPreferences', {
        preferences,
        phoneNumber: phoneNumber.trim(),
      });

      Alert.alert('Success', 'SMS preferences updated successfully');
    } finally {
      setIsSaving(false);
    }
  });

  const handleSendVerification = withErrorHandling(async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter a phone number');
      return;
    }

    setIsSaving(true);
    try {
      await callFirebaseFunction('sendPhoneVerification', {
        phoneNumber: phoneNumber.trim(),
      });

      setShowVerification(true);
      Alert.alert('Success', 'Verification code sent to your phone');
    } finally {
      setIsSaving(false);
    }
  });

  const handleVerifyCode = withErrorHandling(async () => {
    if (!verificationCode.trim()) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }

    setIsSaving(true);
    try {
      const result = await callFirebaseFunction('verifySmsCode', {
        phoneNumber: phoneNumber.trim(),
        code: verificationCode.trim(),
      });

      if (result.verified) {
        setIsPhoneVerified(true);
        setShowVerification(false);
        setVerificationCode('');
        Alert.alert('Success', 'Phone number verified successfully');
        onPhoneVerified?.();
      } else {
        Alert.alert('Error', 'Invalid verification code');
      }
    } finally {
      setIsSaving(false);
    }
  });

  const reminderOptions = [
    { value: 2, label: '2 hours before' },
    { value: 24, label: '1 day before' },
    { value: 48, label: '2 days before' },
    { value: 168, label: '1 week before' },
  ];

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dynastyGreen} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Phone Number Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Phone Number</Text>
        <View style={styles.phoneSection}>
          <ValidatedInput
            label="Phone Number"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+1 234-567-8900"
            keyboardType="phone-pad"
            editable={!isPhoneVerified}
            style={styles.phoneInput}
          />
          {isPhoneVerified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.palette.status.success} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.verifyButton}
              onPress={handleSendVerification}
              disabled={isSaving || !phoneNumber.trim()}
            >
              <Text style={styles.verifyButtonText}>Verify</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Verification Code Input */}
        {showVerification && !isPhoneVerified && (
          <View style={styles.verificationSection}>
            <ValidatedInput
              label="Verification Code"
              value={verificationCode}
              onChangeText={setVerificationCode}
              placeholder="Enter 6-digit code"
              keyboardType="number-pad"
              maxLength={6}
              style={styles.codeInput}
            />
            <Button
              title="Verify Code"
              onPress={handleVerifyCode}
              isLoading={isSaving}
              disabled={!verificationCode.trim() || verificationCode.length !== 6}
              style={styles.verifyCodeButton}
            />
          </View>
        )}
      </View>

      {/* SMS Preferences Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SMS Notifications</Text>
        
        {/* Master Toggle */}
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceInfo}>
            <Text style={styles.preferenceTitle}>Enable SMS Notifications</Text>
            <Text style={styles.preferenceDescription}>
              Receive important updates via text message
            </Text>
          </View>
          <Switch
            value={preferences.enabled}
            onValueChange={(value) => setPreferences({ ...preferences, enabled: value })}
            trackColor={{ false: Colors.light.border.primary, true: Colors.dynastyGreen }}
            thumbColor={Colors.light.background.primary}
            disabled={!isPhoneVerified}
          />
        </View>

        {/* Individual Preferences */}
        {preferences.enabled && (
          <>
            <View style={styles.divider} />
            
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceTitle}>Family Invitations</Text>
                <Text style={styles.preferenceDescription}>
                  Get notified when invited to join a family
                </Text>
              </View>
              <Switch
                value={preferences.familyInvites}
                onValueChange={(value) => setPreferences({ ...preferences, familyInvites: value })}
                trackColor={{ false: Colors.light.border.primary, true: Colors.dynastyGreen }}
                thumbColor={Colors.light.background.primary}
              />
            </View>

            <View style={styles.preferenceRow}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceTitle}>Event Invitations</Text>
                <Text style={styles.preferenceDescription}>
                  Receive invites to family events
                </Text>
              </View>
              <Switch
                value={preferences.eventInvites}
                onValueChange={(value) => setPreferences({ ...preferences, eventInvites: value })}
                trackColor={{ false: Colors.light.border.primary, true: Colors.dynastyGreen }}
                thumbColor={Colors.light.background.primary}
              />
            </View>

            <View style={styles.preferenceRow}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceTitle}>Event Reminders</Text>
                <Text style={styles.preferenceDescription}>
                  Get reminded about upcoming events
                </Text>
              </View>
              <Switch
                value={preferences.eventReminders}
                onValueChange={(value) => setPreferences({ ...preferences, eventReminders: value })}
                trackColor={{ false: Colors.light.border.primary, true: Colors.dynastyGreen }}
                thumbColor={Colors.light.background.primary}
              />
            </View>

            <View style={styles.preferenceRow}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceTitle}>Event Updates</Text>
                <Text style={styles.preferenceDescription}>
                  Notifications about event changes
                </Text>
              </View>
              <Switch
                value={preferences.eventUpdates}
                onValueChange={(value) => setPreferences({ ...preferences, eventUpdates: value })}
                trackColor={{ false: Colors.light.border.primary, true: Colors.dynastyGreen }}
                thumbColor={Colors.light.background.primary}
              />
            </View>

            <View style={styles.preferenceRow}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceTitle}>RSVP Confirmations</Text>
                <Text style={styles.preferenceDescription}>
                  Confirmation when you RSVP to events
                </Text>
              </View>
              <Switch
                value={preferences.rsvpConfirmations}
                onValueChange={(value) => setPreferences({ ...preferences, rsvpConfirmations: value })}
                trackColor={{ false: Colors.light.border.primary, true: Colors.dynastyGreen }}
                thumbColor={Colors.light.background.primary}
              />
            </View>

            {/* Reminder Timing */}
            {preferences.eventReminders && (
              <>
                <View style={styles.divider} />
                <View style={styles.timingSection}>
                  <Text style={styles.timingTitle}>Default Reminder Time</Text>
                  <View style={styles.timingOptions}>
                    {reminderOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.timingOption,
                          preferences.reminderTiming === option.value && styles.timingOptionSelected,
                        ]}
                        onPress={() => setPreferences({ ...preferences, reminderTiming: option.value })}
                      >
                        <Text
                          style={[
                            styles.timingOptionText,
                            preferences.reminderTiming === option.value && styles.timingOptionTextSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </View>

      {/* Save Button */}
      <View style={styles.saveSection}>
        <Button
          title="Save Preferences"
          onPress={handleSavePreferences}
          isLoading={isSaving}
          style={styles.saveButton}
        />
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.light.text.secondary} />
        <Text style={styles.infoText}>
          Standard SMS rates may apply. You can opt out at any time by replying STOP to any message.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    padding: Spacing.lg,
    backgroundColor: Colors.light.background.card,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.styles.heading3,
    color: Colors.light.text.primary,
    marginBottom: Spacing.md,
  },
  phoneSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  phoneInput: {
    flex: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.palette.status.success + '10',
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  verifiedText: {
    ...Typography.styles.bodySmall,
    color: Colors.palette.status.success,
    fontWeight: Typography.weight.medium,
  },
  verifyButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dynastyGreen,
    borderRadius: BorderRadius.md,
  },
  verifyButtonText: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.inverse,
    fontWeight: Typography.weight.medium,
  },
  verificationSection: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: Typography.size.xl,
    letterSpacing: 5,
  },
  verifyCodeButton: {
    marginTop: Spacing.sm,
  },
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  preferenceInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  preferenceTitle: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.primary,
    fontWeight: Typography.weight.medium,
    marginBottom: Spacing.xxs,
  },
  preferenceDescription: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.secondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border.secondary,
    marginVertical: Spacing.xs,
  },
  timingSection: {
    paddingTop: Spacing.sm,
  },
  timingTitle: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.primary,
    fontWeight: Typography.weight.medium,
    marginBottom: Spacing.md,
  },
  timingOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  timingOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.light.border.primary,
    backgroundColor: Colors.light.background.primary,
  },
  timingOptionSelected: {
    backgroundColor: Colors.dynastyGreen,
    borderColor: Colors.dynastyGreen,
  },
  timingOptionText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.secondary,
  },
  timingOptionTextSelected: {
    color: Colors.light.text.inverse,
    fontWeight: Typography.weight.medium,
  },
  saveSection: {
    padding: Spacing.lg,
  },
  saveButton: {
    width: '100%',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  infoText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.secondary,
    flex: 1,
  },
});