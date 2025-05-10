import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, SafeAreaView, Platform, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
// import { auth, db } from '../../src/lib/firebase'; // Commented out Firebase
// import { collection, query, orderBy, limit, getDocs, Timestamp, doc, getDoc } from 'firebase/firestore'; // Commented out Firebase
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';

// Define the structure for a Post fetched from Firestore
interface Post {
  id: string;
  authorId: string;
  createdAt: Date; // Converted from Timestamp
  text?: string;
  imageUrl?: string;
  location?: string;
  // Denormalized author data (optional but improves performance)
  authorName?: string; 
  authorAvatar?: string;
  // Add other fields like likesCount, commentsCount if stored directly
  commentsCount?: number;
}

const FeedScreen = () => {
  const router = useRouter();

  // const [feedPosts, setFeedPosts] = useState<Post[]>([]); // State for posts // Commented out
  // const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true); // Loading state // Commented out

  // Initialize with mock data
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true); // Set to true initially

  // MARK: - Define Menu Items for Feed Screen
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

  // Fetch feed posts
  useFocusEffect(
    React.useCallback(() => {
      // const fetchPosts = async () => { // Firebase fetching logic commented out
        // setIsLoadingFeed(true);
        // try {
          // const postsRef = collection(db, "posts"); // Assuming collection name is 'posts'
          // // TODO: Add filtering logic (e.g., fetch posts from connections only)
          // // TODO: Implement pagination (e.g., using limit() and startAfter())
          // const q = query(postsRef, orderBy("createdAt", "desc"), limit(20)); // Fetch latest 20
          
          // const querySnapshot = await getDocs(q);
          // const fetchedPosts: Post[] = [];
          
          // // Optional: Fetch author details if not denormalized
          // // This can be inefficient, consider denormalization or backend aggregation
          // for (const postDoc of querySnapshot.docs) {
          //     const data = postDoc.data();
          //     let authorName = data.authorName || 'Unknown User';
          //     let authorAvatar = data.authorAvatar; // Use placeholder if null/undefined

          //     // If author data is not denormalized, fetch it (EXAMPLE - can be slow)
          //     // if (!authorName && data.authorId) {
          //     //   try {
          //     //     const userDocRef = doc(db, "users", data.authorId);
          //     //     const userDocSnap = await getDoc(userDocRef);
          //     //     if (userDocSnap.exists()) {
          //     //       authorName = userDocSnap.data().name || `${userDocSnap.data().firstName || ''} ${userDocSnap.data().lastName || ''}`.trim() || 'User';
          //     //       authorAvatar = userDocSnap.data().profilePicture;
          //     //     }
          //     //   } catch (userError) {
          //     //     console.error("Error fetching author data for post:", postDoc.id, userError);
          //     //   }
          //     // }

          //     fetchedPosts.push({
          //       id: postDoc.id,
          //       ...data,
          //       createdAt: (data.createdAt as Timestamp)?.toDate(),
          //       authorName: authorName, 
          //       authorAvatar: authorAvatar,
          //     } as Post);
          // }
          // setFeedPosts(fetchedPosts);
        // } catch (error) {
        //   console.error("Error fetching feed posts: ", error);
        //   Alert.alert("Error", "Could not fetch feed.");
        // } finally {
        //   setIsLoadingFeed(false);
        // }
      // }; // Firebase fetching logic commented out
      // fetchPosts(); // Firebase fetching logic commented out
      setIsLoadingFeed(false); // Using mock data, so set loading to false
    }, [])
  );

  const handleFeedItemPress = (item: Post) => {
    // Assuming posts are stories for now, adjust if feed contains other types
    router.push({ pathname: '/(screens)/storyDetail', params: { storyId: item.id } });
  };

  // Helper function to format timestamp
  const formatTimestamp = (date: Date | null): string => {
    if (!date) return '';
    // Simple relative time or absolute date (implement more robust logic as needed)
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoadingFeed) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0A5C36" />
          <Text style={styles.loadingText}>Loading Feed...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        {feedPosts.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="newspaper-outline" size={60} color="#CCC" />
            <Text style={styles.emptyStateText}>Your feed is empty.</Text>
            <Text style={styles.emptyStateSubText}>
              Create your first story or connect with family!
            </Text>
          </View>
        ) : (
          feedPosts.map((item) => (
            <TouchableOpacity key={item.id} onPress={() => handleFeedItemPress(item)} style={styles.feedItemContainer}>
                <View style={styles.feedItem}>
                <View style={styles.itemHeader}>
                    <Image source={{ uri: item.authorAvatar || '../../assets/images/avatar-placeholder.png' }} style={styles.avatar} />
                    <View style={styles.userInfo}>
                    <Text style={styles.userName}>{item.authorName || 'User'}</Text>
                    <View style={styles.timestampContainer}>
                        <Text style={styles.timestamp}>{formatTimestamp(item.createdAt)}</Text>
                        {/* Removed Date Pill - can be added back if needed */}
                    </View>
                    </View>
                    <TouchableOpacity style={styles.moreOptionsButton} onPress={(e) => {e.stopPropagation(); alert('More options for ' + item.id);}}>
                    <Ionicons name="ellipsis-horizontal" size={24} color="#888" />
                    </TouchableOpacity>
                </View>

                {item.text && <Text style={styles.feedContent} numberOfLines={3}>{item.text}</Text>}
                {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.feedImage} />}
                {item.location && (
                    <View style={styles.locationContainer}>
                    <Ionicons name="location-sharp" size={16} color="#555" />
                    <Text style={styles.locationText}>{item.location}</Text>
                    </View>
                )}

                <View style={styles.feedStats}>
                    <View style={styles.statItem}>
                        <Ionicons name="chatbubbles-outline" size={16} color="#555" />
                        <Text style={styles.statText}>{item.commentsCount || 0} Comments</Text>
                    </View>
                    {/* Add other stats like likes */}
                </View>
                </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* MARK: - Add Reusable FAB Menu */}
      <FloatingActionMenu menuItems={feedMenuItems} />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F4F4',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
});

export default FeedScreen; 