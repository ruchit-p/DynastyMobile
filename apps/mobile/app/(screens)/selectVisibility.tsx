import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { FlashList } from '../../components/ui/FlashList';
import { logger } from '../../src/services/LoggingService';

type VisibilityOption = 'Public' | 'Private' | 'Friends Only';
const VISIBILITY_OPTIONS: VisibilityOption[] = ['Public', 'Private', 'Friends Only'];

const SelectVisibilityScreenContent = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentVisibility?: VisibilityOption, previousPath?: string }>();
  const [selectedOption, setSelectedOption] = useState<VisibilityOption | undefined>(params.currentVisibility);
  
  // Initialize error handler
  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Select Visibility Error',
    trackCurrentScreen: true
  });

  useEffect(() => {
    if (params.currentVisibility) {
      setSelectedOption(params.currentVisibility);
    }
  }, [params.currentVisibility]);

  // Reset error state when component unmounts or navigation changes
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  useEffect(() => {
    const setNavigationOptions = withErrorHandling(async () => {
      navigation.setOptions({
        title: 'Select Visibility',
        headerStyle: { backgroundColor: '#F8F8F8' },
        headerTintColor: '#333333',
        headerTitleStyle: { fontWeight: '600' },
        headerBackTitleVisible: false,
      });
    });
    
    setNavigationOptions().catch((error) => {
      handleError(error, {
        action: 'setNavigationOptions',
        component: 'SelectVisibilityScreen'
      });
    });
  }, [navigation, withErrorHandling, handleError]);

  const handleSelectVisibility = withErrorHandling(async (option: VisibilityOption) => {
    try {
      setSelectedOption(option);
      
      if (navigation.canGoBack()) {
        const targetPath = params.previousPath || '..';
        router.navigate({
          pathname: targetPath,
          params: { selectedVisibility: option, fromScreen: 'selectVisibility' },
        });
      } else {
        const warning = "Cannot go back from SelectVisibilityScreen or previousPath not set";
        logger.warn(warning);
        handleError(new Error(warning), {
          action: 'navigation',
          option,
          canGoBack: navigation.canGoBack(),
          previousPath: params.previousPath
        });
      }
    } catch (error) {
      handleError(error, {
        action: 'handleSelectVisibility',
        option,
        targetPath: params.previousPath || '..'
      });
      throw error;
    }
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlashList
        data={VISIBILITY_OPTIONS}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.optionButton}
            onPress={() => handleSelectVisibility(item)}
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  list: {
    backgroundColor: '#FFFFFF',
    marginTop: 20, // Or remove if header provides enough spacing
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

const SelectVisibilityScreen = () => {
  return (
    <ErrorBoundary screenName="SelectVisibilityScreen">
      <SelectVisibilityScreenContent />
    </ErrorBoundary>
  );
};

export default SelectVisibilityScreen; 