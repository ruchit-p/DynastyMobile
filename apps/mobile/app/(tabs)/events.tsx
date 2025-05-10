import React from 'react';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import { View } from 'react-native';
import { RouteProp } from '@react-navigation/native';

// Import screens
import CalendarScreen from '../(screens)/CalendarScreen';
import EventListScreen from '../(screens)/EventListScreen';

// Import design system components and utilities
import IconButton from '../../components/ui/IconButton';
import Button from '../../components/ui/Button';
import { Colors } from '../../constants/Colors';
import { useBackgroundColor, useTextColor } from '../../hooks/useThemeColor';

export type EventsStackParamList = {
  CalendarHome: { scrollToToday?: string };
  EventList: undefined;
};

interface CalendarHeaderRightProps {
  navigation: StackNavigationProp<EventsStackParamList, 'CalendarHome'>;
}

const Stack = createStackNavigator<EventsStackParamList>();

const CalendarHeaderRight = ({ navigation }: CalendarHeaderRightProps) => {
  const primaryColor = Colors.palette.dynastyGreen.dark;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Button
        title="Today"
        variant="text"
        size="small"
        onPress={() => {
          navigation.setParams({ scrollToToday: new Date().toISOString() });
        }}
        style={{ marginRight: 8 }}
      />
      
      <IconButton
        iconName="list-outline"
        size={24}
        color={primaryColor}
        onPress={() => navigation.navigate('EventList')}
        accessibilityLabel="View events list"
      />
    </View>
  );
};

interface CalendarHomeScreenOptionsProps {
  route: RouteProp<EventsStackParamList, 'CalendarHome'>;
  navigation: StackNavigationProp<EventsStackParamList, 'CalendarHome'>;
}

const EventsStackNavigator = () => {
  // Get theme colors
  const backgroundColor = useBackgroundColor('primary');
  const textColor = useTextColor('primary');
  const primaryColor = Colors.palette.dynastyGreen.dark;

  return (
    <Stack.Navigator 
      initialRouteName="CalendarHome"
      screenOptions={{
        headerStyle: {
          backgroundColor: backgroundColor,
        },
        headerTintColor: primaryColor,
        headerTitleStyle: {
          color: textColor,
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