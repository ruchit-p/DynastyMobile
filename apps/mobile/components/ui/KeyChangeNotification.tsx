import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { Typography } from '../../constants/Typography';
import { useColorScheme } from '../../hooks/useColorScheme';
import Card from './Card';

export interface KeyChangeNotificationProps {
  userName: string;
  userId: string;
  timestamp?: Date;
  onVerify?: () => void;
  onDismiss?: () => void;
  onLearnMore?: () => void;
  style?: ViewStyle;
  testID?: string;
}

/**
 * KeyChangeNotification Component
 * 
 * Displays a notification when a contact's encryption key has changed.
 * This is an important security feature that alerts users to potential security issues.
 */
const KeyChangeNotification: React.FC<KeyChangeNotificationProps> = ({
  userName,
  userId,
  timestamp,
  onVerify,
  onDismiss,
  onLearnMore,
  style,
  testID,
}) => {
  const colorScheme = useColorScheme();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];

  const formatTimestamp = (date?: Date) => {
    if (!date) return '';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  return (
    <Card 
      variant="outlined" 
      style={[
        styles.container, 
        { borderColor: colors.warning },
        style
      ]}
      testID={testID}
    >
      <View style={styles.content}>
        {/* Warning Icon */}
        <View style={[styles.iconContainer, { backgroundColor: colors.warning + '20' }]}>
          <Ionicons 
            name="warning" 
            size={24} 
            color={colors.warning} 
          />
        </View>

        {/* Message Content */}
        <View style={styles.messageContainer}>
          <Text style={[styles.title, { color: colors.text.primary }]}>
            Safety Number Changed
          </Text>
          
          <Text style={[styles.message, { color: colors.text.secondary }]}>
            {userName}&apos;s safety number has changed. This could mean:
          </Text>

          <View style={styles.reasonsList}>
            <Text style={[styles.reasonItem, { color: colors.text.secondary }]}>
              • They reinstalled Dynasty
            </Text>
            <Text style={[styles.reasonItem, { color: colors.text.secondary }]}>
              • They got a new device
            </Text>
            <Text style={[styles.reasonItem, { color: colors.text.secondary }]}>
              • Someone could be intercepting messages
            </Text>
          </View>

          {timestamp && (
            <Text style={[styles.timestamp, { color: colors.text.tertiary }]}>
              Changed {formatTimestamp(timestamp)}
            </Text>
          )}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        {onVerify && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.primaryButton,
              { backgroundColor: colors.primary }
            ]}
            onPress={onVerify}
            activeOpacity={0.8}
            testID={`${testID}-verify-button`}
          >
            <Ionicons name="shield-checkmark" size={16} color="white" />
            <Text style={styles.primaryButtonText}>Verify</Text>
          </TouchableOpacity>
        )}

        {onLearnMore && (
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={onLearnMore}
            activeOpacity={0.8}
            testID={`${testID}-learn-more-button`}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
              Learn More
            </Text>
          </TouchableOpacity>
        )}

        {onDismiss && (
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={onDismiss}
            activeOpacity={0.8}
            testID={`${testID}-dismiss-button`}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text.secondary }]}>
              Dismiss
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    padding: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  messageContainer: {
    flex: 1,
  },
  title: {
    ...Typography.styles.bodyMedium,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  message: {
    ...Typography.styles.bodySmall,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  reasonsList: {
    marginBottom: Spacing.sm,
  },
  reasonItem: {
    ...Typography.styles.bodySmall,
    lineHeight: 20,
  },
  timestamp: {
    ...Typography.styles.caption,
    marginTop: Spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  actionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1,
  },
  secondaryButton: {
    flex: 1,
  },
  primaryButtonText: {
    ...Typography.styles.bodySmall,
    color: 'white',
    fontWeight: '600',
    marginLeft: Spacing.xs,
  },
  secondaryButtonText: {
    ...Typography.styles.bodySmall,
    fontWeight: '600',
  },
});

export default KeyChangeNotification;