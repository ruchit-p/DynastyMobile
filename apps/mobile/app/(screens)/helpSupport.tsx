import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';

const HelpSupportScreen = () => {
  const navigation = useNavigation();
  const router = useRouter();

  useEffect(() => {
    navigation.setOptions({
      title: 'Help & Support',
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10 }}>
          <Ionicons name="arrow-back" size={26} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerTitleAlign: 'center',
    });
  }, [navigation, router]);

  const supportItems = [
    {
      id: 'faq',
      title: 'Frequently Asked Questions',
      icon: 'help-circle-outline',
      action: () => Alert.alert("FAQ", "Navigate to FAQ section or webpage."),
    },
    {
      id: 'contact',
      title: 'Contact Support',
      icon: 'mail-outline',
      action: () => Linking.openURL('mailto:support@dynastyapp.com?subject=Support Request'),
    },
    {
      id: 'terms',
      title: 'Terms of Service',
      icon: 'document-text-outline',
      action: () => Alert.alert("Terms", "Show Terms of Service."), // Or link to webpage
    },
    {
      id: 'privacy',
      title: 'Privacy Policy',
      icon: 'shield-checkmark-outline',
      action: () => Alert.alert("Privacy", "Show Privacy Policy."), // Or link to webpage
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.headerSection}>
          <Ionicons name="help-buoy-outline" size={60} color="#1A4B44" />
          <Text style={styles.headerText}>How can we help you?</Text>
          <Text style={styles.subHeaderText}>
            Find answers to your questions or get in touch with our support team.
          </Text>
        </View>

        {supportItems.map(item => (
          <TouchableOpacity key={item.id} style={styles.item} onPress={item.action}>
            <Ionicons name={item.icon as any} size={24} color="#1A4B44" style={styles.itemIcon} />
            <Text style={styles.itemText}>{item.title}</Text>
            <Ionicons name="chevron-forward" size={20} color="#B0B0B0" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
  headerSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 10,
  },
  headerText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    marginBottom: 5,
  },
  subHeaderText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  item: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  itemIcon: {
    marginRight: 15,
  },
  itemText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
});

export default HelpSupportScreen; 