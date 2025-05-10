import React from 'react';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import { TouchableOpacity, View, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CalendarScreen from '../(screens)/CalendarScreen';
import EventListScreen from '../(screens)/EventListScreen';
import { Colors as ImportedColors } from '../../constants/Colors';
import { RouteProp } from '@react-navigation/native';

// Fallback colors in case ImportedColors is not loaded correctly
const fallbackColors = {
  light: {
    primary: '#1A4B44',
    text: '#11181C',
    background: '#FFFFFF',
    icon: '#687076',
  },
  dynastyGreen: '#1A4B44',
};

// Use imported colors with a fallback mechanism
const Colors = ImportedColors || fallbackColors;

export type EventsStackParamList = {
  CalendarHome: { scrollToToday?: string };
  EventList: undefined;
};

interface CalendarHeaderRightProps {
  navigation: StackNavigationProp<EventsStackParamList, 'CalendarHome'>;
}

const Stack = createStackNavigator<EventsStackParamList>();

const CalendarHeaderRight = ({ navigation }: CalendarHeaderRightProps) => {
  const theme = 'light';
  // Defensive access to colors
  const currentThemeSet = (Colors && Colors[theme]) ? Colors[theme] : fallbackColors[theme];
  const headerColor = currentThemeSet.primary || fallbackColors.dynastyGreen;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: Platform.OS === 'ios' ? 10 : 15 }}>
      <TouchableOpacity
        onPress={() => {
          navigation.setParams({ scrollToToday: new Date().toISOString() });
          console.log('Today button pressed, setting params');
        }}
        style={{ paddingHorizontal: 10 }}
      >
        <Text style={{ color: headerColor, fontSize: 16 }}>Today</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate('EventList')}
        style={{ paddingLeft: 10 }}
      >
        <Ionicons name="list-outline" size={24} color={headerColor} />
      </TouchableOpacity>
    </View>
  );
};

interface CalendarHomeScreenOptionsProps {
  route: RouteProp<EventsStackParamList, 'CalendarHome'>;
  navigation: StackNavigationProp<EventsStackParamList, 'CalendarHome'>;
}

const EventsStackNavigator = () => {
  const theme = 'light';
  // Defensive access to colors
  const currentThemeSet = (Colors && Colors[theme]) ? Colors[theme] : fallbackColors[theme];
  const headerColor = currentThemeSet.primary || fallbackColors.dynastyGreen;
  const headerTitleColor = currentThemeSet.text || fallbackColors.light.text;
  const headerBgColor = currentThemeSet.background || fallbackColors.light.background;

  return (
    <Stack.Navigator 
      initialRouteName="CalendarHome"
      screenOptions={{
        headerStyle: {
          backgroundColor: headerBgColor,
        },
        headerTintColor: headerColor,
        headerTitleStyle: {
          color: headerTitleColor,
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="CalendarHome"
        component={CalendarScreen}
        options={({ navigation }: CalendarHomeScreenOptionsProps) => ({
          title: 'Calendar',
          headerShown: false,
          headerRight: () => <CalendarHeaderRight navigation={navigation} />,
        })}
      />
      <Stack.Screen
        name="EventList"
        component={EventListScreen}
        options={{ 
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
};

export default EventsStackNavigator; 