import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from 'expo-router';
import { commonHeaderOptions } from '../../constants/headerConfig';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

const StorySettingsScreenContent = () => {
  const navigation = useNavigation();
  const { withErrorHandling, clearError } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Story Settings Error',
    trackCurrentScreen: true
  });

  // Reset error state when component mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  const setNavigationOptions = withErrorHandling(async () => {
    navigation.setOptions({
      ...commonHeaderOptions,
      title: 'Story Settings',
    });
  }, { component: 'StorySettings', action: 'setNavigationOptions' });

  useEffect(() => {
    setNavigationOptions();
  }, [navigation, setNavigationOptions]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.placeholderText}>Story Settings UI Placeholder</Text>
        <Text style={styles.placeholderSubText}>(e.g., Default story visibility, collaboration settings, etc.)</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    fontSize: 18,
    color: '#555',
    textAlign: 'center',
  },
  placeholderSubText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
});

const StorySettingsScreen = () => {
  return (
    <ErrorBoundary screenName="StorySettingsScreen">
      <StorySettingsScreenContent />
    </ErrorBoundary>
  );
};

export default StorySettingsScreen; 