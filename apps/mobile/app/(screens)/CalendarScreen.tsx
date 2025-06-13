import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, ActivityIndicator, Text } from 'react-native';
import { CalendarProvider, ExpandableCalendar, TimelineList } from 'react-native-calendars';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import moment from 'moment';

// Import error handling components
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

// Import design system components and utilities
import Screen from '../../components/ui/Screen';

// Import Firebase functions
import { getUpcomingEventsMobile } from '../../src/lib/eventUtils';

// Import design tokens
import { Colors } from '../../constants/Colors';
import { useBackgroundColor, useTextColor } from '../../hooks/useThemeColor';

// Import AuthContext
import { useAuth } from '../../src/contexts/AuthContext';
import { logger } from '../../src/services/LoggingService';

// Types
interface Event {
  id: string;
  title: string;
  start: string; // Format: 'YYYY-MM-DD HH:mm:ss'
  end: string; // Format: 'YYYY-MM-DD HH:mm:ss'
  summary?: string;
  color?: string;
  location?: string;
}

const CalendarScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ scrollToToday?: string }>();
  
  // Initialize error handler
  const { handleError, withErrorHandling, clearError } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Calendar Error',
    trackCurrentScreen: true
  });

  const { user } = useAuth(); // Get user from AuthContext

  // Get theme colors
  const backgroundColor = useBackgroundColor('primary');
  const textColor = useTextColor('primary');
  // const iconColor = useIconColor('primary'); // eslint-disable-line @typescript-eslint/no-unused-vars
  const primaryColor = Colors.palette.dynastyGreen.dark;

  // Calendar states
  const [selectedDate, setSelectedDate] = useState<string>(moment().format('YYYY-MM-DD'));
  const [events, setEvents] = useState<{ [date: string]: Event[] }>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Get current date for the today marker
  const today = useMemo(() => moment().format('YYYY-MM-DD'), []);

  // Marked dates for the calendar
  const markedDates = useMemo(() => {
    const result: any = {};
    
    // Mark today's date
    result[today] = {
      marked: true,
      dotColor: primaryColor
    };
    
    // Mark the selected date
    if (selectedDate !== today) {
      result[selectedDate] = {
        selected: true,
        selectedColor: primaryColor
      };
    } else {
      // If selected date is today, merge the properties
      result[today] = {
        ...result[today],
        selected: true,
        selectedColor: primaryColor
      };
    }
    
    // Mark dates with events
    Object.keys(events).forEach(date => {
      if (events[date] && events[date].length > 0) {
        if (result[date]) {
          result[date] = {
            ...result[date],
            marked: true,
            dotColor: result[date].dotColor || primaryColor
          };
        } else {
          result[date] = {
            marked: true,
            dotColor: primaryColor
          };
        }
      }
    });
    
    return result;
  }, [today, selectedDate, events, primaryColor]);

  // Reset error state when component mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  // Handle scrollToToday param from navigation
  useEffect(() => {
    try {
      if (params.scrollToToday) {
        setSelectedDate(moment().format('YYYY-MM-DD'));
        logger.debug('Navigating to today from params');
      }
    } catch (error) {
      handleError(error, {
        action: 'handleScrollToToday',
        params
      });
    }
  }, [params.scrollToToday, params, handleError]);

  // Fetch events from Firebase
  const fetchEvents = useCallback(() => withErrorHandling(async () => {
    try {
      setIsLoading(true);
      
      // Use the existing event utility to fetch events
      const result = await getUpcomingEventsMobile(100); // Fetch up to 100 events
      
      // Format events for Timeline component
      const formattedEvents: { [date: string]: Event[] } = {};
      
      result.events.forEach(eventDetails => {
        // Create event start date
        const startDate = moment(eventDetails.eventDate);
        if (eventDetails.startTime) {
          const [hours, minutes] = eventDetails.startTime.split(':');
          startDate.hours(parseInt(hours, 10)).minutes(parseInt(minutes, 10));
        } else {
          startDate.hours(0).minutes(0);
        }
        
        // Create event end date
        const endDate = eventDetails.endDate 
          ? moment(eventDetails.endDate) 
          : moment(eventDetails.eventDate);
        
        if (eventDetails.endTime) {
          const [hours, minutes] = eventDetails.endTime.split(':');
          endDate.hours(parseInt(hours, 10)).minutes(parseInt(minutes, 10));
        } else if (eventDetails.startTime) {
          // If no end time but has start time, set end time to start time + 1 hour
          const [hours, minutes] = eventDetails.startTime.split(':');
          endDate.hours(parseInt(hours, 10) + 1).minutes(parseInt(minutes, 10));
        } else {
          // If no specific times, make it all day
          endDate.hours(23).minutes(59);
        }
        
        // Format event for Timeline component
        const formattedEvent: Event = {
          id: eventDetails.id,
          title: eventDetails.title || 'Untitled Event',
          start: startDate.format('YYYY-MM-DD HH:mm:ss'),
          end: endDate.format('YYYY-MM-DD HH:mm:ss'),
          summary: eventDetails.description,
          color: eventDetails.userStatus === 'accepted' ? '#1A4B44' : '#4285F4', // Use Dynasty green for accepted events
          location: eventDetails.isVirtual ? 
            (eventDetails.virtualLink || 'Virtual Event') : 
            (eventDetails.location?.address || '')
        };
        
        // Group events by date
        const dateKey = startDate.format('YYYY-MM-DD');
        if (!formattedEvents[dateKey]) {
          formattedEvents[dateKey] = [];
        }
        
        formattedEvents[dateKey].push(formattedEvent);
      });
      
      setEvents(formattedEvents);
    } catch (error) {
      logger.error("Error fetching events: ", error);
      handleError(error, { action: 'fetchEvents' });
    } finally {
      setIsLoading(false);
    }
  })(), [handleError, withErrorHandling]);

  // Initial fetch on component mount
  useEffect(() => {
    if (user) { // Only fetch events if user is authenticated
      fetchEvents();
    } else {
      // Clear events if user is not authenticated (e.g., after sign-out)
      setEvents({});
      setIsLoading(false); // Ensure loading state is reset
    }
  }, [fetchEvents, user]); // Add user to dependency array

  // Handle date change
  const onDateChanged = (date: string) => {
    try {
      logger.debug('Date changed:', date);
      setSelectedDate(date);
    } catch (error) {
      handleError(error, {
        action: 'onDateChanged',
        date
      });
    }
  };

  // Handle event press
  const handleEventPress = withErrorHandling((event: Event) => {
    try {
      logger.debug('Event pressed:', event);
      router.push({ 
        pathname: '/(screens)/eventDetail', 
        params: { eventId: event.id } 
      });
    } catch (error) {
      handleError(error, {
        action: 'handleEventPress',
        eventId: event.id
      });
    }
  });

  // Handle adding new event
  const handleAddEvent = withErrorHandling((timeString: string, date: string) => {
    try {
      // Extract hours and minutes from timeString (format: "2023-11-15 09:00:00")
      const time = timeString.split(' ')[1];
      const [hours, minutes] = time.split(':');
      
      // Format for the create event screen
      const startTimeStr = `${hours}:${minutes}`;
      const endTimeStr = `${parseInt(hours) + 1}:${minutes}`; // Default to 1 hour duration
      
      // Navigate to create event screen with prefilled date and time
      router.push({
        pathname: '/(screens)/createEvent',
        params: {
          prefillDate: date,
          prefillStartTime: startTimeStr,
          prefillEndTime: endTimeStr
        }
      });
    } catch (error) {
      handleError(error, {
        action: 'handleAddEvent',
        time: timeString,
        date
      });
    }
  });

  // Timeline custom theme
  const theme = {
    backgroundColor: backgroundColor,
    calendarBackground: backgroundColor,
    textSectionTitleColor: '#687076',
    selectedDayBackgroundColor: primaryColor,
    selectedDayTextColor: '#FFFFFF',
    todayTextColor: primaryColor,
    dayTextColor: textColor,
    textDisabledColor: Colors.palette.neutral.light,
    dotColor: primaryColor,
    selectedDotColor: '#FFFFFF',
    arrowColor: primaryColor,
    disabledArrowColor: '#d9e1e8',
    monthTextColor: primaryColor,
    indicatorColor: primaryColor,
    textDayFontSize: 16,
    textMonthFontSize: 18,
    textDayHeaderFontSize: 14,
    textMonthFontWeight: '700',
    textDayHeaderFontWeight: '600',
    // Timeline specific theme
    timelineBackground: backgroundColor,
    timelineHoursTextColor: textColor,
  };

  // Render the event in timeline
  const renderEvent = (event: Event) => {
    return (
      <TouchableOpacity 
        style={[styles.eventCard, { backgroundColor: event.color || primaryColor }]}
        onPress={() => handleEventPress(event)}
      >
        <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
        {event.summary && (
          <Text style={styles.eventSummary} numberOfLines={2}>{event.summary}</Text>
        )}
        {event.location && (
          <View style={styles.locationContainer}>
            <Ionicons name="location-outline" size={12} color="white" style={styles.locationIcon} />
            <Text style={styles.locationText} numberOfLines={1}>{event.location}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Get today's date as a string
  const currentDate = moment().format('YYYY-MM-DD');

  if (isLoading) {
    return (
      <ErrorBoundary screenName="CalendarScreen">
        <Screen safeArea padding={false} scroll={false} style={styles.screen}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={primaryColor} />
            <Text style={[styles.loadingText, { color: textColor }]}>Loading events...</Text>
          </View>
        </Screen>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="CalendarScreen">
      <Screen safeArea padding={false} scroll={false} style={styles.screen}>
        <View style={styles.container}>
          <CalendarProvider
            date={selectedDate}
            onDateChanged={onDateChanged}
            showTodayButton
            disabledOpacity={0.6}
            theme={{
              todayButtonTextColor: primaryColor,
              todayButtonPosition: 'right',
            }}
          >
            <ExpandableCalendar
              firstDay={1}
              markedDates={markedDates}
              theme={theme}
              onDayPress={(day) => {
                onDateChanged(day.dateString);
              }}
            />
            
            <TimelineList
              events={events}
              date={selectedDate}
              format24h={false}
              scrollToFirst
              showNowIndicator
              onEventPress={handleEventPress}
              renderEvent={renderEvent}
              onBackgroundLongPress={(timeString, timeObject) => {
                // Convert to a format suitable for handleAddEvent
                handleAddEvent(timeString, timeObject.date);
              }}
              theme={{
                ...theme,
                // Timeline specific
                timeTextColor: textColor,
                unavailableBackgroundColor: 'rgba(0,0,0,0.03)',
                nowIndicatorColor: '#FF3B30',
              }}
              // Allow customizing time range
              start={7} // Start at 7 AM
              end={22}  // End at 10 PM
              // Other timeline props
              scrollToNow
              unavailableHours={[
                { start: 0, end: 7 },   // 12am to 7am
                { start: 22, end: 24 }, // 10pm to 12am
              ]}
              unavailableHoursColor="rgba(0, 0, 0, 0.05)"
            />
          </CalendarProvider>
        </View>
      </Screen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  eventCard: {
    padding: 8,
    borderRadius: 4,
    flex: 1,
  },
  eventTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
  },
  eventSummary: {
    color: 'white',
    fontSize: 12,
    opacity: 0.9,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  locationIcon: {
    marginRight: 4,
  },
  locationText: {
    color: 'white',
    fontSize: 12,
    opacity: 0.9,
  },
});

export default CalendarScreen;