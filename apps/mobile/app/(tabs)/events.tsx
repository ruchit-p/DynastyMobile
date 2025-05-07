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
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// Define Event interface for type safety
interface Event {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  // Add other potential properties if any
}

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
  const [isMenuVisible, setIsMenuVisible] = useState(false); // State for menu visibility
  const segments = ['Upcoming', 'Past Events', 'My Events'];
  const router = useRouter();

  const getEventsForSegment = (): Event[] => {
    let eventsToFilter: Event[] = []; 
    // Placeholder for actual data fetching logic
    // For now, return an empty array or some mock data based on segment
    if (currentSegment === 0) { // Upcoming
        // eventsToFilter = [{id: '1', name: 'Upcoming Event 1', date: 'Tomorrow', time: '2 PM', location: 'Online'}];
    } else if (currentSegment === 1) { // Past
        // eventsToFilter = [{id: '2', name: 'Past Event A', date: 'Last Week', time: '6 PM', location: 'Community Hall'}];
    }
    // Return empty array if no specific mock data for the segment
    // return []; 
    if (searchText) {
        const lowerSearchText = searchText.toLowerCase();
        return eventsToFilter.filter((event: Event) => 
            event.name.toLowerCase().includes(lowerSearchText) || 
            (event.location && event.location.toLowerCase().includes(lowerSearchText))
        );
    }
    return eventsToFilter;
  };

  const displayedEvents = getEventsForSegment();

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
            // TODO: Create EventCard component based on future designs
            <View key={event.id} style={styles.eventItem}>
              <Text style={styles.eventName}>{event.name}</Text>
              <Text style={styles.eventDetail}>{event.date} at {event.time}</Text>
              <Text style={styles.eventDetail}>{event.location}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {isMenuVisible && (
        <View style={styles.fabMenu}>
          <TouchableOpacity 
            style={styles.fabMenuItem} 
            onPress={() => { 
              setIsMenuVisible(false); 
              router.push('/(screens)/createEvent');
            }}
          >
            <Ionicons name="add-circle-outline" size={22} color="#1A4B44" style={styles.fabMenuItemIcon} />
            <Text style={styles.fabMenuItemText}>Create Event</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setIsMenuVisible(!isMenuVisible)}>
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </TouchableOpacity>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginTop: 0, // Adjust if subHeaderTitle has paddingBottom that creates too much space
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    marginHorizontal: 5,
    backgroundColor: '#EFEFEF', 
  },
  segmentButtonActive: {
    backgroundColor: '#D1E7DD',
  },
  segmentButtonText: {
    fontSize: 14,
    color: '#333',
  },
  segmentButtonTextActive: {
    color: '#1A4B44',
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 10 : 5,
    // borderBottomWidth: 1, // Removing this to make it look more integrated or use a lighter border
    // borderBottomColor: '#E0E0E0',
    marginHorizontal: 15, // Align with pageHeader
    borderRadius: 8,
    marginTop: 15,
    marginBottom: 10, // Added some margin below search
    borderWidth: 1, // Add a subtle border to the search bar itself
    borderColor: '#E0E0E0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: Platform.OS === 'ios' ? 25 : 40, // Adjust height for better iOS feel
    fontSize: 16,
    color: '#333',
  },
  container: {
    flex: 1,
    backgroundColor: '#F4F4F4', // Content scroll area background
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 30,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#555',
    marginTop: 15,
  },
  emptyStateSubText: {
    fontSize: 14,
    color: '#777',
    marginTop: 8,
    textAlign: 'center',
    marginBottom: 20,
  },
  createEventButtonEmptyState: {
    backgroundColor: '#1A4B44', 
    paddingHorizontal: 30, 
    marginTop: 10, 
  },
  eventItem: { 
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 15,
    marginVertical: 8,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1.41,
    elevation: 2,
  },
  eventName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  eventDetail: {
    fontSize: 14,
    color: '#555',
  },
  fab: {
    position: 'absolute',
    bottom: 30, 
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1A4B44', 
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
    zIndex: 10, 
  },
  fabMenu: {
    position: 'absolute',
    bottom: 100, 
    right: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 }, 
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
    minWidth: 150,
    zIndex: 20, 
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  fabMenuItemIcon: {
    marginRight: 10,
  },
  fabMenuItemText: {
    fontSize: 16,
    color: '#1A4B44',
  },
});

export default EventsScreen; 