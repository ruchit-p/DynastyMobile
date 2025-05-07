import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Share,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'; // Added MaterialCommunityIcons
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';

// Re-define or import Event interface (ensure it matches the one in events.tsx)
interface Event {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  imageUri?: string;
  organizer?: string;
  status?: 'Going' | 'Invited' | null;
  description?: string;
  hosts?: { id: string; name: string; role: string; avatarUri?: string }[];
  attendees?: { id: string; name: string; avatarUri?: string }[];
  mapPreviewUri?: string; // For a static map image
  ticketLink?: string;
  contactInfo?: string;
}

// Mock function to get event details - replace with actual data fetching
const getEventDetails = (eventId: string): Event | undefined => {
  const mockEvents: Event[] = [
    {
      id: '1',
      name: 'Connections & Capital Miami Meetup by Fortress, 10T, & Next Layer Capital @ Regatta Coconut Grove',
      date: 'Tomorrow',
      time: '7:30 PM - 9:00 PM',
      location: 'Regatta Grove',
      imageUri: 'https://placekitten.com/400/250', // Larger image for detail screen
      organizer: 'Fortress Calendar',
      status: 'Going',
      description: 'Join us at the intersection of digital assets, finance, startups, venture, and capital raising in the #1 Miami business meetup at Regatta in Coconut Grove.\n\nThis event is hosted by Fortress, a private, invite-only network of high-growth investors and capital allocators.',
      hosts: [
        { id: 'h1', name: 'Fortress', role: 'The Future of Finance', avatarUri: 'https://placekitten.com/50/50?image=1' },
        { id: 'h2', name: 'Brandon Turp', role: '', avatarUri: 'https://placekitten.com/50/50?image=2' },
        { id: 'h3', name: 'Next Layer Capital', role: '', avatarUri: 'https://placekitten.com/50/50?image=3' },
        { id: 'h4', name: '10T Holdings & 1RT Partners', role: 'Private equity fund run by Dan Tapiero, investing...', avatarUri: 'https://placekitten.com/50/50?image=4' },
      ],
      attendees: [
        { id: 'a1', name: 'Anna Vladi', avatarUri: 'https://placekitten.com/40/40?image=5' },
        { id: 'a2', name: 'Idael Diaz', avatarUri: 'https://placekitten.com/40/40?image=6' },
        { id: 'a3', name: 'Dave Boerner', avatarUri: 'https://placekitten.com/40/40?image=7' },
        { id: 'a4', name: 'Tural Bayev', avatarUri: 'https://placekitten.com/40/40?image=8' },
      ],
      mapPreviewUri: 'https://placekitten.com/400/200?image=9', // Placeholder map image
      ticketLink: '#',
      contactInfo: 'events@fortress.com',
    },
    // Add other mock events if needed
  ];
  return mockEvents.find(event => event.id === eventId);
};

const EventDetailScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { eventId } = useLocalSearchParams();
  const [event, setEvent] = useState<Event | null>(null);

  useEffect(() => {
    if (eventId && typeof eventId === 'string') {
      const fetchedEvent = getEventDetails(eventId);
      setEvent(fetchedEvent || null);
      if (fetchedEvent) {
        navigation.setOptions({
          title: fetchedEvent.name.length > 30 ? `${fetchedEvent.name.substring(0,27)}...` : fetchedEvent.name, 
          headerStyle: { backgroundColor: '#F8F8F8' },
          headerTintColor: '#333333', 
          headerTitleStyle: { fontWeight: '600', fontSize: 16 },
          headerBackTitleVisible: false,
        });
      } else {
        navigation.setOptions({ title: 'Event Not Found' });
      }
    } else {
        navigation.setOptions({ title: 'Event Detail' });
    }
  }, [eventId, navigation, event]);

  if (!event) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading event details...</Text>
      </SafeAreaView>
    );
  }

  const handleShareEvent = async () => {
    if (!event) return;
    try {
      const result = await Share.share({
        message: `Check out this event: ${event.name}\n${event.description?.substring(0,100)}...\nFind out more: [placeholder-event-url/${event.id}]`, // Replace with actual event URL if available
        title: `Event: ${event.name}`,
      });
      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          // shared with activity type of result.activityType
        } else {
          // shared
        }
      } else if (result.action === Share.dismissedAction) {
        // dismissed
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleOpenMap = () => {
    if (!event || !event.location) return;
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = ''; // If you have lat/lng, use them: `${event.latitude},${event.longitude}`
    const label = encodeURIComponent(event.name);
    const address = encodeURIComponent(event.location);
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}${address}`,
      android: `${scheme}${latLng}(${label})?q=${address}`,
    });
    if (url) {
        Linking.canOpenURL(url).then(supported => {
            if (supported) {
                Linking.openURL(url);
            } else {
                Alert.alert('Error', "Don't know how to open this map URL: " + url);
            }
        }).catch(err => Alert.alert('Error', 'An error occurred: ' + err));
    }
  };

  const handleContactHost = () => {
    if (!event || !event.contactInfo) {
        Alert.alert('Contact Info', 'No contact information available for this host.');
        return;
    }
    // Assuming contactInfo is an email for now
    Linking.openURL(`mailto:${event.contactInfo}?subject=Inquiry about ${event.name}`).catch(err => Alert.alert('Error', 'Could not open email client.'));
  };

  const renderHostItem = (host: NonNullable<Event['hosts']>[0]) => (
    <View key={host.id} style={styles.hostItemContainer}>
        {host.avatarUri && <Image source={{ uri: host.avatarUri }} style={styles.hostAvatar} />}
        <View style={styles.hostInfo}>
            <Text style={styles.hostName}>{host.name}</Text>
            {host.role && <Text style={styles.hostRole}>{host.role}</Text>}
        </View>
        <View style={styles.hostActions}>
            {/* Placeholder for Instagram/X icons - using generic icons for now */}
            {host.name.includes('Brandon') && <Ionicons name="logo-instagram" size={24} color="#E0E0E0" style={styles.hostActionIcon} />}
            <Ionicons name="close-circle-outline" size={24} color="#E0E0E0" style={styles.hostActionIcon} />
        </View>
    </View>
  );

  const renderAttendeeAvatar = (attendee: NonNullable<Event['attendees']>[0]) => (
    <Image key={attendee.id} source={{ uri: attendee.avatarUri }} style={styles.attendeeAvatar} />
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContentContainer}>
        <Image source={{ uri: event.imageUri }} style={styles.eventImage} />

        <View style={styles.headerContentContainer}>
          {event.organizer && <Text style={styles.organizerText}>{event.organizer} <Ionicons name="chevron-forward" size={14} color='#A0A0A0' /></Text>}
          <Text style={styles.eventName}>{event.name}</Text>
          <View style={styles.dateTimeRow}>
            <Ionicons name="time-outline" size={18} color="#A0A0A0" />
            <Text style={styles.dateTimeText}>{event.date}, {event.time}</Text>
          </View>
          {event.status && (
            <View style={styles.statusPill}>
              <MaterialCommunityIcons name="ticket-confirmation-outline" size={18} color="#81C784" />
              <Text style={styles.statusPillText}>You are {event.status.toLowerCase()}</Text>
            </View>
          )}
        </View>

        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity style={[styles.actionButton, styles.primaryButton]} onPress={() => Alert.alert('My Ticket', 'Ticket viewing not implemented yet.')}>
            <MaterialCommunityIcons name="ticket-outline" size={20} color="#FFFFFF" />
            <Text style={styles.actionButtonTextPrimary}>My Ticket</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleContactHost}>
            <Ionicons name="mail-outline" size={20} color="#E0E0E0" />
            <Text style={styles.actionButtonText}>Contact</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleShareEvent}>
            <Ionicons name="share-social-outline" size={20} color="#E0E0E0" />
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => Alert.alert('More Options', 'More options not implemented yet.')}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#E0E0E0" />
            <Text style={styles.actionButtonText}>More</Text>
          </TouchableOpacity>
        </View>

        {/* Location Section */}
        <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderWithAction}>
                <Text style={styles.sectionTitle}>Location</Text>
                {/* Optional: Temperature icon or similar */}
            </View>
            <Text style={styles.locationAddress}>{event.location}, Miami, Florida</Text> 
            {/* Assuming Miami, Florida for now */}
            {event.mapPreviewUri && 
                <TouchableOpacity onPress={handleOpenMap}>
                    <Image source={{ uri: event.mapPreviewUri }} style={styles.mapPreviewImage} />
                </TouchableOpacity>
            }
        </View>

        {/* Hosted By Section */}
        {event.hosts && event.hosts.length > 0 && (
            <View style={styles.sectionContainer}>
                <View style={styles.sectionHeaderWithAction}>
                    <Text style={styles.sectionTitle}>Hosted By</Text>
                    <TouchableOpacity onPress={handleContactHost}><Text style={styles.sectionActionText}>Contact</Text></TouchableOpacity>
                </View>
                {event.hosts.map(renderHostItem)}
            </View>
        )}

        {/* Going Section */}
        {event.attendees && event.attendees.length > 0 && (
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>{event.attendees.length * 10 + 100} Going</Text> 
                {/* Example: 144 Going - adjust logic for total */}
                <View style={styles.attendeesAvatarContainer}>
                    {event.attendees.slice(0, 4).map(renderAttendeeAvatar)} 
                    {/* Show first 4, then a +X more indicator */}
                    {event.attendees.length > 4 && 
                        <View style={styles.moreAttendeesBadge}>
                            <Text style={styles.moreAttendeesText}>+{event.attendees.length * 10 + 100 - 4}</Text>
                        </View>
                    }
                </View>
                <Text style={styles.attendeesSummaryText}>
                    {event.attendees.map(a => a.name).join(', ')} and {event.attendees.length * 10 + 100 - event.attendees.length} more
                </Text>
            </View>
        )}

        {/* About Event Section */}
        {event.description && (
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>About Event</Text>
                <Text style={styles.descriptionText}>{event.description}</Text>
            </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  container: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: 100, // Ensure space for content above any potential tab bar or FAB
  },
  eventImage: {
    width: '100%',
    height: 280, // Adjust height as needed for the detail view image
    resizeMode: 'cover',
  },
  headerContentContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'rgba(25,25,25,0.8)', // Slightly transparent dark background
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginTop: -20, // Pull up to overlap image slightly for a nicer effect
    zIndex: 1,
  },
  organizerText: {
    fontSize: 14,
    color: '#A0A0A0',
    marginBottom: 8,
    fontWeight: '500',
  },
  eventName: {
    fontSize: 26, // Larger for detail screen
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
    lineHeight: 32,
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateTimeText: {
    fontSize: 16,
    color: '#E0E0E0',
    marginLeft: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.2)', // Semi-transparent green
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  statusPillText: {
    color: '#81C784', // Light green text
    marginLeft: 6,
    fontWeight: '600',
    fontSize: 14,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(70, 70, 70, 0.5)',
    marginBottom: 15,
  },
  actionButton: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(50, 50, 50, 0.7)', // Frosty button background
    minWidth: 70, // Ensure buttons have some width
  },
  primaryButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)', // Accent color for primary button
  },
  actionButtonText: {
    color: '#E0E0E0',
    fontSize: 12,
    marginTop: 4,
  },
  actionButtonTextPrimary: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 4,
    fontWeight: 'bold',
  },
  sectionContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(70, 70, 70, 0.5)',
  },
  sectionHeaderWithAction: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  sectionActionText: {
      fontSize: 14,
      color: 'rgba(0, 122, 255, 1)', // Accent color
      fontWeight: '600',
  },
  locationAddress: {
      fontSize: 16,
      color: '#E0E0E0',
      marginBottom: 10,
  },
  mapPreviewImage: {
      width: '100%',
      height: 180,
      borderRadius: 10,
      marginTop: 5,
  },
  hostItemContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 0.5,
      borderBottomColor: 'rgba(90, 90, 90, 0.5)',
  },
  hostAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      marginRight: 12,
  },
  hostInfo: {
      flex: 1,
  },
  hostName: {
      fontSize: 16,
      color: '#FFFFFF',
      fontWeight: '600',
  },
  hostRole: {
      fontSize: 13,
      color: '#A0A0A0',
  },
  hostActions: {
      flexDirection: 'row',
  },
  hostActionIcon: {
      marginLeft: 15,
  },
  attendeesAvatarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
  },
  attendeeAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: -10, // Overlap avatars slightly
      borderWidth: 1.5,
      borderColor: '#000000', // To make overlap clear
  },
  moreAttendeesBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(80, 80, 80, 0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: -10, // Ensure it overlaps correctly
      borderWidth: 1.5,
      borderColor: '#000000',
  },
  moreAttendeesText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: 'bold',
  },
  attendeesSummaryText: {
      fontSize: 14,
      color: '#B0B0B0',
      lineHeight: 20,
  },
  descriptionText: {
    fontSize: 16,
    color: '#E0E0E0',
    lineHeight: 24,
  },
});

export default EventDetailScreen; 