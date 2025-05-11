import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// Import design system components and utilities
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { useBackgroundColor, useTextColor } from '../../hooks/useThemeColor';
import ThemedText from '../ThemedText';

// The time slots to show in the day view
const TIME_SLOTS = [
  '12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', '6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM',
  'Noon', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM'
];

interface Event {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  isAllDay?: boolean;
  location?: string;
}

interface TimeSlotProps {
  time: string;
  events?: Event[];
  onPress: (time: string) => void;
  onLongPress: (time: string) => void;
}

interface DayScheduleViewProps {
  date: Date;
  events?: Event[];
  onAddEvent: (time: string) => void;
  onEventPress?: (event: Event) => void;
  onBackPress: () => void;
}

const TimeSlot: React.FC<TimeSlotProps> = ({ time, events = [], onPress, onLongPress }) => {
  const primaryColor = Colors.palette.dynastyGreen.dark;
  const textColor = useTextColor('primary');
  const secondaryTextColor = useTextColor('secondary');
  const [isPressed, setIsPressed] = useState(false);

  const handlePress = () => {
    onPress(time);
  };

  const handleLongPress = () => {
    onLongPress(time);
  };

  return (
    <View style={styles.timeSlotContainer}>
      <View style={styles.timeColumn}>
        <Text style={[styles.timeText, { color: secondaryTextColor }]}>{time}</Text>
      </View>
      <TouchableOpacity
        style={[
          styles.slotColumn,
          isPressed && styles.slotColumnActive
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={300}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setTimeout(() => setIsPressed(false), 150)}
        activeOpacity={0.7}
      >
        <View style={styles.slotLine} />

        {/* Active feedback when pressed */}
        {isPressed && (
          <View style={styles.pressedSlotHighlight} />
        )}

        {events.map((event, index) => (
          <View key={event.id} style={[styles.eventCard, { backgroundColor: primaryColor }]}>
            <ThemedText variant="bodySmall" color="inverse" style={styles.eventTitle}>
              {event.title}
            </ThemedText>
            {event.location && (
              <View style={styles.eventLocationContainer}>
                <Ionicons name="location-outline" size={12} color="white" style={{ marginRight: 2 }} />
                <ThemedText variant="caption" color="inverse" style={styles.eventLocation}>
                  {event.location}
                </ThemedText>
              </View>
            )}
          </View>
        ))}
      </TouchableOpacity>
    </View>
  );
};

const DayScheduleView: React.FC<DayScheduleViewProps> = ({
  date,
  events = [],
  onAddEvent,
  onEventPress,
  onBackPress
}) => {
  const backgroundColor = useBackgroundColor('primary');
  const primaryColor = Colors.palette.dynastyGreen.dark;
  const textColor = useTextColor('primary');
  const router = useRouter();

  // Format the date for display (e.g., "Saturday, May 10, 2025")
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Get the current time for the red line
  const currentTime = new Date();
  const isToday = date.getDate() === currentTime.getDate() &&
                  date.getMonth() === currentTime.getMonth() &&
                  date.getFullYear() === currentTime.getFullYear();

  // Calculate position for the current time line (percentage of the day)
  const getCurrentTimePosition = () => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    return (totalMinutes / (24 * 60)) * 100;
  };

  const handleTimeSlotPress = (time: string) => {
    // Handle normal press, maybe show events at this time
    console.log(`Pressed time slot: ${time}`);
  };

  const handleTimeSlotLongPress = (time: string) => {
    // Handle long press to create event
    console.log(`Long pressed time slot: ${time}`);
    onAddEvent(time);
  };

  // Convert time string to hours for creating event
  const timeToHours = (timeStr: string): number => {
    if (timeStr === 'Noon') return 12;

    const parts = timeStr.split(' ');
    let hours = parseInt(parts[0], 10);

    if (parts[1] === 'PM' && hours !== 12) {
      hours += 12;
    }
    if (parts[1] === 'AM' && hours === 12) {
      hours = 0;
    }

    return hours;
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Updated header layout to match the second screenshot */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={onBackPress}>
            <Ionicons name="chevron-back" size={24} color={primaryColor} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: primaryColor }]}>Calendar</Text>
        </View>

        {/* Only includes the add button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            // Create a new event at the current time
            const now = new Date();
            const hours = now.getHours();
            const timeIndex = hours === 12 ? 12 : hours % 12;
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const timeStr = hours === 12 ? 'Noon' : `${timeIndex} ${ampm}`;
            onAddEvent(timeStr);
          }}
        >
          <Ionicons name="add" size={22} color={primaryColor} />
        </TouchableOpacity>
      </View>

      <View style={styles.dateContainer}>
        <Text style={[styles.dateText, { color: textColor }]}>
          {formatDate(date)}
        </Text>
      </View>

      <ScrollView style={styles.timelineContainer}>
        {TIME_SLOTS.map((time, index) => {
          // Find events that happen at this time
          const timeSlotEvents = events.filter(event => {
            const eventHour = event.startTime.getHours();
            const slotHour = timeToHours(time);
            return eventHour === slotHour;
          });

          return (
            <TimeSlot
              key={time}
              time={time}
              events={timeSlotEvents}
              onPress={handleTimeSlotPress}
              onLongPress={handleTimeSlotLongPress}
            />
          );
        })}

        {/* Current time indicator */}
        {isToday && (
          <View
            style={[
              styles.currentTimeIndicator,
              {
                top: `${getCurrentTimePosition()}%`,
                backgroundColor: '#FF3B30'
              }
            ]}
          >
            <View style={styles.currentTimeDot} />
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 4,
    marginRight: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  addButton: {
    padding: Spacing.xs,
  },
  dateContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  dateText: {
    fontSize: 18,
    fontWeight: '600',
  },
  timelineContainer: {
    flex: 1,
  },
  timeSlotContainer: {
    flexDirection: 'row',
    height: 60,
  },
  timeColumn: {
    width: 60,
    paddingRight: Spacing.xs,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  timeText: {
    fontSize: 13,
  },
  slotColumn: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: '#E0E0E0',
    paddingLeft: Spacing.xs,
    position: 'relative',
  },
  slotColumnActive: {
    borderLeftWidth: 2,
    borderLeftColor: '#999999',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  slotLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  pressedSlotHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: '#999999',
    borderRadius: 4,
    margin: 2,
  },
  eventCard: {
    position: 'absolute',
    left: Spacing.sm,
    right: Spacing.xs,
    padding: Spacing.xs,
    borderRadius: BorderRadius.sm,
    height: 50,
    marginTop: 5,
  },
  eventTitle: {
    fontWeight: '600',
  },
  eventLocationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  eventLocation: {
    fontSize: 11,
  },
  currentTimeIndicator: {
    position: 'absolute',
    left: 60,
    right: 0,
    height: 1,
    zIndex: 10,
  },
  currentTimeDot: {
    position: 'absolute',
    left: -4,
    top: -3.5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
});

export default DayScheduleView;