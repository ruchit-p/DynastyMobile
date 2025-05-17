import React, { useState, useCallback } from 'react';
import { Alert, View, StyleSheet, Share, TouchableOpacity, Image, Text } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { fetchAccessibleStoriesMobile } from '../../src/lib/storyUtils';
import { getFirebaseDb, getFirebaseAuth } from '../../src/lib/firebase';
import { Timestamp } from 'firebase/firestore';

// Import design system components
import Screen from '../../components/ui/Screen';
import EmptyState from '../../components/ui/EmptyState';
import StoryPost from '../../components/ui/StoryPost';
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';
import AnimatedActionSheet from '../../components/ui/AnimatedActionSheet';
import { Ionicons } from '@expo/vector-icons';

// Import design tokens
import { Spacing } from '../../constants/Spacing';

import type { Story as StoryType } from '../../src/lib/storyUtils';

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
  console.log('--- FeedScreen IS RENDERING ---');
  const router = useRouter();
  const { user, firestoreUser } = useAuth();
  const db = getFirebaseDb();
  const auth = getFirebaseAuth();
  
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  
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
  
  const fetchFeedData = useCallback(async () => {
    if (!user?.uid || !firestoreUser?.familyTreeId) {
      setFeedItems([]);
      setIsLoadingFeed(false);
      setIsRefreshing(false);
      return;
    }
    setIsLoadingFeed(true);

    try {
      const stories = await fetchAccessibleStoriesMobile(user.uid, firestoreUser.familyTreeId);
      const mappedStories: FeedStory[] = stories.map(story => ({
        ...story,
        type: 'story',
        primaryDate: story.createdAt instanceof Timestamp 
            ? story.createdAt.toDate() 
            : (story.createdAt && typeof story.createdAt === 'object' && 'seconds' in story.createdAt && 'nanoseconds' in story.createdAt) 
                ? new Timestamp(story.createdAt.seconds, story.createdAt.nanoseconds).toDate() 
                : new Date(story.createdAt as any),
      }));

      const eventsCollection = await db.collection('events').get();
      const fetchedEvents: FeedEvent[] = eventsCollection.docs.map(doc => {
        const data = doc.data();
        let startDate = new Date();
        if (data.eventDate) {
          const rawStartDate = data.eventDate instanceof Timestamp 
            ? data.eventDate.toDate() 
            : (data.eventDate && typeof data.eventDate === 'object' && 'seconds' in data.eventDate && 'nanoseconds' in data.eventDate)
                ? new Timestamp(data.eventDate.seconds, data.eventDate.nanoseconds).toDate()
                : new Date(data.eventDate);
          startDate = rawStartDate;
          if (data.startTime) {
            const [hours, minutes] = data.startTime.split(':').map(Number);
            startDate.setHours(hours, minutes, 0, 0);
          }
        }
        
        let endDate = new Date(startDate);
        if (data.endDate) {
            const rawEndDate = data.endDate instanceof Timestamp 
                ? data.endDate.toDate() 
                : (data.endDate && typeof data.endDate === 'object' && 'seconds' in data.endDate && 'nanoseconds' in data.endDate)
                    ? new Timestamp(data.endDate.seconds, data.endDate.nanoseconds).toDate()
                    : new Date(data.endDate);
            endDate = rawEndDate;
            if (data.endTime) {
                const [endHours, endMinutes] = data.endTime.split(':').map(Number);
                endDate.setHours(endHours, endMinutes, 0, 0);
            }
        } else if (data.endTime) {
            const [endHours, endMinutes] = data.endTime.split(':').map(Number);
            endDate = new Date(startDate);
            endDate.setHours(endHours, endMinutes, 0, 0);
        }

        return {
          id: doc.id,
          type: 'event',
          name: data.title || 'Untitled Event',
          startDate: startDate,
          endDate: endDate,
          location: data.isVirtual ? (data.virtualLink || 'Virtual Event') : (data.location?.address || 'No location'),
          imageUrl: data.coverPhotos && data.coverPhotos.length > 0 ? data.coverPhotos[0] : undefined,
          createdBy: data.hostId,
          primaryDate: startDate,
        };
      });

      const combinedItems = [...mappedStories, ...fetchedEvents];
      combinedItems.sort((a, b) => b.primaryDate.getTime() - a.primaryDate.getTime());
      
      setFeedItems(combinedItems);

    } catch (error) {
      console.error("Error fetching feed data: ", error);
      Alert.alert("Error", "Could not fetch feed data.");
    } finally {
      setIsLoadingFeed(false);
      setIsRefreshing(false);
    }
  }, [user, firestoreUser, db]);

  useFocusEffect(
    useCallback(() => {
      fetchFeedData();
    }, [fetchFeedData])
  );
  
  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchFeedData();
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
    <Screen
      safeArea
      scroll={{
        enabled: true,
        refreshing: isRefreshing,
        onRefresh: handleRefresh,
        showsVerticalScrollIndicator: false,
      }}
      padding
    >
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
            onPress: () => console.log(`Report pressed for ${selectedItem?.type} ${selectedItem?.id}`),
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
    paddingBottom: Spacing.xl + Spacing.lg,
  },
  feedItem: {
    marginBottom: Spacing.sm,
  },
  eventFeedItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  eventFeedImage: {
    width: 60,
    height: 60,
    borderRadius: 6,
    marginRight: Spacing.md,
  },
  eventFeedContent: {
    flex: 1,
  },
  eventFeedTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: Spacing.xs,
  },
  eventFeedDate: {
    fontSize: 13,
    color: '#666',
  },
  moreOptionsButtonEvent: {
    padding: Spacing.sm,
  },
});

export default FeedScreen;