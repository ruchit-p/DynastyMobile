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
import { useAuth } from '../../src/contexts/AuthContext';
import { fetchAccessibleStoriesMobile, getStoryCommentsMobile } from '../../src/lib/storyUtils';
import { commonHeaderOptions } from '../../constants/headerConfig';
import ProfilePicture from '../../components/ui/ProfilePicture';
import { formatDate, formatTimeAgo } from '../../src/lib/dateUtils';

interface StoryComment {
  id: string;
  userName: string;
  avatarUrl: string;
  commentText: string;
  timestamp: string;
  // replies?: StoryComment[]; // For threaded comments
}

// Local story detail type used by this screen
interface StoryDetail {
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

const StoryDetailScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ storyId: string }>();
  const storyId = params.storyId as string;
  const { user, firestoreUser } = useAuth();

  const [story, setStory] = useState<StoryDetail | null>(null);
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);

  useEffect(() => {
    // Fetch story detail and comments from backend
    if (storyId && user?.uid && firestoreUser?.familyTreeId && !story) {
      navigation.setOptions({ ...commonHeaderOptions, title: 'Loading...', headerRight: () => null });
      (async () => {
        try {
          // Get all accessible stories and find current one
          const stories = await fetchAccessibleStoriesMobile(user.uid, firestoreUser.familyTreeId);
          const found = stories.find(s => s.id === storyId);
          if (!found) {
            Alert.alert("Story not found", "This story could not be loaded.", [{ text: "OK", onPress: () => router.back() }]);
            return;
          }
          // Build local story detail with formatted dates
          const detail: StoryDetail = {
            id: found.id,
            userName: found.author?.displayName || found.authorID,
            userAvatar: found.author?.profilePicture || '',
            date: formatDate(found.createdAt),
            timestamp: formatTimeAgo(found.createdAt),
            title: found.blocks.find(b => b.type === 'text')?.data as string || '',
            content: found.blocks.find(b => b.type === 'text')?.data as string || '',
            images: found.blocks.filter(b => b.type === 'image').flatMap(b => Array.isArray(b.data) ? b.data : []),
            location: found.location?.address,
            likesCount: found.likeCount || 0,
            commentsCount: found.commentCount || 0,
            isLiked: false,
          };
          setStory(detail);
          setIsLiked(detail.isLiked || false);
          setLikesCount(detail.likesCount);
          // Fetch comments
          const rawComments = await getStoryCommentsMobile(storyId);
          const mappedComments: StoryComment[] = rawComments.map(c => {
            let cDate: Date;
            if (c.createdAt && typeof (c.createdAt as any).toDate === 'function') {
              cDate = (c.createdAt as any).toDate();
            } else if (c.createdAt && (c.createdAt as any).seconds) {
              cDate = new Date((c.createdAt as any).seconds * 1000);
            } else {
              cDate = new Date(c.createdAt as any);
            }
            return {
              id: c.id,
              userName: c.user?.displayName || '',
              avatarUrl: c.user?.profilePicture || '',
              commentText: c.text || '',
              timestamp: cDate.toLocaleTimeString(),
            };
          });
          setComments(mappedComments);
          // Update header title
          navigation.setOptions({
            ...commonHeaderOptions,
            title: detail.title.length > 25 ? `${detail.title.substring(0, 25)}...` : detail.title,
            headerRight: () => (
              <TouchableOpacity onPress={() => Alert.alert("Story Options", "Share, Edit, Delete...")} style={{ paddingHorizontal: 15 }}>
                <Ionicons name="ellipsis-horizontal" size={24} color="#1A4B44" />
              </TouchableOpacity>
            ),
          });
        } catch (error) {
          console.error(error);
          Alert.alert("Error", "Failed to load story.", [{ text: "OK", onPress: () => router.back() }]);
        }
      })();
    }
  }, [storyId, user, firestoreUser]);

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
            <ProfilePicture source={story.userAvatar} name={story.userName} size={45} style={styles.avatar} />
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