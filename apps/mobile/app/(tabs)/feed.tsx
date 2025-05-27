import React, { useState, useCallback, useEffect } from 'react';
import { Alert, View, StyleSheet, Share, TouchableOpacity, Image, Text, ScrollView, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { fetchAccessibleStoriesMobile } from '../../src/lib/storyUtils';
import { getFirebaseDb, getFirebaseAuth } from '../../src/lib/firebase';
import { toDate } from '../../src/lib/dateUtils';
import { useOffline } from '../../src/contexts/OfflineContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FeedCacheService } from '../../src/services/FeedCacheService';

// Import design system components
import Screen from '../../components/ui/Screen';
import EmptyState from '../../components/ui/EmptyState';
import StoryPost from '../../components/ui/StoryPost';
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';
import AnimatedActionSheet from '../../components/ui/AnimatedActionSheet';
import { Ionicons } from '@expo/vector-icons';

// Import design tokens
import { Spacing, BorderRadius, Shadows } from '../../constants/Spacing';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { showErrorAlert } from '../../src/lib/errorUtils';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { OfflineIndicator } from '../../components/ui/OfflineIndicator';
import { SyncStatus } from '../../components/ui/SyncStatus';

import type { Story as StoryType } from '../../src/lib/storyUtils';
import { logger } from '../../src/services/LoggingService';

interface FeedEvent {
  id: string;
  type: 'event';
  name: string; 
  startDate: Date;
  endDate: Date;
  location: string; 
  imageUrl?: string; 
  createdBy?: string; 
  primaryDate: Date; 
}

interface FeedStory extends StoryType {
  type: 'story';
  primaryDate: Date;
}

type FeedItem = FeedStory | FeedEvent;

const FeedScreen = () => {
  logger.debug('--- FeedScreen IS RENDERING ---');
  const router = useRouter();
  const { user, firestoreUser } = useAuth();
  const db = getFirebaseDb();
  const auth = getFirebaseAuth();
  const { isOnline, forceSync } = useOffline();
  const feedCache = FeedCacheService.getInstance();
  
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [isLoadingFromCache, setIsLoadingFromCache] = useState<boolean>(false);
  
  const feedMenuItems: FabMenuItemAction[] = [
    {
      id: 'createStory',
      text: 'Create Story',
      iconName: 'create-outline',
      iconLibrary: 'Ionicons',
      onPress: () => router.push('/(screens)/createStory'),
    },
    {
      id: 'createEvent',
      text: 'Create Event',
      iconName: 'calendar-outline',
      iconLibrary: 'Ionicons',
      onPress: () => router.push('/(screens)/createEvent'),
    },
  ];
  
  // Initialize our error handling hook
  const { handleError, withErrorHandling } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Feed Error',
    trackCurrentScreen: true
  });

  // Load cached data on mount
  useEffect(() => {
    const loadCachedData = async () => {
      if (!user?.uid) return;
      
      setIsLoadingFromCache(true);
      try {
        // Try to load from cache first
        const cachedData = await feedCache.getCachedFeed(user.uid, {});
        if (cachedData && cachedData.length > 0) {
          logger.debug('FeedScreen: Loaded cached data:', cachedData.length, 'items');
          setFeedItems(cachedData as FeedItem[]);
          setIsLoadingFeed(false);
        }
      } catch (error) {
        logger.error('FeedScreen: Error loading cached data:', error);
      } finally {
        setIsLoadingFromCache(false);
      }
    };

    loadCachedData();
  }, [user?.uid]);

  const fetchFeedData = useCallback(async (isRefresh = false) => {
    if (!user?.uid || !firestoreUser?.familyTreeId) {
      setFeedItems([]);
      setIsLoadingFeed(false);
      setIsRefreshing(false);
      return;
    }
    
    // Don't show loading spinner if we already have cached data
    if (!isRefresh && feedItems.length === 0) {
      setIsLoadingFeed(true);
    }

    try {
      // Check if online, if not, use cached data
      if (!isOnline && !isRefresh) {
        logger.debug('FeedScreen: Offline, using cached data');
        const cachedData = await feedCache.getCachedFeed(user.uid, {});
        if (cachedData) {
          setFeedItems(cachedData as FeedItem[]);
        }
        return;
      }

      const stories = await fetchAccessibleStoriesMobile(user.uid, firestoreUser.familyTreeId);
      const mappedStories: FeedStory[] = stories.map(story => {
        let storyCreationDateForSorting: Date;
        const createdAt = story.createdAt; // Cache for clarity

        const dateResult = toDate(createdAt);
        storyCreationDateForSorting = dateResult || new Date(0); // Default to epoch for invalid/missing createdAt
        return {
          ...story,
          type: 'story',
          primaryDate: storyCreationDateForSorting,
        };
      });

      const eventsCollection = await db.collection('events').get();
      const fetchedEvents: FeedEvent[] = eventsCollection.docs.map(doc => {
        const data = doc.data();
        let startDate = new Date();
        if (data.eventDate) {
          const dateResult = toDate(data.eventDate);
          startDate = dateResult || new Date();
          if (data.startTime) {
            const [hours, minutes] = data.startTime.split(':').map(Number);
            startDate.setHours(hours, minutes, 0, 0);
          }
        }
        
        let endDate = new Date(startDate);
        if (data.endDate) {
            const endDateResult = toDate(data.endDate);
            endDate = endDateResult || new Date(startDate);
            if (data.endTime) {
                const [endHours, endMinutes] = data.endTime.split(':').map(Number);
                endDate.setHours(endHours, endMinutes, 0, 0);
            }
        } else if (data.endTime) {
            const [endHours, endMinutes] = data.endTime.split(':').map(Number);
            endDate = new Date(startDate);
            endDate.setHours(endHours, endMinutes, 0, 0);
        }

        // Determine primaryDate for sorting using the event's creation time
        let eventCreationDateForSorting: Date;
        const createdAt = data.createdAt; // Cache for clarity, assuming events have createdAt

        const createdAtResult = toDate(createdAt);
        eventCreationDateForSorting = createdAtResult || new Date(0); // Default to epoch for invalid/missing createdAt

        return {
          id: doc.id,
          type: 'event',
          name: data.title || 'Untitled Event',
          startDate: startDate,
          endDate: endDate,
          location: data.isVirtual ? (data.virtualLink || 'Virtual Event') : (data.location?.address || 'No location'),
          imageUrl: data.coverPhotos && data.coverPhotos.length > 0 ? data.coverPhotos[0] : undefined,
          createdBy: data.hostId,
          primaryDate: eventCreationDateForSorting, // Use creation date for sorting
        };
      });

      const combinedItems = [...mappedStories, ...fetchedEvents];
      combinedItems.sort((a, b) => b.primaryDate.getTime() - a.primaryDate.getTime());
      
      setFeedItems(combinedItems);
      
      // Cache the data for offline access
      await feedCache.cacheFeedData(user.uid, combinedItems);
      logger.debug('FeedScreen: Cached', combinedItems.length, 'feed items');

    } catch (error) {
      // Use our error handler instead of showErrorAlert
      handleError(error, { 
        action: 'fetchFeedData',
        userId: user?.uid,
        familyTreeId: firestoreUser?.familyTreeId
      });
      
      // If online fetch fails, try cache
      if (isOnline) {
        logger.debug('FeedScreen: Online fetch failed, trying cache');
        const cachedData = await feedCache.getCachedFeed(user.uid, {});
        if (cachedData) {
          setFeedItems(cachedData as FeedItem[]);
          Alert.alert('Offline Mode', 'Showing cached content. Pull to refresh when online.');
        }
      }
    } finally {
      setIsLoadingFeed(false);
      setIsRefreshing(false);
    }
  }, [user, firestoreUser, db, isOnline, feedItems.length, feedCache, handleError]);

  useFocusEffect(
    useCallback(() => {
      fetchFeedData();
    }, [fetchFeedData])
  );
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    // If online, trigger sync first
    if (isOnline) {
      try {
        await forceSync();
        logger.debug('FeedScreen: Sync completed, refreshing feed');
      } catch (error) {
        logger.error('FeedScreen: Sync failed:', error);
      }
    }
    
    // Then refresh the feed data
    await fetchFeedData(true);
  };
  
  const handleFeedItemPress = (item: FeedItem) => {
    if (item.type === 'story') {
      router.push({ 
        pathname: '/(screens)/storyDetail', 
        params: { storyId: item.id } 
      });
    } else if (item.type === 'event') {
      router.push({ 
        pathname: '/(screens)/eventDetail',
        params: { eventId: item.id } 
      });
    }
  };
  
  const handleMoreOptions = (item: FeedItem) => {
    setSelectedItem(item);
    setActionSheetVisible(true);
  };
  
  return (
    <ErrorBoundary screenName="FeedScreen">
      <Screen
        safeArea
        scroll={false}
      >
      <OfflineIndicator isOnline={isOnline} />
      {isLoadingFeed && feedItems.length === 0 ? (
        <View style={styles.loadingStateContainer}>
          <EmptyState
            icon="hourglass-outline"
            title="Loading Feed"
            description="Fetching your latest stories and updates..."
            iconSize={50}
          />
        </View>
      ) : feedItems.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <EmptyState
            icon="newspaper-outline"
            title="Your feed is empty"
            description="Create your first story or event to see it here!"
          />
        </View>
      ) : (
        <View style={styles.feedContainer}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Spacing.xl + Spacing.lg }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
              />
            }
          >
            {feedItems.map(item => {
              if (item.type === 'story') {
                return (
                  <StoryPost
                    key={`story-${item.id}`}
                    story={item as StoryType}
                    onPress={() => handleFeedItemPress(item)}
                    onMorePress={() => handleMoreOptions(item)}
                    style={styles.feedItem}
                  />
                );
              } else if (item.type === 'event') {
                const event = item as FeedEvent;
                return (
                  <TouchableOpacity 
                      key={`event-${event.id}`} 
                      style={[styles.feedItem, styles.eventFeedItem]} 
                      onPress={() => handleFeedItemPress(event)}
                  >
                    {event.imageUrl && <Image source={{uri: event.imageUrl}} style={styles.eventFeedImage} />}
                    <View style={styles.eventFeedContent}>
                      <Text style={styles.eventFeedTitle}>{event.name}</Text>
                      <Text style={styles.eventFeedDate}>{event.startDate.toLocaleDateString()} - {event.location}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleMoreOptions(event)} style={styles.moreOptionsButtonEvent}>
                        <Ionicons name="ellipsis-horizontal" size={24} color="#666" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }
              return null;
            })}
          </ScrollView>
        </View>
      )}
      
      <FloatingActionMenu menuItems={feedMenuItems} absolutePosition={false} />
      <AnimatedActionSheet
        isVisible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        title="Options"
        actions={[
          {
            title: 'Share',
            onPress: () => {
              if (selectedItem) {
                const message = selectedItem.type === 'story' 
                  ? `Check out this story: ${(selectedItem as FeedStory).title}`
                  : `Check out this event: ${(selectedItem as FeedEvent).name}`;
                Share.share({ message });
              }
            },
            icon: 'share-outline',
          },
          {
            title: 'Report',
            onPress: () => logger.debug(`Report pressed for ${selectedItem?.type} ${selectedItem?.id}`),
            style: 'destructive',
            icon: 'flag-outline',
          },
          {
            title: 'Cancel',
            onPress: () => setActionSheetVisible(false),
            style: 'cancel',
          },
        ]}
      />
      </Screen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  loadingStateContainer: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 400,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    minHeight: 400,
  },
  feedContainer: {
    flex: 1,
  },
  feedItem: {
    marginBottom: Spacing.sm,
  },
  eventFeedItem: {
    backgroundColor: Colors.light.background.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadows.xs,
  },
  eventFeedImage: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.md,
  },
  eventFeedContent: {
    flex: 1,
  },
  eventFeedTitle: {
    ...Typography.styles.bodyMedium,
    fontWeight: Typography.weight.bold,
    color: Colors.light.text.secondary,
    marginBottom: Spacing.xs,
  },
  eventFeedDate: {
    ...Typography.styles.caption,
    color: Colors.light.text.tertiary,
  },
  moreOptionsButtonEvent: {
    padding: Spacing.sm,
  },
});

export default FeedScreen;