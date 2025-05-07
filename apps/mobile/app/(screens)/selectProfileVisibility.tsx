import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ProfileVisibilityOption } from './privacySettings'; // Import type

const PROFILE_VISIBILITY_OPTIONS: ProfileVisibilityOption[] = ['Public', 'Connections Only', 'Private'];

const SelectProfileVisibilityScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentVisibility?: ProfileVisibilityOption, previousPath?: string }>();
  
  const [selectedOption, setSelectedOption] = useState<ProfileVisibilityOption | undefined>(params.currentVisibility);

  useEffect(() => {
    if (params.currentVisibility) {
      setSelectedOption(params.currentVisibility);
    }
  }, [params.currentVisibility]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Profile Visibility',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  const handleSelectOption = (option: ProfileVisibilityOption) => {
    setSelectedOption(option);
    const targetPath = params.previousPath || '..'; // Default to one level up if no path provided
    router.navigate({
      pathname: targetPath,
      params: { selectedProfileVisibility: option, fromScreen: 'selectProfileVisibility' },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
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
});

export default SelectProfileVisibilityScreen; 