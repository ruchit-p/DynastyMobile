import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  Text
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

// Import design system components and utilities
import Screen from '../../components/ui/Screen';
import EmptyState from '../../components/ui/EmptyState';
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';
import StoryPost from '../../components/ui/StoryPost';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';

// Import design tokens
import { Spacing } from '../../constants/Spacing';

// Import context and utility functions
import { useAuth } from '../../src/contexts/AuthContext';
import { fetchUserStoriesMobile } from '../../src/lib/storyUtils';
import type { Story } from '../../src/lib/storyUtils';
import { showErrorAlert } from '../../src/lib/errorUtils';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { useOffline } from '../../src/contexts/OfflineContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../src/services/LoggingService';

// Main History Screen
const HistoryScreen = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline, forceSync } = useOffline();
  const [userStories, setUserStories] = useState<Story[]>([]);
  const [isLoadingStories, setIsLoadingStories] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Initialize our error handler
  const { handleError, withErrorHandling } = useErrorHandler({
    title: 'History Error',
  });

  useFocusEffect(
    React.useCallback(() => {
      const fetchStories = async () => {
        setIsLoadingStories(true);
        try {
          if (user?.uid) {
            // Try to get cached data first if offline
            if (!isOnline) {
              const cachedUserStories = await AsyncStorage.getItem(`userStories_${user.uid}`);
              if (cachedUserStories) {
                const cached = JSON.parse(cachedUserStories);
                logger.debug('HistoryScreen: Using cached user stories');
                setUserStories(cached.stories || []);
                setIsLoadingStories(false);
                return;
              }
            }
            
            // If online, fetch fresh data
            if (isOnline) {
              const stories = await fetchUserStoriesMobile(user.uid);
              setUserStories(stories);
              
              // Cache the stories
              await AsyncStorage.setItem(`userStories_${user.uid}`, JSON.stringify({
                stories,
                timestamp: Date.now()
              }));
            } else {
              // Offline with no cache
              setUserStories([]);
            }
          }
        } catch (error) {
          handleError(error, {
            severity: ErrorSeverity.ERROR,
            metadata: {
              action: 'fetchUserStories',
              userId: user?.uid,
              isOffline: !isOnline
            },
            showAlert: true
          });
          
          // Try to use cached data on error
          if (user?.uid) {
            try {
              const cachedUserStories = await AsyncStorage.getItem(`userStories_${user.uid}`);
              if (cachedUserStories) {
                const cached = JSON.parse(cachedUserStories);
                setUserStories(cached.stories || []);
              }
            } catch (cacheError) {
              setUserStories([]);
            }
          }
        } finally {
          setIsLoadingStories(false);
          setIsRefreshing(false);
        }
      };
      fetchStories();
    }, [user, isOnline])
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

  const handleStoryPress = withErrorHandling((story: Story) => {
    router.push({ 
      pathname: '/(screens)/storyDetail', 
      params: { storyId: story.id } 
    });
  });
  
  const handleMoreOptions = withErrorHandling((story: Story) => {
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
          onPress: () => {
            // Implement delete functionality
            Alert.alert('Not Implemented', 'Delete functionality not yet implemented');
          }
        },
        { 
          text: 'Cancel', 
          style: 'cancel' 
        }
      ]
    );
  });
  
  const handleRefresh = withErrorHandling(() => {
    setIsRefreshing(true);
    // Re-fetch stories
    (async () => {
      try {
        // If online, trigger sync first
        if (isOnline) {
          try {
            await forceSync();
            logger.debug('HistoryScreen: Sync completed, refreshing stories');
          } catch (error) {
            logger.error('HistoryScreen: Sync failed:', error);
          }
        }
        
        if (user?.uid) {
          if (isOnline) {
            const stories = await fetchUserStoriesMobile(user.uid);
            setUserStories(stories);
            
            // Update cache
            await AsyncStorage.setItem(`userStories_${user.uid}`, JSON.stringify({
              stories,
              timestamp: Date.now()
            }));
          } else {
            // Offline - just reload from cache
            const cachedUserStories = await AsyncStorage.getItem(`userStories_${user.uid}`);
            if (cachedUserStories) {
              const cached = JSON.parse(cachedUserStories);
              setUserStories(cached.stories || []);
            }
          }
        }
      } catch (error) {
        handleError(error, {
          severity: ErrorSeverity.ERROR,
          metadata: {
            action: 'refreshUserStories',
            userId: user?.uid,
            isOffline: !isOnline
          }
        });
      } finally {
        setIsRefreshing(false);
      }
    })();
  });

  const handleCreateStory = withErrorHandling(() => {
    router.push('/(screens)/createStory');
  });
  
  return (
    <ErrorBoundary screenName="HistoryScreen">
      <Screen
        safeArea
        scroll={false}
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
          />
        </View>
      ) : (
        <View style={styles.storiesContainer}>
          {!isOnline && (
            <View style={styles.offlineIndicator}>
              <Text style={styles.offlineText}>📴 Offline - Showing cached stories</Text>
            </View>
          )}
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
            {userStories.map(story => (
              <StoryPost
                key={story.id}
                story={story}
                onPress={handleStoryPress}
                onMorePress={handleMoreOptions}
                style={styles.storyItem}
              />
            ))}
          </ScrollView>
        </View>
      )}
      
      {/* Floating Action Button Menu - Using fixed positioning */}
      <FloatingActionMenu menuItems={historyMenuItems} absolutePosition={false} />
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
  storiesContainer: {
    flex: 1,
  },
  storyItem: {
    marginBottom: Spacing.sm, // Reduced spacing between posts from md (16) to sm (8)
  },
  offlineIndicator: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FFF3E0',
    marginBottom: 8,
    alignItems: 'center',
  },
  offlineText: {
    fontSize: 14,
    color: '#666',
  },
});

export default HistoryScreen;