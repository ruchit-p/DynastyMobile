import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  Alert,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

// Import design system components and utilities
import Screen from '../../components/ui/Screen';
import ThemedText from '../../components/ThemedText';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Avatar from '../../components/ui/Avatar';
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';
import Divider from '../../components/ui/Divider';

// Import design tokens
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { useBorderColor } from '../../hooks/useThemeColor';
import { Colors } from '../../constants/Colors';

// Define a type for History items
interface HistoryItemType {
  id: string;
  userAvatar: string;
  userName: string;
  timestamp: string;
  date: string;
  createdAt?: Date;
  content: string;
  image?: string;
  location?: string;
  commentsCount: number;
  mediaCount: number;
}

// Mock data with empty array (for now)
const mockHistoryItems: HistoryItemType[] = [];

// On This Day Section Component
const OnThisDaySection = () => {
  return (
    <View style={styles.onThisDaySectionContainer}>
      <ThemedText variant="h5" style={styles.onThisDayTitle}>
        On This Day
      </ThemedText>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={styles.onThisDayContent}
      >
        {[1, 2, 3].map(item => (
          <Card key={item} style={styles.onThisDayItem}>
            <ThemedText>Memory {item}</ThemedText>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
};

// Scrollable Timeline Component
interface ScrollableTimelineProps {
  historyItems: HistoryItemType[];
}

const ScrollableTimeline: React.FC<ScrollableTimelineProps> = ({ historyItems }) => {
  const [timelineYears, setTimelineYears] = useState<string[]>([]);
  
  // Get theme colors
  const borderColor = useBorderColor('primary');

  useEffect(() => {
    if (historyItems.length > 0) {
      const years = historyItems
        .map(item => {
          const dateObj = item.createdAt instanceof Date ? item.createdAt :
                         item.date ? new Date(item.date) : new Date();
          return dateObj.getFullYear().toString();
        })
        .filter((value, index, self) => self.indexOf(value) === index)
        .sort((a, b) => parseInt(b) - parseInt(a));
      setTimelineYears(years);
    } else {
      setTimelineYears([]);
    }
  }, [historyItems]);

  if (historyItems.length === 0) {
    return null;
  }

  return (
    <View style={[styles.timelineContainer, { borderLeftColor: borderColor }]}>
      <View style={styles.timelineTrack}>
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
            <ThemedText variant="bodySmall" style={styles.timelineYearText}>
              {year}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

// History Feed Item Component
interface HistoryFeedItemProps {
  item: HistoryItemType;
  onPress: (item: HistoryItemType) => void;
  onMorePress: (item: HistoryItemType) => void;
}

const HistoryFeedItem: React.FC<HistoryFeedItemProps> = ({ 
  item, 
  onPress, 
  onMorePress 
}) => {
  // Get theme colors
  const borderColor = useBorderColor('primary');
  
  const handleMorePress = (e: any) => {
    e.stopPropagation();
    onMorePress(item);
  };
  
  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={0.8}
      accessibilityLabel={`View history post by ${item.userName}`}
    >
      <Card style={styles.feedItemContainer}>
        <View style={styles.feedItem}>
          <View style={styles.itemHeader}>
            <Avatar
              source={item.userAvatar}
              size="sm"
              style={styles.avatar}
            />
            
            <View style={styles.userInfo}>
              <ThemedText variant="bodyMedium" style={styles.userName}>
                {item.userName}
              </ThemedText>
              
              <View style={styles.timestampContainer}>
                <ThemedText variant="caption" color="tertiary" style={styles.timestamp}>
                  {item.timestamp}
                </ThemedText>
                
                <View style={styles.dotSeparator} />
                
                <View style={styles.datePillContainer}>
                  <ThemedText variant="caption" style={styles.datePill}>
                    {item.date}
                  </ThemedText>
                </View>
              </View>
            </View>
            
            <TouchableOpacity 
              style={styles.moreOptionsButton} 
              onPress={handleMorePress}
              accessibilityLabel="More options"
            >
              <Ionicons name="ellipsis-horizontal" size={24} color="#888" />
            </TouchableOpacity>
          </View>
          
          <ThemedText variant="bodyMedium" style={styles.feedContent} numberOfLines={3}>
            {item.content}
          </ThemedText>
          
          {item.image && (
            <Image source={{ uri: item.image }} style={styles.feedImage} />
          )}
          
          {item.location && (
            <View style={styles.locationContainer}>
              <Ionicons name="location-sharp" size={16} color="#555" />
              <ThemedText variant="caption" color="secondary" style={styles.locationText}>
                {item.location}
              </ThemedText>
            </View>
          )}
          
          <Divider />
          
          <View style={styles.feedStats}>
            <View style={styles.statItem}>
              <Ionicons name="chatbubbles-outline" size={16} color="#555" />
              <ThemedText variant="caption" color="secondary" style={styles.statText}>
                {item.commentsCount} Comments
              </ThemedText>
            </View>
            
            <View style={styles.statItem}>
              <Ionicons name="images-outline" size={16} color="#555" />
              <ThemedText variant="caption" color="secondary" style={styles.statText}>
                {item.mediaCount} Media
              </ThemedText>
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

// Main History Screen
const HistoryScreen = () => {
  const router = useRouter();
  const [historyItems, setHistoryItems] = useState<HistoryItemType[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useFocusEffect(
    React.useCallback(() => {
      // Simulate fetching data
      const exampleItems: HistoryItemType[] = [];
      
      setHistoryItems(exampleItems);

      const timer = setTimeout(() => {
        setIsLoadingHistory(false);
        setIsRefreshing(false);
      }, 500);
      
      return () => clearTimeout(timer);
    }, [])
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

  const handleHistoryItemPress = (item: HistoryItemType) => {
    router.push({ 
      pathname: '/(screens)/storyDetail', 
      params: { storyId: item.id } 
    });
  };
  
  const handleMoreOptions = (item: HistoryItemType) => {
    Alert.alert('Options', `More options for ${item.id}`);
  };
  
  const handleRefresh = () => {
    setIsRefreshing(true);
    // Re-fetch data
  };

  if (isLoadingHistory && !isRefreshing) {
    return (
      <Screen>
        <EmptyState
          icon="hourglass-outline"
          title="Loading History"
          description="Please wait while we fetch your family history..."
          iconSize={50}
        />
      </Screen>
    );
  }

  // Empty State
  if (historyItems.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="newspaper-outline"
          title="Your History Book is Empty"
          description="Start by writing your first story or add events to build your family timeline."
          actionLabel="Write a Story"
          onAction={() => router.push('/(screens)/createStory')}
        />
        
        <FloatingActionMenu menuItems={historyMenuItems} />
      </Screen>
    );
  }

  return (
    <Screen
      safeArea
      padding={false}
      scroll={{
        enabled: false,
      }}
    >
      <OnThisDaySection />
      
      <View style={styles.mainContentContainer}>
        <ScrollView 
          style={styles.postsScrollViewContainer}
          showsVerticalScrollIndicator={false}
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
        >
          <View style={styles.feedContainer}>
            {historyItems.map((item) => (
              <HistoryFeedItem
                key={item.id}
                item={item}
                onPress={handleHistoryItemPress}
                onMorePress={handleMoreOptions}
              />
            ))}
          </View>
        </ScrollView>
        
        <ScrollableTimeline historyItems={historyItems} />
      </View>
      
      <FloatingActionMenu menuItems={historyMenuItems} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  mainContentContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  postsScrollViewContainer: {
    flex: 3,
  },
  feedContainer: {
    padding: Spacing.md,
  },
  feedItemContainer: {
    marginBottom: Spacing.md,
  },
  feedItem: {
    padding: Spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatar: {
    marginRight: Spacing.sm,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
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
    backgroundColor: '#BBB',
    marginHorizontal: Spacing.xs,
  },
  datePillContainer: {
    backgroundColor: Colors.palette.dynastyGreen.extraLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  datePill: {
    fontSize: 11,
    color: Colors.palette.dynastyGreen.dark,
  },
  moreOptionsButton: {
    padding: Spacing.xs,
  },
  feedContent: {
    marginBottom: Spacing.sm,
  },
  feedImage: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  locationText: {
    marginLeft: Spacing.xs,
  },
  feedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.xs,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  statText: {
    marginLeft: Spacing.xs,
  },
  onThisDaySectionContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.palette.neutral.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.palette.neutral.lighter,
  },
  onThisDayTitle: {
    marginBottom: Spacing.sm,
  },
  onThisDayContent: {
    flexDirection: 'row',
  },
  onThisDayItem: {
    width: 120,
    height: 100,
    marginRight: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineContainer: {
    flex: 1,
    backgroundColor: Colors.palette.neutral.lightest,
    borderLeftWidth: 1,
    paddingTop: Spacing.sm,
    alignItems: 'center',
  },
  timelineTrack: {
    width: 4,
    height: '90%',
    backgroundColor: Colors.palette.neutral.light,
    borderRadius: 2,
    position: 'absolute',
    left: '50%',
    marginLeft: -2,
    top: '5%',
  },
  timelineDraggableCircle: {
    width: 20,
    height: 20,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.palette.dynastyGreen.dark,
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -10,
    marginTop: -10,
    borderWidth: 2,
    borderColor: Colors.palette.neutral.white,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  timelineScrollContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  timelineMarker: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  timelineYearText: {
    fontWeight: '600',
  },
});

export default HistoryScreen;