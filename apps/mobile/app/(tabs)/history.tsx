import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, SafeAreaView, Platform, TouchableOpacity, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// Define a type for History items (assuming they are essentially stories)
interface HistoryItemType {
  id: string; // Crucial for navigation to storyDetail
  userAvatar: string;
  userName: string;
  timestamp: string;
  date: string;
  content: string;
  image?: string;
  location?: string;
  commentsCount: number;
  mediaCount: number; // Or likesCount, depending on what this represents
}

// Updated mock data with IDs and more specific content for history context
const mockHistoryItems: HistoryItemType[] = [
    {
        id: 'story789', // This ID should match a story in mockStoriesDatabase for storyDetail to work
        userAvatar: 'https://via.placeholder.com/40/ADD8E6/000000?Text=J',
        userName: 'Uncle John',
        timestamp: '1 day ago',
        date: 'Oct 25, 2023',
        content: 'Recalled his first fishing trip with Dad. A cherished memory of learning and bonding...',
        image: 'https://via.placeholder.com/600x400/B0E0E6/000000?Text=Fishing+at+Pond',
        location: "Miller's Pond",
        commentsCount: 12,
        mediaCount: 1, // e.g., 1 image
    },
    // Add more mock history items if desired
];

const HistoryScreen = () => {
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const router = useRouter();

  const handleHistoryItemPress = (item: HistoryItemType) => {
    // Assuming history items are stories and navigate to StoryDetailScreen
    router.push({ pathname: '/(screens)/storyDetail', params: { storyId: item.id } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        {mockHistoryItems.length > 0 ? (
          mockHistoryItems.map((item) => (
            <TouchableOpacity key={item.id} onPress={() => handleHistoryItemPress(item)} style={styles.feedItemContainer}>
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
                  <View style={styles.statItem}>
                    <Ionicons name="images-outline" size={16} color="#555" />
                    <Text style={styles.statText}>{item.mediaCount} Media</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyStateContainer}>
            <MaterialCommunityIcons name="book-open-variant" size={60} color="#CCC" />
            <Text style={styles.emptyStateText}>Your history book is empty.</Text>
            <Text style={styles.emptyStateSubText}>Start by writing your first story!</Text>
          </View>
        )}
      </ScrollView>

      {isMenuVisible && (
        <View style={styles.fabMenu}>
          <TouchableOpacity 
            style={styles.fabMenuItem} 
            onPress={() => { 
              setIsMenuVisible(false); 
              router.push('/(screens)/createStory');
            }}
          >
            <Ionicons name="create-outline" size={20} color="#1A4B44" style={styles.fabMenuItemIcon} />
            <Text style={styles.fabMenuItemText}>Write Story</Text>
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
    // paddingTop: Platform.OS === 'android' ? 25 : 0, // Handled by SafeAreaView for iOS
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
    paddingVertical: 10, // Unified padding
    marginTop: 10,
    // Removed bottom border and margin, as feedActions are removed
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20, // Increased spacing
  },
  statText: {
    marginLeft: 5,
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

export default HistoryScreen; 