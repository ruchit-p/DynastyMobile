import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, Image } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Reusable ListItem component (Copy from accountSettings or move to shared location)
interface ListItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  onPress: () => void;
}

const ListItem: React.FC<ListItemProps> = ({ icon, text, onPress }) => {
  return (
    <TouchableOpacity style={styles.listItem} onPress={onPress}>
      <Ionicons name={icon} size={22} color="#555" style={styles.listItemIcon} />
      <Text style={styles.listItemText}>{text}</Text>
      <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
    </TouchableOpacity>
  );
};

const HelpAndSupportScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      title: 'Help & Support',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  const helpOptions: ListItemProps[] = [
    {
        icon: 'help-buoy-outline', // Changed icon
        text: 'Frequently Asked Questions',
        onPress: () => router.push('/(screens)/faq'),
    },
    {
        icon: 'mail-outline',
        text: 'Contact Support',
        onPress: () => router.push('/(screens)/contactSupport'),
    },
    {
        icon: 'document-text-outline',
        text: 'Terms of Service',
        onPress: () => router.push('/(screens)/termsOfService'),
    },
    {
        icon: 'shield-checkmark-outline',
        text: 'Privacy Policy',
        onPress: () => router.push('/(screens)/privacyPolicy'),
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={helpOptions}
        keyExtractor={(item) => item.text}
        renderItem={({ item }) => <ListItem {...item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={() => (
          <View style={styles.headerContent}>
            <Image 
                // Placeholder for the logo shown in screenshot
                source={require('../../assets/images/dynasty.png')} 
                style={styles.logo}
                resizeMode="contain" 
            />
            <Text style={styles.headerTitle}>How can we help you?</Text>
            <Text style={styles.headerSubtitle}>
                Find answers to your questions or get in touch with our support team.
            </Text>
          </View>
        )}
        style={styles.listContainer}
        contentContainerStyle={{ paddingBottom: 20 }} // Add padding at the bottom
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  listContainer: {
      flex: 1,
  },
  headerContent: {
    paddingVertical: 40, 
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#FFFFFF', 
    marginBottom: 20, 
  },
  logo: {
    width: 60,
    height: 60,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  headerSubtitle: {
      fontSize: 16,
      color: '#666',
      textAlign: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 15,
    backgroundColor: '#FFFFFF',
  },
  listItemIcon: {
    marginRight: 15,
    width: 24,
    textAlign: 'center',
    color: '#555',
  },
  listItemText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
    marginLeft: 15 + 24 + 15, 
  },
});

export default HelpAndSupportScreen; 