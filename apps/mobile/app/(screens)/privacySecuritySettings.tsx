import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, SafeAreaView, Alert } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// MARK: - Types
interface PrivacySettingItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  onPress: () => void;
  description?: string;
}

// MARK: - Main Component
const PrivacySecuritySettingsScreen = () => {
  const navigation = useNavigation();

  React.useEffect(() => {
    navigation.setOptions({
      title: 'Privacy & Security',
      headerTitleAlign: 'center',
      headerLeft: () => (
        <Ionicons 
          name="arrow-back" 
          size={24} 
          color={Platform.OS === 'ios' ? "#007AFF" : "#000"}
          style={{ marginLeft: 15 }} 
          onPress={() => navigation.goBack()} 
        />
      ),
    });
  }, [navigation]);

  const privacyItems: PrivacySettingItem[] = [
    {
      id: 'manageBlocked',
      title: 'Manage Blocked Users',
      icon: <Ionicons name="people-circle-outline" size={24} color="#4A90E2" />,
      onPress: () => Alert.alert('Manage Blocked', 'Feature coming soon!'),
      description: 'View and manage users you have blocked.'
    },
    {
      id: 'twoFactorAuth',
      title: 'Two-Factor Authentication',
      icon: <Ionicons name="shield-checkmark-outline" size={24} color="#4CAF50" />,
      onPress: () => Alert.alert('2FA', 'Setup Two-Factor Authentication - coming soon!'),
      description: 'Add an extra layer of security to your account.'
    },
    {
      id: 'loginHistory',
      title: 'Login Activity',
      icon: <Ionicons name="list-outline" size={24} color="#F5A623" />,
      onPress: () => Alert.alert('Login Activity', 'View your recent login activity - coming soon!'),
      description: 'See where and when your account has been accessed.'
    },
    {
      id: 'connectedApps',
      title: 'Connected Apps & Services',
      icon: <Ionicons name="apps-outline" size={24} color="#7E57C2" />,
      onPress: () => Alert.alert('Connected Apps', 'Manage connected applications - coming soon!'),
      description: 'Review apps and services with access to your account.'
    },
    {
      id: 'dataPrivacyPolicy',
      title: 'Data & Privacy Policy',
      icon: <Ionicons name="document-text-outline" size={24} color="#50E3C2" />,
      onPress: () => Alert.alert('Privacy Policy', 'View our Data & Privacy Policy - coming soon!'),
      description: 'Read about how we handle your data.'
    },
  ];

  // MARK: - Render
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        {privacyItems.map((item, index) => (
          <React.Fragment key={item.id}>
            <TouchableOpacity style={styles.itemContainer} onPress={item.onPress}>
              <View style={styles.iconContainer}>{item.icon}</View>
              <View style={styles.textContainer}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                {item.description && <Text style={styles.itemDescription}>{item.description}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
            {index < privacyItems.length - 1 && <View style={styles.separator} />}
          </React.Fragment>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

// MARK: - Styles
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  container: {
    flex: 1,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
  },
  iconContainer: {
    marginRight: 15,
  },
  textContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    color: '#000000',
    marginBottom: 2,
  },
  itemDescription: {
    fontSize: 12,
    color: '#666666',
  },
  separator: {
    height: 1,
    backgroundColor: '#EFEFF4',
    marginLeft: 20, 
  },
});

export default PrivacySecuritySettingsScreen; 