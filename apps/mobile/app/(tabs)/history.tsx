import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, Platform, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';
import AppHeader from '../../components/ui/AppHeader';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from 'react-native';

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
const OnThisDaySection = ({ themeColors }: { themeColors: typeof Colors.light }) => {
  // Dynamic styles for OnThisDaySection
  const onThisDayStyles = StyleSheet.create({
    sectionContainer: {
      paddingVertical: 15,
      paddingHorizontal: 10,
      backgroundColor: themeColors.surface, // Use theme surface color
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    title: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 10,
      color: themeColors.text, // Use theme text color
    },
    content: {
      flexDirection: 'row',
    },
    item: {
      width: 120,
      height: 120,
      backgroundColor: themeColors.card, // Use theme card color (or a lighter surface)
      borderRadius: 8,
      marginRight: 10,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    itemText: {
      color: themeColors.textSecondary, // Use theme secondary text color
    },
  });

  return (
    <View style={onThisDayStyles.sectionContainer}>
      <Text style={onThisDayStyles.title}>On This Day</Text>
      {/* Placeholder content - replace with actual memories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={onThisDayStyles.content}>
        {[1, 2, 3].map(item => (
          <View key={item} style={onThisDayStyles.item}>
            <Text style={onThisDayStyles.itemText}>Memory {item}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

// MARK: - Scrollable Timeline Component
interface ScrollableTimelineProps {
  historyItems: HistoryItemType[];
  themeColors: typeof Colors.light;
  // Add props for onDrag, currentScrollPosition etc. later
}

const ScrollableTimeline: React.FC<ScrollableTimelineProps> = ({ historyItems, themeColors }) => {
  const [timelineYears, setTimelineYears] = useState<string[]>([]);

  // Dynamic styles for ScrollableTimeline
  const timelineStyles = StyleSheet.create({
    timelineContainer: {
      flex: 1,
      backgroundColor: themeColors.surface, // Light gray background for the timeline area
      borderLeftWidth: 1,
      borderLeftColor: themeColors.border,
      paddingTop: 10, // Give some space at the top
      alignItems: 'center', // Center the track and scrollview horizontally
    },
    timelineTrack: { // Visual track for the draggable circle
      width: 4, // Width of the line itself
      height: '90%', // Adjust as needed, relative to its scrollable content area
      backgroundColor: themeColors.border, // Color of the track line (was #C0C0C0)
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
      backgroundColor: themeColors.primary, // Theme color for the circle (was #0A5C36)
      position: 'absolute',
      top: '50%', // Start in the middle, will be dynamic later
      left: '50%',
      marginLeft: -10, // Adjust to center the circle on the track
      marginTop: -10,
      borderWidth: 2,
      borderColor: themeColors.background, // Use background for border for better visibility (was #FFFFFF)
      shadowColor: themeColors.text, // Use theme text for shadow (was #000)
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
      color: themeColors.textSecondary, // Use theme secondary text (was #444)
    },
  });

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
    <View style={timelineStyles.timelineContainer}>
      <View style={timelineStyles.timelineTrack}>
        {/* Placeholder for draggable circle - actual implementation later */}
        <View style={timelineStyles.timelineDraggableCircle} />
      </View>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={timelineStyles.timelineScrollContent}
      >
        {timelineYears.map(year => (
          <TouchableOpacity 
            key={year} 
            style={timelineStyles.timelineMarker}
            accessibilityLabel={`Navigate to year ${year}`}
          >
            <Text style={timelineStyles.timelineYearText}>{year}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const HistoryScreen = () => {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const currentColors = Colors[colorScheme as 'light' | 'dark'];

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
      // Use View instead of SafeAreaView, AppHeader handles top inset
      <View style={[styles.outerContainer, { backgroundColor: currentColors.background }]}>
        <AppHeader title="History" />
        <View style={[styles.loadingContainer, { backgroundColor: currentColors.background }]}>
          <ActivityIndicator size="large" color={currentColors.primary} />
          <Text style={[styles.loadingText, { color: currentColors.textSecondary }]}>Loading History...</Text>
        </View>
      </View>
    );
  }

  // New: Overall Empty State if no history items
  if (historyItems.length === 0) {
    return (
      // Use View instead of SafeAreaView
      <View style={[styles.outerContainer, { backgroundColor: currentColors.background }]}>
        <AppHeader title="History" />
        <View style={[styles.fullEmptyStateContainer, { backgroundColor: currentColors.background }]}>
          <MaterialCommunityIcons name="book-open-variant" size={70} color={currentColors.textMuted} />
          <Text style={[styles.fullEmptyStateTitle, { color: currentColors.text }]}>Your History Book is Empty</Text>
          <Text style={[styles.fullEmptyStateSubtitle, { color: currentColors.textSecondary }]}>
            Start by writing your first story or add events to build your family timeline.
          </Text>
          <TouchableOpacity 
            style={[styles.fullEmptyStateButton, { backgroundColor: currentColors.primary }]}
            onPress={() => router.push('/(screens)/createStory' as any)} // Added as any for router path
            accessibilityLabel="Create First Story"
          >
            <Ionicons name="add-circle-outline" size={22} color={currentColors.headerText} style={{marginRight: 8}} />
            <Text style={[styles.fullEmptyStateButtonText, { color: currentColors.headerText }]}>Create First Story</Text>
          </TouchableOpacity>
        </View>
        {/* FAB Menu can still be shown in empty state */}
        <FloatingActionMenu menuItems={historyMenuItems} />
      </View>
    );
  }

  return (
    // Use View instead of SafeAreaView
    <View style={[styles.outerContainer, { backgroundColor: currentColors.background }]}>
      <AppHeader title="History" />
      <OnThisDaySection themeColors={currentColors} />
      <View style={styles.mainContentContainer}>
        <ScrollView style={[styles.postsScrollViewContainer, { backgroundColor: currentColors.surface }]}>
          {historyItems.map((item) => (
            <TouchableOpacity 
              key={item.id} 
              onPress={() => handleHistoryItemPress(item)} 
              style={[styles.feedItemContainer, { backgroundColor: currentColors.card, borderColor: currentColors.border }]} // Themed card and border
              accessibilityLabel={`View history post by ${item.userName}`}
            >
              <View style={styles.feedItem}>
                <View style={styles.itemHeader}>
                  <Image 
                    source={{ uri: item.userAvatar || '../../assets/images/avatar-placeholder.png' }} 
                    style={[styles.avatar, { backgroundColor: currentColors.imagePlaceholder }]} // Themed placeholder
                  />
                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, { color: currentColors.text }]}>{item.userName}</Text>
                    <View style={styles.timestampContainer}>
                      <Text style={[styles.timestamp, { color: currentColors.textSecondary }]}>{item.timestamp}</Text>
                      <View style={[styles.dotSeparator, { backgroundColor: currentColors.border }]} />
                      <Text style={[styles.datePill, { color: currentColors.primary, backgroundColor: currentColors.surface }]}>{item.date}</Text>
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
                    <Ionicons name="ellipsis-horizontal" size={24} color={currentColors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.feedContent, { color: currentColors.text }]} numberOfLines={3}>{item.content}</Text>
                {item.image && <Image source={{ uri: item.image }} style={[styles.feedImage, { backgroundColor: currentColors.imagePlaceholder }]} />}
                {item.location && (
                  <View style={styles.locationContainer}>
                    <Ionicons name="location-sharp" size={16} color={currentColors.textSecondary} />
                    <Text style={[styles.locationText, { color: currentColors.textSecondary }]}>{item.location}</Text>
                  </View>
                )}
                <View style={[styles.feedStats, { borderTopColor: currentColors.border }]}>
                  <View style={styles.statItem}>
                    <Ionicons name="chatbubbles-outline" size={16} color={currentColors.textSecondary} />
                    <Text style={[styles.statText, { color: currentColors.textSecondary }]}>{item.commentsCount} Comments</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="images-outline" size={16} color={currentColors.textSecondary} />
                    <Text style={[styles.statText, { color: currentColors.textSecondary }]}>{item.mediaCount} Media</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollableTimeline historyItems={historyItems} themeColors={currentColors} />
      </View>
      <FloatingActionMenu menuItems={historyMenuItems} />
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  fullEmptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  fullEmptyStateTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  fullEmptyStateSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
  },
  fullEmptyStateButton: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    alignItems: 'center',
  },
  fullEmptyStateButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  mainContentContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  postsScrollViewContainer: {
    flex: 3,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 30,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyStateSubText: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  feedItemContainer: {
    borderRadius: 8,
    marginVertical: 8,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
    borderWidth: 1,
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
  },
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  timestamp: {
    fontSize: 12,
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 5,
  },
  datePill: {
    fontSize: 11,
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
    marginLeft: 5,
  },
  feedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
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
  },
});

export default HistoryScreen; 