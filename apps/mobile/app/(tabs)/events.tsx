import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  // SafeAreaView, // AppHeader now handles safe area for the top
  Platform,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'; // Added MaterialCommunityIcons back
import { useRouter, useFocusEffect } from 'expo-router';
import AppHeader from '../../components/ui/AppHeader'; // Import the new AppHeader
import { Colors } from '../../constants/Colors'; // Import Colors for styling if needed locally
import useColorScheme from '../../hooks/useColorScheme'; // For local color scheme if needed
// import { auth, db } from '../../src/lib/firebase'; // Commented out Firebase
// import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore'; // Commented out Firebase
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu'; // MARK: - Import

// Define Event interface for type safety
interface Event {
  id: string;
  name: string;
  // Store dates as JS Date objects after fetching, or Timestamps and convert for display
  startDate: Date; 
  endDate: Date;
  location: string;
  imageUrl?: string; // For the event image from Firebase Storage
  organizer?: string; // Could be a user ID or name
  status?: 'Going' | 'Invited' | null; // This might be user-specific, not part of core event data
  description?: string;
  createdBy?: string; // User ID of the creator
  // Add other Firestore fields: createdAt, updatedAt if needed for display/logic
}

// --- New EventCard Component ---
interface EventCardProps {
  event: Event;
  onPress: () => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, onPress }) => {
  // Helper to format date and time from Date object
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
          {/* Display formatted startDate */}
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

// Segmented Control like component
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

const EventsScreen = () => {
  const [currentSegment, setCurrentSegment] = useState(0);
  const [searchText, setSearchText] = useState('');
  const segments = ['Upcoming', 'Past Events', 'My Events'];
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const currentColors = Colors[colorScheme];

  // const [allEvents, setAllEvents] = useState<Event[]>([]); // Commented out
  // const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(true); // Commented out

  // Initialize with mock data
  const mockEventsData: Event[] = [];
  const [allEvents, setAllEvents] = useState<Event[]>(mockEventsData);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(true); // Set to true initially

  // MARK: - Define Menu Items for Events Screen
  const eventMenuItems: FabMenuItemAction[] = [
    {
      id: 'createStory',
      text: 'Create Story',
      iconName: 'pencil-outline', // MaterialCommunityIcons
      iconLibrary: 'MaterialCommunityIcons',
      onPress: () => router.push('/(screens)/createStory' as any), // Added 'as any' to bypass strict typing for now
    },
    {
      id: 'createEvent',
      text: 'Create Event',
      iconName: 'calendar-plus', // MaterialCommunityIcons
      iconLibrary: 'MaterialCommunityIcons',
      onPress: () => router.push('/(screens)/createEvent' as any), // Added 'as any' to bypass strict typing for now
    },
  ];

  // Fetch events from Firestore
  useFocusEffect(
    React.useCallback(() => {
      // const fetchEvents = async () => { // Firebase fetching logic commented out
        // setIsLoadingEvents(true);
        // try {
        //   const eventsCollectionRef = collection(db, "events");
        //   const q = query(eventsCollectionRef, orderBy("startDate", "asc"));
        //   const querySnapshot = await getDocs(q);
        //   const fetchedEvents: Event[] = [];
        //   querySnapshot.forEach((doc) => {
        //     const data = doc.data();
        //     fetchedEvents.push({
        //       id: doc.id,
        //       ...data,
        //       startDate: (data.startDate as Timestamp)?.toDate(),
        //       endDate: (data.endDate as Timestamp)?.toDate(),
        //     } as Event);
        //   });
        //   setAllEvents(fetchedEvents);
        // } catch (error) {
        //   console.error("Error fetching events: ", error);
        //   Alert.alert("Error", "Could not fetch events.");
        // } finally {
        //   setIsLoadingEvents(false);
        // }
      // }; // Firebase fetching logic commented out
      // fetchEvents(); // Firebase fetching logic commented out
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
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime()); // Sort descending for past
    } else if (currentSegment === 2) { // My Events
      // if (!auth.currentUser) { // Commented out auth check
        // // Optionally show a message to login to see their events
        // return [];
      // }
      // Simulate a logged-in user for "My Events"
      const mockCurrentUserId = 'user123'; // Assume this user is logged in
      eventsToFilter = allEvents
        .filter(event => event.createdBy === mockCurrentUserId)
        // Could further sort by upcoming/past if desired, or just by date
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

  // MARK: - Render
  if (isLoadingEvents) {
    return (
      <View style={[styles.safeArea, { backgroundColor: currentColors.background, flex: 1}]}>
        <AppHeader title="Events" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentColors.primary} />
          <Text style={[styles.loadingText, { color: currentColors.text }]}>Loading events...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: currentColors.background, flex: 1 }]}>
      <AppHeader title="Events" />
      
      <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={currentColors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: currentColors.text, borderColor: currentColors.border }]}
            placeholder="Search events..."
            placeholderTextColor={currentColors.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
          />
      </View>

      <SegmentedControl
        segments={segments}
        currentIndex={currentSegment}
        onChange={setCurrentSegment}
      />

      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.scrollContentContainer}
      >
        {displayedEvents.length > 0 ? (
          displayedEvents.map(event => (
            <EventCard key={event.id} event={event} onPress={() => router.push(`/(screens)/eventDetails/${event.id}` as any)} />
          ))
        ) : (
          <View style={styles.emptyStateContainer}>
            <MaterialCommunityIcons name="calendar-remove-outline" size={60} color={currentColors.textSecondary} />
            <Text style={[styles.emptyStateTitle, { color: currentColors.text }]}>No events found</Text>
            <Text style={[styles.emptyStateSubtitle, { color: currentColors.textSecondary }]}>
              You don't have any {segments[currentSegment].toLowerCase()} events.
            </Text>
            {currentSegment === 0 && (
              <TouchableOpacity 
                style={[styles.createEventButton, { backgroundColor: currentColors.primary }]} 
                onPress={() => router.push('/(screens)/createEvent' as any)}
              >
                <Text style={[styles.createEventButtonText, { color: currentColors.headerBackground }]}>+ Create New Event</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
      <FloatingActionMenu menuItems={eventMenuItems} />
    </View>
  );
};

// MARK: - Styles
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // backgroundColor is now set dynamically
  },
  container: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 80, // Space for FAB
  },
  // Custom pageHeader View styles removed as AppHeader is used
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginVertical: 12,
    // backgroundColor dynamically from theme if needed, or keep default
    borderRadius: 8,
    borderWidth: 1,
    // borderColor: '#E0E0E0', // Use theme border color
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    // color: '#333', // Use theme text color
  },
  segmentedControlContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#EEEEEE', // Consider theming this background
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DDDDDD', // Consider theming
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: Colors.light.dynastyGreen, // Use dynastyGreen directly or from theme
    // No, this should use currentColors.primary or similar
  },
  segmentButtonText: {
    fontSize: 14,
    color: Colors.light.textSecondary, // Use dynastyGreen or similar
  },
  segmentButtonTextActive: {
    color: Colors.light.background, // White text on active green segment
    fontWeight: 'bold',
  },
  eventCard: {
    backgroundColor: 'white', // Consider Colors.light.surface
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  eventImage: {
    width: '100%',
    height: 150,
  },
  statusBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1, // Ensure it's above the image
  },
  statusGoing: {
    backgroundColor: 'rgba(0, 128, 0, 0.7)', // Green with opacity
  },
  statusInvited: {
    backgroundColor: 'rgba(255, 165, 0, 0.7)', // Orange with opacity
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  eventInfoContainer: {
    padding: 12,
  },
  eventOrganizerText: {
    fontSize: 12,
    color: '#757575', // Consider Colors.light.textSecondary
    marginBottom: 4,
  },
  eventNameText: {
    fontSize: 18,
    fontWeight: 'bold',
    // color: '#333', // Consider Colors.light.text
    marginBottom: 8,
  },
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventDetailIcon: {
    // color: '#555', // Consider Colors.light.icon or textSecondary
    // This is just an example, color will be directly applied to Icon component
    color: Colors.light.textSecondary, // Defaulting to a theme color
  },
  eventDetailText: {
    fontSize: 14,
    // color: '#555', // Consider Colors.light.textSecondary
    marginLeft: 8,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50, // Give some space from header/controls
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    // color: '#333',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    // color: '#666',
    marginTop: 8,
    textAlign: 'center',
    marginBottom: 20,
  },
  createEventButton: {
    // backgroundColor: '#0A5C36', // Use theme primary
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
  },
  createEventButtonText: {
    // color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    // color: '#333',
  },
});

export default EventsScreen; 