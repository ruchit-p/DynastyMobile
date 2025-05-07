import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Platform,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';

interface StoryComment {
  id: string;
  userName: string;
  avatarUrl: string;
  commentText: string;
  timestamp: string;
  // replies?: StoryComment[]; // For threaded comments
}

interface Story {
  id: string;
  userName: string;
  userAvatar: string;
  timestamp: string;
  date: string; // Full date string
  title: string;
  content: string;
  images?: string[];
  location?: string;
  likesCount: number;
  commentsCount: number;
  isLiked?: boolean;
  // comments: StoryComment[]; // Full comment objects
}

// Mock Story Data - In a real app, fetch based on storyId
const mockStoriesDatabase: { [key: string]: Story } = {
  story123: {
    id: 'story123',
    userName: 'Grandma Millie',
    userAvatar: 'https://via.placeholder.com/40/FFD700/000000?Text=M',
    timestamp: '3 hours ago',
    date: 'October 26, 2023',
    title: 'My Childhood Memories on the Farm',
    content: 
      `I remember those long summer days on the farm like they were yesterday. Waking up to the rooster crowing, the smell of fresh hay, and my mother baking bread in the old wood-fired oven. We didn't have much, but we had each other, and that was everything. We'd spend hours playing in the fields, chasing butterflies and making up grand adventures. Evenings were for storytelling around the fireplace, with dad playing his old guitar. Those simple times shaped who I am today.\n\nOne particular memory that stands out is the big harvest festival. The whole community would come together. There was so much food, music, and laughter. It was a celebration of hard work and togetherness. I miss those days dearly.`,
    images: [
      'https://via.placeholder.com/600x400/E6E6FA/000000?Text=Farm+View',
      'https://via.placeholder.com/600x400/FFF0F5/000000?Text=Family+Photo+1950s',
    ],
    location: 'Sunny Meadows Farm, Willow Creek',
    likesCount: 156,
    commentsCount: 23,
    isLiked: false,
  },
  story789: {
    id: 'story789',
    userName: 'Uncle John',
    userAvatar: 'https://via.placeholder.com/40/ADD8E6/000000?Text=J',
    timestamp: '1 day ago',
    date: 'October 25, 2023',
    title: 'My First Fishing Trip with Dad',
    content: 
      `I must have been about 7 years old when Dad took me on my first real fishing trip. We woke up before dawn, packed our gear, and headed to Miller's Pond. I was so excited, I could barely sit still. He taught me how to cast, how to be patient, and the importance of respecting nature. I didn't catch a big one that day, just a tiny sunfish, but I felt like the king of the world. It's a memory I'll cherish forever.`,
    images: ['https://via.placeholder.com/600x400/B0E0E6/000000?Text=Fishing+at+Pond'],
    location: "Miller's Pond",
    likesCount: 88,
    commentsCount: 12,
    isLiked: true,
  },
};

const mockStoryComments: { [key: string]: StoryComment[] } = {
    story123: [
        { id: 'c1', userName: 'Sarah P.', avatarUrl: 'https://via.placeholder.com/30/FFC0CB/000000?Text=S', commentText: 'What a beautiful story, Grandma! Sounds idyllic.', timestamp: '2h ago' },
        { id: 'c2', userName: 'Tom R.', avatarUrl: 'https://via.placeholder.com/30/90EE90/000000?Text=T', commentText: 'Amazing memories. Thanks for sharing!', timestamp: '1h ago' },
    ],
    story789: [
        { id: 'c3', userName: 'Lisa M.', avatarUrl: 'https://via.placeholder.com/30/FFA07A/000000?Text=L', commentText: 'So sweet! Every kid remembers their first fish.', timestamp: '20h ago' },
    ]
};

const StoryDetailScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ storyId: string }>();
  const storyId = params.storyId as string;

  const [story, setStory] = useState<Story | null>(null);
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);

  useEffect(() => {
    // Set initial title to "Loading..." when storyId is present but story is not yet loaded
    if (storyId && !story) {
      navigation.setOptions({ 
        title: 'Loading...',
        headerTitleAlign: 'center', // Keep consistent alignment
        headerRight: () => null, // Hide options menu while loading
      });
    }

    if (storyId) {
      const foundStory = mockStoriesDatabase[storyId];
      if (foundStory) {
        setStory(foundStory);
        setComments(mockStoryComments[storyId] || []);
        setIsLiked(foundStory.isLiked || false);
        setLikesCount(foundStory.likesCount || 0);
        navigation.setOptions({
          title: foundStory.title.length > 25 ? `${foundStory.title.substring(0, 25)}...` : foundStory.title,
          headerTitleAlign: 'center',
          headerRight: () => (
            <TouchableOpacity onPress={() => Alert.alert("Story Options", "Share, Edit, Delete...")} style={{ paddingHorizontal: 15}}>
              <Ionicons name="ellipsis-horizontal" size={24} color="#1A4B44" />
            </TouchableOpacity>
          ),
        });
      } else {
        Alert.alert("Story not found", "This story could not be loaded.", [{ text: "OK", onPress: () => router.back() }]);
      }
    } else {
        Alert.alert("Error", "Story ID is missing.", [{ text: "OK", onPress: () => router.back() }]);
    }
  }, [storyId, navigation, router]);

  const handleLikePress = () => {
    setIsLiked(!isLiked);
    setLikesCount(prev => isLiked ? prev - 1 : prev + 1);
    // TODO: API call to update like status
  };

  const handlePostComment = () => {
    if (newComment.trim().length === 0) return;
    const commentToAdd: StoryComment = {
        id: `comm_${Date.now()}`,
        userName: 'Current User', // Replace with actual user
        avatarUrl: 'https://via.placeholder.com/30', // Replace
        commentText: newComment.trim(),
        timestamp: 'Just now',
    };
    setComments(prev => [...prev, commentToAdd]);
    setNewComment('');
    // TODO: API call to post comment
  };

  if (!story) {
    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.loadingContainer}><Text>Loading story...</Text></View>
        </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{flex: 1}}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView style={styles.scrollContainer}>
          <View style={styles.storyHeader}>
            <Image source={{ uri: story.userAvatar }} style={styles.avatar} />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{story.userName}</Text>
              <View style={styles.timestampContainer}>
                <Text style={styles.datePill}>{story.date}</Text>
                <View style={styles.dotSeparator} />
                <Text style={styles.timestamp}>{story.timestamp}</Text>
              </View>
            </View>
          </View>

          {story.title && <Text style={styles.storyTitleText}>{story.title}</Text>}
          <Text style={styles.storyContent}>{story.content}</Text>

          {story.images && story.images.map((imgUri, index) => (
            <Image key={index} source={{ uri: imgUri }} style={styles.storyImage} />
          ))}

          {story.location && (
            <View style={styles.locationContainer}>
              <Ionicons name="location-sharp" size={16} color="#555" />
              <Text style={styles.locationText}>{story.location}</Text>
            </View>
          )}

          <View style={styles.actionsContainer}>
            <TouchableOpacity style={styles.actionButton} onPress={handleLikePress}>
              <Ionicons name={isLiked ? "heart" : "heart-outline"} size={22} color={isLiked ? '#E91E63' : '#555'} />
              <Text style={styles.actionText}>{likesCount} Likes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => { /* Focus comment input */ }}>
              <Ionicons name="chatbubble-outline" size={22} color="#555" />
              <Text style={styles.actionText}>{comments.length} Comments</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => Alert.alert("Share Story", "Implement sharing")}>
              <Ionicons name="share-social-outline" size={22} color="#555" />
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.commentsSection}>
            <Text style={styles.commentsTitle}>Comments ({comments.length})</Text>
            {comments.map(comment => (
              <View key={comment.id} style={styles.commentItem}>
                <Image source={{ uri: comment.avatarUrl }} style={styles.commentAvatar} />
                <View style={styles.commentContent}>
                  <Text style={styles.commentUserName}>{comment.userName}</Text>
                  <Text style={styles.commentText}>{comment.commentText}</Text>
                  <Text style={styles.commentTimestamp}>{comment.timestamp}</Text>
                </View>
              </View>
            ))}
            {comments.length === 0 && <Text style={styles.noCommentsText}>Be the first to comment!</Text>}
          </View>
        </ScrollView>
        
        <View style={styles.commentInputContainer}>
            <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
                value={newComment}
                onChangeText={setNewComment}
                placeholderTextColor="#888"
                multiline
            />
            <TouchableOpacity onPress={handlePostComment} style={styles.sendButton} disabled={!newComment.trim()}>
                <Ionicons name="send" size={24} color={newComment.trim() ? '#1A4B44' : '#B0B0B0'} />
            </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContainer: { flex: 1, backgroundColor: '#F9F9F9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' }, 
  storyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#FFFFFF',
  },
  avatar: { width: 45, height: 45, borderRadius: 22.5, marginRight: 12 },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: 'bold', color: '#333' },
  timestampContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  datePill: { 
    fontSize: 11, 
    color: '#006400',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
    fontWeight: '500',
  },
  dotSeparator: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#BBB', marginHorizontal: 6 },
  timestamp: { fontSize: 12, color: '#777' },
  storyTitleText: {
      fontSize: 22,
      fontWeight: 'bold',
      color: '#222',
      paddingHorizontal: 15,
      paddingTop: 10, 
      paddingBottom: 5,
      backgroundColor: '#FFFFFF',
  },
  storyContent: { 
    fontSize: 16, 
    lineHeight: 24, 
    color: '#444', 
    paddingHorizontal: 15, 
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  storyImage: {
    width: '100%',
    aspectRatio: 16/9, // Or a fixed height: height: 250,
    marginTop: 0, // Assuming content already has padding
    backgroundColor: '#E0E0E0', // Placeholder background for images
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, 
    borderTopColor: '#EEE',
  },
  locationText: { fontSize: 14, color: '#555', marginLeft: 8 },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  actionButton: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  actionText: { marginLeft: 6, fontSize: 14, color: '#333', fontWeight: '500' },
  commentsSection: {
    marginTop: 10,
    paddingHorizontal: 15,
    paddingBottom: 20, // Space for last comment before input
    backgroundColor: '#FFFFFF',
  },
  commentsTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  commentItem: { flexDirection: 'row', marginBottom: 15 },
  commentAvatar: { width: 35, height: 35, borderRadius: 17.5, marginRight: 10 },
  commentContent: { flex: 1, backgroundColor: '#F7F7F7', padding: 10, borderRadius: 8 },
  commentUserName: { fontWeight: 'bold', fontSize: 14, color: '#444', marginBottom: 3 },
  commentText: { fontSize: 14, color: '#555' }, 
  commentTimestamp: { fontSize: 11, color: '#999', marginTop: 4 },
  noCommentsText: { color: '#777', textAlign: 'center', paddingVertical: 10 }, 
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#D0D0D0',
    backgroundColor: '#FFFFFF',
  },
  commentInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 10, // Ensure consistent padding with multiline
    paddingBottom: 10, 
    fontSize: 15,
    marginRight: 8,
  },
  sendButton: { padding: 8 }, 
});

export default StoryDetailScreen; 