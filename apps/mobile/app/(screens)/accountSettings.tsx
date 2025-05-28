import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Switch } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import Slider from '@react-native-community/slider';
// import { Ionicons } from '@expo/vector-icons';
import { getFirebaseAuth } from '../../src/lib/firebase';
import ListItem, { ListItemProps } from '../../components/ListItem'; // Import shared ListItem
import { commonHeaderOptions } from '../../constants/headerConfig'; // Import common header options
import { showErrorAlert } from '../../src/lib/errorUtils'; // Added import
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { FlashList } from '../../components/ui/FlashList';
import { useFontScale } from '../../src/hooks/useFontScale';
import FontSizeService, { FontSizePreset } from '../../src/services/FontSizeService';
import { Spacing } from '../../constants/Spacing';
import { Colors } from '../../constants/Colors';
import { ThemedText } from '../../components/ThemedText';

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
  
  const { fontScale, setFontScale, getScaledFontSize } = useFontScale();
  const [useDeviceSettings, setUseDeviceSettings] = useState(true);
  const fontService = FontSizeService.getInstance();

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

  const handleFontScaleChange = withErrorHandling(async (value: number) => {
    await setFontScale(value);
  });

  const handleUseDeviceSettingsChange = withErrorHandling(async (value: boolean) => {
    setUseDeviceSettings(value);
    await fontService.setUseDeviceSettings(value);
  });

  // Font size section component
  const FontSizeSection = () => (
    <View style={styles.fontSizeSection}>
      <ThemedText style={[styles.sectionTitle, { fontSize: getScaledFontSize(18) }]}>
        Font Size
      </ThemedText>
      
      <View style={styles.fontPreview}>
        <ThemedText style={[styles.previewText, { fontSize: getScaledFontSize(14) }]}>
          Preview Text
        </ThemedText>
        <ThemedText style={[styles.previewTextLarge, { fontSize: getScaledFontSize(20) }]}>
          Dynasty
        </ThemedText>
      </View>

      <View style={styles.sliderContainer}>
        <ThemedText style={[styles.sliderLabel, { fontSize: getScaledFontSize(12) }]}>A</ThemedText>
        <Slider
          style={styles.slider}
          minimumValue={0.85}
          maximumValue={1.5}
          value={fontScale}
          onValueChange={handleFontScaleChange}
          minimumTrackTintColor={Colors.light.primary}
          maximumTrackTintColor={Colors.light.border}
          thumbTintColor={Colors.light.primary}
        />
        <ThemedText style={[styles.sliderLabelLarge, { fontSize: getScaledFontSize(18) }]}>A</ThemedText>
      </View>

      <View style={styles.switchContainer}>
        <ThemedText style={[styles.switchLabel, { fontSize: getScaledFontSize(16) }]}>
          Use Device Text Size
        </ThemedText>
        <Switch
          value={useDeviceSettings}
          onValueChange={handleUseDeviceSettingsChange}
          trackColor={{ false: Colors.light.border, true: Colors.light.primary }}
          thumbColor="#FFFFFF"
        />
      </View>
    </View>
  );

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
          ListHeaderComponent={() => <FontSizeSection />}
          ListFooterComponent={() => (
              <Text style={[styles.footerText, { fontSize: getScaledFontSize(14) }]}>Dynasty App v1.0.0</Text>
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
  },
  fontSizeSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text.primary,
    marginBottom: Spacing.md,
  },
  fontPreview: {
    backgroundColor: Colors.light.background.secondary,
    padding: Spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  previewText: {
    fontSize: 14,
    color: Colors.light.text.secondary,
    marginBottom: Spacing.xs,
  },
  previewTextLarge: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.light.text.primary,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  sliderLabel: {
    fontSize: 12,
    color: Colors.light.text.secondary,
    width: 20,
  },
  sliderLabelLarge: {
    fontSize: 18,
    color: Colors.light.text.primary,
    width: 20,
    fontWeight: 'bold',
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: Spacing.sm,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  switchLabel: {
    fontSize: 16,
    color: Colors.light.text.primary,
  },
});

export default AccountSettingsScreen; 