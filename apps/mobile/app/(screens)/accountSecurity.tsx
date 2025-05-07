import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../src/lib/firebase'; // Import auth for user info
// import { sendPasswordResetEmail } from 'firebase/auth'; // REMOVED - For password reset

// Mock data - replace with actual data fetching if needed
const MOCK_LOGIN_ACTIVITY = [
  { id: '1', device: 'iPhone 15 Pro', location: 'New York, USA', lastLogin: '2 hours ago' },
  { id: '2', device: 'Chrome on macOS', location: 'London, UK', lastLogin: '1 day ago' },
];

const AccountSecurityScreen = () => {
  const navigation = useNavigation();
  const [isTwoFactorEnabled, setIsTwoFactorEnabled] = useState(false); // Mock state

  useEffect(() => {
    navigation.setOptions({
      title: 'Account Security',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  const handleChangePassword = () => {
    if (auth.currentUser && auth.currentUser.email) {
        // sendPasswordResetEmail(auth, auth.currentUser.email) // OLD WAY
        auth.sendPasswordResetEmail(auth.currentUser.email) // CHANGED for RNFB
        .then(() => {
          Alert.alert(
            "Password Reset Email Sent",
            "An email has been sent to your registered address with instructions to reset your password."
          );
        })
        .catch((error) => {
          console.error("Error sending password reset email:", error);
          Alert.alert("Error", "Could not send password reset email. Please try again later.");
        });
    } else {
        Alert.alert("Error", "Could not determine your email address. Please ensure you are logged in.");
    }
    // TODO: For a more secure in-app password change, you'd typically re-authenticate the user 
    // and then use Firebase Auth's updatePassword method.
  };

  const handleToggleTwoFactor = () => {
    setIsTwoFactorEnabled(!isTwoFactorEnabled);
    // TODO: Implement actual 2FA setup/disable logic with Firebase Auth (e.g., phone MFA)
    Alert.alert('Two-Factor Authentication', `2FA is now ${!isTwoFactorEnabled ? "enabled" : "disabled"} (mock).`);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <Text style={styles.sectionHeader}>Password</Text>
        <TouchableOpacity style={styles.settingItemContainer} onPress={handleChangePassword}>
          <Ionicons name="lock-closed-outline" size={22} color="#555" style={styles.itemIcon} />
          <Text style={styles.settingLabel}>Change Password</Text>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>Two-Factor Authentication</Text>
        <View style={styles.settingItemContainer}>
            <View style={styles.textContainer}>
                <Text style={styles.settingLabel}>Enable 2FA</Text>
                 <Text style={styles.settingDescription}>Adds an extra layer of security to your account.</Text>
            </View>
            <Switch
                trackColor={{ false: "#767577", true: "#81b0ff" }}
                thumbColor={isTwoFactorEnabled ? "#007AFF" : "#f4f3f4"}
                ios_backgroundColor="#E0E0E0"
                onValueChange={handleToggleTwoFactor}
                value={isTwoFactorEnabled}
            />
        </View>
        {/* TODO: Add navigation to 2FA setup screen if isTwoFactorEnabled is false and user wants to set it up */}

        <Text style={styles.sectionHeader}>Login Activity</Text>
        {MOCK_LOGIN_ACTIVITY.map((activity, index) => (
          <View key={activity.id} style={[styles.settingItemContainer, styles.activityItem]}>
            <Ionicons name={activity.device.toLowerCase().includes('iphone') ? "phone-portrait-outline" : "laptop-outline"} size={22} color="#555" style={styles.itemIcon} />
            <View style={styles.textContainer}>
                <Text style={styles.settingLabel}>{activity.device}</Text>
                <Text style={styles.settingDescription}>{activity.location} - {activity.lastLogin}</Text>
            </View>
            {/* TODO: Add option to sign out of specific device if API allows */}
          </View>
        ))}
        {MOCK_LOGIN_ACTIVITY.length === 0 && (
            <View style={styles.settingItemContainer}>
                <Text style={styles.settingDescription}>No recent login activity found.</Text>
            </View>
        )}
         {/* TODO: Add a "Sign out of all other devices" option */}
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
  activityItem: {
    justifyContent: 'flex-start',
  },
  itemIcon: {
    marginRight: 15,
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
});

export default AccountSecurityScreen; 