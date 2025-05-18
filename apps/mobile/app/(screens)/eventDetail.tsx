import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, Image, TouchableOpacity, Linking, Platform, ActivityIndicator, Share, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
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
import AnimatedActionSheet, { ActionSheetAction } from '@/components/ui/AnimatedActionSheet';
import MediaGallery, { MediaItem } from '@/components/ui/MediaGallery';

const EventDetailScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = params.eventId;
  const colorScheme = useColorScheme();
  const { user } = useAuth();

  const scheme = colorScheme ?? 'light';

  const [eventDetails, setEventDetails] = useState<MobileEventDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isActionSheetVisible, setActionSheetVisible] = useState(false);

  useEffect(() => {
    if (eventId) {
      const fetchEventData = async () => {
        setIsLoading(true);
        setError(null);
        navigation.setOptions({ title: 'Loading Event...' });
        try {
          console.log(`[EventDetailScreen] Fetching details for event: ${eventId}`);
          const details = await getEventDetailsMobile(eventId);
          if (details) {
            console.log('[EventDetailScreen] Event details fetched:', details);
            setEventDetails(details);

            const isHost = user?.uid === details.hostId;
            navigation.setOptions({
              ...commonHeaderOptions,
              headerTitle: details.title.length > 25 ? `${details.title.substring(0, 22)}...` : details.title,
              headerLeft: () => (
                <TouchableOpacity 
                  onPress={() => router.back()} 
                  style={styles.headerButton}
                  accessibilityLabel="Go back"
                  accessibilityHint="Returns to the previous screen"
                >
                  <Ionicons name="arrow-back" size={24} color={commonHeaderOptions.headerTintColor || Colors[scheme].icon.primary} />
                </TouchableOpacity>
              ),
              headerRight: () => (
                <View style={styles.headerRightContainer}>
                  <TouchableOpacity 
                    onPress={handleShareEventInternal}
                    style={styles.headerButton}
                    accessibilityLabel="Share event"
                    accessibilityHint="Opens sharing options for this event"
                  >
                    <Ionicons name="share-social-outline" size={22} color={commonHeaderOptions.headerTintColor || Colors[scheme].icon.primary} />
                  </TouchableOpacity>
                  {isHost && (
                    <TouchableOpacity 
                      onPress={() => setActionSheetVisible(true)} 
                      style={[styles.headerButton, { marginLeft: Spacing.sm }]}
                      accessibilityLabel="Event options"
                      accessibilityHint="Opens options to edit or delete the event"
                    >
                      <Ionicons name="ellipsis-horizontal" size={24} color={commonHeaderOptions.headerTintColor || Colors[scheme].icon.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              ),
            });
          } else {
            console.log('[EventDetailScreen] No event details returned or event not found.');
            setError('Event not found or an error occurred.');
            navigation.setOptions({ title: 'Error' });
          }
        } catch (err: any) {
          console.error('[EventDetailScreen] Error fetching event details:', err);
          setError(err.message || 'Failed to load event details.');
          navigation.setOptions({ title: 'Error' });
        } finally {
          setIsLoading(false);
        }
      };
      fetchEventData();
    } else {
      setError("Event ID is missing.");
      setIsLoading(false);
      navigation.setOptions({ title: 'Error' });
    }
  }, [eventId, navigation, router, user, scheme]);

  const handleShareEventInternal = async () => {
    if (!eventDetails) return;
    try {
      await Share.share({
        message: `Check out this event: ${eventDetails.title} on ${formatDate(toDate(eventDetails.eventDate))}! More info: [Your App Event Link Here] `,
        title: eventDetails.title,
      });
    } catch (shareError) {
      console.error('Error sharing event:', shareError);
      Alert.alert('Error', 'Could not share the event.');
    }
  };

  const handleEditEvent = () => {
    if (!eventDetails) return;
    router.push({
      pathname: '/(screens)/createEvent',
      params: { eventId: eventDetails.id, editMode: 'true' },
    });
    setActionSheetVisible(false);
  };

  const handleDeleteEvent = async () => {
    if (!eventDetails || !user) return;
    setActionSheetVisible(false);
    Alert.alert(
      "Delete Event",
      "Are you sure you want to delete this event? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              Alert.alert("Placeholder", "Delete functionality to be implemented.");
            } catch (error) {
              console.error("Error deleting event:", error);
              Alert.alert("Error", "An unexpected error occurred while deleting the event.");
            }
          },
        },
      ]
    );
  };

  const eventHostActions: ActionSheetAction[] = [
    {
      title: 'Edit Event',
      icon: 'create-outline',
      onPress: handleEditEvent,
    },
    {
      title: 'Delete Event',
      icon: 'trash-outline',
      style: 'destructive',
      onPress: handleDeleteEvent,
    },
    {
      title: 'Cancel',
      style: 'cancel',
      onPress: () => setActionSheetVisible(false),
    },
  ];

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
  
  return (
    <Screen safeArea scroll>
      <ThemedView style={styles.container} variant="primary">
        {/* Event Cover Media Gallery */}
        {eventDetails.coverPhotoUrls && eventDetails.coverPhotoUrls.length > 0 ? (
          <MediaGallery
            media={eventDetails.coverPhotoUrls.map(url => ({
              uri: url,
              type: 'image', // Assuming all coverPhotoUrls are images for now
              // Add other MediaItem props if available or derivable, e.g., width, height, duration for videos
            }))}
            // Props to make it display-only, similar to storyDetail.tsx if applicable
            onAddMedia={() => {}} // No action
            onRemoveMedia={() => {}} // No action
            onReplaceMedia={() => {}} // No action
            showRemoveButton={false}
            showReplaceButton={false}
            allowAddingMore={false}
            style={styles.mediaGalleryStyle} // Added a style for the gallery container itself if needed
          />
        ) : (
          <ThemedView style={[styles.eventImagePlaceholder, styles.placeholderImage]} variant="secondary"> {/* Changed style name for clarity */}
            <Ionicons name="images-outline" size={80} color={Colors[scheme].icon.secondary} />
            <ThemedText variant="bodyMedium" color="secondary" style={{marginTop: Spacing.sm}}>No event image</ThemedText>
          </ThemedView>
        )}

        <View style={styles.contentPadding}>
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

          {/* Additional Information Section */}
          {(eventDetails.dresscode || eventDetails.whatToBring || eventDetails.additionalInfo) && (
            <Card style={styles.card}>
              <Card.Header>
                <ThemedText variant="h4" style={styles.sectionTitleNoMargin}>Additional Information</ThemedText>
              </Card.Header>
              <Card.Content>
                {eventDetails.dresscode && (
                  <View style={styles.detailItemRow}>
                    <Ionicons name="shirt-outline" size={20} color={Colors[scheme].icon.primary} style={styles.detailItemIcon} />
                    <View style={styles.detailItemTextContainer}>
                      <ThemedText variant="bodyMedium" style={styles.detailItemLabel}>Dress Code</ThemedText>
                      <ThemedText variant="bodyMedium" color="secondary">{eventDetails.dresscode}</ThemedText>
                    </View>
                  </View>
                )}
                {eventDetails.whatToBring && (
                  <View style={styles.detailItemRow}>
                    <Ionicons name="briefcase-outline" size={20} color={Colors[scheme].icon.primary} style={styles.detailItemIcon} />
                    <View style={styles.detailItemTextContainer}>
                      <ThemedText variant="bodyMedium" style={styles.detailItemLabel}>What to Bring</ThemedText>
                      <ThemedText variant="bodyMedium" color="secondary">{eventDetails.whatToBring}</ThemedText>
                    </View>
                  </View>
                )}
                {eventDetails.additionalInfo && (
                  <View style={styles.detailItemRow}>
                    <Ionicons name="information-circle-outline" size={20} color={Colors[scheme].icon.primary} style={styles.detailItemIcon} />
                    <View style={styles.detailItemTextContainer}>
                      <ThemedText variant="bodyMedium" style={styles.detailItemLabel}>More Info</ThemedText>
                      <ThemedText variant="bodyMedium" color="secondary">{eventDetails.additionalInfo}</ThemedText>
                    </View>
                  </View>
                )}
              </Card.Content>
            </Card>
          )}

          {/* Guest Options Section - Example for allowGuestPlusOne */}
          <Card style={styles.card}>
            <Card.Header>
              <ThemedText variant="h4" style={styles.sectionTitleNoMargin}>Guest Options</ThemedText>
            </Card.Header>
            <Card.Content>
              <View style={styles.detailItemRow}>
                <Ionicons name="people-outline" size={20} color={Colors[scheme].icon.primary} style={styles.detailItemIcon} />
                <View style={styles.detailItemTextContainer}>
                  <ThemedText variant="bodyMedium" style={styles.detailItemLabel}>Guests Can Bring a +1</ThemedText>
                  <ThemedText variant="bodyMedium" color="secondary">{eventDetails.allowGuestPlusOne ? 'Yes' : 'No'}</ThemedText>
                </View>
              </View>
              <View style={styles.detailItemRow}>
                <Ionicons name="eye-outline" size={20} color={Colors[scheme].icon.primary} style={styles.detailItemIcon} />
                <View style={styles.detailItemTextContainer}>
                  <ThemedText variant="bodyMedium" style={styles.detailItemLabel}>Guest List Visible</ThemedText>
                  <ThemedText variant="bodyMedium" color="secondary">{eventDetails.showGuestList ? 'Yes' : 'No'}</ThemedText>
                </View>
              </View>
            </Card.Content>
          </Card>
        </View>
      </ThemedView>
      {eventDetails && user?.uid === eventDetails.hostId && (
        <AnimatedActionSheet
          isVisible={isActionSheetVisible}
          onClose={() => setActionSheetVisible(false)}
          actions={eventHostActions}
          title="Event Options"
          message="Manage your event."
        />
      )}
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
  mediaGalleryStyle: { // Style for the MediaGallery container
    width: '100%',
    height: 280, // Match previous eventImage height or adjust as needed
    borderBottomLeftRadius: BorderRadius.sm, // Apply to gallery if it's the top element
    borderBottomRightRadius: BorderRadius.sm,
  },
  eventImagePlaceholder: { // Renamed from eventImage for clarity when it is a placeholder
    width: '100%',
    height: 280,
    resizeMode: 'cover',
    borderBottomLeftRadius: BorderRadius.sm,
    borderBottomRightRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderImage: { // This style is for the content *inside* the placeholder
    // justifyContent: 'center', // Handled by eventImagePlaceholder
    // alignItems: 'center', // Handled by eventImagePlaceholder
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
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  detailItemIcon: {
    marginRight: Spacing.md,
    marginTop: Spacing.xxs, // Align icon better with multi-line text
  },
  detailItemTextContainer: {
    flex: 1,
  },
  detailItemLabel: {
    fontWeight: Typography.weight.semiBold,
    marginBottom: Spacing.xxs,
  },
  eventDetailsCard: {
    marginTop: -Spacing.xl, // Keep the overlap effect
    zIndex: 1,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    ...Shadows.md,
  },
});

export default EventDetailScreen; 