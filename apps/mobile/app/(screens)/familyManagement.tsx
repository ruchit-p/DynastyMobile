import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from 'expo-router';
import { commonHeaderOptions } from '../../constants/headerConfig';

const FamilyManagementScreen = () => {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      ...commonHeaderOptions,
      title: 'Family Management',
    });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.placeholderText}>Family Management UI Placeholder</Text>
        <Text style={styles.placeholderSubText}>(e.g., View family tree, invite members, manage roles/permissions, pending invites)</Text>
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

export default FamilyManagementScreen; 