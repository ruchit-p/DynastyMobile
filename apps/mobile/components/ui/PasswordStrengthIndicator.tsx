import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/Colors';
import { calculatePasswordStrength } from '../../src/lib/validation';
import { Typography } from '../../constants/Typography';
import { Spacing, BorderRadius } from '../../constants/Spacing';

interface PasswordStrengthIndicatorProps {
  password: string;
  showFeedback?: boolean;
  testID?: string;
}

export const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({
  password,
  showFeedback = true,
  testID,
}) => {
  const strength = calculatePasswordStrength(password);

  // Calculate the width percentage for the strength bar
  const barWidthPercentage = (strength.score / 4) * 100;

  const barFillStyle: ViewStyle = {
    ...styles.barFill,
    width: `${barWidthPercentage}%`,
    backgroundColor: strength.color,
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.barContainer}>
        <View style={styles.barBackground}>
          <View style={barFillStyle} />
        </View>
        <Text style={[styles.label, { color: strength.color }]}>
          {strength.label}
        </Text>
      </View>
      
      {showFeedback && strength.feedback.length > 0 && (
        <View style={styles.feedbackContainer}>
          {strength.feedback.map((feedback, index) => (
            <Text key={index} style={styles.feedbackText}>
              • {feedback}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.xs,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  barBackground: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.light.text.tertiary,
    borderRadius: BorderRadius.xs,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: BorderRadius.xs,
  },
  label: {
    ...Typography.styles.bodySmall,
    fontWeight: '600',
    minWidth: 50,
  },
  feedbackContainer: {
    marginTop: Spacing.xs,
  },
  feedbackText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.secondary,
    marginTop: 2,
  },
});