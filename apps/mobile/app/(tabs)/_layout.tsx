import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, View, Text, Alert, StyleSheet } from 'react-native';
// import { Colors } from '../../constants/Colors'; // Corrected import - Assuming this path is correct or Colors are defined elsewhere
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
const useHeaderActions = () => {
  const router = useRouter();
  return {
    // navigateToNewChat: () => router.push('/(screens)/newChat'), // Kept for potential future use, but not for Feed header direct action
    navigateToNotifications: () => router.push('/(screens)/notifications'), // Updated path and removed 'as any'
    navigateToMessages: () => router.navigate('/(screens)/chat' as any), // Temp fix for type error
    // Placeholder for actual notification actions if needed directly in header
    // handleMarkAllNotificationsRead: () => console.log("Mark all as read"), 
    // handleClearReadNotifications: () => console.log("Clear read notifications"), 
  };
};

export default function TabLayout() {
  const { 
    // navigateToNewChat, // Not used directly in Feed header now
    navigateToNotifications,
    navigateToMessages,
    // handleMarkAllNotificationsRead, // Removed from direct use here
    // handleClearReadNotifications // Removed from direct use here
  } = useHeaderActions();

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

  const familyTreeHeaderRight = () => (
    <IconButton
      iconName="ellipsis-vertical"
      size={24}
      color={Colors.primary}
      onPress={() => {
        Alert.alert(
          "Family Tree Options",
          "",
          [
            { text: "Add new member", onPress: () => console.log("Add new member pressed") },
            { text: "Family tree settings", onPress: () => console.log("Family tree settings pressed") },
            { text: "Invite members", onPress: () => console.log("Invite members pressed") },
            { text: "Cancel", style: "cancel" }
          ],
          { cancelable: true }
        );
      }}
      accessibilityLabel="Family tree options"
    />
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
          header: (props) => <AppHeader title={props.options.title || 'Family Tree'} headerRight={familyTreeHeaderRight} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} /> 
          ),
          headerShown: true,
          header: (props) => <AppHeader title={props.options.title || 'Events'} />,
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
