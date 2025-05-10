import React, { useState } from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

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
          // Mock data for now (would be replaced with actual API calls)
          // This is just a placeholder for demonstration
          setTimeout(() => {
            setFeedPosts([
              // Example post 1
              {
                id: '1',
                authorId: 'user1',
                authorName: 'John Smith',
                authorAvatar: 'https://randomuser.me/api/portraits/men/32.jpg',
                createdAt: new Date(Date.now() - 3600000), // 1 hour ago
                text: 'Just found these amazing old family photos from the 1950s! Can\'t wait to share these with everyone.',
                imageUrl: 'https://images.unsplash.com/photo-1529932260967-af9d3bbd8138',
                commentsCount: 5,
                likesCount: 12,
              },
              // Example post 2
              {
                id: '2',
                authorId: 'user2',
                authorName: 'Emily Johnson',
                authorAvatar: 'https://randomuser.me/api/portraits/women/44.jpg',
                createdAt: new Date(Date.now() - 86400000), // 1 day ago
                text: "Visited our family's hometown today. So many memories!",
                location: 'Boston, MA',
                commentsCount: 3,
                likesCount: 8,
              },
            ]);
            setIsLoadingFeed(false);
            setIsRefreshing(false);
          }, 1000);
        } catch (error) {
          console.error("Error fetching feed posts: ", error);
          Alert.alert("Error", "Could not fetch feed.");
          setIsLoadingFeed(false);
          setIsRefreshing(false);
        }
      };
      
      fetchPosts();
    }, [])
  );
  
  // Handle refresh
  const handleRefresh = () => {
    setIsRefreshing(true);
    // Re-fetch data (using the same mock implementation for now)
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
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
            actionLabel="Create Story"
            onAction={handleCreateNewStory}
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
    justifyContent: 'center',
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