import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, View, Text, Alert, StyleSheet } from 'react-native';
import AppHeader from '../../components/ui/AppHeader'; // Import the new AppHeader
import IconButton, { IconSet } from '../../components/ui/IconButton'; // Import the new IconButton

// Define a placeholder for Colors if not imported (used for tab bar, not header anymore for Profile)
const Colors = {
  primary: '#1A4B44', // Dynasty primary color
  secondary: '#007AFF', // iOS blue as an example
  gray: 'gray',
  white: '#FFFFFF',
  lightGray: '#CCC',
};

// Custom hook for header actions to avoid repeating logic
// This hook is problematic if used outside a component context for router instance.
// Let's simplify and manage router instance directly in TabLayout.
/*
const useHeaderActions = () => {
  const router = useRouter(); // This is fine if useHeaderActions is called inside TabLayout
  return {
    navigateToNotifications: () => router.push('/(screens)/notifications'),
    navigateToMessages: () => router.navigate('/(screens)/chat' as any),
  };
};
*/

export default function TabLayout() {
  const router = useRouter(); // Call useRouter at the top level of the component

  // const { navigateToNotifications, navigateToMessages } = useHeaderActions(); // Re-evaluate if this hook is still needed or integrate directly
  const navigateToNotifications = () => router.push('/(screens)/notifications');
  const navigateToMessages = () => router.navigate('/(screens)/chat' as any);

  // Define headerRight components to pass to AppHeader
  const feedHeaderRight = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton
        iconName="notifications-outline"
        size={26}
        color={Colors.primary}
        onPress={navigateToNotifications}
        style={styles.headerIcon}
        accessibilityLabel="View notifications"
      />
      <IconButton
        iconName="chatbubbles-outline"
        size={26}
        color={Colors.primary}
        onPress={navigateToMessages}
        style={styles.headerIcon}
        accessibilityLabel="View messages"
      />
    </View>
  );

  // Modified calendarHeaderRight to accept router instance
  const calendarHeaderRight = (currentRouter: ReturnType<typeof useRouter>) => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text
        style={{ color: Colors.primary, marginRight: 15, fontSize: 16 }}
        onPress={() => console.log('Today pressed')} // Placeholder action
      >
        Today
      </Text>
      <IconButton
        iconSet={IconSet.Ionicons}
        iconName="list-outline"
        size={28}
        color={Colors.primary}
        onPress={() => {
          currentRouter.push('/(screens)/EventListScreen');
        }}
        style={styles.headerIcon}
        accessibilityLabel="View events list"
      />
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Platform.OS === 'ios' ? Colors.secondary : Colors.primary,
        tabBarInactiveTintColor: Colors.gray,
        tabBarStyle: {
          backgroundColor: Colors.white,
        },
        headerShown: false, // Important: We use custom header for all screens via options.header
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} /> 
          ),
          headerShown: true, // Must be true to use custom header
          header: (props) => <AppHeader title={props.options.title || 'Feed'} headerRight={feedHeaderRight} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons name={focused ? "book-open-page-variant" : "book-open-page-variant-outline"} size={size} color={color} /> 
          ),
          headerShown: true,
          header: (props) => <AppHeader title={props.options.title || 'History'} />,
        }}
      />
      <Tabs.Screen
        name="familyTree"
        options={{
          title: 'Family Tree',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} color={color} size={size} />
          ),
          tabBarLabel: ({ focused, color }) => (
            <Text style={{ color, fontSize: 10, textAlign: 'center' }}>
              Family Tree
            </Text>
          ),
          tabBarLabelStyle: { fontSize: 10 },
          headerShown: true,
          header: (props) => <AppHeader title={props.options.title || 'Family Tree'} />,
        }}
      />
      {/* Vault Tab - Moved and Icon Updated */}
      <Tabs.Screen
        name="vault"
        options={{
          title: 'Vault',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "lock-closed" : "lock-closed-outline"} size={size} color={color} />
          ),
          headerShown: false, // Let VaultScreen render its own header
        }}
      />
      {/* End Vault Tab */}
      <Tabs.Screen
        name="events"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} /> 
          ),
          headerShown: true, // Changed from false
          header: (props) => <AppHeader 
                                title={props.options.title || 'Calendar'} 
                                // Pass the router instance obtained from the top level
                                headerRight={() => calendarHeaderRight(router)} 
                             />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={size} color={color} />
          ),
          headerShown: true,
          header: (props) => <AppHeader title={props.options.title || 'Profile'} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerIcon: {
    paddingHorizontal: 10, // Preserving original horizontal padding for feed icons
  },
});
