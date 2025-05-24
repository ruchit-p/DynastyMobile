import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { StoryVisibilityOption } from './privacySettings'; // Import type
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import FlashList from '../../components/ui/FlashList';

// Define your story visibility options
const STORY_VISIBILITY_OPTIONS: StoryVisibilityOption[] = ['Public', 'Connections Only', 'Friends Only', 'Private'];

const SelectStoryVisibilityScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentVisibility?: StoryVisibilityOption, previousPath?: string }>();
  
  const [selectedOption, setSelectedOption] = useState<StoryVisibilityOption | undefined>(params.currentVisibility);
  
  // Initialize error handler
  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Story Visibility Error',
    trackCurrentScreen: true
  });

  // Error state reset effect
  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (params.currentVisibility) {
      setSelectedOption(params.currentVisibility);
    }
  }, [params.currentVisibility]);

  const setupNavigation = withErrorHandling(async () => {
    navigation.setOptions({
      title: 'Default Story Visibility',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  });

  useEffect(() => {
    setupNavigation().catch(error => {
      handleError(error, { 
        action: 'setupNavigation',
        screen: 'SelectStoryVisibilityScreen'
      });
    });
  }, [navigation, setupNavigation, handleError]);

  const handleSelectOption = withErrorHandling(async (option: StoryVisibilityOption) => {
    try {
      setSelectedOption(option);
      const targetPath = params.previousPath || '..';
      router.navigate({
        pathname: targetPath,
        params: { selectedStoryVisibility: option, fromScreen: 'selectStoryVisibility' },
      });
    } catch (error) {
      handleError(error, {
        action: 'handleSelectOption',
        option,
        targetPath: params.previousPath,
        screen: 'SelectStoryVisibilityScreen'
      });
    }
  });

  return (
    <ErrorBoundary screenName="SelectStoryVisibilityScreen">
      <SafeAreaView style={styles.safeArea}>
        <FlashList
          data={STORY_VISIBILITY_OPTIONS}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.optionButton}
              onPress={() => {
                handleSelectOption(item).catch(error => {
                  handleError(error, {
                    action: 'onPress',
                    item,
                    screen: 'SelectStoryVisibilityScreen'
                  });
                });
              }}
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

export default SelectStoryVisibilityScreen; 