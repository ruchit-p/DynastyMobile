import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, Platform } from 'react-native';
import { CalendarList, DateData } from 'react-native-calendars';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Import design system components and utilities
import Screen from '../../components/ui/Screen';
import ThemedText from '../../components/ThemedText';
import IconButton from '../../components/ui/IconButton';
import Button from '../../components/ui/Button';

// Import design tokens
import { Colors } from '../../constants/Colors';
import { useBackgroundColor, useTextColor, useIconColor } from '../../hooks/useThemeColor';
import { Spacing } from '../../constants/Spacing';

const CalendarScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ scrollToToday?: string }>();

  // Get theme colors
  const backgroundColor = useBackgroundColor('primary');
  const textColor = useTextColor('primary');
  const iconColor = useIconColor('primary');
  const primaryColor = Colors.palette.dynastyGreen.dark;

  // Reference to the calendar
  const calendarRef = React.useRef(null);

  // Get today's date in format YYYY-MM-DD
  const today = useMemo(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }, []);

  // Create marked dates object with today highlighted with a green circle
  const markedDates = useMemo(() => {
    return {
      [today]: {
        selected: true,
        selectedColor: primaryColor,
        marked: true,
        dotColor: 'white'
      }
    };
  }, [today, primaryColor]);

  // Handle scrollToToday param from navigation
  useEffect(() => {
    if (params.scrollToToday) {
      // Logic to scroll to today would go here
      console.log('Navigating to today from params');
    }
  }, [params.scrollToToday]);

  const handleDayPress = (day: DateData) => {
    console.log('selected day', day);
    // TODO: Implement logic for when a day is pressed
  };

  return (
    <Screen
      safeArea={true}
      padding={false}
      scroll={false}
      style={styles.screen}
    >
      <View style={styles.container}>
        <CalendarList
          ref={calendarRef}
          theme={{
            backgroundColor: backgroundColor,
            calendarBackground: backgroundColor,
            textSectionTitleColor: '#b6c1cd',
            selectedDayBackgroundColor: primaryColor,
            selectedDayTextColor: '#FFFFFF',
            todayTextColor: '#FFFFFF', // Changed to white so it's visible on the green circle
            dayTextColor: textColor,
            textDisabledColor: Colors.palette.neutral.light,
            dotColor: primaryColor,
            selectedDotColor: '#FFFFFF',
            arrowColor: primaryColor,
            disabledArrowColor: '#d9e1e8',
            monthTextColor: primaryColor,
            indicatorColor: primaryColor,
            textDayFontSize: 16,
            textMonthFontSize: 16,
            textDayHeaderFontSize: 14,
          }}
          markedDates={markedDates}
          pastScrollRange={12}
          futureScrollRange={24}
          scrollEnabled={true}
          showScrollIndicator={false}
          horizontal={false}
          pagingEnabled={false}
          onVisibleMonthsChange={(months) => {console.log('now these months are visible', months);}}
          onDayPress={handleDayPress}
          style={styles.calendarList}
        />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayButton: {
    marginRight: Spacing.xs,
  },
  listButton: {
    marginLeft: Spacing.xs,
  },
  calendarList: {
    // Styles for CalendarList itself, if needed
  },
});

export default CalendarScreen;