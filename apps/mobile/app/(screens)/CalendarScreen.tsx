import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Platform } from 'react-native';
import { CalendarList, DateData } from 'react-native-calendars';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Import design system components and utilities
import Screen from '../../components/ui/Screen';
import ThemedText from '../../components/ThemedText';
import IconButton from '../../components/ui/IconButton';
import Button from '../../components/ui/Button';
import DayScheduleView from '../../components/ui/DayScheduleView';

// Import design tokens
import { Colors } from '../../constants/Colors';
import { useBackgroundColor, useTextColor, useIconColor } from '../../hooks/useThemeColor';
import { Spacing } from '../../constants/Spacing';

// Types
interface Event {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  isAllDay?: boolean;
  location?: string;
}

const CalendarScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ scrollToToday?: string }>();

  // Get theme colors
  const backgroundColor = useBackgroundColor('primary');
  const textColor = useTextColor('primary');
  const iconColor = useIconColor('primary');
  const primaryColor = Colors.palette.dynastyGreen.dark;

  // Selected date and view state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isMonthView, setIsMonthView] = useState(true);

  // Sample events data (would come from your Firebase in real app)
  const [events, setEvents] = useState<Event[]>([
    {
      id: '1',
      title: 'Family Dinner',
      startTime: new Date(new Date().setHours(18, 0, 0, 0)),
      endTime: new Date(new Date().setHours(20, 0, 0, 0)),
      location: 'Joe\'s Place'
    }
  ]);

  // Reference to the calendar
  const calendarRef = React.useRef(null);

  // Get today's date in format YYYY-MM-DD
  const today = useMemo(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }, []);

  // Format selected date for Calendar component
  const formattedSelectedDate = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  // Create marked dates object with both today and selected day highlighted
  const markedDates = useMemo(() => {
    const result: any = {
      [today]: {
        selected: true,
        selectedColor: primaryColor,
        marked: true,
        dotColor: 'white'
      }
    };

    // If selected date is different from today, mark it too
    if (formattedSelectedDate !== today) {
      result[formattedSelectedDate] = {
        selected: true,
        selectedColor: primaryColor
      };
    }

    return result;
  }, [today, formattedSelectedDate, primaryColor]);

  // Handle scrollToToday param from navigation
  useEffect(() => {
    if (params.scrollToToday) {
      setSelectedDate(new Date());
      console.log('Navigating to today from params');
    }
  }, [params.scrollToToday]);

  const handleDayPress = (day: DateData) => {
    console.log('selected day', day);
    // Create Date object from selected day
    const selectedDate = new Date(day.year, day.month - 1, day.day);
    setSelectedDate(selectedDate);
    setIsMonthView(false);
  };

  const handleBackToCalendar = () => {
    setIsMonthView(true);
  };

  const handleAddEvent = (time: string) => {
    console.log('Add event at', time);

    // Convert time string to hours and minutes
    let hours = 0;
    let minutes = 0;

    if (time === 'Noon') {
      hours = 12;
    } else {
      // Parse times like "1 PM", "3 AM", etc.
      const parts = time.split(' ');
      hours = parseInt(parts[0], 10);

      if (parts[1] === 'PM' && hours !== 12) {
        hours += 12;
      }
      if (parts[1] === 'AM' && hours === 12) {
        hours = 0;
      }
    }

    // Set event time on selected date
    const eventDate = new Date(selectedDate);
    eventDate.setHours(hours, 0, 0, 0);

    // Calculate end time (1 hour later)
    const endTime = new Date(eventDate);
    endTime.setHours(hours + 1);

    // Format times for navigation params
    const startTimeStr = `${hours.toString().padStart(2, '0')}:00`;
    const endTimeStr = `${(hours + 1).toString().padStart(2, '0')}:00`;

    // Navigate to create event screen with prefilled date and time
    router.push({
      pathname: '/(screens)/createEvent',
      params: {
        prefillDate: eventDate.toISOString(),
        prefillStartTime: startTimeStr,
        prefillEndTime: endTimeStr
      }
    });
  };

  return (
    <Screen
      safeArea={true}
      padding={false}
      scroll={false}
      style={styles.screen}
    >
      <View style={styles.container}>
        {isMonthView ? (
          <CalendarList
            ref={calendarRef}
            theme={{
              backgroundColor: backgroundColor,
              calendarBackground: backgroundColor,
              textSectionTitleColor: '#687076', // Darker color for day titles (Mon, Tue, etc)
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
              textMonthFontSize: 18, // Increased size for month/year
              textDayHeaderFontSize: 14,
              textMonthFontWeight: '700', // Bolder month/year
              textDayHeaderFontWeight: '600' // Semi-bold day headers
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
        ) : (
          <DayScheduleView
            date={selectedDate}
            events={events}
            onAddEvent={handleAddEvent}
            onBackPress={handleBackToCalendar}
          />
        )}
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