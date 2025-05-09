import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, TouchableOpacity, View, Text, Alert } from 'react-native';
// import { Colors } from '../../constants/Colors'; // Corrected import - Assuming this path is correct or Colors are defined elsewhere

// Define a placeholder for Colors if not imported
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
    navigateToNotifications: () => router.navigate('/(screens)/notifications'),
    navigateToMessages: () => router.navigate('/(screens)/chat'),
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

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Platform.OS === 'ios' ? Colors.secondary : Colors.primary,
        tabBarInactiveTintColor: Colors.gray,
        tabBarStyle: {
          backgroundColor: Colors.white,
        },
        // headerShown: true, // This was enabling headers globally
        // Default header styling is removed as each screen will have its own AppHeader
        // headerStyle: {
        //   backgroundColor: Colors.white,
        //   elevation: Platform.OS === 'android' ? 4 : 0, 
        //   shadowOpacity: Platform.OS === 'ios' ? 0.1 : 0, 
        //   shadowOffset: { width: 0, height: 1 },
        //   shadowRadius: 2,
        //   borderBottomWidth: Platform.OS === 'android' ? 0 : 0.5, 
        //   borderBottomColor: Colors.lightGray,
        // },
        // headerTitleStyle: {
        //   fontWeight: 'bold',
        //   fontSize: Platform.OS === 'ios' ? 34 : 24,
        //   color: Colors.primary,
        //   paddingBottom: Platform.OS === 'ios' ? 60 : 5,
        // },
        // headerTitleAlign: Platform.OS === 'ios' ? 'left' : 'left', 
        // headerLeftContainerStyle: { paddingLeft: 10 },
        // headerRightContainerStyle: { paddingRight: 15 },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          headerShown: false, // Use custom AppHeader in screen file
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} /> 
          ),
          // headerRight is now handled by AppHeader instance in feed.tsx
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          headerShown: false, // Use custom AppHeader in screen file
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons name={focused ? "book-open-page-variant" : "book-open-page-variant-outline"} size={size} color={color} /> 
          ),
        }}
      />
      <Tabs.Screen
        name="familyTree"
        options={{
          title: 'Family Tree',
          headerShown: false, // Use custom AppHeader in screen file
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} color={color} size={size} />
          ),
          // headerRight is now handled by AppHeader instance in familyTree.tsx
          tabBarLabel: ({ focused, color }) => (
            <Text style={{
              color,
              fontSize: 10,
              textAlign: 'center',
              // Ensure enough height for two lines, adjust as needed
              // lineHeight might also be useful if specific spacing is desired
              // flexWrap: 'wrap', // Not standard for Text, height and textAlign usually suffice
            }}>
              Family Tree
            </Text>
          ),
          tabBarLabelStyle: { // Keep this for general styling, but custom component gives more control
            fontSize: 10, 
            // height: Platform.OS === 'ios' ? 'auto' : 35, // Let height be auto or adjust based on content
            // lineHeight: 12, // Adjust if needed
          }
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          headerShown: false, // Use custom AppHeader in screen file
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} /> 
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: false, // Use custom AppHeader in screen file
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
