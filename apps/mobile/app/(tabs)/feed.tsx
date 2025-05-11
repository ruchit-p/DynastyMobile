import React, { useState } from 'react';
import { Alert, View, StyleSheet, Share } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { fetchAccessibleStoriesMobile } from '../../src/lib/storyUtils';

// Import design system components
import Screen from '../../components/ui/Screen';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import StoryPost from '../../components/ui/StoryPost';
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';
import AnimatedActionSheet from '../../components/ui/AnimatedActionSheet';

// Import design tokens
import { Spacing } from '../../constants/Spacing';

import type { Story } from '../../src/lib/storyUtils';

const FeedScreen = () => {
  const router = useRouter();
  const { user, firestoreUser } = useAuth();
  
  // State for feed posts and loading state
  const [feedStories, setFeedStories] = useState<Story[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  
  // Define menu items for floating action button
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
  
  // Load feed data when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      const fetchPosts = async () => {
        setIsLoadingFeed(true);
        try {
          if (!user?.uid || !firestoreUser?.familyTreeId) {
            setFeedStories([]);
            return;
          }
          const stories = await fetchAccessibleStoriesMobile(user.uid, firestoreUser.familyTreeId);
          setFeedStories(stories);
        } catch (error) {
          console.error("Error fetching feed posts: ", error);
          Alert.alert("Error", "Could not fetch feed.");
        } finally {
          setIsLoadingFeed(false);
          setIsRefreshing(false);
        }
      };
      fetchPosts();
    }, [user, firestoreUser])
  );
  
  // Handle refresh
  const handleRefresh = () => {
    setIsRefreshing(true);
    // Re-fetch data
    (async () => {
      try {
        if (user?.uid && firestoreUser?.familyTreeId) {
          const stories = await fetchAccessibleStoriesMobile(user.uid, firestoreUser.familyTreeId);
          setFeedStories(stories);
        }
      } catch (error) {
        console.error("Error refreshing feed posts: ", error);
        Alert.alert("Error", "Could not refresh feed.");
      } finally {
        setIsRefreshing(false);
      }
    })();
  };
  
  // Handle feed item press
  const handleFeedItemPress = (story: Story) => {
    router.push({ 
      pathname: '/(screens)/storyDetail', 
      params: { storyId: story.id } 
    });
  };
  
  // Handle more options press
  const handleMoreOptions = (story: Story) => {
    setSelectedStory(story);
    setActionSheetVisible(true);
  };
  
  // Create New Story button for empty state
  const handleCreateNewStory = () => {
    router.push('/(screens)/createStory');
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
      {isLoadingFeed && feedStories.length === 0 ? (
        <View style={styles.loadingStateContainer}>
          <EmptyState
            icon="hourglass-outline"
            title="Loading Feed"
            description="Fetching your latest stories and updates..."
            iconSize={50}
          />
        </View>
      ) : feedStories.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <EmptyState
            icon="newspaper-outline"
            title="Your feed is empty"
            description="Create your first story or connect with family!"
          />
        </View>
      ) : (
        <View style={styles.feedContainer}>
          {feedStories.map(story => (
            <StoryPost
              key={story.id}
              story={story}
              onPress={handleFeedItemPress}
              onMorePress={handleMoreOptions}
              style={styles.feedItem}
            />
          ))}
        </View>
      )}
      
      {/* Floating Action Button Menu - Using fixed positioning */}
      <FloatingActionMenu menuItems={feedMenuItems} absolutePosition={false} />
      <AnimatedActionSheet
        isVisible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        title="Options"
        actions={[
          {
            title: 'Share',
            onPress: () => {
              if (selectedStory) {
                Share.share({ message: `Check out this story: ${selectedStory.id}` });
              }
            },
            icon: 'share-outline',
          },
          {
            title: 'Report',
            onPress: () => console.log(`Report pressed for ${selectedStory?.id}`),
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
    paddingBottom: Spacing.xl + Spacing.lg, // Extra padding at bottom for FAB and to ensure last post is fully visible
  },
  feedItem: {
    marginBottom: Spacing.sm, // Reduced spacing between posts from md (16) to sm (8)
  },
});

export default FeedScreen;