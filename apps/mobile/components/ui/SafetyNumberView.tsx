import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import Clipboard from '@react-native-clipboard/clipboard';

import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius, Shadows } from '../../constants/Spacing';
import { Typography } from '../../constants/Typography';
import { useColorScheme } from '../../hooks/useColorScheme';
import Card from './Card';

export interface SafetyNumberViewProps {
  numberString: string;
  qrCodeData: string;
  userName: string;
  verified?: boolean;
  onCopyNumber?: () => void;
  onVerificationChange?: (verified: boolean) => void;
  style?: ViewStyle;
  numberStyle?: TextStyle;
  testID?: string;
}

/**
 * SafetyNumberView Component
 * 
 * Displays a user's safety number and QR code for Signal Protocol verification.
 * Allows users to verify their conversation security.
 */
const SafetyNumberView: React.FC<SafetyNumberViewProps> = ({
  numberString,
  qrCodeData,
  userName,
  verified = false,
  onCopyNumber,
  onVerificationChange,
  style,
  numberStyle,
  testID,
}) => {
  const colorScheme = useColorScheme();
  const theme = colorScheme || 'light';
  const colors = Colors[theme];

  // Format the safety number for display (groups of 5 digits)
  const formatSafetyNumber = (number: string) => {
    return number.match(/.{1,5}/g)?.join(' ') || '';
  };

  const formattedNumber = formatSafetyNumber(numberString);

  return (
    <View style={[styles.container, style]} testID={testID}>
      {/* Safety Number Display */}
      <Card variant="elevated" style={styles.numberCard}>
        <Card.Header>
          <View style={styles.numberHeader}>
            <Text style={[styles.numberTitle, { color: colors.text.primary }]}>
              Your Safety Number with {userName}
            </Text>
            {verified && (
              <View style={[styles.verifiedBadge, { backgroundColor: colors.success }]}>
                <Ionicons name="shield-checkmark" size={14} color="white" />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            )}
          </View>
        </Card.Header>

        <Card.Content>
          <TouchableOpacity 
            onPress={() => {
              Clipboard.setString(numberString);
              Alert.alert('Copied', 'Safety number copied to clipboard');
              onCopyNumber?.();
            }} 
            style={[styles.numberBox, { backgroundColor: colors.background.secondary }]}
            activeOpacity={0.8}
            testID={`${testID}-copy-button`}
          >
            <Text 
              style={[
                styles.numberText, 
                { color: colors.text.primary },
                numberStyle
              ]}
              selectable
            >
              {formattedNumber}
            </Text>
            <Ionicons 
              name="copy-outline" 
              size={20} 
              color={colors.text.secondary} 
              style={styles.copyIcon}
            />
          </TouchableOpacity>
        </Card.Content>
      </Card>

      {/* QR Code Display */}
      <Card variant="elevated" style={styles.qrCard}>
        <Card.Header>
          <Text style={[styles.qrTitle, { color: colors.text.primary }]}>
            QR Code for Verification
          </Text>
        </Card.Header>

        <Card.Content>
          <View style={styles.qrContainer}>
            <View style={styles.qrWrapper}>
              <QRCode
                value={qrCodeData}
                size={200}
                backgroundColor={colors.background.primary}
                color={colors.text.primary}
                logo={require('../../assets/images/icon.png')}
                logoSize={40}
                logoBackgroundColor={colors.background.primary}
                logoBorderRadius={8}
                quietZone={10}
              />
            </View>
            <Text style={[styles.qrHint, { color: colors.text.secondary }]}>
              Have {userName} scan this code, or scan theirs to verify
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Information Box */}
      <View style={[styles.infoBox, { backgroundColor: colors.primary + '10' }]}>
        <Ionicons
          name="information-circle"
          size={20}
          color={colors.primary}
          style={styles.infoIcon}
        />
        <Text style={[styles.infoText, { color: colors.text.secondary }]}>
          Safety numbers protect against someone trying to intercept your messages.
          Compare these numbers or scan the QR code to verify your encryption.
        </Text>
      </View>

      {/* Verification Toggle (if callback provided) */}
      {onVerificationChange && (
        <TouchableOpacity
          style={[
            styles.verifyButton,
            { 
              backgroundColor: verified ? colors.success : colors.primary,
              ...Shadows.sm 
            }
          ]}
          onPress={() => onVerificationChange(!verified)}
          activeOpacity={0.8}
          testID={`${testID}-verify-toggle`}
        >
          <Ionicons 
            name={verified ? "shield-checkmark" : "shield"} 
            size={20} 
            color="white" 
          />
          <Text style={styles.verifyButtonText}>
            {verified ? 'Verified' : 'Mark as Verified'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  numberCard: {
    marginBottom: Spacing.md,
  },
  numberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  numberTitle: {
    ...Typography.styles.bodyMedium,
    fontWeight: '600',
    flex: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.sm,
  },
  verifiedText: {
    ...Typography.styles.caption,
    color: 'white',
    marginLeft: Spacing.xs / 2,
    fontWeight: '600',
  },
  numberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    minHeight: 60,
  },
  numberText: {
    ...Typography.styles.mono,
    fontSize: 15,
    letterSpacing: 1.2,
    flex: 1,
    lineHeight: 22,
  },
  copyIcon: {
    marginLeft: Spacing.sm,
  },
  qrCard: {
    marginBottom: Spacing.md,
  },
  qrTitle: {
    ...Typography.styles.bodyMedium,
    fontWeight: '600',
  },
  qrContainer: {
    alignItems: 'center',
  },
  qrWrapper: {
    padding: Spacing.md,
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    ...Shadows.md,
  },
  qrHint: {
    ...Typography.styles.caption,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  infoIcon: {
    marginRight: Spacing.sm,
  },
  infoText: {
    ...Typography.styles.bodySmall,
    flex: 1,
    lineHeight: 18,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  verifyButtonText: {
    ...Typography.styles.bodyMedium,
    color: 'white',
    fontWeight: '600',
    marginLeft: Spacing.sm,
  },
});

export default SafetyNumberView;