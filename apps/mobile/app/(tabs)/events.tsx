import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Platform,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
// import { auth, db } from '../../src/lib/firebase'; // Commented out Firebase
// import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore'; // Commented out Firebase

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
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const segments = ['Upcoming', 'Past Events', 'My Events'];
  const router = useRouter();

  // const [allEvents, setAllEvents] = useState<Event[]>([]); // Commented out
  // const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(true); // Commented out

  // Initialize with mock data
  const mockEventsData: Event[] = [
    {
      id: 'event1',
      name: 'Summer Music Festival',
      startDate: new Date(Date.now() + 86400000 * 7), // 7 days from now
      endDate: new Date(Date.now() + 86400000 * 9),   // 9 days from now
      location: 'Central Park, New York',
      imageUrl: 'https://via.placeholder.com/300x200.png/FF6347/FFFFFF?Text=Music+Fest',
      organizer: 'City Events Co.',
      status: 'Invited',
      description: 'Join us for a fantastic weekend of live music and fun activities.',
      createdBy: 'user123', // Example creator
    },
    {
      id: 'event2',
      name: 'Tech Conference 2024',
      startDate: new Date(Date.now() + 86400000 * 30), // 30 days from now
      endDate: new Date(Date.now() + 86400000 * 32),
      location: 'Moscone Center, San Francisco',
      imageUrl: 'https://via.placeholder.com/300x200.png/4682B4/FFFFFF?Text=Tech+Conf',
      organizer: 'Innovatech',
      status: 'Going',
      description: 'The premier conference for technology enthusiasts and professionals.',
      createdBy: 'user456',
    },
    {
      id: 'event3',
      name: 'Family Picnic Day',
      startDate: new Date(Date.now() - 86400000 * 14), // 14 days ago (Past Event)
      endDate: new Date(Date.now() - 86400000 * 14),
      location: 'Greenwood Park',
      imageUrl: 'https://via.placeholder.com/300x200.png/32CD32/FFFFFF?Text=Picnic',
      organizer: 'Community Association',
      description: 'A lovely day out for the whole family with games and food.',
      createdBy: 'user123', // This user's event for "My Events"
    },
    {
        id: 'event4',
        name: 'Art Workshop',
        startDate: new Date(Date.now() + 86400000 * 3), // 3 days from now
        endDate: new Date(Date.now() + 86400000 * 3),
        location: 'Downtown Art Studio',
        imageUrl: 'https://via.placeholder.com/300x200.png/9370DB/FFFFFF?Text=Art+Workshop',
        organizer: 'Creative Minds',
        description: 'Explore your creativity in our hands-on art workshop.',
        createdBy: 'adminUser', // Not created by 'user123'
      },
  ];
  const [allEvents, setAllEvents] = useState<Event[]>(mockEventsData);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(false); // Set to false

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

  if (isLoadingEvents) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0A5C36" />
          <Text style={styles.loadingText}>Loading events...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Custom pageHeader View removed */}
      
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
          <View style={styles.emptyStateContainer}>
            <MaterialIcons name="event-busy" size={60} color="#CCC" />
            <Text style={styles.emptyStateText}>No events found</Text>
            <Text style={styles.emptyStateSubText}>
              You don&apos;t have any {segments[currentSegment].toLowerCase()} events.
            </Text>
            {/* Button to create event in empty state could link to header FAB action or directly to screen */}
             <TouchableOpacity 
                style={[styles.actionButton, styles.createEventButtonEmptyState]}
                onPress={() => router.push('/(screens)/createEvent')}
            >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Create New Event</Text>
            </TouchableOpacity>
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

      {isMenuVisible && (
        <View style={styles.fabMenu}>
          <TouchableOpacity
            style={styles.fabMenuItem}
            onPress={() => {
              setIsMenuVisible(false);
              router.push('/(screens)/createStory'); // Correct navigation
            }}
          >
            <MaterialCommunityIcons name='pencil-outline' size={22} style={styles.fabMenuItemIcon} />
            <Text style={styles.fabMenuItemText}>Create Story</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fabMenuItem}
            onPress={() => {
              setIsMenuVisible(false);
              router.push('/(screens)/createEvent');
            }}
          >
            <MaterialCommunityIcons name='calendar-plus' size={22} style={styles.fabMenuItemIcon} />
            <Text style={styles.fabMenuItemText}>Create Event</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setIsMenuVisible(!isMenuVisible)}>
        <MaterialCommunityIcons name="plus" size={30} color="#FFFFFF" />
      </TouchableOpacity>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0', // Consistent light gray background
  },
  // pageHeader and pageTitle styles removed
  subHeaderTitle: { // This style might be re-evaluated or removed if not needed
    fontSize: 14,
    color: '#555',
    // textAlign: 'center', // Let it align left below the main title, or keep centered if preferred
    paddingHorizontal: 15, // Align with pageHeader horizontal padding
    paddingBottom: 10,      // Space before segmented control
    backgroundColor: '#FFFFFF',
    // borderBottomWidth: 1, // Removing this border, segmented control has its own top border visually
    // borderBottomColor: '#E0E0E0',
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
    backgroundColor: '#F0F0F0', // Match safeArea background or slightly different light shade
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#DCDCDC', // Lighter border
    marginTop: 0, 
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginHorizontal: 5,
    backgroundColor: '#FFFFFF', // White inactive button
    borderWidth: 1, // Add border to inactive buttons for definition
    borderColor: '#DCDCDC',
  },
  segmentButtonActive: {
    backgroundColor: '#1A4B44', // Changed to app theme green
    borderColor: '#1A4B44', // Changed to app theme green
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  segmentButtonText: {
    fontSize: 14,
    color: '#333333', // Dark text for light background
  },
  segmentButtonTextActive: {
    color: '#FFFFFF', // White text for active button
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', // White search bar
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    marginHorizontal: 15, 
    borderRadius: 10,
    marginTop: 15,
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: '#E0E0E0', // Light border for search bar
  },
  searchIcon: {
    marginRight: 10,
    color: '#888888', // Medium gray icon
  },
  searchInput: {
    flex: 1,
    height: Platform.OS === 'ios' ? 28 : 40, 
    fontSize: 16,
    color: '#333333', // Dark text for input
  },
  container: {
    flex: 1,
    // backgroundColor: '#F0F0F0', // Set at safeArea
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyStateIcon: { // Added for consistency if MaterialIcons is used
      color: '#B0B0B0', // Lighter gray for empty state icon
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#555555', // Darker gray text
    marginTop: 20,
  },
  emptyStateSubText: {
    fontSize: 16,
    color: '#777777', // Medium gray subtext
    marginTop: 10,
    textAlign: 'center',
    marginBottom: 25,
  },
  createEventButtonEmptyState: {
    backgroundColor: '#1A4B44', // Changed to app theme green
    paddingHorizontal: 30, 
    marginTop: 10, 
    borderRadius: 25,
    paddingVertical: 15,
  },
  eventCard: {
    backgroundColor: '#FFFFFF', // White card background
    borderRadius: 12,
    marginHorizontal: 15,
    marginVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, // Softer shadow for light theme
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
    // For light theme, badge colors might need more opacity or different shades
    // borderColor: 'rgba(0, 0, 0, 0.1)', // Optional subtle border
  },
  statusGoing: {
    backgroundColor: '#1A4B44', // Changed to app theme green (can revert if needed)
    borderColor: '#1A4B44', // Changed to app theme green
  },
  statusInvited: {
    backgroundColor: '#2196F3', // Kept blue (can be changed)
    borderColor: '#2196F3',
  },
  statusText: {
    color: '#FFFFFF', 
    fontSize: 13,
    fontWeight: 'bold',
  },
  eventInfoContainer: {
    padding: 15,
  },
  eventOrganizerText: {
    fontSize: 13,
    color: '#666666', // Medium gray for secondary text
    marginBottom: 5, 
    fontWeight: '500',
  },
  eventNameText: {
    fontSize: 18, // Slightly smaller to fit cards well
    fontWeight: 'bold',
    color: '#222222', // Very dark gray / black for title
    marginBottom: 10,
    lineHeight: 22,
  },
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventDetailIcon: { 
      color: '#888888' // Medium gray for icons
  },
  eventDetailText: {
    fontSize: 14,
    color: '#555555', // Darker gray for details
    marginLeft: 10,
    flexShrink: 1,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1A4B44', // App theme green
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 4,
    elevation: 0,
    zIndex: 10,
  },
  fabMenu: {
    position: 'absolute',
    bottom: 95, // Adjusted to be closer to FAB
    right: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 12, // More rounded corners
    paddingVertical: 10, // Adjusted padding
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 }, // Adjusted shadow
    shadowOpacity: 0.15, // Adjusted shadow
    shadowRadius: 5, // Adjusted shadow
    elevation: 8, // Adjusted elevation for Android shadow
    minWidth: 200, // Adjusted minWidth to fit content
    zIndex: 20,
    // borderWidth: 1, // Removed border
    // borderColor: '#E0E0E0', // Removed border
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15, // Increased padding for better spacing
    paddingHorizontal: 20, // Adjusted horizontal padding
  },
  fabMenuItemIcon: {
    marginRight: 15, // Slightly increased margin
    color: '#333333', // Neutral dark gray for icon
  },
  fabMenuItemText: {
    fontSize: 16,
    color: '#333333', // Dark text for menu items
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F4F4',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
});

export default EventsScreen; 