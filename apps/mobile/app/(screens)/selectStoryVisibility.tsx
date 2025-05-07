import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { StoryVisibilityOption } from './privacySettings'; // Import type

// Define your story visibility options
const STORY_VISIBILITY_OPTIONS: StoryVisibilityOption[] = ['Public', 'Connections Only', 'Friends Only', 'Private'];

const SelectStoryVisibilityScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentVisibility?: StoryVisibilityOption, previousPath?: string }>();
  
  const [selectedOption, setSelectedOption] = useState<StoryVisibilityOption | undefined>(params.currentVisibility);

  useEffect(() => {
    if (params.currentVisibility) {
      setSelectedOption(params.currentVisibility);
    }
  }, [params.currentVisibility]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Default Story Visibility',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  const handleSelectOption = (option: StoryVisibilityOption) => {
    setSelectedOption(option);
    const targetPath = params.previousPath || '..';
    router.navigate({
      pathname: targetPath,
      params: { selectedStoryVisibility: option, fromScreen: 'selectStoryVisibility' },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={STORY_VISIBILITY_OPTIONS}
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

export default SelectStoryVisibilityScreen; 