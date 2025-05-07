import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, SafeAreaView, Platform, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// Define a more specific type for feed items, assuming they are stories or could be events
interface FeedItemType {
  id: string; // Crucial for navigation to detail views
  type: 'story' | 'event'; // To differentiate if feed shows mixed content
  userAvatar: string;
  userName: string;
  timestamp: string;
  date: string;
  content: string;
  image?: string;
  location?: string;
  commentsCount: number;
  // Add other type-specific fields or make them optional
  // For story specific navigation, ensure 'id' is the storyId
}

const mockFeedItems: FeedItemType[] = [
    // Example Story item (ensure 'id' can be used for storyDetail)
    {
        id: 'story123', // This ID should match a story in mockStoriesDatabase for storyDetail to work
        type: 'story',
        userAvatar: 'https://via.placeholder.com/40/FFD700/000000?Text=M',
        userName: 'Grandma Millie',
        timestamp: '3h ago',
        date: 'Oct 26',
        content: 'Shared her childhood memories on the farm. Tap to read more...',
        image: 'https://via.placeholder.com/600x400/E6E6FA/000000?Text=Farm+View',
        location: 'Sunny Meadows Farm',
        commentsCount: 23,
    },
    // Example Event item (navigation for event detail would be different)
    // {
    //     id: 'eventABC',
    //     type: 'event',
    //     userAvatar: 'https://via.placeholder.com/40/ADD8E6/000000?Text=J',
    //     userName: 'Community Group',
    //     timestamp: 'Upcoming',
    //     date: 'Nov 5',
    //     content: 'Family Reunion BBQ - All are welcome! Click for details.',
    //     image: 'https://via.placeholder.com/600x400/B0E0E6/000000?Text=BBQ+Flyer',
    //     location: 'Central Park Pavilion',
    //     commentsCount: 5, // Or use participantCount for events
    // },
];

const FeedScreen = () => {
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const router = useRouter();

  const handleFeedItemPress = (item: FeedItemType) => {
    if (item.type === 'story') {
      router.push({ pathname: '/(screens)/storyDetail', params: { storyId: item.id } });
    } else if (item.type === 'event') {
      // TODO: Implement navigation to EventDetailScreen if it exists
      // router.push({ pathname: '/(screens)/eventDetail', params: { eventId: item.id } });
      alert(`Navigate to Event ID: ${item.id}`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        {mockFeedItems.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="newspaper-outline" size={60} color="#CCC" />
            <Text style={styles.emptyStateText}>Your feed is empty.</Text>
            <Text style={styles.emptyStateSubText}>
              Create your first story or event to see it here!
            </Text>
          </View>
        ) : (
          mockFeedItems.map((item) => (
            <TouchableOpacity key={item.id} onPress={() => handleFeedItemPress(item)} style={styles.feedItemContainer}>
                <View style={styles.feedItem}>
                <View style={styles.itemHeader}>
                    <Image source={{ uri: item.userAvatar }} style={styles.avatar} />
                    <View style={styles.userInfo}>
                    <Text style={styles.userName}>{item.userName}</Text>
                    <View style={styles.timestampContainer}>
                        <Text style={styles.timestamp}>{item.timestamp}</Text>
                        <View style={styles.dotSeparator} />
                        <Text style={styles.datePill}>{item.date}</Text>
                    </View>
                    </View>
                    <TouchableOpacity style={styles.moreOptionsButton} onPress={(e) => {e.stopPropagation(); alert('More options for ' + item.id);}}>
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
                    {/* Add other stats like likes if available in FeedItemType */}
                </View>
                {/* Removed individual Like/Comment pills from feed item, assumed tap navigates to detail */}
                </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {isMenuVisible && (
        <View style={styles.fabMenu}>
          <TouchableOpacity style={styles.fabMenuItem} onPress={() => { setIsMenuVisible(false); router.push('/(screens)/createStory'); }}>
            <Ionicons name="create-outline" size={20} color="#1A4B44" style={styles.fabMenuItemIcon} />
            <Text style={styles.fabMenuItemText}>Create Story</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fabMenuItem} onPress={() => { setIsMenuVisible(false); router.push('/(screens)/createEvent'); }}>
            <Ionicons name="calendar-outline" size={20} color="#1A4B44" style={styles.fabMenuItemIcon} />
            <Text style={styles.fabMenuItemText}>Create Event</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setIsMenuVisible(!isMenuVisible)}>
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F4F4F4',
  },
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
    marginRight: 15,
  },
  statText: {
    marginLeft: 4,
    fontSize: 13,
    color: '#555',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#555',
    marginTop: 15,
  },
  emptyStateSubText: {
    fontSize: 14,
    color: '#777',
    marginTop: 5,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1A4B44',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  fabMenu: {
    position: 'absolute',
    bottom: 100,
    right: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
    minWidth: 150,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  fabMenuItemIcon: {
    marginRight: 10,
  },
  fabMenuItemText: {
    fontSize: 16,
    color: '#1A4B44',
  },
});

export default FeedScreen; 