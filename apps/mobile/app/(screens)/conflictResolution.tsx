import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '../../hooks/useThemeColor';
import { Colors } from '../../constants/Colors';
import { Spacing } from '../../constants/Spacing';
import { Typography } from '../../constants/Typography';
import { ConflictResolver, ConflictData, ResolutionChoice } from '../../components/ui/ConflictResolver';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { Ionicons } from '@expo/vector-icons';
import { logger } from '../../src/services/LoggingService';

/**
 * ConflictResolutionScreen - Full screen for managing multiple data conflicts
 * Lists all pending conflicts and provides batch resolution options
 */
export default function ConflictResolutionScreen() {
  const router = useRouter();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const secondaryTextColor = useThemeColor(
    { 
      light: Colors.light.text.secondary,
      dark: Colors.dark.text.secondary
    },
    'text'
  );

  // Mock conflicts data - in real app, this would come from your sync service
  const [conflicts, setConflicts] = useState<ConflictData[]>([
    {
      id: '1',
      type: 'profile',
      field: 'Display Name',
      localValue: 'John Doe',
      serverValue: 'John D.',
      localTimestamp: new Date(Date.now() - 3600000),
      serverTimestamp: new Date(Date.now() - 1800000),
      metadata: {
        userName: 'John (iPad)',
        deviceName: 'iPad Pro',
      },
    },
    {
      id: '2',
      type: 'event',
      field: 'Event Date',
      localValue: new Date('2025-02-15'),
      serverValue: new Date('2025-02-16'),
      localTimestamp: new Date(Date.now() - 7200000),
      serverTimestamp: new Date(Date.now() - 3600000),
      metadata: {
        userName: 'Sarah',
        userAvatar: 'https://example.com/avatar.jpg',
        deviceName: 'iPhone',
      },
    },
    {
      id: '3',
      type: 'settings',
      field: 'Notification Preferences',
      localValue: { push: true, email: false },
      serverValue: { push: false, email: true },
      localTimestamp: new Date(Date.now() - 86400000),
      serverTimestamp: new Date(Date.now() - 43200000),
    },
  ]);

  const [resolvedCount, setResolvedCount] = useState(0);

  // Handle individual conflict resolution
  const handleResolve = useCallback((conflictId: string, choice: ResolutionChoice, mergedValue?: any) => {
    // In real app, this would sync the resolution to the server
    logger.debug(`Resolving conflict ${conflictId} with choice: ${choice}`);
    
    setConflicts(prev => prev.filter(c => c.id !== conflictId));
    setResolvedCount(prev => prev + 1);
  }, []);

  // Handle skipping a conflict
  const handleSkip = useCallback((conflictId: string) => {
    logger.debug(`Skipping conflict ${conflictId}`);
    // Move to end of list
    setConflicts(prev => {
      const conflict = prev.find(c => c.id === conflictId);
      if (conflict) {
        return [...prev.filter(c => c.id !== conflictId), conflict];
      }
      return prev;
    });
  }, []);

  // Handle resolve all
  const handleResolveAll = useCallback((choice: 'local' | 'server') => {
    Alert.alert(
      `Keep All ${choice === 'local' ? 'Your' : 'Server'} Versions?`,
      `This will resolve all ${conflicts.length} conflicts by keeping the ${choice === 'local' ? 'local' : 'server'} version for each.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: () => {
            conflicts.forEach(conflict => {
              handleResolve(conflict.id, choice);
            });
          },
        },
      ]
    );
  }, [conflicts, handleResolve]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Resolve Conflicts',
          headerStyle: {
            backgroundColor: backgroundColor,
          },
          headerTintColor: textColor,
          headerShadowVisible: false,
        }}
      />
      
      <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['bottom']}>
        {conflicts.length === 0 ? (
          <EmptyState
            icon="checkmark-circle"
            title="All Conflicts Resolved"
            message={resolvedCount > 0 
              ? `You've successfully resolved ${resolvedCount} conflict${resolvedCount !== 1 ? 's' : ''}.`
              : "No conflicts to resolve."
            }
            action={{
              label: 'Go Back',
              onPress: () => router.back(),
            }}
          />
        ) : (
          <>
            {/* Header Info */}
            <View style={styles.header}>
              <View style={styles.headerInfo}>
                <Text style={[styles.conflictCount, { color: textColor }]}>
                  {conflicts.length} Conflict{conflicts.length !== 1 ? 's' : ''} to Resolve
                </Text>
                <Text style={[styles.helpText, { color: secondaryTextColor }]}>
                  Choose which version to keep for each conflict
                </Text>
              </View>
              
              {/* Batch Actions */}
              <View style={styles.batchActions}>
                <Button
                  variant="outline"
                  size="small"
                  onPress={() => handleResolveAll('local')}
                  style={styles.batchButton}
                >
                  <Ionicons name="phone-portrait" size={16} color={textColor} />
                  <Text style={styles.batchButtonText}>Keep All Mine</Text>
                </Button>
                <Button
                  variant="outline"
                  size="small"
                  onPress={() => handleResolveAll('server')}
                  style={styles.batchButton}
                >
                  <Ionicons name="cloud" size={16} color={textColor} />
                  <Text style={styles.batchButtonText}>Keep All Theirs</Text>
                </Button>
              </View>
            </View>

            {/* Conflicts List */}
            <ScrollView 
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {conflicts.map((conflict, index) => (
                <ConflictResolver
                  key={conflict.id}
                  conflict={conflict}
                  onResolve={handleResolve}
                  onSkip={handleSkip}
                />
              ))}
              
              {/* Bottom Padding */}
              <View style={styles.bottomPadding} />
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerInfo: {
    marginBottom: Spacing.md,
  },
  conflictCount: {
    ...Typography.styles.heading3,
    marginBottom: Spacing.xs,
  },
  helpText: {
    ...Typography.styles.bodySmall,
  },
  batchActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  batchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  batchButtonText: {
    ...Typography.styles.caption,
    fontWeight: Typography.weight.medium,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: Spacing.sm,
  },
  bottomPadding: {
    height: Spacing.xl,
  },
});