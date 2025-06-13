import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../../components/ui/Screen';
import AppHeader from '../../components/ui/AppHeader';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

const HelpAndSupportScreen = () => {
  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.INFO,
    title: 'Help Support Error',
    trackCurrentScreen: true,
  });

  // Reset error state when component mounts
  useEffect(() => {
    reset();
  }, [reset]);

  const renderContent = withErrorHandling(() => {
    try {
      return (
        <Screen>
          <AppHeader title="Help & Support" />
          <View style={styles.container}>
            <Text>Help and Support Content Coming Soon!</Text>
          </View>
        </Screen>
      );
    } catch (error) {
      handleError(error, {
        component: 'HelpAndSupportScreen',
        action: 'renderContent',
      });
      throw error; // Re-throw to let withErrorHandling handle it
    }
  });

  return (
    <ErrorBoundary screenName="HelpAndSupportScreen">
      {renderContent()}
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default HelpAndSupportScreen; 