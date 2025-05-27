import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
// import { Ionicons } from '@expo/vector-icons';
import { getFirebaseAuth } from '../../src/lib/firebase';
import ListItem, { ListItemProps } from '../../components/ListItem'; // Import shared ListItem
import { commonHeaderOptions } from '../../constants/headerConfig'; // Import common header options
import { showErrorAlert } from '../../src/lib/errorUtils'; // Added import
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { FlashList } from '../../components/ui/FlashList';

// Reusable ListItem component - REMOVED
// interface ListItemProps { ... }
// const ListItem: React.FC<ListItemProps> = ({ icon, text, onPress }) => { ... };

const AccountSettingsScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Account Settings Error',
    trackCurrentScreen: true
  });

  useEffect(() => {
    navigation.setOptions({
      ...commonHeaderOptions, // Spread common options
      title: 'Account Settings',
    });
  }, [navigation]);

  useEffect(() => {
    if (!isError) {
      // Clear any local error states when global error is cleared
    }
  }, [isError]);

  const handleLogout = withErrorHandling(async () => {
    reset();
    try {
      const authInstance = getFirebaseAuth(); // Get the auth instance
      await authInstance.signOut(); // Call signOut on the instance
      router.replace('/login');
    } catch (error: any) {
      handleError(error, { 
        action: 'logout',
        metadata: { 
          screenName: 'AccountSettings',
          timestamp: new Date().toISOString()
        }
      });
      showErrorAlert(error, "Logout Failed"); // Refactored
    }
  });

  const handleNavigation = withErrorHandling(async (path: string, optionName: string) => {
    reset();
    try {
      router.push(path as any);
    } catch (error: any) {
      handleError(error, { 
        action: 'navigation',
        metadata: { 
          destination: path,
          optionName,
          screenName: 'AccountSettings'
        }
      });
      showErrorAlert(error, "Navigation Failed");
    }
  });

  const settingsOptions: ListItemProps[] = [
    {
        icon: 'person-circle-outline',
        text: 'Edit Profile',
        onPress: () => handleNavigation('/(screens)/editProfile', 'Edit Profile'),
    },
    {
        icon: 'notifications-outline',
        text: 'Notification Preferences',
        onPress: () => handleNavigation('/(screens)/notificationPreferences', 'Notification Preferences'),
    },
    {
        icon: 'lock-closed-outline',
        text: 'Privacy Settings',
        onPress: () => handleNavigation('/(screens)/privacySettings', 'Privacy Settings'),
    },
    {
        icon: 'shield-checkmark-outline',
        text: 'Account Security',
        onPress: () => handleNavigation('/(screens)/accountSecurity', 'Account Security'),
    },
    {
        icon: 'information-circle-outline',
        text: 'About Dynasty',
        onPress: () => handleNavigation('/(screens)/aboutDynasty', 'About Dynasty'),
    },
    {
        icon: 'log-out-outline',
        text: 'Logout',
        onPress: handleLogout,
    },
  ];

  return (
    <ErrorBoundary screenName="AccountSettingsScreen">
      <SafeAreaView style={styles.safeArea}>
        <FlashList
          data={settingsOptions}
          keyExtractor={(item) => item.text}
          renderItem={({ item }) => <ListItem {...item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={() => (
              <Text style={styles.footerText}>Dynasty App v1.0.0</Text>
          )}
          style={styles.listContainer}
          estimatedItemSize={60}
        />
      </SafeAreaView>
    </ErrorBoundary>
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
  userInfoHeader: {
    paddingVertical: 30,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF', // White background for this section
    marginBottom: 20, // Space before the list items
  },
  userName: {
      fontSize: 22,
      fontWeight: 'bold',
      color: '#333',
      marginBottom: 5,
  },
  userEmail: {
      fontSize: 16,
      color: '#777',
  },
  separator: {
    height: StyleSheet.hairlineWidth, // Use hairline for subtle separator
    backgroundColor: '#E0E0E0',
    marginLeft: 15 + 24 + 15, // Align with text
  },
  footerText: {
      textAlign: 'center',
      paddingVertical: 20,
      fontSize: 14,
      color: '#999',
  }
});

export default AccountSettingsScreen; 