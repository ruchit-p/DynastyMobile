import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Linking, Platform, ActivityIndicator, Share, StyleSheet, TextInput, Keyboard, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import Screen from '@/components/ui/Screen';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Card from '@/components/ui/Card';
import { Colors } from '@/constants/Colors';
import { Typography } from '@/constants/Typography';
import { Spacing, BorderRadius, Shadows } from '@/constants/Spacing';
import { commonHeaderOptions } from '@/constants/headerConfig';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getEventDetailsMobile, EventDetails as MobileEventDetails, addCommentToEventMobile, deleteEventCommentMobile, RsvpStatus , deleteEventMobile, rsvpToEventMobile } from '@src/lib/eventUtils';
import { formatDate, formatTimeAgo, toDate } from '@src/lib/dateUtils';
import { useAuth } from '@/src/contexts/AuthContext';
import AnimatedActionSheet, { ActionSheetAction } from '@/components/ui/AnimatedActionSheet';
import MediaGallery from '@/components/ui/MediaGallery';
import { showErrorAlert } from '@src/lib/errorUtils';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { ErrorSeverity } from '@/src/lib/ErrorHandlingService';
import GuestListManagement from '@/components/ui/GuestListManagement';
import RSVPStatusIndicator, { RSVPDeadlineCountdown } from '@/components/ui/RSVPStatusIndicator';
import RSVPSummary from '@/components/ui/RSVPSummary';
import { logger } from '../../src/services/LoggingService';

const EventDetailScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = params.eventId;
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Event Detail Error',
    trackCurrentScreen: true
  });

  const scheme = colorScheme ?? 'light';

  const [eventDetails, setEventDetails] = useState<MobileEventDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isActionSheetVisible, setActionSheetVisible] = useState(false);
  
  // Comment-related state
  const [commentText, setCommentText] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [replyingToComment, setReplyingToComment] = useState<string | null>(null);
  const [showCommentInput, setShowCommentInput] = useState(false);
  
  // RSVP/Plus One related state
  const [showPlusOneOptions, setShowPlusOneOptions] = useState(false);
  const [plusOneName, setPlusOneName] = useState('');
  
  // Guest List Management state
  const [showGuestManagement, setShowGuestManagement] = useState(false);
  const [_showRSVPSummary, _setShowRSVPSummary] = useState(false);

  useEffect(() => {
    if (!isError) {
      setError(null);
    }
  }, [isError]);

  useEffect(() => {
    if (eventId) {
      const fetchEventData = withErrorHandling(async () => {
        reset();
        setIsLoading(true);
        setError(null);
        navigation.setOptions({ title: 'Loading Event...' });
        try {
          logger.debug(`[EventDetailScreen] Fetching details for event: ${eventId}`);
          // Use the utility function from eventUtils
          const details = await getEventDetailsMobile(eventId);
          if (details) {
            logger.debug('[EventDetailScreen] Event details fetched:', details);
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
            logger.debug('[EventDetailScreen] No event details returned or event not found.');
            setError('Event not found or an error occurred.');
            navigation.setOptions({ title: 'Error' });
          }
        } catch (err: any) {
          logger.error('[EventDetailScreen] Error fetching event details:', err);
          
          handleError(err, {
            action: 'fetchEventData',
            metadata: {
              eventId,
              userId: user?.uid,
              errorCode: err.code,
              errorMessage: err.message
            }
          });

          setError(err.message || 'Failed to load event details.');
          navigation.setOptions({ title: 'Error' });
        } finally {
          setIsLoading(false);
        }
      });
      fetchEventData();
    } else {
      setError("Event ID is missing.");
      setIsLoading(false);
      navigation.setOptions({ title: 'Error' });
    }
  }, [eventId, navigation, router, user, scheme, handleError, handleShareEventInternal, reset, withErrorHandling]);

  const handleShareEventInternal = withErrorHandling(async () => {
    reset();
    if (!eventDetails) return;
    try {
      await Share.share({
        message: `Check out this event: ${eventDetails.title} on ${formatDate(toDate(eventDetails.eventDate))}! More info: [Your App Event Link Here] `,
        title: eventDetails.title,
      });
    } catch (shareError: any) {
      logger.error('Error sharing event:', shareError);
      
      handleError(shareError, {
        action: 'handleShareEventInternal',
        metadata: {
          eventId: eventDetails.id,
          eventTitle: eventDetails.title,
          errorCode: shareError.code,
          errorMessage: shareError.message
        }
      });

      showErrorAlert(shareError, 'Share Error');
    }
  });

  const handleEditEvent = () => {
    if (!eventDetails) return;
    router.push({
      pathname: '/(screens)/createEvent',
      params: { eventId: eventDetails.id, editMode: 'true' },
    });
    setActionSheetVisible(false);
  };

  const handleDeleteEvent = withErrorHandling(async () => {
    reset();
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
              // Use the utility function from eventUtils to delete the event
              const success = await deleteEventMobile(eventDetails.id);
              if (success) {
                Alert.alert("Success", "Event has been deleted.");
                router.back();
              } else {
                Alert.alert("Error", "Failed to delete the event. Please try again.");
              }
            } catch (error: any) {
              logger.error("Error deleting event:", error);
              
              handleError(error, {
                action: 'handleDeleteEvent',
                metadata: {
                  eventId: eventDetails.id,
                  eventTitle: eventDetails.title,
                  hostId: eventDetails.hostId,
                  userId: user.uid
                }
              });

              showErrorAlert(error, 'Delete Error');
            }
          },
        },
      ]
    );
  });

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
    logger.debug("Contacting host:", eventDetails.host.id);
    alert("Navigate to chat with host: " + eventDetails.host.name);
  };

  // Comment handling functions
  const handleAddComment = withErrorHandling(async () => {
    reset();
    if (!eventDetails || !user || !commentText.trim()) return;
    
    setIsAddingComment(true);
    try {
      const newComment = await addCommentToEventMobile(
        eventDetails.id, 
        commentText.trim(),
        replyingToComment || undefined
      );
      
      if (newComment) {
        // Update local state with new comment
        setEventDetails(prev => prev ? {
          ...prev,
          comments: prev.comments ? [...prev.comments, newComment] : [newComment]
        } : null);
        
        setCommentText('');
        setReplyingToComment(null);
        setShowCommentInput(false);
        Keyboard.dismiss();
        Alert.alert('Success', 'Your comment has been added!');
      }
    } catch (error: any) {
      handleError(error, {
        action: 'addComment',
        metadata: {
          eventId: eventDetails.id,
          commentLength: commentText.length,
          isReply: !!replyingToComment
        }
      });
      showErrorAlert(error, 'Comment Error');
    } finally {
      setIsAddingComment(false);
    }
  });

  const handleDeleteComment = withErrorHandling(async (commentId: string) => {
    reset();
    if (!eventDetails || !user) return;
    
    Alert.alert(
      "Delete Comment",
      "Are you sure you want to delete this comment?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const success = await deleteEventCommentMobile(eventDetails.id, commentId);
              if (success) {
                // Update local state to remove comment
                setEventDetails(prev => prev ? {
                  ...prev,
                  comments: prev.comments?.filter(comment => comment.id !== commentId) || []
                } : null);
                Alert.alert('Success', 'Comment has been deleted.');
              }
            } catch (error: any) {
              handleError(error, {
                action: 'deleteComment',
                metadata: {
                  eventId: eventDetails.id,
                  commentId
                }
              });
              showErrorAlert(error, 'Delete Comment Error');
            }
          }
        }
      ]
    );
  });
  
  const handleReplyToComment = (commentId: string) => {
    setReplyingToComment(commentId);
    setShowCommentInput(true);
  };
  
  const handleRSVPWithStatus = withErrorHandling(async (status: RsvpStatus) => {
    reset();
    if (!eventDetails || !user) return;
    
    // If event allows plus one and user is accepting, show plus one options
    if (status === 'accepted' && eventDetails.allowGuestPlusOne) {
      setShowPlusOneOptions(true);
      return;
    }
    
    // Otherwise, proceed with RSVP directly
    try {
      const success = await rsvpToEventMobile(eventDetails.id, status);
      if (success) {
        setEventDetails(prev => prev ? {...prev, userStatus: status} : null);
        const statusMessage = status === 'accepted' ? "You're going to this event!" :
                             status === 'declined' ? "We'll miss you!" : 
                             "Your response has been recorded.";
        Alert.alert("RSVP Updated", statusMessage);
      }
    } catch (error) {
      handleError(error, {
        action: 'rsvpToEvent',
        metadata: {
          eventId: eventDetails.id,
          status
        }
      });
      showErrorAlert(error, 'RSVP Error');
    }
  });

  const handleConfirmRSVPWithPlusOne = withErrorHandling(async (includePlusOne: boolean) => {
    reset();
    if (!eventDetails || !user) return;
    
    try {
      const success = await rsvpToEventMobile(
        eventDetails.id, 
        'accepted', 
        includePlusOne,
        includePlusOne ? plusOneName.trim() || undefined : undefined
      );
      
      if (success) {
        setEventDetails(prev => prev ? {
          ...prev, 
          userStatus: 'accepted',
          userHasPlusOne: includePlusOne
        } : null);
        setShowPlusOneOptions(false);
        setPlusOneName('');
        Alert.alert("RSVP Confirmed", 
          includePlusOne ? "You and your guest are going to this event!" : "You're going to this event!");
      }
    } catch (error) {
      handleError(error, {
        action: 'rsvpToEvent',
        metadata: {
          eventId: eventDetails.id,
          status: 'accepted',
          plusOne: includePlusOne
        }
      });
      showErrorAlert(error, 'RSVP Error');
    }
  });

  const checkRSVPDeadline = (): { canRSVP: boolean; message?: string } => {
    if (!eventDetails.rsvpDeadline) return { canRSVP: true };
    
    const deadline = toDate(eventDetails.rsvpDeadline);
    const now = new Date();
    
    if (!deadline) return { canRSVP: true };
    
    if (now > deadline) {
      return {
        canRSVP: false,
        message: 'RSVP deadline has passed'
      };
    }
    
    // Show warning if within 24 hours
    const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursLeft <= 24 && hoursLeft > 0) {
      return {
        canRSVP: true,
        message: `RSVP deadline is in ${Math.round(hoursLeft)} hour(s)`
      };
    }
    
    return { canRSVP: true };
  };

  const handleRSVP = withErrorHandling(async () => {
    reset();
    if (!eventDetails || !user) return;
    
    const rsvpCheck = checkRSVPDeadline();
    
    if (!rsvpCheck.canRSVP) {
      Alert.alert('RSVP Closed', rsvpCheck.message || 'RSVP is no longer available for this event.');
      return;
    }
    
    if (rsvpCheck.message) {
      Alert.alert(
        'Deadline Warning',
        rsvpCheck.message + '. Would you like to continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => showRSVPOptions() }
        ]
      );
      return;
    }
    
    showRSVPOptions();
  });
  
  const showRSVPOptions = () => {
    // Show action sheet with RSVP options
    setActionSheetVisible(true);
    const rsvpActions: ActionSheetAction[] = [
      {
        title: "I'm Going",
        icon: "checkmark-circle-outline",
        onPress: () => {
          setActionSheetVisible(false);
          handleRSVPWithStatus('accepted');
        },
      },
      {
        title: "Maybe",
        icon: "help-circle-outline",
        onPress: () => {
          setActionSheetVisible(false);
          handleRSVPWithStatus('maybe');
        },
      },
      {
        title: "I Can't Go",
        icon: "close-circle-outline",
        onPress: () => {
          setActionSheetVisible(false);
          handleRSVPWithStatus('declined');
        },
      },
      {
        title: "Cancel",
        style: "cancel",
        onPress: () => setActionSheetVisible(false),
      },
    ];
    
    // Need to update the action sheet actions
    navigation.setOptions({
      headerRight: () => (
        <AnimatedActionSheet
          isVisible={isActionSheetVisible}
          onClose={() => setActionSheetVisible(false)}
          actions={rsvpActions}
          title="RSVP to Event"
          message="Let the host know if you'll be attending."
        />
      ),
    });
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
    <ErrorBoundary screenName="EventDetailScreen">
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
                {/* RSVP Status Indicator */}
                {eventDetails.userStatus && eventDetails.userStatus !== 'pending' && (
                  <RSVPStatusIndicator 
                    status={eventDetails.userStatus}
                    size="medium"
                    style={{ marginBottom: Spacing.sm }}
                  />
                )}
                
                {/* RSVP Deadline Countdown */}
                {eventDetails.rsvpDeadline && (
                  <RSVPDeadlineCountdown 
                    deadline={eventDetails.rsvpDeadline}
                    style={{ marginBottom: Spacing.sm }}
                  />
                )}
                
                <Button 
                  title={eventDetails.userStatus === 'accepted' ? "You're Going!" : 
                         eventDetails.userStatus === 'declined' ? "Not Going" : 
                         eventDetails.userStatus === 'maybe' ? "Maybe" : "RSVP Now"} 
                  onPress={handleRSVP} 
                  variant="primary"
                  style={styles.rsvpButton}
                  leftIcon={eventDetails.userStatus === 'accepted' ? "checkmark-circle" : 
                           eventDetails.userStatus === 'declined' ? "close-circle" : 
                           eventDetails.userStatus === 'maybe' ? "help-circle" : "calendar"}
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

          {/* RSVP Summary for Hosts */}
          {eventDetails.isHost && eventDetails.attendees && eventDetails.attendees.length > 0 && (
            <RSVPSummary
              data={{
                totalInvited: eventDetails.attendees.length,
                accepted: eventDetails.attendees.filter(a => a.status === 'accepted').length,
                declined: eventDetails.attendees.filter(a => a.status === 'declined').length,
                maybe: eventDetails.attendees.filter(a => a.status === 'maybe').length,
                pending: eventDetails.attendees.filter(a => a.status === 'pending').length,
                plusOnes: eventDetails.attendees.filter(a => a.plusOne).length,
                responseRate: ((eventDetails.attendees.length - eventDetails.attendees.filter(a => a.status === 'pending').length) / eventDetails.attendees.length) * 100,
                estimatedAttendance: eventDetails.attendees.filter(a => a.status === 'accepted').length + (eventDetails.attendees.filter(a => a.status === 'maybe').length * 0.7)
              }}
              style={styles.card}
            />
          )}

          {eventDetails.attendees && eventDetails.attendees.length > 0 && eventDetails.showGuestList && (
            <Card style={styles.card}>
              <Card.Header style={styles.attendeesHeader}>
                <ThemedText variant="h4" style={styles.sectionTitleNoMargin}>Attendees ({eventDetails.attendees.length})</ThemedText>
                {eventDetails.isHost && (
                  <TouchableOpacity 
                    onPress={() => setShowGuestManagement(!showGuestManagement)}
                    style={styles.manageGuestsButton}
                  >
                    <Ionicons 
                      name={showGuestManagement ? "people" : "settings"} 
                      size={20} 
                      color={Colors[scheme].text.link} 
                    />
                    <ThemedText variant="caption" color="link" style={{ marginLeft: Spacing.xs }}>
                      {showGuestManagement ? "Hide" : "Manage"}
                    </ThemedText>
                  </TouchableOpacity>
                )}
              </Card.Header>
              <Card.Content>
                {showGuestManagement && eventDetails.isHost ? (
                  <GuestListManagement
                    eventId={eventDetails.id}
                    isHost={true}
                    allowGuestPlusOne={eventDetails.allowGuestPlusOne}
                    onSendReminder={(userId) => {
                      // TODO: Implement send reminder functionality
                      Alert.alert('Reminder Sent', 'RSVP reminder sent to guest!');
                    }}
                  />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attendeesScrollContainer}>
                    {eventDetails.attendees.map(renderAttendeeAvatar)}
                  </ScrollView>
                )}
              </Card.Content>
            </Card>
          )}

          {/* Comments Section */}
          <Card style={styles.card}>
            <Card.Header style={styles.commentHeader}>
              <ThemedText variant="h4" style={styles.sectionTitleNoMargin}>
                Comments ({eventDetails.comments?.length || 0})
              </ThemedText>
              <TouchableOpacity 
                onPress={() => setShowCommentInput(!showCommentInput)}
                style={styles.addCommentButton}
              >
                <Ionicons 
                  name={showCommentInput ? "close" : "add"} 
                  size={20} 
                  color={Colors[scheme].text.link} 
                />
              </TouchableOpacity>
            </Card.Header>
            <Card.Content>
              {/* Add Comment Input */}
              {showCommentInput && (
                <View style={styles.addCommentContainer}>
                  {replyingToComment && (
                    <View style={styles.replyIndicator}>
                      <ThemedText variant="caption" color="secondary">
                        Replying to comment...
                      </ThemedText>
                      <TouchableOpacity onPress={() => setReplyingToComment(null)}>
                        <Ionicons name="close" size={16} color={Colors[scheme].text.secondary} />
                      </TouchableOpacity>
                    </View>
                  )}
                  <View style={styles.commentInputContainer}>
                    <Avatar 
                      source={user?.photoURL ?? undefined} 
                      fallback={user?.displayName?.substring(0,1) || 'U'} 
                      size="sm" 
                    />
                    <TextInput
                      style={styles.commentInput}
                      placeholder="Write a comment..."
                      placeholderTextColor={Colors[scheme].text.secondary}
                      value={commentText}
                      onChangeText={setCommentText}
                      multiline
                      maxLength={500}
                    />
                    <TouchableOpacity 
                      onPress={handleAddComment}
                      disabled={!commentText.trim() || isAddingComment}
                      style={[
                        styles.sendCommentButton, 
                        (!commentText.trim() || isAddingComment) && styles.sendCommentButtonDisabled
                      ]}
                    >
                      {isAddingComment ? (
                        <ActivityIndicator size="small" color={Colors[scheme].background.primary} />
                      ) : (
                        <Ionicons 
                          name="send" 
                          size={16} 
                          color={Colors[scheme].background.primary} 
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              
              {/* Comments List */}
              {eventDetails.comments && eventDetails.comments.length > 0 ? (
                eventDetails.comments.map(comment => (
                  <View key={comment.id} style={styles.commentItemContainer}>
                    <Avatar 
                      source={comment.user.avatar ?? undefined} 
                      fallback={comment.user.name?.substring(0,1)} 
                      size="sm" 
                    />
                    <View style={styles.commentContent}>
                      <View style={styles.commentHeader}>
                        <ThemedText variant="bodyMedium" style={{ fontWeight: Typography.weight.bold }}>
                          {comment.user.name}
                        </ThemedText>
                        <View style={styles.commentActions}>
                          <TouchableOpacity 
                            onPress={() => handleReplyToComment(comment.id)}
                            style={styles.commentActionButton}
                          >
                            <Ionicons name="arrow-undo-outline" size={14} color={Colors[scheme].text.secondary} />
                          </TouchableOpacity>
                          {(user?.uid === comment.userId || user?.uid === eventDetails.hostId) && (
                            <TouchableOpacity 
                              onPress={() => handleDeleteComment(comment.id)}
                              style={styles.commentActionButton}
                            >
                              <Ionicons name="trash-outline" size={14} color={Colors[scheme].text.error} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      <ThemedText variant="bodySmall" style={styles.commentText}>
                        {comment.text}
                      </ThemedText>
                      <ThemedText variant="caption" color="secondary" style={styles.commentTimestamp}>
                        {formatTimeAgo(toDate(comment.timestamp))}
                      </ThemedText>
                    </View>
                  </View>
                ))
              ) : !showCommentInput ? (
                <View style={styles.noCommentsContainer}>
                  <ThemedText variant="bodyMedium" color="secondary">
                    No comments yet. Be the first to comment!
                  </ThemedText>
                </View>
              ) : null}
            </Card.Content>
          </Card>

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
        
        {/* Plus One Modal */}
        {showPlusOneOptions && (
          <ThemedView style={styles.modalOverlay}>
            <ThemedView style={styles.plusOneModal} variant="primary">
              <ThemedText variant="h3" style={styles.modalTitle}>
                Bring a Guest?
              </ThemedText>
              <ThemedText variant="bodyMedium" color="secondary" style={styles.modalSubtitle}>
                This event allows you to bring a +1 guest
              </ThemedText>
              
              <View style={styles.plusOneInputContainer}>
                <ThemedText variant="bodyMedium" style={styles.inputLabel}>
                  Guest name (optional)
                </ThemedText>
                <TextInput
                  style={styles.plusOneInput}
                  placeholder="Enter guest's name"
                  placeholderTextColor={Colors[scheme].text.secondary}
                  value={plusOneName}
                  onChangeText={setPlusOneName}
                  maxLength={50}
                />
              </View>
              
              <View style={styles.modalButtonContainer}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => handleConfirmRSVPWithPlusOne(false)}
                >
                  <ThemedText variant="bodyMedium" color="secondary">
                    Just Me
                  </ThemedText>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={() => handleConfirmRSVPWithPlusOne(true)}
                >
                  <ThemedText variant="bodyMedium" style={styles.modalButtonText}>
                    Bring Guest
                  </ThemedText>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity 
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowPlusOneOptions(false);
                  setPlusOneName('');
                }}
              >
                <ThemedText variant="bodySmall" color="secondary">
                  Cancel
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        )}
      </Screen>
    </ErrorBoundary>
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
  attendeesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  manageGuestsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.xs,
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
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentActionButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  commentText: {
    marginBottom: Spacing.xs,
  },
  commentTimestamp: {
    marginTop: Spacing.xs,
  },
  addCommentButton: {
    padding: Spacing.xs,
  },
  addCommentContainer: {
    marginBottom: Spacing.md,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.sm,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: BorderRadius.md,
  },
  commentInput: {
    flex: 1,
    marginLeft: Spacing.sm,
    marginRight: Spacing.sm,
    minHeight: 40,
    maxHeight: 120,
    fontSize: 16,
    color: Colors.light.text.primary,
    paddingVertical: Spacing.xs,
  },
  sendCommentButton: {
    backgroundColor: Colors.light.text.link,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: 36,
  },
  sendCommentButtonDisabled: {
    backgroundColor: Colors.light.text.secondary,
    opacity: 0.5,
  },
  replyIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.light.background.tertiary,
    borderRadius: BorderRadius.sm,
  },
  noCommentsContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  plusOneModal: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    maxWidth: 400,
    width: '100%',
    ...Shadows.lg,
  },
  modalTitle: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  modalSubtitle: {
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  plusOneInputContainer: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    marginBottom: Spacing.sm,
    fontWeight: Typography.weight.semiBold,
  },
  plusOneInput: {
    borderWidth: 1,
    borderColor: Colors.light.text.secondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.light.text.primary,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  modalButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: Colors.light.background.tertiary,
    borderWidth: 1,
    borderColor: Colors.light.text.secondary,
  },
  modalButtonPrimary: {
    backgroundColor: Colors.light.text.link,
  },
  modalButtonText: {
    color: Colors.light.background.primary,
    fontWeight: Typography.weight.semiBold,
  },
  modalCancelButton: {
    alignItems: 'center',
    padding: Spacing.sm,
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