import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Switch, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../src/lib/firebase';
import { doc, setDoc, getDoc } from "firebase/firestore";

interface SettingToggleProps {
    label: string;
    description?: string;
    isEnabled: boolean;
    onToggle: (value: boolean) => void;
}

const SettingToggle: React.FC<SettingToggleProps> = ({ label, description, isEnabled, onToggle }) => {
    return (
        <View style={styles.settingItemContainer}>
            <View style={styles.textContainer}>
                <Text style={styles.settingLabel}>{label}</Text>
                {description && <Text style={styles.settingDescription}>{description}</Text>}
            </View>
            <Switch
                trackColor={{ false: "#767577", true: "#81b0ff" }} 
                thumbColor={isEnabled ? "#007AFF" : "#f4f3f4"}
                ios_backgroundColor="#E0E0E0"
                onValueChange={onToggle}
                value={isEnabled}
            />
        </View>
    );
}

interface SettingNavigationProps {
    label: string;
    currentValue?: string;
    onPress: () => void;
}

const SettingNavigation: React.FC<SettingNavigationProps> = ({ label, currentValue, onPress }) => {
    return (
        <TouchableOpacity style={styles.settingItemContainer} onPress={onPress}>
             <View style={styles.textContainer}>
                <Text style={styles.settingLabel}>{label}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center'}}>
                {currentValue && <Text style={styles.currentValueText}>{currentValue}</Text>}
                <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </View>
        </TouchableOpacity>
    );
}

// Define types for visibility options
export type ProfileVisibilityOption = 'Public' | 'Connections Only' | 'Private';
export type StoryVisibilityOption = 'Public' | 'Connections Only' | 'Friends Only' | 'Private'; // Example, adjust as needed

interface PrivacySettings {
    profileVisibility: ProfileVisibilityOption;
    storyVisibility: StoryVisibilityOption;
    allowFriendRequests: boolean;
    showOnlineStatus: boolean;
    // Add other settings as needed
}

