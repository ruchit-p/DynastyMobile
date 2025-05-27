import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Platform,
  TouchableOpacity,
  TextInput,
  // Image,
  // Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';
import AppHeader from '../../components/ui/AppHeader';
import IconButton, { IconSet } from '../../components/ui/IconButton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getFirebaseDb } from '../../src/lib/firebase';
import { getUpcomingEventsMobile, formatEventTime } from '../../src/lib/eventUtils';
import MediaGallery, { MediaItem } from '../../components/ui/MediaGallery';
import { showErrorAlert } from '../../src/lib/errorUtils';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { useAuth } from '../../src/contexts/AuthContext';
import { useOffline } from '../../src/contexts/OfflineContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../src/services/LoggingService';

// Define Event interface for type safety
interface Event {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  location: string;
  coverPhotos?: MediaItem[];
  organizer?: string;
  organizerName?: string;
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
    const timeString = formatEventTime(date.getHours() + ':' + date.getMinutes());
    return `${dateString}, ${timeString}`;
  };

  // ADDED: Diagnostic log
  logger.debug(`[EventCard] Rendering for event "${event.name}". Cover photos:`, JSON.stringify(event.coverPhotos, null, 2));

  return (
    <View style={styles.eventCard}>
      {event.coverPhotos && event.coverPhotos.length > 0 && (
        <MediaGallery
          media={event.coverPhotos}
          onAddMedia={() => {}}
          onRemoveMedia={() => {}}
          onReplaceMedia={() => {}}
          showRemoveButton={false}
          showReplaceButton={false}
          allowAddingMore={false}
          style={styles.eventMediaGallery}
        />
      )}
      <TouchableOpacity onPress={onPress}>
        {event.status && (
          <View style={[
              styles.statusBadge,
              event.status === 'Going' ? styles.statusGoing : styles.statusInvited,
          ]}>
            <Text style={styles.statusText}>{event.status}</Text>
          </View>
        )}
        <View style={styles.eventInfoContainer}>
          <Text style={styles.eventNameText} numberOfLines={2} ellipsizeMode="tail">{event.name}</Text>
          {event.organizerName && (
            <View style={styles.eventDetailRow}>
              <Ionicons name="person-outline" size={16} color={styles.eventDetailIcon.color} />
              <Text style={styles.eventDetailText}>Hosted by {event.organizerName}</Text>
            </View>
          )}
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
    </View>
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

const EventListScreen = () => {
  const [currentSegment, setCurrentSegment] = useState(0);
  const [searchText, setSearchText] = useState('');
  const segments = ['Upcoming', 'Past Events', 'My Events'];
  const router = useRouter();
  const db = getFirebaseDb();
  const { user } = useAuth();
  const { isOnline, forceSync } = useOffline();

  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState(false);

  // Initialize error handler
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Event List Error',
    trackCurrentScreen: true
  });

  // Clear local errors when global error state resets
  useEffect(() => {
    if (!isError) {
      // Reset any local error states if needed
    }
  }, [isError]);

  // --- Back Action Component ---
  const BackAction = () => (
    <IconButton
      iconSet={IconSet.Ionicons}
      iconName={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
      size={28}
      color={"#1A4B44"}
      onPress={withErrorHandling(async () => {
        try {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.push('/(tabs)/events');
          }
        } catch (error) {
          handleError(error, { action: 'navigation_back', source: 'EventListScreen' });
        }
      })}
      accessibilityLabel="Go back"
      style={{ marginLeft: -5 }}
    />
  );

  const eventMenuItems: FabMenuItemAction[] = [
    {
      id: 'createEvent',
      text: 'Create Event',
      iconName: 'calendar-plus',
      iconLibrary: 'MaterialCommunityIcons',
      onPress: withErrorHandling(async () => {
        try {
          if (user) {
            router.push('/(screens)/createEvent');
          } else {
            showErrorAlert("Authentication Required", "Please sign in to create an event.");
          }
        } catch (error) {
          handleError(error, { action: 'navigate_create_event', source: 'EventListScreen' });
        }
      }),
    },
  ];

  const fetchEvents = useCallback(() => withErrorHandling(async (forceRefresh = false) => {
    try {
      if (!user?.uid) {
        setAllEvents([]);
        setIsLoadingEvents(false);
        setRefreshing(false);
        return;
      }
      setIsLoadingEvents(true);
      
      // Try to get cached data first if offline or not forcing refresh
      if (!isOnline || !forceRefresh) {
        const cachedEventsData = await AsyncStorage.getItem('cachedEvents');
        if (cachedEventsData) {
          const cached = JSON.parse(cachedEventsData);
          // Check if cache is not too old (e.g., 1 hour)
          const cacheAge = Date.now() - (cached.timestamp || 0);
          if (cacheAge < 3600000 || !isOnline) { // 1 hour or offline
            logger.debug('EventListScreen: Using cached events');
            setAllEvents(cached.events);
            setIsLoadingEvents(false);
            setRefreshing(false);
            
            // If online but using cache, still try to fetch fresh data in background
            if (isOnline && !forceRefresh) {
              getUpcomingEventsMobile(100).then(result => {
                const fetchedEvents = mapEventsToInterface(result.events);
                setAllEvents(fetchedEvents);
                // Update cache
                AsyncStorage.setItem('cachedEvents', JSON.stringify({
                  events: fetchedEvents,
                  timestamp: Date.now()
                }));
              }).catch(error => {
                logger.error('Background fetch failed:', error);
              });
            }
            return;
          }
        }
      }
      
      // If online, fetch fresh data
      if (isOnline) {
        const result = await getUpcomingEventsMobile(100);
        const fetchedEvents = mapEventsToInterface(result.events);
        
        setAllEvents(fetchedEvents);
        
        // Cache the events
        await AsyncStorage.setItem('cachedEvents', JSON.stringify({
          events: fetchedEvents,
          timestamp: Date.now()
        }));
      } else {
        // Offline with no cache
        setAllEvents([]);
      }
    } catch (error) {
      logger.error("Error fetching events: ", error);
      handleError(error, { action: 'fetch_events', source: 'EventListScreen' });
      
      // Try to use cached data on error
      try {
        const cachedEventsData = await AsyncStorage.getItem('cachedEvents');
        if (cachedEventsData) {
          const cached = JSON.parse(cachedEventsData);
          setAllEvents(cached.events);
        } else {
          setAllEvents([]);
        }
      } catch (cacheError) {
        setAllEvents([]);
      }
    } finally {
      setIsLoadingEvents(false);
      setRefreshing(false);
    }
  })(), [user, handleError, isOnline]);
  
  // Helper function to map events
  const mapEventsToInterface = (eventDetails: any[]): Event[] => {
    return eventDetails.map(event => {
      let eventStatus: 'Going' | 'Invited' | null = null;
      if (event.userStatus === 'accepted') {
        eventStatus = 'Going';
      } else if (event.userStatus === 'pending') {
        eventStatus = 'Invited';
      }

      return {
        id: event.id,
        name: event.title || 'Untitled Event',
        startDate: new Date(event.eventDate), 
        endDate: event.endDate ? new Date(event.endDate) : new Date(event.eventDate),
        location: event.isVirtual ? 
          (event.virtualLink || 'Virtual Event') : 
          (event.location?.address || 'No location'),
        coverPhotos: (event.coverPhotoUrls || []).map(url => ({
          uri: url,
          type: (/\.(mp4|mov|avi|mkv|webm)(?:\?|$)/i.test(url.toLowerCase()) ? 'video' : 'image') as 'video' | 'image',
        })),
        organizer: event.hostId,
        organizerName: event.host?.name || 'Unknown Host',
        description: event.description || '',
        createdBy: event.hostId,
        status: eventStatus
      };
    });
  };

  useFocusEffect(
    useCallback(() => {
      const loadEventsOnFocus = withErrorHandling(async () => {
        if (user?.uid) {
          await fetchEvents();
        } else {
          setAllEvents([]);
          setIsLoadingEvents(false);
        }
      });
      loadEventsOnFocus();
    }, [user, fetchEvents, handleError, withErrorHandling])
  );

  const onRefresh = useCallback(() => withErrorHandling(async () => {
    try {
      setRefreshing(true);
      
      // If online, trigger sync first
      if (isOnline) {
        try {
          await forceSync();
          logger.debug('EventListScreen: Sync completed, refreshing events');
        } catch (error) {
          logger.error('EventListScreen: Sync failed:', error);
        }
      }
      
      // Force refresh to get latest data
      await fetchEvents(true);
    } catch (error) {
      handleError(error, { action: 'refresh_events', source: 'EventListScreen' });
    }
  })(), [fetchEvents, withErrorHandling, handleError, isOnline, forceSync]);

  const getEventsForSegment = (): Event[] => {
    try {
      const now = new Date();
      let eventsToFilter: Event[] = allEvents;

      if (currentSegment === 0) {
        eventsToFilter = allEvents
          .filter(event => event.endDate && event.endDate >= now)
          .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      } else if (currentSegment === 1) {
        eventsToFilter = allEvents
          .filter(event => event.endDate && event.endDate < now)
          .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
      } else if (currentSegment === 2) {
        const currentUserId = user?.uid;
        eventsToFilter = allEvents
          .filter(event => event.createdBy === currentUserId)
          .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      }

      if (searchText) {
        const lowerSearchText = searchText.toLowerCase();
        return eventsToFilter.filter((event: Event) =>
          event.name.toLowerCase().includes(lowerSearchText) ||
          (event.location && event.location.toLowerCase().includes(lowerSearchText))
        );
      }
      return eventsToFilter;
    } catch (error) {
      handleError(error, { 
        action: 'filter_events', 
        currentSegment, 
        searchText,
        source: 'EventListScreen' 
      });
      return [];
    }
  };

  const displayedEvents = getEventsForSegment();

  if (isLoadingEvents && !refreshing && allEvents.length === 0) {
    return (
      <ErrorBoundary screenName="EventListScreen">
        <SafeAreaView style={styles.safeArea} edges={[ 'left', 'right', 'bottom' ]}>
          <Stack.Screen options={{ headerShown: false }} />
          <AppHeader title="Events" headerLeft={BackAction} />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0A5C36" />
            <Text style={styles.loadingText}>Loading events...</Text>
          </View>
        </SafeAreaView>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary screenName="EventListScreen">
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
        
        {!isOnline && (
          <View style={styles.offlineIndicator}>
            <MaterialIcons name="cloud-off" size={16} color="#666" />
            <Text style={styles.offlineText}>Offline - Showing cached events</Text>
          </View>
        )}

        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#0A5C36"]}/>}
        >
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
                onPress={withErrorHandling(async () => {
                  try {
                    router.push({ pathname: '/(screens)/eventDetail', params: { eventId: event.id } });
                  } catch (error) {
                    handleError(error, { 
                      action: 'navigate_event_detail', 
                      eventId: event.id,
                      source: 'EventListScreen' 
                    });
                  }
                })}
              />
            ))
          )}
        </ScrollView>

        <FloatingActionMenu menuItems={eventMenuItems} fabIconName="plus" fabIconLibrary="MaterialCommunityIcons" />
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
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
  scrollContainer: {
    flexGrow: 1,
  },
  noEventsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  noEventsText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#555555',
    marginTop: 20,
  },
  noEventsSubText: {
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
  eventMediaGallery: {
    height: 180,
    width: '100%',
    marginBottom: 10,
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
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFF3E0',
    marginHorizontal: 15,
    marginBottom: 10,
    borderRadius: 8,
  },
  offlineText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
});

export default EventListScreen; 