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
import VerificationIndicator from './VerificationIndicator';

export interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  isOnline?: boolean;
  verificationStatus?: 'verified' | 'unverified' | 'changed';
  onBackPress?: () => void;
  onVerificationPress?: () => void;
  onSearchPress?: () => void;
  onMediaPress?: () => void;
  onInfoPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

/**
 * ChatHeader Component
 * 
 * Header for chat screens showing user info and verification status.
 */
const ChatHeader: React.FC<ChatHeaderProps> = ({
  title,
  subtitle,
  isOnline = false,
  verificationStatus = 'unverified',
  onBackPress,
  onVerificationPress,
  onSearchPress,
  onMediaPress,
  onInfoPress,
  style,
  testID,
}) => {
  const colorScheme = useColorScheme();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }, style]} testID={testID}>
      <View style={styles.leftSection}>
        {onBackPress && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBackPress}
            activeOpacity={0.7}
            testID="chat-header-back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        )}
        
        <View style={styles.titleContainer}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
              {title}
            </Text>
            {isOnline && (
              <View 
                style={[styles.onlineIndicator, { backgroundColor: colors.success }]} 
                testID="online-indicator"
              />
            )}
          </View>
          {subtitle && (
            <Text style={[styles.subtitle, { color: colors.text.secondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.rightSection}>
        {verificationStatus && onVerificationPress && (
          <TouchableOpacity
            onPress={onVerificationPress}
            activeOpacity={0.7}
            testID="chat-header-verification"
          >
            <VerificationIndicator
              level={verificationStatus}
              size="small"
              style={styles.verificationIndicator}
            />
          </TouchableOpacity>
        )}
        
        {onSearchPress && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onSearchPress}
            activeOpacity={0.7}
            testID="chat-header-search"
          >
            <Ionicons name="search" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        )}
        
        {onMediaPress && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onMediaPress}
            activeOpacity={0.7}
            testID="chat-header-media"
          >
            <Ionicons name="images" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        )}
        
        {onInfoPress && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onInfoPress}
            activeOpacity={0.7}
            testID="chat-header-info"
          >
            <Ionicons name="information-circle" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    marginRight: Spacing.sm,
  },
  titleContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    ...Typography.styles.heading3,
    marginRight: Spacing.xs,
  },
  subtitle: {
    ...Typography.styles.bodySmall,
    marginTop: 2,
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: Spacing.xs,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationIndicator: {
    marginRight: Spacing.sm,
  },
  actionButton: {
    marginLeft: Spacing.sm,
  },
});

export default ChatHeader;