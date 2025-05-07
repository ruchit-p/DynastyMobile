import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const SelectLocationScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ currentLocation?: string, previousPath?: string }>();
  const [location, setLocation] = useState<string>(params.currentLocation || '');

  useEffect(() => {
    if (params.currentLocation) {
      setLocation(params.currentLocation);
    }
  }, [params.currentLocation]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Select Location',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  const handleConfirmLocation = () => {
    const targetPath = params.previousPath || '..';
    router.navigate({
      pathname: targetPath,
      params: { selectedLocation: location, fromScreen: 'selectLocation' },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.label}>Event Location:</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter location or address"
          value={location}
          onChangeText={setLocation}
          autoFocus
        />
        <TouchableOpacity style={styles.button} onPress={handleConfirmLocation}> 
            <Text style={styles.buttonText}>Confirm Location</Text>
        </TouchableOpacity>
        <Text style={styles.placeholderSubText}> (Future: Map view, Search bar for places)</Text>
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
    alignItems: 'center',
    padding: 20,
    paddingTop: 30,
  },
  label: {
    fontSize: 16,
    color: '#333',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  input: {
    height: 45,
    borderColor: '#DDD',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
    backgroundColor: '#FFF',
    width: '100%',
    marginBottom: 20,
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
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  }
});

export default SelectLocationScreen; 