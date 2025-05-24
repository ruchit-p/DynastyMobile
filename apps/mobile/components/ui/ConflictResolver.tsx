import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Colors } from '@/constants/Colors';
import { Spacing, BorderRadius } from '@/constants/Spacing';
import Typography from '@/constants/Typography';
import Card from './Card';
import Button from './Button';
import Avatar from './Avatar';

export type ConflictData = {
  id: string;
  type: 'profile' | 'event' | 'story' | 'settings';
  field: string;
  localValue: any;
  serverValue: any;
  localTimestamp: Date;
  serverTimestamp: Date;
  metadata?: {
    userName?: string;
    userAvatar?: string;
    deviceName?: string;
  };
};

export type ResolutionChoice = 'local' | 'server' | 'merge';

interface ConflictResolverProps {
  conflict: ConflictData;
  onResolve: (conflictId: string, choice: ResolutionChoice, mergedValue?: any) => void;
  onSkip?: (conflictId: string) => void;
}

/**
 * ConflictResolver - Component to display and resolve data conflicts
 * Shows both versions (local vs server) and provides resolution options
 */
export const ConflictResolver = React.memo<ConflictResolverProps>(({
  conflict,
  onResolve,
  onSkip,
}) => {
  const [selectedChoice, setSelectedChoice] = useState<ResolutionChoice | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const secondaryTextColor = useThemeColor(
    { 
      light: Colors.light.text.secondary,
      dark: Colors.dark.text.secondary
    },
    'text'
  );
  const borderColor = useThemeColor(
    { 
      light: Colors.light.border.default,
      dark: Colors.dark.border.default
    },
    'border'
  );
  const warningColor = useThemeColor(
    { 
      light: Colors.light.status.warning,
      dark: Colors.dark.status.warning
    },
    'text'
  );
  const selectedBackgroundColor = useThemeColor(
    { 
      light: Colors.light.button.secondary.background,
      dark: Colors.dark.button.secondary.background
    },
    'background'
  );

  // Format timestamp for display
  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  // Render value based on type
  const renderValue = (value: any) => {
    if (typeof value === 'string' || typeof value === 'number') {
      return <Text style={[styles.valueText, { color: textColor }]}>{value}</Text>;
    }
    if (typeof value === 'boolean') {
      return <Text style={[styles.valueText, { color: textColor }]}>{value ? 'Yes' : 'No'}</Text>;
    }
    if (value instanceof Date) {
      return <Text style={[styles.valueText, { color: textColor }]}>{value.toLocaleDateString()}</Text>;
    }
    if (typeof value === 'object' && value !== null) {
      return (
        <Text style={[styles.valueText, { color: textColor }]}>
          {JSON.stringify(value, null, 2)}
        </Text>
      );
    }
    return <Text style={[styles.valueText, { color: secondaryTextColor }]}>Unknown value</Text>;
  };

  const handleResolve = () => {
    if (selectedChoice) {
      onResolve(conflict.id, selectedChoice);
    }
  };

  const getConflictIcon = () => {
    switch (conflict.type) {
      case 'profile': return 'person';
      case 'event': return 'calendar';
      case 'story': return 'book';
      case 'settings': return 'settings';
      default: return 'alert-circle';
    }
  };

  return (
    <Card style={styles.container}>
      {/* Header */}
      <TouchableOpacity 
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Ionicons 
            name={getConflictIcon() as any} 
            size={24} 
            color={warningColor}
            style={styles.typeIcon}
          />
          <View style={styles.headerInfo}>
            <Text style={[styles.conflictType, { color: textColor }]}>
              {conflict.type.charAt(0).toUpperCase() + conflict.type.slice(1)} Conflict
            </Text>
            <Text style={[styles.fieldName, { color: secondaryTextColor }]}>
              {conflict.field}
            </Text>
          </View>
        </View>
        <Ionicons 
          name={isExpanded ? 'chevron-up' : 'chevron-down'} 
          size={20} 
          color={secondaryTextColor}
        />
      </TouchableOpacity>

      {/* Expanded Content */}
      {isExpanded && (
        <>
          {/* Local Version */}
          <TouchableOpacity
            style={[
              styles.versionContainer,
              { borderColor },
              selectedChoice === 'local' && { backgroundColor: selectedBackgroundColor }
            ]}
            onPress={() => setSelectedChoice('local')}
            activeOpacity={0.7}
          >
            <View style={styles.versionHeader}>
              <Ionicons 
                name="phone-portrait" 
                size={20} 
                color={textColor}
                style={styles.versionIcon}
              />
              <View style={styles.versionInfo}>
                <Text style={[styles.versionTitle, { color: textColor }]}>Your Version</Text>
                <Text style={[styles.timestamp, { color: secondaryTextColor }]}>
                  {formatTimestamp(conflict.localTimestamp)}
                </Text>
              </View>
              {selectedChoice === 'local' && (
                <Ionicons name="checkmark-circle" size={24} color={Colors.light.dynasty} />
              )}
            </View>
            <View style={styles.valueContainer}>
              {renderValue(conflict.localValue)}
            </View>
          </TouchableOpacity>

          {/* Server Version */}
          <TouchableOpacity
            style={[
              styles.versionContainer,
              { borderColor },
              selectedChoice === 'server' && { backgroundColor: selectedBackgroundColor }
            ]}
            onPress={() => setSelectedChoice('server')}
            activeOpacity={0.7}
          >
            <View style={styles.versionHeader}>
              {conflict.metadata?.userAvatar ? (
                <Avatar
                  imageUrl={conflict.metadata.userAvatar}
                  size="small"
                  style={styles.userAvatar}
                />
              ) : (
                <Ionicons 
                  name="cloud" 
                  size={20} 
                  color={textColor}
                  style={styles.versionIcon}
                />
              )}
              <View style={styles.versionInfo}>
                <Text style={[styles.versionTitle, { color: textColor }]}>
                  {conflict.metadata?.userName || 'Server Version'}
                </Text>
                <Text style={[styles.timestamp, { color: secondaryTextColor }]}>
                  {formatTimestamp(conflict.serverTimestamp)}
                  {conflict.metadata?.deviceName && ` • ${conflict.metadata.deviceName}`}
                </Text>
              </View>
              {selectedChoice === 'server' && (
                <Ionicons name="checkmark-circle" size={24} color={Colors.light.dynasty} />
              )}
            </View>
            <View style={styles.valueContainer}>
              {renderValue(conflict.serverValue)}
            </View>
          </TouchableOpacity>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <Button
              variant="primary"
              size="medium"
              onPress={handleResolve}
              disabled={!selectedChoice}
              style={styles.resolveButton}
            >
              {selectedChoice === 'local' ? 'Keep Mine' : 'Keep Theirs'}
            </Button>
            {onSkip && (
              <Button
                variant="ghost"
                size="medium"
                onPress={() => onSkip(conflict.id)}
                style={styles.skipButton}
              >
                Skip for Now
              </Button>
            )}
          </View>

          {/* Help Text */}
          <Text style={[styles.helpText, { color: secondaryTextColor }]}>
            This conflict occurred because the same data was changed on multiple devices. 
            Choose which version to keep.
          </Text>
        </>
      )}
    </Card>
  );
});

ConflictResolver.displayName = 'ConflictResolver';

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    marginVertical: Spacing.sm,
    marginHorizontal: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeIcon: {
    marginRight: Spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  conflictType: {
    fontSize: 16,
    fontWeight: Typography.weight.semiBold,
    marginBottom: 8,
  },
  fieldName: {
    fontSize: 14,
    fontWeight: Typography.weight.medium,
    marginTop: 2,
  },
  versionContainer: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  versionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  versionIcon: {
    marginRight: Spacing.sm,
  },
  userAvatar: {
    marginRight: Spacing.sm,
  },
  versionInfo: {
    flex: 1,
  },
  versionTitle: {
    fontSize: 16,
    fontWeight: Typography.weight.medium,
  },
  timestamp: {
    fontSize: 14,
    fontWeight: Typography.weight.medium,
    marginTop: 2,
  },
  valueContainer: {
    paddingLeft: Spacing.lg + Spacing.sm,
  },
  valueText: {
    fontSize: 16,
    fontWeight: Typography.weight.medium,
  },
  actions: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  resolveButton: {
    flex: 1,
  },
  skipButton: {
    flex: 1,
  },
  helpText: {
    fontSize: 14,
    fontWeight: Typography.weight.medium,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
});