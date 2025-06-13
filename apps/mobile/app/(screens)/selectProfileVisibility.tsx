import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ProfileVisibilityOption } from './privacySettings'; // Import type
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { FlashList } from '../../components/ui/FlashList';

const PROFILE_VISIBILITY_OPTIONS: ProfileVisibilityOption[] = ['Public', 'Connections Only', 'Private'];

const SelectProfileVisibilityScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentVisibility?: ProfileVisibilityOption, previousPath?: string }>();
  
  const [selectedOption, setSelectedOption] = useState<ProfileVisibilityOption | undefined>(params.currentVisibility);
  
  // Initialize error handler
  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Profile Visibility Error',
    trackCurrentScreen: true
  });

  // Reset error state when component mounts
  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    try {
      if (params.currentVisibility) {
        setSelectedOption(params.currentVisibility);
      }
    } catch (error) {
      handleError(error, { 
        action: 'set_initial_visibility',
        currentVisibility: params.currentVisibility 
      });
    }
  }, [params.currentVisibility, handleError]);

  useEffect(() => {
    try {
      navigation.setOptions({
        title: 'Profile Visibility',
        headerStyle: { backgroundColor: '#F8F8F8' },
        headerTintColor: '#333333',
        headerTitleStyle: { fontWeight: '600' },
        headerBackTitleVisible: false,
      });
    } catch (error) {
      handleError(error, { 
        action: 'set_navigation_options',
        screen: 'SelectProfileVisibilityScreen'
      });
    }
  }, [navigation, handleError]);

  const handleSelectOption = withErrorHandling(async (option: ProfileVisibilityOption) => {
    try {
      setSelectedOption(option);
      const targetPath = params.previousPath || '..'; // Default to one level up if no path provided
      
      router.navigate({
        pathname: targetPath,
        params: { selectedProfileVisibility: option, fromScreen: 'selectProfileVisibility' },
      });
    } catch (error) {
      handleError(error, { 
        action: 'select_visibility_option',
        selectedOption: option,
        targetPath: params.previousPath || '..',
        navigationParams: { selectedProfileVisibility: option, fromScreen: 'selectProfileVisibility' }
      });
    }
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlashList
        data={PROFILE_VISIBILITY_OPTIONS}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.optionButton}
            onPress={() => handleSelectOption(item)}
          >
            <Text style={styles.optionText}>{item}</Text>
            {selectedOption === item && (
              <Ionicons name="checkmark" size={24} color="#007AFF" />
            )}
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        style={styles.list}
        estimatedItemSize={60}
      />
    </SafeAreaView>
  );
};

const SelectProfileVisibilityScreenWithErrorBoundary = () => {
  return (
    <ErrorBoundary screenName="SelectProfileVisibilityScreen">
      <SelectProfileVisibilityScreen />
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  list: {
    backgroundColor: '#FFFFFF',
    marginTop: 20, 
  },
  optionButton: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  separator: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginLeft: 20,
  },
});

export default SelectProfileVisibilityScreenWithErrorBoundary; 