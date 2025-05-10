import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, SafeAreaView, Platform, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';
import { emptyStateStyles } from '../../constants/emptyStateConfig';

// Define a type for History items (assuming they are essentially stories)
interface HistoryItemType {
  id: string; // Crucial for navigation to storyDetail
  userAvatar: string;
  userName: string;
  timestamp: string;
  date: string;
  createdAt?: Date; // Add this for more precise chronological sorting if available
  content: string;
  image?: string;
  location?: string;
  commentsCount: number;
  mediaCount: number; // Or likesCount, depending on what this represents
}

// Updated mock data with IDs and more specific content for history context
const mockHistoryItems: HistoryItemType[] = [];

// MARK: - On This Day Section Component (Placeholder)
const OnThisDaySection = () => {
  return (
    <View style={styles.onThisDaySectionContainer}>
      <Text style={styles.onThisDayTitle}>On This Day</Text>
      {/* Placeholder content - replace with actual memories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.onThisDayContent}>
        {[1, 2, 3].map(item => (
          <View key={item} style={styles.onThisDayItem}>
            <Text>Memory {item}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

// MARK: - Scrollable Timeline Component
interface ScrollableTimelineProps {
  historyItems: HistoryItemType[];
  // Add props for onDrag, currentScrollPosition etc. later
}

const ScrollableTimeline: React.FC<ScrollableTimelineProps> = ({ historyItems }) => {
  const [timelineYears, setTimelineYears] = useState<string[]>([]);

  useEffect(() => {
    if (historyItems.length > 0) {
      const years = historyItems
        .map(item => {
          // Assuming item.date is a string like "Oct 25, 2023" or item.createdAt is a Date
          // Prioritize createdAt if it exists and is a Date object
          const dateObj = item.createdAt instanceof Date ? item.createdAt :
                         item.date ? new Date(item.date) : new Date(); // Fallback to current date if no valid date found
          return dateObj.getFullYear().toString();
        })
        .filter((value, index, self) => self.indexOf(value) === index) // Unique years
        .sort((a, b) => parseInt(b) - parseInt(a)); // Sort descending (latest year first)
      setTimelineYears(years);
    } else {
      setTimelineYears([]);
    }
  }, [historyItems]);

  if (historyItems.length === 0) {
    return null; // Don't render timeline if no items
  }

  return (
    <View style={styles.timelineContainer}>
      <View style={styles.timelineTrack}>
        {/* Placeholder for draggable circle - actual implementation later */}
        <View style={styles.timelineDraggableCircle} />
      </View>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.timelineScrollContent}
      >
        {timelineYears.map(year => (
          <TouchableOpacity 
            key={year} 
            style={styles.timelineMarker}
            accessibilityLabel={`Navigate to year ${year}`}
          >
            <Text style={styles.timelineYearText}>{year}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const HistoryScreen = () => {
  const router = useRouter();
  const [historyItems, setHistoryItems] = useState<HistoryItemType[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);

  useFocusEffect(
    React.useCallback(() => {
      // Simulate fetching data
      // Define an empty array with the correct type to ensure no string type issues
      const exampleItems: HistoryItemType[] = [];
      
      /* Example of items if you want to test the timeline populated:
      const exampleItems: HistoryItemType[] = [
        {
          id: '1', 
          userName: 'Test User', 
          userAvatar: '', 
          timestamp: '2h ago', 
          date: '2023-10-26', 
          createdAt: new Date(2023, 9, 26),
          content: 'Post from 2023', 
          commentsCount: 0, 
          mediaCount: 0
        },
        {
          id: '2', 
          userName: 'Test User 2', 
          userAvatar: '', 
          timestamp: '1d ago', 
          date: '2022-05-15', 
          createdAt: new Date(2022, 4, 15),
          content: 'Post from 2022', 
          commentsCount: 0, 
          mediaCount: 0
        },
      ];
      */
      
      setHistoryItems(exampleItems);

      const timer = setTimeout(() => {
        setIsLoadingHistory(false);
      }, 500);
      
      return () => clearTimeout(timer);
    }, [])
  );

  // MARK: - Define Menu Items for History Screen
  const historyMenuItems: FabMenuItemAction[] = [
    {
      id: 'writeStory',
      text: 'Write Story',
      iconName: 'create-outline',
      iconLibrary: 'Ionicons',
      onPress: () => router.push('/(screens)/createStory'),
    },
  ];

  const handleHistoryItemPress = (item: HistoryItemType) => {
    // Assuming history items are stories and navigate to StoryDetailScreen
    router.push({ pathname: '/(screens)/storyDetail', params: { storyId: item.id } });
  };

  if (isLoadingHistory) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0A5C36" />
          <Text style={styles.loadingText}>Loading History...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // New: Overall Empty State if no history items
  if (historyItems.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={emptyStateStyles.emptyStateContainer}> 
          <Ionicons name="newspaper-outline" size={60} color="#CCC" />
          <Text style={emptyStateStyles.emptyStateText}>Your History Book is empty.</Text>
          <Text style={emptyStateStyles.emptyStateSubText}>
            Start by writing your first story or add events to build your family timeline.
          </Text>
        </View>
        {/* FAB Menu can still be shown in empty state */}
        <FloatingActionMenu menuItems={historyMenuItems} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <OnThisDaySection />
      <View style={styles.mainContentContainer}>
        <ScrollView style={styles.postsScrollViewContainer}>
          {historyItems.map((item) => (
            <TouchableOpacity 
              key={item.id} 
              onPress={() => handleHistoryItemPress(item)} 
              style={styles.feedItemContainer}
              accessibilityLabel={`View history post by ${item.userName}`}
            >
              <View style={styles.feedItem}>
                <View style={styles.itemHeader}>
                  <Image 
                    source={{ uri: item.userAvatar || '../../assets/images/avatar-placeholder.png' }} 
                    style={styles.avatar} 
                  />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{item.userName}</Text>
                    <View style={styles.timestampContainer}>
                      <Text style={styles.timestamp}>{item.timestamp}</Text>
                      <View style={styles.dotSeparator} />
                      <Text style={styles.datePill}>{item.date}</Text>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={styles.moreOptionsButton} 
                    onPress={(e) => {
                      e.stopPropagation();
                      Alert.alert('Options', `More options for ${item.id}`);
                    }}
                    accessibilityLabel="More options"
                  >
                    <Ionicons name="ellipsis-horizontal" size={24} color="#888" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.feedContent} numberOfLines={3}>{item.content}</Text>
                {item.image && <Image source={{ uri: item.image }} style={styles.feedImage} />}
                {item.location && (
                  <View style={styles.locationContainer}>
                    <Ionicons name="location-sharp" size={16} color="#555" />
                    <Text style={styles.locationText}>{item.location}</Text>
                  </View>
                )}
                <View style={styles.feedStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="chatbubbles-outline" size={16} color="#555" />
                    <Text style={styles.statText}>{item.commentsCount} Comments</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="images-outline" size={16} color="#555" />
                    <Text style={styles.statText}>{item.mediaCount} Media</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollableTimeline historyItems={historyItems} />
      </View>
      <FloatingActionMenu menuItems={historyMenuItems} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
  loadingContainer: { // Ensure this is centered for the loading state
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', // Match safeArea background
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  // Main content area with posts and timeline
  mainContentContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  postsScrollViewContainer: {
    flex: 3,
    backgroundColor: '#F4F4F4',
  },
  // Updated Styles for ScrollableTimeline
  timelineContainer: {
    flex: 1,
    backgroundColor: '#F0F0F0', // Light gray background for the timeline area
    borderLeftWidth: 1,
    borderLeftColor: '#DCDCDC',
    paddingTop: 10, // Give some space at the top
    alignItems: 'center', // Center the track and scrollview horizontally
  },
  timelineTrack: { // Visual track for the draggable circle
    width: 4, // Width of the line itself
    height: '90%', // Adjust as needed, relative to its scrollable content area
    backgroundColor: '#C0C0C0', // Color of the track line
    borderRadius: 2,
    position: 'absolute',
    left: '50%', // Center the track
    marginLeft: -2, // Half of its width to truly center
    top: '5%', // Align with content
  },
  timelineDraggableCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0A5C36', // Theme color for the circle
    position: 'absolute',
    top: '50%', // Start in the middle, will be dynamic later
    left: '50%',
    marginLeft: -10, // Adjust to center the circle on the track
    marginTop: -10,
    borderWidth: 2,
    borderColor: '#FFFFFF', // White border for better visibility
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  timelineScrollContent: {
    alignItems: 'center', // Ensure years are centered relative to the timeline container
    paddingHorizontal: 10, // Padding for the year text itself
  },
  timelineMarker: {
    alignItems: 'center',
    paddingVertical: 20, // Increased padding for easier tapping and visual separation
  },
  timelineYearText: {
    fontSize: 13, // Slightly smaller
    fontWeight: '600',
    color: '#444',
  },
  // ... (feedItemContainer and other specific item styles remain the same)
  feedItemContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginVertical: 8,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  feedItem: {
    padding: 15,
    borderRadius: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  timestamp: {
    fontSize: 12,
    color: '#777',
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#BBB',
    marginHorizontal: 5,
  },
  datePill: {
    fontSize: 11,
    color: '#006400',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  moreOptionsButton: {
    padding: 5,
  },
  feedContent: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
    marginBottom: 10,
  },
  feedImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 5,
    marginBottom: 10,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 5,
  },
  locationText: {
    fontSize: 13,
    color: '#555',
    marginLeft: 5,
  },
  feedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingVertical: 10, 
    marginTop: 10,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20, 
  },
  statText: {
    marginLeft: 5,
    fontSize: 13,
    color: '#555',
  },
  // Styles for OnThisDaySection
  onThisDaySectionContainer: {
    paddingVertical: 15,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF', // Or theme.colors.background
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0', // Or theme.colors.border
  },
  onThisDayTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333333', // Or theme.colors.text
    marginBottom: 10,
  },
  onThisDayContent: {
    flexDirection: 'row',
  },
  onThisDayItem: {
    width: 120,
    height: 100,
    backgroundColor: '#F0F0F0', // Placeholder
    borderRadius: 8,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default HistoryScreen; 