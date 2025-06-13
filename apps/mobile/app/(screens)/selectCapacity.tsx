import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showErrorAlert } from '../../src/lib/errorUtils';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { FlashList } from '../../components/ui/FlashList';

const CAPACITY_PRESETS = ['Unlimited', '10', '25', '50', '100', 'Custom'];

const SelectCapacityInner = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentCapacity?: string, previousPath?: string }>();

  const [selectedCapacity, setSelectedCapacity] = useState<string>('Unlimited');
  const [customCapacity, setCustomCapacity] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Initialize error handler
  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Select Capacity Error',
    trackCurrentScreen: true,
  });

  // Error state reset effect
  useEffect(() => {
    reset();
  }, []);

  useEffect(() => {
    try {
      if (params.currentCapacity) {
        if (CAPACITY_PRESETS.includes(params.currentCapacity)) {
          setSelectedCapacity(params.currentCapacity);
          setShowCustomInput(params.currentCapacity === 'Custom');
          if (params.currentCapacity === 'Custom') {
            // If current is 'Custom', but no specific number was passed, leave customCapacity empty
            // Or, if createEvent stores "Custom: 123", then parse it here.
            // For now, assume createEvent stores the raw number if custom, or the preset string.
          }
        } else {
          // It's a custom number not in presets (e.g. "75")
          setSelectedCapacity('Custom');
          setCustomCapacity(params.currentCapacity);
          setShowCustomInput(true);
        }
      }
    } catch (error) {
      handleError(error, {
        action: 'initialize_capacity_from_params',
        currentCapacity: params.currentCapacity,
        params: params
      });
    }
  }, [params.currentCapacity, handleError]);

  useEffect(() => {
    try {
      navigation.setOptions({
        title: 'Select Capacity',
        headerStyle: { backgroundColor: '#F8F8F8' },
        headerTintColor: '#333333',
        headerTitleStyle: { fontWeight: '600' },
        headerBackTitleVisible: false,
      });
    } catch (error) {
      handleError(error, {
        action: 'set_navigation_options'
      });
    }
  }, [navigation, handleError]);

  const navigateBackWithCapacity = withErrorHandling(async (capacityValue: string) => {
    try {
      const targetPath = params.previousPath || '..';
      router.navigate({
        pathname: targetPath,
        params: { selectedCapacity: capacityValue, fromScreen: 'selectCapacity' },
      });
    } catch (error) {
      handleError(error, {
        action: 'navigate_back_with_capacity',
        capacityValue,
        targetPath: params.previousPath || '..',
      });
      throw error;
    }
  });

  const handleSelectCapacity = withErrorHandling(async (option: string) => {
    try {
      setSelectedCapacity(option);
      if (option === 'Custom') {
        setShowCustomInput(true);
        // Don't navigate back yet, wait for custom input
      } else {
        setShowCustomInput(false);
        setCustomCapacity(''); // Clear custom input if a preset is chosen
        await navigateBackWithCapacity(option);
      }
    } catch (error) {
      handleError(error, {
        action: 'select_capacity_option',
        selectedOption: option,
        isCustom: option === 'Custom'
      });
    }
  });

  const handleConfirmCustomCapacity = withErrorHandling(async () => {
    try {
      const numericCapacity = parseInt(customCapacity, 10);
      if (customCapacity.trim() && !isNaN(numericCapacity) && numericCapacity > 0) {
        await navigateBackWithCapacity(customCapacity.trim());
      } else {
        const validationError = new Error('Please enter a valid positive number for custom capacity.');
        handleError(validationError, {
          action: 'validate_custom_capacity',
          inputValue: customCapacity,
          parsedValue: numericCapacity,
          isValid: false
        });
        showErrorAlert({ message: 'Please enter a valid positive number for custom capacity.', code: 'invalid-argument' }, 'Invalid Input');
      }
    } catch (error) {
      handleError(error, {
        action: 'confirm_custom_capacity',
        customCapacity: customCapacity
      });
    }
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlashList
        data={CAPACITY_PRESETS}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.optionButton}
            onPress={() => handleSelectCapacity(item)}
          >
            <Text style={styles.optionText}>{item}</Text>
            {selectedCapacity === item && <Ionicons name="checkmark" size={24} color="#007AFF" />}
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        style={styles.list}
        estimatedItemSize={60}
        ListFooterComponent={() => (
            showCustomInput ? (
                <View style={styles.customInputContainer}>
                    <TextInput 
                        style={styles.customInput}
                        placeholder="Enter custom capacity (e.g., 75)"
                        keyboardType="number-pad"
                        value={customCapacity}
                        onChangeText={setCustomCapacity}
                        autoFocus
                    />
                    <TouchableOpacity style={styles.confirmButton} onPress={() => handleConfirmCustomCapacity()}>
                        <Text style={styles.confirmButtonText}>Confirm Custom</Text>
                    </TouchableOpacity>
                </View>
            ) : null
        )}
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
  customInputContainer: {
      padding: 20,
      borderTopWidth: 1,
      borderTopColor: '#E0E0E0',
  },
  customInput: {
      backgroundColor: '#FFFFFF',
      borderColor: '#D0D0D0',
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 15,
      paddingVertical: 12,
      fontSize: 16,
      marginBottom: 15,
  },
  confirmButton: {
      backgroundColor: '#007AFF',
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
  },
  confirmButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
  }
});

const SelectCapacityScreen = () => {
  return (
    <ErrorBoundary screenName="SelectCapacityScreen">
      <SelectCapacityInner />
    </ErrorBoundary>
  );
};

export default SelectCapacityScreen; 