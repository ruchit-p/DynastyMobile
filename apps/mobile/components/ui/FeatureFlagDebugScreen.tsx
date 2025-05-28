/**
 * Feature Flag Debug Screen
 * 
 * Development-only component for testing and debugging feature flags.
 * Allows developers to view, toggle, and test feature flags in real-time.
 * 
 * Features:
 * - View all feature flags with metadata
 * - Toggle flags with overrides
 * - Test flag changes in real-time
 * - View service status and debug info
 * - Force refresh flags
 * - Clear overrides
 * - Export/import flag configurations
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Switch,
  TextInput,
  Share,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ErrorBoundary from './ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { 
  useFeatureFlags, 
  useFeatureFlagOverrides,
  UseFeatureFlagsOptions 
} from '../../hooks/useFeatureFlags';
import { 
  FEATURE_FLAGS,
  FEATURE_FLAGS_BY_CATEGORY,
  FeatureFlagCategory,
  FeatureFlagKey,
  FeatureFlagType,
  DEV_ONLY_FLAGS,
  RESTART_REQUIRED_FLAGS,
} from '../../constants/FeatureFlags';
import { featureFlagService } from '../../src/services/FeatureFlagService';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Spacing } from '../../constants/Spacing';

// MARK: - Types

interface FlagOverride {
  key: string;
  value: any;
  type: FeatureFlagType;
}

// MARK: - Component

export default function FeatureFlagDebugScreen() {
  const [selectedCategory, setSelectedCategory] = useState<FeatureFlagCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOverridesOnly, setShowOverridesOnly] = useState(false);
  
  const { handleError } = useErrorHandler({
    severity: ErrorSeverity.WARNING,
    title: 'Feature Flag Debug Error',
    trackCurrentScreen: true,
  });

  const { flags, isLoading, error, refresh, status } = useFeatureFlags(undefined, {
    watchUpdates: true,
    debug: true,
  });

  const { setOverride, removeOverride, clearOverrides } = useFeatureFlagOverrides();

  // Get debug info from service
  const debugInfo = useMemo(() => {
    try {
      return featureFlagService.getDebugInfo();
    } catch (error) {
      handleError(error, 'Failed to get debug info');
      return null;
    }
  }, [flags, handleError]);

  // Filter flags based on category and search
  const filteredFlags = useMemo(() => {
    const allFlagsArray = Object.values(FEATURE_FLAGS);
    
    let filtered = allFlagsArray;
    
    // Filter by category
    if (selectedCategory !== 'ALL') {
      filtered = filtered.filter(flag => flag.category === selectedCategory);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(flag => 
        flag.key.toLowerCase().includes(query) ||
        flag.description.toLowerCase().includes(query)
      );
    }
    
    // Filter by overrides only
    if (showOverridesOnly && debugInfo) {
      filtered = filtered.filter(flag => 
        Object.keys(debugInfo.overrides).includes(flag.key)
      );
    }
    
    return filtered.sort((a, b) => a.key.localeCompare(b.key));
  }, [selectedCategory, searchQuery, showOverridesOnly, debugInfo]);

  // Handle flag override toggle
  const handleFlagToggle = useCallback((flagKey: FeatureFlagKey, currentValue: any) => {
    const flagConfig = FEATURE_FLAGS[flagKey];
    if (!flagConfig) return;

    try {
      let newValue: any;
      
      switch (flagConfig.type) {
        case FeatureFlagType.BOOLEAN:
          newValue = !Boolean(currentValue);
          break;
        case FeatureFlagType.NUMBER:
          // For numbers, prompt user for input
          Alert.prompt(
            'Set Number Value',
            `Enter new value for ${flagKey}:`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Set',
                onPress: (value) => {
                  if (value !== undefined) {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                      setOverride(flagKey, numValue);
                    } else {
                      Alert.alert('Error', 'Invalid number value');
                    }
                  }
                },
              },
            ],
            'plain-text',
            String(currentValue)
          );
          return;
        case FeatureFlagType.STRING:
          // For strings, prompt user for input
          Alert.prompt(
            'Set String Value',
            `Enter new value for ${flagKey}:`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Set',
                onPress: (value) => {
                  if (value !== undefined) {
                    setOverride(flagKey, value);
                  }
                },
              },
            ],
            'plain-text',
            String(currentValue)
          );
          return;
        default:
          newValue = !Boolean(currentValue);
      }
      
      setOverride(flagKey, newValue);
      
      // Show restart warning if needed
      if (flagConfig.requiresRestart) {
        Alert.alert(
          'Restart Required',
          `Changes to ${flagKey} require an app restart to take effect.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      handleError(error, `Failed to toggle flag: ${flagKey}`);
    }
  }, [setOverride, handleError]);

  // Handle remove override
  const handleRemoveOverride = useCallback((flagKey: FeatureFlagKey) => {
    try {
      removeOverride(flagKey);
    } catch (error) {
      handleError(error, `Failed to remove override: ${flagKey}`);
    }
  }, [removeOverride, handleError]);

  // Handle clear all overrides
  const handleClearAllOverrides = useCallback(() => {
    Alert.alert(
      'Clear All Overrides',
      'Are you sure you want to clear all feature flag overrides?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            try {
              clearOverrides();
            } catch (error) {
              handleError(error, 'Failed to clear overrides');
            }
          },
        },
      ]
    );
  }, [clearOverrides, handleError]);

  // Handle refresh flags
  const handleRefresh = useCallback(async () => {
    try {
      await refresh();
    } catch (error) {
      handleError(error, 'Failed to refresh flags');
    }
  }, [refresh, handleError]);

  // Handle export debug info
  const handleExportDebugInfo = useCallback(async () => {
    if (!debugInfo) return;
    
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        status,
        flags: debugInfo.flags,
        overrides: debugInfo.overrides,
        abTests: debugInfo.abTests,
      };
      
      const jsonString = JSON.stringify(exportData, null, 2);
      
      await Share.share({
        message: jsonString,
        title: 'Feature Flags Debug Info',
      });
    } catch (error) {
      handleError(error, 'Failed to export debug info');
    }
  }, [debugInfo, status, handleError]);

  // Render flag item
  const renderFlagItem = useCallback((flag: typeof FEATURE_FLAGS[FeatureFlagKey]) => {
    const currentValue = flags[flag.key as keyof typeof flags];
    const hasOverride = debugInfo?.overrides && Object.keys(debugInfo.overrides).includes(flag.key);
    const flagMetadata = debugInfo?.flags?.[flag.key];
    
    return (
      <View key={flag.key} style={styles.flagItem}>
        <View style={styles.flagHeader}>
          <View style={styles.flagInfo}>
            <Text style={styles.flagKey}>{flag.key}</Text>
            <Text style={styles.flagDescription}>{flag.description}</Text>
            <View style={styles.flagMeta}>
              <Text style={styles.flagMetaText}>
                Category: {flag.category} | Type: {flag.type}
              </Text>
              {flagMetadata && (
                <Text style={styles.flagMetaText}>
                  Source: {flagMetadata.source} | Updated: {new Date(flagMetadata.lastUpdated).toLocaleString()}
                </Text>
              )}
              {DEV_ONLY_FLAGS.includes(flag.key) && (
                <Text style={[styles.flagMetaText, styles.devOnlyFlag]}>DEV ONLY</Text>
              )}
              {RESTART_REQUIRED_FLAGS.includes(flag.key) && (
                <Text style={[styles.flagMetaText, styles.restartFlag]}>RESTART REQUIRED</Text>
              )}
            </View>
          </View>
          
          <View style={styles.flagControls}>
            <View style={styles.flagValue}>
              <Text style={styles.flagValueText}>
                {typeof currentValue === 'object' 
                  ? JSON.stringify(currentValue)
                  : String(currentValue)
                }
              </Text>
              {hasOverride && (
                <Text style={styles.overrideLabel}>OVERRIDE</Text>
              )}
            </View>
            
            {flag.type === FeatureFlagType.BOOLEAN ? (
              <Switch
                value={Boolean(currentValue)}
                onValueChange={() => handleFlagToggle(flag.key as FeatureFlagKey, currentValue)}
                trackColor={{ false: Colors.neutral.gray300, true: Colors.primary.blue500 }}
                thumbColor={Boolean(currentValue) ? Colors.primary.blue600 : Colors.neutral.gray500}
              />
            ) : (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => handleFlagToggle(flag.key as FeatureFlagKey, currentValue)}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        
        {hasOverride && (
          <TouchableOpacity
            style={styles.removeOverrideButton}
            onPress={() => handleRemoveOverride(flag.key as FeatureFlagKey)}
          >
            <Text style={styles.removeOverrideText}>Remove Override</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [flags, debugInfo, handleFlagToggle, handleRemoveOverride]);

  // Don't render in production
  if (!__DEV__) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Feature Flag Debug (Development Only)</Text>
      </SafeAreaView>
    );
  }

  return (
    <ErrorBoundary screenName="FeatureFlagDebugScreen">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Feature Flag Debug</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleRefresh}>
              <Text style={styles.actionButtonText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleExportDebugInfo}>
              <Text style={styles.actionButtonText}>Export</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.clearButton]} 
              onPress={handleClearAllOverrides}
            >
              <Text style={[styles.actionButtonText, styles.clearButtonText]}>Clear Overrides</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Info */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>Service Status</Text>
          <Text style={styles.statusText}>
            Initialized: {status.initialized ? 'Yes' : 'No'} | 
            Online: {status.online ? 'Yes' : 'No'} | 
            Flags: {status.flagCount} | 
            Cache: {status.cacheSize} items
          </Text>
          {error && (
            <Text style={styles.errorText}>Error: {error.message}</Text>
          )}
          {isLoading && (
            <Text style={styles.loadingText}>Loading...</Text>
          )}
        </View>

        {/* Filters */}
        <View style={styles.filtersContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search flags..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            <TouchableOpacity
              style={[styles.categoryButton, selectedCategory === 'ALL' && styles.categoryButtonActive]}
              onPress={() => setSelectedCategory('ALL')}
            >
              <Text style={[styles.categoryButtonText, selectedCategory === 'ALL' && styles.categoryButtonTextActive]}>
                ALL
              </Text>
            </TouchableOpacity>
            
            {Object.values(FeatureFlagCategory).map(category => (
              <TouchableOpacity
                key={category}
                style={[styles.categoryButton, selectedCategory === category && styles.categoryButtonActive]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text style={[styles.categoryButtonText, selectedCategory === category && styles.categoryButtonTextActive]}>
                  {category.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Show overrides only:</Text>
            <Switch
              value={showOverridesOnly}
              onValueChange={setShowOverridesOnly}
              trackColor={{ false: Colors.neutral.gray300, true: Colors.primary.blue500 }}
              thumbColor={showOverridesOnly ? Colors.primary.blue600 : Colors.neutral.gray500}
            />
          </View>
        </View>

        {/* Flags List */}
        <ScrollView style={styles.flagsList} showsVerticalScrollIndicator={false}>
          {filteredFlags.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No flags found for the current filters.
              </Text>
            </View>
          ) : (
            filteredFlags.map(renderFlagItem)
          )}
        </ScrollView>
      </SafeAreaView>
    </ErrorBoundary>
  );
}

// MARK: - Styles

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral.white,
  },
  
  header: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral.gray200,
  },
  
  title: {
    ...Typography.heading.h2,
    color: Colors.neutral.black,
    marginBottom: Spacing.sm,
  },
  
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  
  actionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary.blue500,
    borderRadius: 6,
  },
  
  actionButtonText: {
    ...Typography.body.medium,
    color: Colors.neutral.white,
    fontWeight: '600',
  },
  
  clearButton: {
    backgroundColor: Colors.semantic.error,
  },
  
  clearButtonText: {
    color: Colors.neutral.white,
  },
  
  statusContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.neutral.gray50,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral.gray200,
  },
  
  statusTitle: {
    ...Typography.body.large,
    fontWeight: '600',
    color: Colors.neutral.black,
    marginBottom: Spacing.xs,
  },
  
  statusText: {
    ...Typography.body.small,
    color: Colors.neutral.gray600,
  },
  
  errorText: {
    ...Typography.body.small,
    color: Colors.semantic.error,
    marginTop: Spacing.xs,
  },
  
  loadingText: {
    ...Typography.body.small,
    color: Colors.primary.blue500,
    marginTop: Spacing.xs,
  },
  
  filtersContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.neutral.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral.gray200,
  },
  
  searchInput: {
    ...Typography.body.medium,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.neutral.gray300,
    borderRadius: 6,
    backgroundColor: Colors.neutral.white,
    marginBottom: Spacing.md,
  },
  
  categoryScroll: {
    marginBottom: Spacing.md,
  },
  
  categoryButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    backgroundColor: Colors.neutral.gray100,
    borderRadius: 6,
  },
  
  categoryButtonActive: {
    backgroundColor: Colors.primary.blue500,
  },
  
  categoryButtonText: {
    ...Typography.body.small,
    color: Colors.neutral.gray700,
    fontWeight: '600',
  },
  
  categoryButtonTextActive: {
    color: Colors.neutral.white,
  },
  
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  filterLabel: {
    ...Typography.body.medium,
    color: Colors.neutral.gray700,
  },
  
  flagsList: {
    flex: 1,
  },
  
  flagItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral.gray200,
  },
  
  flagHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  
  flagInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  
  flagKey: {
    ...Typography.body.large,
    fontWeight: '600',
    color: Colors.neutral.black,
    marginBottom: Spacing.xs,
  },
  
  flagDescription: {
    ...Typography.body.medium,
    color: Colors.neutral.gray600,
    marginBottom: Spacing.sm,
  },
  
  flagMeta: {
    gap: Spacing.xs,
  },
  
  flagMetaText: {
    ...Typography.body.small,
    color: Colors.neutral.gray500,
  },
  
  devOnlyFlag: {
    color: Colors.semantic.warning,
    fontWeight: '600',
  },
  
  restartFlag: {
    color: Colors.semantic.error,
    fontWeight: '600',
  },
  
  flagControls: {
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  
  flagValue: {
    alignItems: 'flex-end',
  },
  
  flagValueText: {
    ...Typography.body.medium,
    color: Colors.neutral.black,
    fontWeight: '600',
  },
  
  overrideLabel: {
    ...Typography.body.small,
    color: Colors.semantic.warning,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
  
  editButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.neutral.gray200,
    borderRadius: 4,
  },
  
  editButtonText: {
    ...Typography.body.small,
    color: Colors.neutral.gray700,
    fontWeight: '600',
  },
  
  removeOverrideButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
  },
  
  removeOverrideText: {
    ...Typography.body.small,
    color: Colors.semantic.error,
    fontWeight: '600',
  },
  
  emptyState: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  
  emptyStateText: {
    ...Typography.body.medium,
    color: Colors.neutral.gray500,
    textAlign: 'center',
  },
}); 