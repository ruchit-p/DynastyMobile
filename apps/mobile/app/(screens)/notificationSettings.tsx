import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Platform, SafeAreaView } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// MARK: - Types
interface NotificationSetting {
  id: string;
  label: string;
  value: boolean;
}

// MARK: - Main Component
const NotificationSettingsScreen = () => {
  const navigation = useNavigation();
  const [settings, setSettings] = useState<NotificationSetting[]>([
    { id: 'newPost', label: 'New Posts from Family', value: true },
    { id: 'eventReminder', label: 'Event Reminders', value: true },
    { id: 'commentOnPost', label: 'Comments on Your Posts', value: true },
    { id: 'storyMention', label: 'Mentions in Stories', value: false },
    { id: 'newMessage', label: 'New Chat Messages', value: true },
    { id: 'appUpdates', label: 'App Updates & Announcements', value: true },
  ]);

  React.useEffect(() => {
    navigation.setOptions({
      title: 'Notification Preferences',
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

  const toggleSetting = (id: string) => {
    setSettings(prevSettings =>
      prevSettings.map(setting =>
        setting.id === id ? { ...setting, value: !setting.value } : setting
      )
    );
    // TODO: Persist this change to backend/local storage
  };

  // MARK: - Render
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <Text style={styles.sectionHeader}>Push Notifications</Text>
        {settings.map(setting => (
          <View key={setting.id} style={styles.settingItem}>
            <Text style={styles.settingLabel}>{setting.label}</Text>
            <Switch
              trackColor={{ false: '#767577', true: '#4CAF50' }}
              thumbColor={setting.value ? '#FFFFFF' : '#f4f3f4'}
              ios_backgroundColor="#3e3e3e"
              onValueChange={() => toggleSetting(setting.id)}
              value={setting.value}
            />
          </View>
        ))}
        <View style={styles.descriptionContainer}>
            <Text style={styles.descriptionText}>
                Manage your notification preferences. You can choose what updates you receive from Dynasty.
            </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// MARK: - Styles
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
  container: {
    flex: 1,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    backgroundColor: '#F4F4F4',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
  },
  descriptionContainer: {
    padding: 20,
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  descriptionText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  }
});

export default NotificationSettingsScreen; 