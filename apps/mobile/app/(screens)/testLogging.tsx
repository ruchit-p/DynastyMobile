import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Screen } from '../../components/ui/Screen';
import { Colors } from '../../constants/Colors';
import { Spacing } from '../../constants/Spacing';
import { Typography } from '../../constants/Typography';
import { LoggingService, LogLevel } from '../../src/services/LoggingService';
import { useColorScheme } from '../../hooks/useColorScheme';

export default function TestLoggingScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [testResults, setTestResults] = useState<string[]>([]);

  const addResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toISOString().substr(11, 8)} - ${message}`]);
  };

  const runBasicLoggingTest = () => {
    addResult('Starting basic logging test...');
    
    LoggingService.debug('Debug test', { detail: 'This is debug info' });
    addResult('✅ Debug logged');
    
    LoggingService.info('Info test', { action: 'User logged in' });
    addResult('✅ Info logged');
    
    LoggingService.warn('Warning test', { issue: 'Slow network detected' });
    addResult('✅ Warning logged');
    
    LoggingService.error('Error test', new Error('Test error'), { context: 'Testing' });
    addResult('✅ Error logged');
    
    LoggingService.fatal('Fatal test', new Error('Critical error'), { severity: 'high' });
    addResult('✅ Fatal logged');
    
    Alert.alert('Success', 'Basic logging test completed. Check Sentry dashboard.');
  };

  const runPerformanceTest = async () => {
    addResult('Starting performance tracking test...');
    
    // Test API call timing
    LoggingService.startPerformance('api-call-test');
    await new Promise(resolve => setTimeout(resolve, 500));
    LoggingService.endPerformance('api-call-test', { endpoint: '/api/test' });
    addResult('✅ API call performance tracked (500ms)');
    
    // Test database query timing
    LoggingService.startPerformance('db-query-test');
    await new Promise(resolve => setTimeout(resolve, 200));
    LoggingService.endPerformance('db-query-test', { query: 'SELECT * FROM test' });
    addResult('✅ DB query performance tracked (200ms)');
    
    Alert.alert('Success', 'Performance tracking test completed.');
  };

  const runNetworkLoggingTest = () => {
    addResult('Starting network logging test...');
    
    // Success request
    LoggingService.logNetworkRequest({
      method: 'GET',
      url: 'https://api.dynasty.app/users',
      status: 200,
      duration: 150,
      size: 2048
    });
    addResult('✅ Successful request logged');
    
    // Failed request
    LoggingService.logNetworkRequest({
      method: 'POST',
      url: 'https://api.dynasty.app/users',
      status: 500,
      duration: 2500,
      error: 'Internal Server Error'
    });
    addResult('✅ Failed request logged');
    
    // Timeout request
    LoggingService.logNetworkRequest({
      method: 'GET',
      url: 'https://api.dynasty.app/data',
      status: 0,
      duration: 30000,
      error: 'Request timeout'
    });
    addResult('✅ Timeout request logged');
    
    Alert.alert('Success', 'Network logging test completed.');
  };

  const runUserContextTest = () => {
    addResult('Starting user context test...');
    
    // Set user context
    LoggingService.setUserContext({
      id: 'test-user-123',
      email: 'test@dynasty.app',
      role: 'premium'
    });
    addResult('✅ User context set');
    
    // Add breadcrumbs
    LoggingService.addBreadcrumb({
      message: 'User opened test screen',
      category: 'navigation',
      level: 'info'
    });
    addResult('✅ Navigation breadcrumb added');
    
    LoggingService.addBreadcrumb({
      message: 'User initiated test',
      category: 'action',
      level: 'info',
      data: { testType: 'userContext' }
    });
    addResult('✅ Action breadcrumb added');
    
    // Log an event with context
    LoggingService.info('User context test completed', {
      screen: 'TestLogging',
      testsRun: testResults.length
    });
    addResult('✅ Event logged with user context');
    
    Alert.alert('Success', 'User context test completed.');
  };

  const runComplexErrorTest = () => {
    addResult('Starting complex error test...');
    
    // Nested error
    const innerError = new Error('Database connection failed');
    const outerError = new Error('Failed to fetch user data');
    (outerError as any).cause = innerError;
    
    LoggingService.error('Nested error test', outerError, {
      userId: 'test-user-456',
      operation: 'fetchUserProfile',
      retryCount: 3
    });
    addResult('✅ Nested error logged');
    
    // Custom error with metadata
    const customError = new Error('Authentication failed');
    (customError as any).code = 'AUTH_FAILED';
    (customError as any).statusCode = 401;
    
    LoggingService.error('Custom error test', customError, {
      endpoint: '/api/auth',
      timestamp: Date.now()
    });
    addResult('✅ Custom error logged');
    
    Alert.alert('Success', 'Complex error test completed.');
  };

  const clearResults = () => {
    setTestResults([]);
    LoggingService.clearUserContext();
    addResult('Test results cleared and user context reset');
  };

  return (
    <Screen title="Logging Test Suite" hasBackButton>
      <ScrollView style={styles.container}>
        <Text style={[Typography.styles.heading2, { color: colors.text.primary, marginBottom: Spacing.md }]}>
          Production Logging Tests
        </Text>
        
        <Text style={[Typography.styles.bodyMedium, { color: colors.text.secondary, marginBottom: Spacing.lg }]}>
          Run these tests to verify Sentry, Crashlytics, and local logging integration.
        </Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.ui.primary }]}
            onPress={runBasicLoggingTest}
          >
            <Text style={[Typography.styles.bodyMedium, { color: colors.text.inverse }]}>
              Test Basic Logging
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.ui.secondary }]}
            onPress={runPerformanceTest}
          >
            <Text style={[Typography.styles.bodyMedium, { color: colors.text.primary }]}>
              Test Performance Tracking
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.ui.secondary }]}
            onPress={runNetworkLoggingTest}
          >
            <Text style={[Typography.styles.bodyMedium, { color: colors.text.primary }]}>
              Test Network Logging
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.ui.secondary }]}
            onPress={runUserContextTest}
          >
            <Text style={[Typography.styles.bodyMedium, { color: colors.text.primary }]}>
              Test User Context
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.ui.error }]}
            onPress={runComplexErrorTest}
          >
            <Text style={[Typography.styles.bodyMedium, { color: colors.text.inverse }]}>
              Test Complex Errors
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.ui.tertiary }]}
            onPress={clearResults}
          >
            <Text style={[Typography.styles.bodyMedium, { color: colors.text.primary }]}>
              Clear Results
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.resultsContainer, { backgroundColor: colors.background.secondary }]}>
          <Text style={[Typography.styles.heading3, { color: colors.text.primary, marginBottom: Spacing.sm }]}>
            Test Results:
          </Text>
          {testResults.length === 0 ? (
            <Text style={[Typography.styles.bodySmall, { color: colors.text.secondary }]}>
              No tests run yet. Click a button above to start testing.
            </Text>
          ) : (
            testResults.map((result, index) => (
              <Text
                key={index}
                style={[Typography.styles.bodySmall, { color: colors.text.primary, marginBottom: Spacing.xs }]}
              >
                {result}
              </Text>
            ))
          )}
        </View>

        <View style={styles.infoContainer}>
          <Text style={[Typography.styles.heading3, { color: colors.text.primary, marginBottom: Spacing.sm }]}>
            📊 Where to Check Results:
          </Text>
          <Text style={[Typography.styles.bodySmall, { color: colors.text.secondary, marginBottom: Spacing.xs }]}>
            • Sentry Dashboard: https://mydynastyapp.sentry.io
          </Text>
          <Text style={[Typography.styles.bodySmall, { color: colors.text.secondary, marginBottom: Spacing.xs }]}>
            • Firebase Console → Crashlytics (for fatal errors)
          </Text>
          <Text style={[Typography.styles.bodySmall, { color: colors.text.secondary, marginBottom: Spacing.xs }]}>
            • AsyncStorage: Check device logs for offline storage
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.md,
  },
  buttonContainer: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  button: {
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  resultsContainer: {
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.lg,
    minHeight: 200,
  },
  infoContainer: {
    marginBottom: Spacing.xl,
  },
});