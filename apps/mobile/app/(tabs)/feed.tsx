import React, { useState } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { fetchAccessibleStoriesMobile } from '../../src/lib/storyUtils';

// Import design system components
import Screen from '../../components/ui/Screen';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import FeedCard, { Post } from '../../components/ui/feed/FeedCard';
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';

// Import design tokens
import { Spacing } from '../../constants/Spacing';

const FeedScreen = () => {
  const router = useRouter();
  const { user, firestoreUser } = useAuth();
  
  // State for feed posts and loading state
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  
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
            setFeedPosts([]);
            return;
          }
          const stories = await fetchAccessibleStoriesMobile(user.uid, firestoreUser.familyTreeId);
          const mapped = stories.map(story => {
            const textBlock = story.blocks.find(b => b.type === 'text');
            const imageBlock = story.blocks.find(b => b.type === 'image');
            return {
              id: story.id,
              authorId: story.authorID,
              createdAt: new Date(story.createdAt.seconds * 1000),
              text: typeof textBlock?.data === 'string' ? textBlock.data : undefined,
              imageUrl: Array.isArray(imageBlock?.data) ? imageBlock.data[0] : undefined,
              location: story.location?.address,
              authorName: '', // To implement: fetch author info
              authorAvatar: undefined,
              commentsCount: story.commentCount || 0,
              likesCount: story.likeCount || 0,
            } as Post;
          });
          setFeedPosts(mapped);
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
          const mapped = stories.map(story => {
            const textBlock = story.blocks.find(b => b.type === 'text');
            const imageBlock = story.blocks.find(b => b.type === 'image');
            return {
              id: story.id,
              authorId: story.authorID,
              createdAt: new Date(story.createdAt.seconds * 1000),
              text: typeof textBlock?.data === 'string' ? textBlock.data : undefined,
              imageUrl: Array.isArray(imageBlock?.data) ? imageBlock.data[0] : undefined,
              location: story.location?.address,
              authorName: '',
              authorAvatar: undefined,
              commentsCount: story.commentCount || 0,
              likesCount: story.likeCount || 0,
            } as Post;
          });
          setFeedPosts(mapped);
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
  const handleFeedItemPress = (item: Post) => {
    router.push({ 
      pathname: '/(screens)/storyDetail', 
      params: { storyId: item.id } 
    });
  };
  
  // Handle more options press
  const handleMoreOptions = (item: Post) => {
    Alert.alert(
      "Options",
      `Actions for post ${item.id}`,
      [
        { text: "Share", onPress: () => console.log("Share pressed") },
        { text: "Report", onPress: () => console.log("Report pressed") },
        { text: "Cancel", style: "cancel" }
      ]
    );
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
      {isLoadingFeed && feedPosts.length === 0 ? (
        <View style={styles.loadingStateContainer}>
          <EmptyState
            icon="hourglass-outline"
            title="Loading Feed"
            description="Fetching your latest stories and updates..."
            iconSize={50}
          />
        </View>
      ) : feedPosts.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <EmptyState
            icon="newspaper-outline"
            title="Your feed is empty"
            description="Create your first story or connect with family!"
          />
        </View>
      ) : (
        <View style={styles.feedContainer}>
          {feedPosts.map((post) => (
            <FeedCard
              key={post.id}
              post={post}
              onPress={handleFeedItemPress}
              onMorePress={handleMoreOptions}
              style={styles.feedItem}
            />
          ))}
        </View>
      )}
      
      {/* Floating Action Button Menu */}
      <FloatingActionMenu menuItems={feedMenuItems} />
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
    paddingBottom: Spacing.xl, // Extra padding at bottom for FAB
  },
  feedItem: {
    marginBottom: Spacing.md,
  },
});

export default FeedScreen;