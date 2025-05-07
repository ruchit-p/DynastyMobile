import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type VisibilityOption = 'Public' | 'Private' | 'Friends Only';
const VISIBILITY_OPTIONS: VisibilityOption[] = ['Public', 'Private', 'Friends Only'];

const SelectVisibilityScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentVisibility?: VisibilityOption, previousPath?: string }>();
  const [selectedOption, setSelectedOption] = useState<VisibilityOption | undefined>(params.currentVisibility);

  useEffect(() => {
    if (params.currentVisibility) {
      setSelectedOption(params.currentVisibility);
    }
  }, [params.currentVisibility]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Select Visibility',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  const handleSelectVisibility = (option: VisibilityOption) => {
    setSelectedOption(option);
    if (navigation.canGoBack()) {
      const targetPath = params.previousPath || '..';
      router.navigate({
        pathname: targetPath,
        params: { selectedVisibility: option, fromScreen: 'selectVisibility' },
      });
    } else {
      console.warn("Cannot go back from SelectVisibilityScreen or previousPath not set");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
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

export default SelectVisibilityScreen; 