const PrivacySettingsScreen = () => {
  const navigation = useNavigation();
  const router = useRouter();
  const currentPath = router.pathname; // Get current path for sub-screens
  const params = useLocalSearchParams<{ 
    selectedProfileVisibility?: ProfileVisibilityOption,
    selectedStoryVisibility?: StoryVisibilityOption,
    fromScreen?: string 
  }>();

  const initialSettings: PrivacySettings = {
      profileVisibility: 'Public', 
      storyVisibility: 'Connections Only',
      allowFriendRequests: true,
      showOnlineStatus: true,
  };

  const [settings, setSettings] = useState<PrivacySettings>(initialSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch/initialize settings and handle updates from sub-screens
  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;
      const loadSettings = async () => {
        if (!auth.currentUser) {
          if (isActive) setIsLoading(false);
          console.warn("No user logged in, cannot load privacy settings.");
          return;
        }
        if (isActive) setIsLoading(true);
        
        let currentSettings = settings; // Start with current state

        // Check for updates from sub-screens (visibility pickers)
        if (params.fromScreen === 'selectProfileVisibility' && params.selectedProfileVisibility) {
            currentSettings = { ...currentSettings, profileVisibility: params.selectedProfileVisibility };
            // router.setParams({ fromScreen: undefined, selectedProfileVisibility: undefined }); // Clear param
        } else if (params.fromScreen === 'selectStoryVisibility' && params.selectedStoryVisibility) {
            currentSettings = { ...currentSettings, storyVisibility: params.selectedStoryVisibility };
            // router.setParams({ fromScreen: undefined, selectedStoryVisibility: undefined }); // Clear param
        }
        
        // If settings were changed by a sub-screen, save them immediately
        if ((params.fromScreen === 'selectProfileVisibility' && params.selectedProfileVisibility) ||
            (params.fromScreen === 'selectStoryVisibility' && params.selectedStoryVisibility)) {
            await saveSettings(currentSettings, false); // Save without showing alert for this case
        } else {
            // Otherwise, fetch from DB or initialize
            const userDocRef = doc(db, "users", auth.currentUser.uid);
            try {
                const docSnap = await getDoc(userDocRef);
                if (isActive) {
                    if (docSnap.exists() && docSnap.data().privacySettings) {
                        // Merge with defaults to ensure all keys are present
                        const fetchedSettings = { ...initialSettings, ...docSnap.data().privacySettings };
                        setSettings(fetchedSettings);
                        currentSettings = fetchedSettings; // Update currentSettings to reflect fetched
                    } else {
                        // No saved settings, use defaults and save them
                        await setDoc(userDocRef, { privacySettings: initialSettings }, { merge: true });
                        setSettings(initialSettings);
                        currentSettings = initialSettings;
                    }
                }
            } catch (error) {
                console.error("Error fetching privacy settings:", error);
                if (isActive) setSettings(initialSettings); // Revert to defaults
            }
        }
        
        if (isActive) {
            setSettings(currentSettings); // Ensure final state is set
            setIsLoading(false);
        }
      };

      loadSettings();
      return () => { isActive = false; };
    // Include params in dependency array to react to changes from sub-screens
    }, [params.fromScreen, params.selectedProfileVisibility, params.selectedStoryVisibility]) 
  );

  useEffect(() => {
    navigation.setOptions({
      title: 'Privacy Settings',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  const saveSettings = async (updatedSettings: PrivacySettings, showAlert = true) => {
    if (!auth.currentUser) {
      if (showAlert) Alert.alert("Error", "You must be logged in to change settings.");
      return false;
    }
    try {
      const userDocRef = doc(db, "users", auth.currentUser.uid);
      await setDoc(userDocRef, { privacySettings: updatedSettings }, { merge: true });
      // if (showAlert) console.log("Privacy settings saved."); // Or a success toast
      return true;
    } catch (error) {
      console.error("Error saving privacy settings:", error);
      if (showAlert) Alert.alert("Save Failed", "Could not save your settings. Please try again.");
      return false;
    }
  };

  const handleToggle = async (key: keyof Pick<PrivacySettings, 'allowFriendRequests' | 'showOnlineStatus'>) => {
      const newSettings = {
        ...settings,
        [key]: !settings[key],
      };
      setSettings(newSettings); // Optimistic UI update
      const success = await saveSettings(newSettings);
      if (!success) {
        // Revert UI if save failed
        setSettings(prev => ({...prev, [key]: !prev[key]})); 
      }
  };
  
  const handleProfileVisibilityPress = () => {
    router.push({
      pathname: '/(screens)/selectProfileVisibility', // Ensure this screen is created
      params: { currentVisibility: settings.profileVisibility, previousPath: currentPath },
    });
  };

  const handleStoryVisibilityPress = () => {
    router.push({
      pathname: '/(screens)/selectStoryVisibility', // Ensure this screen is created
      params: { currentVisibility: settings.storyVisibility, previousPath: currentPath },
    });
  };

  const handleBlockedUsersPress = () => {
      router.push('/(screens)/blockedUsers'); // Ensure this screen is created
      console.log('Navigate to Blocked Users Screen');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0A5C36" />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <Text style={styles.sectionHeader}>Profile Privacy</Text>
        <SettingNavigation 
            label="Profile Visibility"
            currentValue={settings.profileVisibility}
            onPress={handleProfileVisibilityPress}
        />
        <SettingToggle 
            label="Show Online Status"
            isEnabled={settings.showOnlineStatus}
            onToggle={() => handleToggle('showOnlineStatus')}
        />
        
        <Text style={styles.sectionHeader}>Story Privacy</Text>
        <SettingNavigation 
            label="Default Story Visibility"
            currentValue={settings.storyVisibility}
            onPress={handleStoryVisibilityPress}
        />

        <Text style={styles.sectionHeader}>Connections</Text>
         <SettingToggle 
            label="Allow Friend Requests"
            description="Allow others to send you connection requests."
            isEnabled={settings.allowFriendRequests}
            onToggle={() => handleToggle('allowFriendRequests')}
        />
         <SettingNavigation 
            label="Blocked Users"
            onPress={handleBlockedUsersPress}
        />
      </ScrollView>
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
  },
  sectionHeader: {
      fontSize: 14,
      color: '#666',
      fontWeight: '600',
      textTransform: 'uppercase',
      paddingHorizontal: 15,
      paddingTop: 25,
      paddingBottom: 8,
  },
  settingItemContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DCDCDC',
  },
  textContainer: {
      flex: 1, 
      marginRight: 10,
  },
  settingLabel: {
      fontSize: 16,
      color: '#333',
  },
  settingDescription: {
      fontSize: 13,
      color: '#777',
      marginTop: 3,
  },
  currentValueText: {
      fontSize: 16,
      color: '#888',
      marginRight: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
});

export default PrivacySettingsScreen; 