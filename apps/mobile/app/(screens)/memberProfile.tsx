import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useNavigation, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../components/ui/AppHeader';
import { Colors } from '../../constants/Colors';
import Fonts from '../../constants/Fonts';
import Layout from '../../constants/Layout';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { getFirebaseDb } from '../../src/lib/firebase';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { fetchAccessibleStoriesMobile } from '../../src/lib/storyUtils';
import { useAuth } from '../../src/contexts/AuthContext';
import { logger } from '../../src/services/LoggingService';

interface MemberProfile {
  id: string;
  name: string;
  profilePictureUrl?: string;
  email?: string;
  phoneNumber?: string;
  dateOfBirth?: FirebaseFirestoreTypes.Timestamp;
  gender?: string;
  bio?: string;
  occupation?: string;
  joinedDate?: FirebaseFirestoreTypes.Timestamp;
  familyRole?: string;
}

interface StoryItem {
  id: string;
  title: string;
  subtitle?: string;
  privacy: 'family' | 'privateAccess' | 'custom';
  createdAt: FirebaseFirestoreTypes.Timestamp;
  authorName: string;
  blocks?: {
    type: string;
    data: any;
  }[];
}

interface EventItem {
  id: string;
  title: string;
  eventDate: FirebaseFirestoreTypes.Timestamp;
  endDate?: FirebaseFirestoreTypes.Timestamp;
  location?: {
    address?: string;
    lat?: number;
    lng?: number;
  };
  description?: string;
  hostId: string;
  rsvpStatus?: 'pending' | 'accepted' | 'declined' | 'maybe';
}

type ActiveTab = 'stories' | 'events';

