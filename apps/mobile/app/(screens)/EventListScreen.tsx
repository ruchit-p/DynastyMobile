import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Platform,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu'; // Corrected path
import AppHeader from '../../components/ui/AppHeader'; // Corrected path
import IconButton, { IconSet } from '../../components/ui/IconButton'; // Import IconButton
import { SafeAreaView } from 'react-native-safe-area-context';

// Define Event interface for type safety
interface Event {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  location: string;
  imageUrl?: string;
  organizer?: string;
  status?: 'Going' | 'Invited' | null;
  description?: string;
  createdBy?: string;
}

// --- EventCard Component ---
interface EventCardProps {
  event: Event;
  onPress: () => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, onPress }) => {
  const formatEventDateTime = (date: Date) => {
    const dateString = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeString = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dateString}, ${timeString}`;
  };

  return (
    <TouchableOpacity style={styles.eventCard} onPress={onPress}>
      <Image
        source={{ uri: event.imageUrl || 'https://placekitten.com/300/200' }}
        style={styles.eventImage}
      />
      {event.status && (
        <View style={[
            styles.statusBadge,
            event.status === 'Going' ? styles.statusGoing : styles.statusInvited,
        ]}>
          <Text style={styles.statusText}>{event.status}</Text>
        </View>
      )}
      <View style={styles.eventInfoContainer}>
        {event.organizer && <Text style={styles.eventOrganizerText}>{event.organizer}</Text>}
        <Text style={styles.eventNameText} numberOfLines={2} ellipsizeMode="tail">{event.name}</Text>
        <View style={styles.eventDetailRow}>
          <Ionicons name="time-outline" size={16} color={styles.eventDetailIcon.color} />
          <Text style={styles.eventDetailText}>{formatEventDateTime(event.startDate)}</Text>
        </View>
        <View style={styles.eventDetailRow}>
          <Ionicons name="location-outline" size={16} color={styles.eventDetailIcon.color} />
          <Text style={styles.eventDetailText}>{event.location}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};
// --- End EventCard Component ---

interface SegmentedControlProps {
  segments: string[];
  currentIndex: number;
  onChange: (index: number) => void;
}

const SegmentedControl: React.FC<SegmentedControlProps> = ({ segments, currentIndex, onChange }) => {
  return (
    <View style={styles.segmentedControlContainer}>
      {segments.map((segment: string, index: number) => (
        <TouchableOpacity
          key={segment}
          style={[
            styles.segmentButton,
            currentIndex === index && styles.segmentButtonActive,
          ]}
          onPress={() => onChange(index)}
        >
          <Text
            style={[
              styles.segmentButtonText,
              currentIndex === index && styles.segmentButtonTextActive,
            ]}
          >
            {segment}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const EventListScreen = () => { // Renamed from EventsScreen
  const [currentSegment, setCurrentSegment] = useState(0);
  const [searchText, setSearchText] = useState('');
  const segments = ['Upcoming', 'Past Events', 'My Events'];
  const router = useRouter();

  // --- Back Action Component ---
  const BackAction = () => (
    <IconButton
      iconSet={IconSet.Ionicons}
      iconName={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
      size={28}
      color={"#1A4B44"} // Using the primary color defined in _layout.tsx
      onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)/events')} // Navigate to calendar tab if no history
      accessibilityLabel="Go back"
      style={{ marginLeft: -5 }} // Adjust as needed for alignment
    />
  );

  const mockEventsData: Event[] = []; // Using mock data as in original
  const [allEvents, setAllEvents] = useState<Event[]>(mockEventsData);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(true);

  const eventMenuItems: FabMenuItemAction[] = [
    {
      id: 'createEvent',
      text: 'Create Event',
      iconName: 'calendar-plus',
      iconLibrary: 'MaterialCommunityIcons',
      onPress: () => router.push('/(screens)/createEvent'), // Path remains same if createEvent is in (screens)
    },
  ];

  useFocusEffect(
    React.useCallback(() => {
      setIsLoadingEvents(false); // Using mock data
    }, [])
  );

  const getEventsForSegment = (): Event[] => {
    const now = new Date();
    let eventsToFilter: Event[] = [];

    if (currentSegment === 0) { // Upcoming
      eventsToFilter = allEvents
        .filter(event => event.endDate && event.endDate >= now)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    } else if (currentSegment === 1) { // Past
      eventsToFilter = allEvents
        .filter(event => event.endDate && event.endDate < now)
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
    } else if (currentSegment === 2) { // My Events
      const mockCurrentUserId = 'user123';
      eventsToFilter = allEvents
        .filter(event => event.createdBy === mockCurrentUserId)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    }

    if (searchText) {
      const lowerSearchText = searchText.toLowerCase();
      return eventsToFilter.filter((event: Event) =>
        event.name.toLowerCase().includes(lowerSearchText) ||
        (event.location && event.location.toLowerCase().includes(lowerSearchText)) ||
        (event.organizer && event.organizer.toLowerCase().includes(lowerSearchText))
      );
    }
    return eventsToFilter;
  };

  const displayedEvents = getEventsForSegment();

  if (isLoadingEvents) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[ 'left', 'right', 'bottom' ]}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppHeader title="Events" headerLeft={BackAction} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0A5C36" />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[ 'left', 'right', 'bottom' ]}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title="Events" headerLeft={BackAction} />
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search events..."
          placeholderTextColor="#888"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      <SegmentedControl
        segments={segments}
        currentIndex={currentSegment}
        onChange={setCurrentSegment}
      />

      <ScrollView style={styles.container}>
        {displayedEvents.length === 0 ? (
          <View style={styles.noEventsContainer}>
            <MaterialCommunityIcons name="calendar-remove-outline" size={70} color="#D0D0D0" />
            <Text style={styles.noEventsText}>No events found</Text>
            <Text style={styles.noEventsSubText}>
              {currentSegment === 0 && "You don't have any upcoming events."}
              {currentSegment === 1 && "There are no past events to show."}
              {currentSegment === 2 && "You haven't created or been added to any events yet."}
            </Text>
          </View>
        ) : (
          displayedEvents.map((event: Event) => (
            <EventCard
              key={event.id}
              event={event}
              onPress={() => router.push({ pathname: '/(screens)/eventDetail', params: { eventId: event.id } })}
            />
          ))
        )}
      </ScrollView>

      <FloatingActionMenu menuItems={eventMenuItems} fabIconName="plus" fabIconLibrary="MaterialCommunityIcons" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
  loadingContainer: { // Added for completeness from typical structure
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { // Added for completeness
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
  subHeaderTitle: {
    fontSize: 14,
    color: '#555',
    paddingHorizontal: 15,
    paddingBottom: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  segmentedControlContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#DCDCDC',
    marginTop: 0,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginHorizontal: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCDCDC',
  },
  segmentButtonActive: {
    backgroundColor: '#1A4B44',
    borderColor: '#1A4B44',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  segmentButtonText: {
    fontSize: 14,
    color: '#333333',
  },
  segmentButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    marginHorizontal: 15,
    borderRadius: 10,
    marginTop: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchIcon: {
    marginRight: 10,
    color: '#888888',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333333',
  },
  container: {
    flex: 1,
  },
  noEventsContainer: { // Combined from emptyStateContainer
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50, // Keep some top margin
  },
  noEventsText: { // Combined from emptyStateText
    fontSize: 20,
    fontWeight: '600',
    color: '#555555',
    marginTop: 20,
  },
  noEventsSubText: { // Combined from emptyStateSubText
    fontSize: 16,
    color: '#777777',
    marginTop: 10,
    textAlign: 'center',
    marginBottom: 25,
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 15,
    marginVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
    overflow: 'hidden',
  },
  eventImage: {
    width: '100%',
    height: 150,
  },
  statusBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 1,
    borderWidth: 0.5,
  },
  statusGoing: {
    backgroundColor: '#1A4B44',
    borderColor: '#1A4B44',
  },
  statusInvited: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  eventInfoContainer: {
    padding: 15,
  },
  eventOrganizerText: {
    fontSize: 13,
    color: '#666666',
    marginBottom: 5,
    fontWeight: '500',
  },
  eventNameText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 10,
    lineHeight: 22,
  },
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventDetailIcon: {
      color: '#888888'
  },
  eventDetailText: {
    fontSize: 14,
    color: '#555555',
    marginLeft: 8,
  },
  // Styles from original EventScreen that might be missing or were part of empty state/loading
  emptyStateContainer: { // Kept if used by noEventsContainer
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyStateIcon: {
      color: '#B0B0B0',
  },
  emptyStateText: { // Kept if used by noEventsText
    fontSize: 20,
    fontWeight: '600',
    color: '#555555',
    marginTop: 20,
  },
  emptyStateSubText: { // Kept if used by noEventsSubText
    fontSize: 16,
    color: '#777777',
    marginTop: 10,
    textAlign: 'center',
    marginBottom: 25,
  },
  createEventButtonEmptyState: { // This might be specific to an empty state not shown above
    backgroundColor: '#1A4B44',
    paddingHorizontal: 30,
    marginTop: 10,
    borderRadius: 25,
    paddingVertical: 15,
  },
});

export default EventListScreen; 