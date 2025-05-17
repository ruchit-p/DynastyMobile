import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, Image, TouchableOpacity, Linking, Platform, ActivityIndicator, Share, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
import AppHeader from '@/components/ui/AppHeader';
import Screen from '@/components/ui/Screen';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Card from '@/components/ui/Card';
import Colors from '@/constants/Colors';
import { Typography } from '@/constants/Typography';
import { Spacing, BorderRadius, Shadows } from '@/constants/Spacing';
import { commonHeaderOptions } from '@/constants/headerConfig';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getEventDetailsMobile, MobileEventDetails } from '@src/lib/firebaseUtils';
import { formatDate, formatTimeAgo, toDate } from '@src/lib/dateUtils';
import { useAuth } from '@/src/contexts/AuthContext';

const EventDetailScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = params.eventId;
  const colorScheme = useColorScheme();
  const { user } = useAuth();

  const scheme = colorScheme ?? 'light';

  const [eventDetails, setEventDetails] = useState<MobileEventDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (eventId) {
      const fetchEventData = async () => {
        setIsLoading(true);
        setError(null);
        try {
          console.log(`[EventDetailScreen] Fetching details for event: ${eventId}`);
          const details = await getEventDetailsMobile(eventId);
          if (details) {
            console.log('[EventDetailScreen] Event details fetched:', details);
            setEventDetails(details);
          } else {
            console.log('[EventDetailScreen] No event details returned or event not found.');
            setError('Event not found or an error occurred.');
          }
        } catch (err: any) {
          console.error('[EventDetailScreen] Error fetching event details:', err);
          setError(err.message || 'Failed to load event details.');
        } finally {
          setIsLoading(false);
        }
      };
      fetchEventData();
    } else {
      setError("Event ID is missing.");
      setIsLoading(false);
    }
  }, [eventId]);

  const handleShareEvent = async () => {
    if (!eventDetails) return;
    try {
      await Share.share({
        message: `Check out this event: ${eventDetails.title} on ${formatDate(toDate(eventDetails.eventDate))}! More info: [Your App Event Link Here] `,
        title: eventDetails.title,
      });
    } catch (shareError) {
      console.error('Error sharing event:', shareError);
    }
  };

  const handleOpenMap = () => {
    if (!eventDetails?.location) return;
    const { lat, lng, address } = eventDetails.location;
    const platformScheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${lat},${lng}`;
    const label = encodeURIComponent(address || eventDetails.title);
    const url = Platform.select({
      ios: `${platformScheme}${label}@${latLng}`,
      android: `${platformScheme}${latLng}(${label})`,
    });
    if (url) Linking.openURL(url);
  };
  
  const handleContactHost = () => {
    if (!eventDetails?.host?.id || !user) return;
    console.log("Contacting host:", eventDetails.host.id);
    // Example: router.push({ pathname: '/(screens)/chatDetail', params: { recipientId: eventDetails.host.id } });
    alert("Navigate to chat with host: " + eventDetails.host.name);
  };

  const renderHostItem = (host: MobileEventDetails['host']) => (
    <TouchableOpacity onPress={handleContactHost} style={styles.hostItemContainer}>
      <Avatar source={host.avatar ?? undefined} fallback={host.name?.substring(0,1)} size="md" />
      <View style={styles.hostInfo}>
        <ThemedText variant="bodyLarge" style={{ fontWeight: Typography.weight.bold }}>{host.name}</ThemedText>
        <ThemedText variant="bodySmall" color="secondary">Host</ThemedText>
      </View>
      <Ionicons name="chatbubble-ellipses-outline" size={24} color={Colors[scheme].icon.secondary} />
    </TouchableOpacity>
  );

  const renderAttendeeAvatar = (attendee: MobileEventDetails['attendees'][0]) => (
    <View key={attendee.id} style={styles.attendeeAvatarContainer}>
      <Avatar source={attendee.avatar ?? undefined} fallback={attendee.name?.substring(0,1)} size="sm" />
      <ThemedText variant="caption" style={styles.attendeeName} numberOfLines={1}>{attendee.name}</ThemedText>
    </View>
  );

  const headerLeftComponent = () => (
    <TouchableOpacity 
      onPress={() => router.back()} 
      style={styles.headerButton}
      accessibilityLabel="Go back"
      accessibilityHint="Returns to the previous screen"
    >
      <Ionicons name="chevron-back" size={24} color={Colors[scheme].icon.primary} />
    </TouchableOpacity>
  );

  const headerRightComponent = () => (
    <TouchableOpacity 
      onPress={handleShareEvent} 
      style={styles.headerButton}
      accessibilityLabel="Share event"
      accessibilityHint="Opens sharing options for this event"
    >
      <Ionicons name="share-social-outline" size={22} color={Colors[scheme].icon.primary} />
    </TouchableOpacity>
  );
  
  if (isLoading) {
    return (
      <Screen safeArea style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={Colors[scheme].text.link} />
        <ThemedText variant="bodyLarge" style={{ marginTop: Spacing.md }}>Loading event details...</ThemedText>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen safeArea style={styles.centeredContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors[scheme].text.error} />
        <ThemedText variant="h3" style={{ marginTop: Spacing.md, textAlign: 'center' }}>Error</ThemedText>
        <ThemedText variant="bodyMedium" style={{ marginTop: Spacing.sm, textAlign: 'center', marginHorizontal: Spacing.lg }}>{error}</ThemedText>
        <Button title="Go Back" onPress={() => router.back()} style={{ marginTop: Spacing.lg }} variant="primary" />
      </Screen>
    );
  }

  if (!eventDetails) {
    return (
      <Screen safeArea style={styles.centeredContainer}>
        <Ionicons name="information-circle-outline" size={48} color={Colors[scheme].text.secondary} />
        <ThemedText variant="h3" style={{ marginTop: Spacing.md }}>Event Not Found</ThemedText>
        <ThemedText variant="bodyMedium" style={{ marginTop: Spacing.sm, textAlign: 'center' }}>The event you are looking for could not be found.</ThemedText>
        <Button title="Go Back" onPress={() => router.back()} style={{ marginTop: Spacing.lg }} variant="primary" />
      </Screen>
    );
  }
  
  const eventDateObject = toDate(eventDetails.eventDate);
  const formattedDate = eventDateObject ? formatDate(eventDateObject, 'PPPP') : 'Date not available';
  const formattedTime = eventDetails.startTime ? formatDate(toDate(`1970-01-01T${eventDetails.startTime}Z`), 'p') : 'Time not set';
  const rsvpDeadlineObject = eventDetails.rsvpDeadline ? toDate(eventDetails.rsvpDeadline) : null;
  const formattedRsvpDeadline = rsvpDeadlineObject ? `RSVP by ${formatDate(rsvpDeadlineObject, 'MMM d, yyyy')}` : null;
  
  // Apply common header styling from headerConfig

  return (
    <Screen safeArea scroll>
      <AppHeader 
        title={eventDetails.title}
        headerLeft={headerLeftComponent} 
        headerRight={headerRightComponent}
        testID="event-detail-header"
      />
      <ThemedView style={styles.container} variant="primary">
        {/* Event Cover Image */}
        {eventDetails.coverPhotoUrls && eventDetails.coverPhotoUrls.length > 0 ? (
          <Image source={{ uri: eventDetails.coverPhotoUrls[0] }} style={styles.eventImage} />
        ) : (
          <ThemedView style={[styles.eventImage, styles.placeholderImage]} variant="secondary">
            <Ionicons name="images-outline" size={80} color={Colors[scheme].icon.secondary} />
            <ThemedText variant="bodyMedium" color="secondary" style={{marginTop: Spacing.sm}}>No event image</ThemedText>
          </ThemedView>
        )}

        <View style={styles.contentPadding}>
          {/* Main Event Details Card */}
          <Card style={[styles.card, styles.eventDetailsCard]}>
            <Card.Content>
              <ThemedText variant="h2" style={styles.eventName}>{eventDetails.title}</ThemedText>
              
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={20} color={Colors[scheme].icon.primary} style={styles.infoIcon}/>
                <ThemedText variant="bodyMedium" style={styles.infoText}>{formattedDate} at {formattedTime}</ThemedText>
              </View>

              {eventDetails.location && (
                <TouchableOpacity onPress={handleOpenMap} style={styles.infoRow}>
                  <Ionicons name="location-outline" size={20} color={Colors[scheme].icon.primary} style={styles.infoIcon}/>
                  <ThemedText variant="bodyMedium" style={styles.infoText} color="link">{eventDetails.location.address}</ThemedText>
                </TouchableOpacity>
              )}
              {eventDetails.isVirtual && eventDetails.virtualLink && (
                <TouchableOpacity onPress={() => Linking.openURL(eventDetails.virtualLink!)} style={styles.infoRow}>
                  <Ionicons name="link-outline" size={20} color={Colors[scheme].icon.primary} style={styles.infoIcon}/>
                  <ThemedText variant="bodyMedium" style={styles.infoText} color="link">Join Virtual Event</ThemedText>
                </TouchableOpacity>
              )}
              
              {/* RSVP Button */}
              <View style={styles.rsvpContainer}>
                <Button 
                  title={eventDetails.userStatus === 'going' ? "You're Going!" : "RSVP Now"} 
                  onPress={() => alert('RSVP action')} 
                  variant="primary"
                  style={styles.rsvpButton}
                  leftIcon={eventDetails.userStatus === 'going' ? "checkmark-circle" : "calendar"}
                />
                {formattedRsvpDeadline && (
                  <ThemedText 
                    variant="caption" 
                    color="secondary" 
                    style={styles.rsvpDeadlineText}
                  >
                    {formattedRsvpDeadline}
                  </ThemedText>
                )}
              </View>
            </Card.Content>
          </Card>

          {/* About Event */}
          {eventDetails.description && (
            <Card style={styles.card}>
              <Card.Header>
                <ThemedText variant="h4" style={styles.sectionTitleNoMargin}>About this event</ThemedText>
              </Card.Header>
              <Card.Content>
                <ThemedText variant="bodyMedium">{eventDetails.description}</ThemedText>
              </Card.Content>
            </Card>
          )}

          {/* Host Info */}
          {eventDetails.host && (
            <Card style={styles.card}>
              <Card.Header>
                <ThemedText variant="h4" style={styles.sectionTitleNoMargin}>Host</ThemedText>
              </Card.Header>
              <Card.Content>
                {renderHostItem(eventDetails.host)}
              </Card.Content>
            </Card>
          )}

          {/* Attendees List */}
          {eventDetails.attendees && eventDetails.attendees.length > 0 && eventDetails.showGuestList && (
            <Card style={styles.card}>
              <Card.Header>
                <ThemedText variant="h4" style={styles.sectionTitleNoMargin}>Attendees ({eventDetails.attendees.length})</ThemedText>
              </Card.Header>
              <Card.Content>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attendeesScrollContainer}>
                  {eventDetails.attendees.map(renderAttendeeAvatar)}
                </ScrollView>
              </Card.Content>
            </Card>
          )}

          {/* Comments Section */}
          {eventDetails.comments && eventDetails.comments.length > 0 && (
            <Card style={styles.card}>
              <Card.Header>
                <ThemedText variant="h4" style={styles.sectionTitleNoMargin}>Comments ({eventDetails.comments.length})</ThemedText>
              </Card.Header>
              <Card.Content>
                {eventDetails.comments.map(comment => (
                  <ThemedView key={comment.id} style={styles.commentItemContainer} variant="secondary">
                    <Avatar source={comment.user.avatar ?? undefined} fallback={comment.user.name?.substring(0,1)} size="sm" />
                    <View style={styles.commentContent}>
                      <ThemedText variant="bodyMedium" style={{ fontWeight: Typography.weight.bold }}>{comment.user.name}</ThemedText>
                      <ThemedText variant="bodySmall">{comment.text}</ThemedText>
                      <ThemedText variant="caption" color="secondary">{formatTimeAgo(toDate(comment.timestamp))}</ThemedText>
                    </View>
                  </ThemedView>
                ))}
              </Card.Content>
            </Card>
          )}
        </View>
      </ThemedView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  container: {
    flex: 1,
  },
  eventImage: {
    width: '100%',
    height: 280, // Slightly taller for better visual impact
    resizeMode: 'cover',
    borderBottomLeftRadius: BorderRadius.sm,
    borderBottomRightRadius: BorderRadius.sm,
  },
  placeholderImage: {
    // backgroundColor is applied via ThemedView variant="secondary"
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentPadding: {
    paddingHorizontal: Spacing.md, 
    paddingVertical: Spacing.sm, 
  },
  card: {
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  eventName: {
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  infoIcon: {
    marginRight: Spacing.md,
  },
  infoText: {
    flexShrink: 1, 
  },
  rsvpContainer: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  rsvpButton: {
    minWidth: 180,
    marginVertical: Spacing.sm,
  },
  rsvpDeadlineText: {
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
  sectionTitleNoMargin: {
  },
  hostItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hostInfo: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  attendeesScrollContainer: {
    paddingVertical: Spacing.xs,
  },
  attendeeAvatarContainer: {
    marginRight: Spacing.md,
    alignItems: 'center',
    width: 70,
  },
  attendeeName: {
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  commentItemContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  commentContent: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  headerButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  eventDetailsCard: {
    marginTop: -Spacing.xl,
    zIndex: 1,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    ...Shadows.md,
  },
});

export default EventDetailScreen; 