function MemberProfileScreenContent() {
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string; memberName?: string }>();
  const { user, firestoreUser } = useAuth();

  const { handleError, withErrorHandling, reset: clearError } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Member Profile Error',
    trackCurrentScreen: true
  });

  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('stories');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const memberNameForHeader = params.memberName || profile?.name || 'Profile';

  // Add useEffect for error state reset
  useEffect(() => {
    clearError();
  }, [clearError]);

  const fetchMemberData = useCallback(withErrorHandling(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!params.userId) {
        const errorMsg = 'No member ID provided';
        setError(errorMsg);
        handleError(new Error(errorMsg), { 
          missingData: 'userId',
          params: Object.keys(params)
        });
        return;
      }

      const db = getFirebaseDb();
      
      // Fetch user profile
      const userDoc = await db.collection('users').doc(params.userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data();
      if (userData) {
        setProfile({
          id: params.userId,
          name: userData.displayName || userData.name || 'Unknown User',
          profilePictureUrl: userData.profilePictureUrl || userData.photoURL,
          email: userData.email,
          phoneNumber: userData.phoneNumber,
          dateOfBirth: userData.dateOfBirth,
          gender: userData.gender,
          bio: userData.bio,
          occupation: userData.occupation,
          joinedDate: userData.createdAt,
          familyRole: userData.familyRole,
        });
      }
      
      // Fetch user's stories
      if (firestoreUser?.familyTreeId) {
        try {
          const storiesQuery = await db
            .collection('stories')
            .where('authorID', '==', params.userId)
            .where('familyTreeId', '==', firestoreUser.familyTreeId)
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();
          
          const fetchedStories: StoryItem[] = storiesQuery.docs.map(doc => ({
            id: doc.id,
            ...doc.data() as any,
          }));
          
          setStories(fetchedStories);
        } catch (storyError) {
          logger.error('Error fetching stories:', storyError);
          // Continue without stories rather than failing entirely
        }
      }
      
      // Fetch user's events
      if (user?.uid) {
        try {
          const eventsQuery = await db
            .collection('events')
            .where('hostId', '==', params.userId)
            .orderBy('eventDate', 'desc')
            .limit(10)
            .get();
          
          const fetchedEvents: EventItem[] = eventsQuery.docs.map(doc => ({
            id: doc.id,
            ...doc.data() as any,
          }));
          
          // Also fetch events where user is invited
          const invitedEventsQuery = await db
            .collection('events')
            .where('invitedMembers', 'array-contains', params.userId)
            .orderBy('eventDate', 'desc')
            .limit(10)
            .get();
          
          const invitedEvents: EventItem[] = invitedEventsQuery.docs.map(doc => ({
            id: doc.id,
            ...doc.data() as any,
          }));
          
          // Combine and deduplicate events
          const allEvents = [...fetchedEvents, ...invitedEvents];
          const uniqueEvents = Array.from(new Map(allEvents.map(event => [event.id, event])).values());
          
          setEvents(uniqueEvents);
        } catch (eventError) {
          logger.error('Error fetching events:', eventError);
          // Continue without events rather than failing entirely
        }
      }
      
    } catch (fetchError) {
      logger.error('Error fetching member data:', fetchError);
      const errorMsg = 'Failed to load profile data';
      setError(errorMsg);
      handleError(fetchError, {
        operation: 'fetchMemberData',
        userId: params.userId,
        memberName: params.memberName
      });
    } finally {
      setIsLoading(false);
    }
  }, { operation: 'fetchMemberData' }), [params.userId, params.memberName, user, firestoreUser, withErrorHandling, handleError]);

  useEffect(() => {
    fetchMemberData();
  }, [fetchMemberData]);

  const handleStoryPress = withErrorHandling(async (storyId: string) => {
    try {
      router.push({
        pathname: '/(screens)/storyDetail',
        params: { storyId }
      });
    } catch (error) {
      handleError(error, {
        operation: 'navigateToStory',
        storyId,
        userId: params.userId
      });
    }
  }, { operation: 'handleStoryPress' });

  const handleEventPress = withErrorHandling(async (eventId: string) => {
    try {
      router.push({
        pathname: '/(screens)/eventDetail',
        params: { eventId }
      });
    } catch (error) {
      handleError(error, {
        operation: 'navigateToEvent',
        eventId,
        userId: params.userId
      });
    }
  }, { operation: 'handleEventPress' });

  const handleTabChange = withErrorHandling(async (tab: ActiveTab) => {
    try {
      setActiveTab(tab);
    } catch (error) {
      handleError(error, {
        operation: 'tabChange',
        newTab: tab,
        previousTab: activeTab
      });
    }
  }, { operation: 'handleTabChange' });

  const renderContent = () => {
    if (isLoading) {
      return <ActivityIndicator size="large" color={Colors.light.tint} style={styles.loader} />;
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchMemberData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (activeTab === 'stories') {
      if (stories.length === 0) {
        return <Text style={styles.emptyStateText}>No stories shared yet.</Text>;
      }
      return stories.map(story => {
        // Extract first image from story blocks if available
        let firstImageUrl: string | undefined;
        if (story.blocks) {
          const imageBlock = story.blocks.find(block => 
            block.type === 'image' && block.data && Array.isArray(block.data) && block.data.length > 0
          );
          if (imageBlock && Array.isArray(imageBlock.data) && imageBlock.data[0]?.uri) {
            firstImageUrl = imageBlock.data[0].uri;
          }
        }
        
        return (
          <TouchableOpacity key={story.id} style={styles.contentItem} onPress={() => handleStoryPress(story.id)}>
            {firstImageUrl && <Image source={{ uri: firstImageUrl }} style={styles.itemImage} />}
            <View style={styles.itemTextContainer}>
              <Text style={styles.itemTitle}>{story.title}</Text>
              {story.subtitle && <Text style={styles.itemSubtitle}>{story.subtitle}</Text>}
              <Text style={styles.itemDate}>
                {story.createdAt?.toDate ? story.createdAt.toDate().toLocaleDateString() : 'Unknown date'}
              </Text>
            </View>
          </TouchableOpacity>
        );
      });
    }

    if (activeTab === 'events') {
      if (events.length === 0) {
        return <Text style={styles.emptyStateText}>No events found.</Text>;
      }
      return events.map(event => (
        <TouchableOpacity key={event.id} style={styles.contentItem} onPress={() => handleEventPress(event.id)}>
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>{event.title}</Text>
            <Text style={styles.itemSubtitle}>
              {event.location?.address || 'No location set'}
            </Text>
            <Text style={styles.itemDate}>
              {event.eventDate?.toDate ? event.eventDate.toDate().toLocaleDateString() : 'Unknown date'}
            </Text>
            {event.rsvpStatus && (
              <Text style={[styles.rsvpStatus, styles[`rsvpStatus${event.rsvpStatus}`]]}>
                {event.rsvpStatus.charAt(0).toUpperCase() + event.rsvpStatus.slice(1)}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      ));
    }
    return null;
  };

  const handleBackPress = withErrorHandling(async () => {
    try {
      navigation.goBack();
    } catch (error) {
      handleError(error, {
        operation: 'navigation',
        action: 'goBack'
      });
    }
  }, { operation: 'handleBackPress' });

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title={memberNameForHeader}
        showBackButton={true}
        onBackPress={handleBackPress}
      />
      <ScrollView style={styles.container}>
        <View style={styles.profileHeader}>
          <Image
            source={{ uri: profile?.profilePictureUrl || 'https://via.placeholder.com/150/CCCCCC/808080?Text=User+Photo' }}
            style={styles.profilePic}
          />
          <Text style={styles.profileName}>{profile?.name || 'Loading...'}</Text>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'stories' && styles.activeTabButton]}
            onPress={() => handleTabChange('stories')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'stories' && styles.activeTabButtonText]}>Stories</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'events' && styles.activeTabButton]}
            onPress={() => handleTabChange('events')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'events' && styles.activeTabButtonText]}>Events</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.contentContainer}>
          {renderContent()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.background, // Use theme color
  },
  container: {
    flex: 1,
  },
  loader: {
    marginTop: 50,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: Layout.spacing.large, // Use theme spacing
    backgroundColor: Colors.light.cardBackground, // Use theme color
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.separator,
  },
  profilePic: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: Layout.spacing.medium,
    borderWidth: 3,
    borderColor: Colors.light.primary, // Use theme color
  },
  profileName: {
    fontSize: Fonts.size.h2, // Use theme font size
    fontWeight: Fonts.weight.bold, // Use theme font weight
    color: Colors.light.text,
  },
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.light.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.separator,
    paddingVertical: Layout.spacing.small,
  },
  tabButton: {
    paddingVertical: Layout.spacing.medium,
    paddingHorizontal: Layout.spacing.large,
    borderRadius: Layout.borderRadius.medium,
  },
  activeTabButton: {
    borderBottomWidth: 3,
    borderBottomColor: Colors.light.tint, // Active tab indicator
  },
  tabButtonText: {
    fontSize: Fonts.size.medium,
    fontWeight: Fonts.weight.medium,
    color: Colors.light.textSecondary,
  },
  activeTabButtonText: {
    color: Colors.light.tint,
    fontWeight: Fonts.weight.bold,
  },
  contentContainer: {
    padding: Layout.spacing.medium,
  },
  contentItem: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: Layout.borderRadius.medium,
    padding: Layout.spacing.medium,
    marginBottom: Layout.spacing.medium,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    flexDirection: 'row', // For image and text side by side
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: Layout.borderRadius.small,
    marginRight: Layout.spacing.medium,
  },
  itemTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: Fonts.size.large,
    fontWeight: Fonts.weight.bold,
    color: Colors.light.text,
    marginBottom: Layout.spacing.small / 2,
  },
  itemSubtitle: {
    fontSize: Fonts.size.medium,
    color: Colors.light.textSecondary,
    marginBottom: Layout.spacing.small / 2,
  },
  itemDate: {
    fontSize: Fonts.size.small,
    color: Colors.light.textMuted,
  },
  emptyStateText: {
    textAlign: 'center',
    fontSize: Fonts.size.medium,
    color: Colors.light.textSecondary,
    marginTop: Layout.spacing.xlarge,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Layout.spacing.xlarge,
  },
  errorText: {
    fontSize: Fonts.size.medium,
    color: Colors.light.error,
    textAlign: 'center',
    marginBottom: Layout.spacing.medium,
  },
  retryButton: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: Layout.spacing.large,
    paddingVertical: Layout.spacing.medium,
    borderRadius: Layout.borderRadius.medium,
  },
  retryButtonText: {
    color: Colors.light.background,
    fontSize: Fonts.size.medium,
    fontWeight: Fonts.weight.medium,
  },
  rsvpStatus: {
    fontSize: Fonts.size.small,
    fontWeight: Fonts.weight.medium,
    marginTop: Layout.spacing.small / 2,
  },
  rsvpStatuspending: {
    color: '#FFA500', // Orange
  },
  rsvpStatusaccepted: {
    color: '#4CAF50', // Green
  },
  rsvpStatusdeclined: {
    color: '#F44336', // Red
  },
  rsvpStatusmaybe: {
    color: '#2196F3', // Blue
  },
});

// Wrap the main component in ErrorBoundary
export default function MemberProfileScreen() {
  return (
    <ErrorBoundary screenName="MemberProfileScreen">
      <MemberProfileScreenContent />
    </ErrorBoundary>
  );
} 