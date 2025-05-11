import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Alert,
  Platform,
  RefreshControl
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

// Import design system components and utilities
import Screen from '../../components/ui/Screen';
import EmptyState from '../../components/ui/EmptyState';
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';
import StoryPost from '../../components/ui/StoryPost';

// Import design tokens
import { Spacing } from '../../constants/Spacing';

// Import context and utility functions
import { useAuth } from '../../src/contexts/AuthContext';
import { fetchUserStoriesMobile } from '../../src/lib/storyUtils';
import type { Story } from '../../src/lib/storyUtils';

// Main History Screen
const HistoryScreen = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [userStories, setUserStories] = useState<Story[]>([]);
  const [isLoadingStories, setIsLoadingStories] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useFocusEffect(
    React.useCallback(() => {
      const fetchStories = async () => {
        setIsLoadingStories(true);
        try {
          if (user?.uid) {
            const stories = await fetchUserStoriesMobile(user.uid);
            setUserStories(stories);
          }
        } catch (error) {
          console.error('Error fetching user stories:', error);
          Alert.alert('Error', 'Could not fetch your stories. Please try again later.');
        } finally {
          setIsLoadingStories(false);
          setIsRefreshing(false);
        }
      };
      fetchStories();
    }, [user])
  );

  // Menu items for History Screen
  const historyMenuItems: FabMenuItemAction[] = [
    {
      id: 'writeStory',
      text: 'Write Story',
      iconName: 'create-outline',
      iconLibrary: 'Ionicons',
      onPress: () => router.push('/(screens)/createStory'),
    },
  ];

  const handleStoryPress = (story: Story) => {
    router.push({ 
      pathname: '/(screens)/storyDetail', 
      params: { storyId: story.id } 
    });
  };
  
  const handleMoreOptions = (story: Story) => {
    Alert.alert(
      'Story Options',
      '',
      [
        { 
          text: 'View Story', 
          onPress: () => handleStoryPress(story) 
        },
        { 
          text: 'Edit Story', 
          onPress: () => router.push({ 
            pathname: '/(screens)/createStory', 
            params: { storyId: story.id, mode: 'edit' } 
          })
        },
        { 
          text: 'Delete Story', 
          style: 'destructive',
          onPress: () => console.log('Delete story', story.id) // Implement delete functionality
        },
        { 
          text: 'Cancel', 
          style: 'cancel' 
        }
      ]
    );
  };
  
  const handleRefresh = () => {
    setIsRefreshing(true);
    // Re-fetch stories
    (async () => {
      try {
        if (user?.uid) {
          const stories = await fetchUserStoriesMobile(user.uid);
          setUserStories(stories);
        }
      } catch (error) {
        console.error('Error refreshing user stories:', error);
        Alert.alert('Error', 'Could not refresh your stories. Please try again later.');
      } finally {
        setIsRefreshing(false);
      }
    })();
  };

  const handleCreateStory = () => {
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
      {isLoadingStories && userStories.length === 0 ? (
        <View style={styles.loadingStateContainer}>
          <EmptyState
            icon="hourglass-outline"
            title="Loading Stories"
            description="Fetching your stories..."
            iconSize={50}
          />
        </View>
      ) : userStories.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <EmptyState
            icon="book-outline"
            title="No Stories Yet"
            description="Your personal history book is empty. Create your first story to get started!"
            actionLabel="Create Story"
            onAction={handleCreateStory}
          />
        </View>
      ) : (
        <View style={styles.storiesContainer}>
          {userStories.map(story => (
            <StoryPost
              key={story.id}
              story={story}
              onPress={handleStoryPress}
              onMorePress={handleMoreOptions}
              style={styles.storyItem}
            />
          ))}
        </View>
      )}
      
      {/* Floating Action Button Menu */}
      <FloatingActionMenu menuItems={historyMenuItems} />
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
  storiesContainer: {
    paddingBottom: Spacing.xl, // Extra padding at bottom for FAB
  },
  storyItem: {
    marginBottom: Spacing.md,
  },
});

export default HistoryScreen;