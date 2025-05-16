import React, { useState, useEffect, useRef } from 'react';
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
import { 
  fetchAccessibleStoriesMobile, 
  getStoryCommentsMobile,
  checkStoryLikeStatusMobile,
  toggleStoryLikeMobile,
  addCommentMobile
} from '../../src/lib/storyUtils';
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
  userAvatar: string | undefined;
  timestamp: string;
  date: string; // Full date string
  title: string; // This will be the definitive story title
  storyBlocks: Array<{ type: string; data: any; localId: string }>; // To store all blocks
  location?: string;
  likesCount: number;
  commentsCount: number;
  isLiked?: boolean;
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
  const [isLoadingLikeStatus, setIsLoadingLikeStatus] = useState(true);
  const commentInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (storyId && user?.uid && firestoreUser?.familyTreeId) {
      if (!story) {
        navigation.setOptions({ ...commonHeaderOptions, title: 'Loading...', headerRight: undefined });
        (async () => {
          try {
            const stories = await fetchAccessibleStoriesMobile(user.uid, firestoreUser.familyTreeId);
            const found = stories.find(s => s.id === storyId);
            if (!found) {
              Alert.alert("Story not found", "This story could not be loaded.", [{ text: "OK", onPress: () => router.back() }]);
              return;
            }

            // ---- START DEBUG LOGS ----
            console.log("[StoryDetailScreen] Raw 'found' story data:", JSON.stringify(found, null, 2));
            const extractedTitle = (found as any).title;
            const firstTextBlockData = found.blocks.find(b => b.type === 'text')?.data as string || '';
            console.log("[StoryDetailScreen] Extracted top-level title:", extractedTitle);
            console.log("[StoryDetailScreen] First text block data:", firstTextBlockData);
            // ----  END DEBUG LOGS  ----

            const detail: StoryDetail = {
              id: found.id,
              userName: found.author?.displayName || found.authorID,
              userAvatar: found.author?.profilePicture || undefined,
              date: formatDate(found.createdAt),
              timestamp: formatTimeAgo(found.createdAt),
              title: extractedTitle || firstTextBlockData || '', // Ensure this logic is robust
              storyBlocks: found.blocks,
              location: found.location?.address,
              likesCount: found.likeCount || 0,
              commentsCount: found.commentCount || 0,
            };
            setStory(detail);
            setLikesCount(found.likeCount || 0);

            setIsLoadingLikeStatus(true);
            const initialLikeStatus = await checkStoryLikeStatusMobile(storyId);
            setIsLiked(initialLikeStatus);
            setIsLoadingLikeStatus(false);

            const rawComments = await getStoryCommentsMobile(storyId);
            const mappedComments: StoryComment[] = rawComments.map(c => {
              return {
                id: c.id,
                userName: c.user?.displayName || '',
                avatarUrl: c.user?.profilePicture || '',
                commentText: c.text || '',
                timestamp: formatTimeAgo(c.createdAt),
              };
            });
            setComments(mappedComments);
            navigation.setOptions({
              ...commonHeaderOptions,
              title: detail.title.length > 25 ? `${detail.title.substring(0, 25)}...` : detail.title,
              headerRight: undefined,
            });
          } catch (error) {
            console.error(error);
            Alert.alert("Error", "Failed to load story details.", [{ text: "OK", onPress: () => router.back() }]);
            setIsLoadingLikeStatus(false);
          }
        })();
      } else {
        // Story already loaded, just ensure like status might need refresh if user navigated back and forth
      }
    }
  }, [storyId, user, firestoreUser, story]);

  const handleLikePress = async () => {
    if (isLoadingLikeStatus || !story) return;

    const originalIsLiked = isLiked;
    const originalLikesCount = likesCount;

    setIsLiked(!originalIsLiked);
    setLikesCount(prev => originalIsLiked ? prev - 1 : prev + 1);

    try {
      await toggleStoryLikeMobile(story.id, originalIsLiked);
    } catch (error) {
      console.error("Error toggling like:", error);
      setIsLiked(originalIsLiked);
      setLikesCount(originalLikesCount);
      Alert.alert("Error", "Could not update like status. Please try again.");
    }
  };

  const handlePostComment = async () => {
    if (newComment.trim().length === 0 || !story) return;

    // Optimistic update (basic version)
    // For a more robust optimistic update, generate a temporary ID, 
    // then replace with server ID upon successful creation.
    const tempId = `temp_${Date.now()}`;
    const optimisticComment: StoryComment = {
        id: tempId,
        userName: firestoreUser?.displayName || user?.displayName || 'You', 
        avatarUrl: firestoreUser?.profilePictureUrl || user?.photoURL || '', 
        commentText: newComment.trim(),
        timestamp: 'Sending...',
    };
    setComments(prev => [optimisticComment, ...prev]); // Add to top for better UX
    const commentTextToPost = newComment.trim();
    setNewComment('');

    try {
      const newServerComment = await addCommentMobile(story.id, commentTextToPost);
      if (newServerComment && newServerComment.id) {
        // Replace optimistic comment with server comment
        setComments(prevComments => 
          prevComments.map(c => c.id === tempId ? {
            id: newServerComment.id,
            userName: newServerComment.user?.displayName || 'User',
            avatarUrl: newServerComment.user?.profilePicture || '',
            commentText: newServerComment.text,
            timestamp: newServerComment.createdAt ? formatTimeAgo(newServerComment.createdAt) : 'Just now',
          } : c)
        );
      } else {
        // If server comment doesn't come back as expected, remove optimistic one or mark as failed
        console.warn("New comment data not returned from server as expected.");
        setComments(prevComments => prevComments.filter(c => c.id !== tempId)); // Remove optimistic
        // Optionally, re-add the text to input or show an error specific to comment posting
        Alert.alert("Comment Error", "Failed to post comment. Please try again.");
      }
    } catch (error) {
      console.error("Error posting comment:", error);
      // Revert optimistic update or mark as failed
      setComments(prevComments => prevComments.filter(c => c.id !== tempId));
      Alert.alert("Error", "Could not post comment. Please try again.");
      setNewComment(commentTextToPost); // Restore input
    }
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
              {story.title && <Text style={styles.storyTitleMain}>{story.title}</Text>}
            </View>
          </View>

          {/* Iterate over all story blocks to render their content */}
          {story.storyBlocks && story.storyBlocks.map((block, index) => {
            if (block.type === 'text') {
              return (
                <Text key={`block-${block.localId || index}`} style={styles.storyContentBlockText}>
                  {block.data as string}
                </Text>
              );
            }
            if (block.type === 'image' && Array.isArray(block.data)) {
              return (block.data as string[]).map((imgUri, imgIndex) => (
                <Image
                  key={`block-${block.localId || index}-img-${imgIndex}`}
                  source={{ uri: imgUri }}
                  style={styles.storyImage}
                />
              ));
            }
            // TODO: Add rendering for other block types like video, audio if needed
            
            return null;
          })}

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
            <TouchableOpacity style={styles.actionButton} onPress={() => commentInputRef.current?.focus()}>
              <Ionicons name="chatbubble-outline" size={22} color="#555" />
              <Text style={styles.actionText}>{comments.length} Comments</Text>
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
                ref={commentInputRef}
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
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  avatar: { width: 45, height: 45, borderRadius: 22.5, marginRight: 12 },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  timestampContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  datePill: { 
    backgroundColor: '#E8F5E9',
    color: '#1A4B44',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 12,
    fontWeight: '500',
    overflow: 'hidden',
  },
  dotSeparator: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#B0B0B0', marginHorizontal: 6 },
  timestamp: { fontSize: 12, color: '#777' },
  storyTitleMain: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
    marginTop: 10,
    paddingHorizontal: 15,
    paddingBottom: 5,
  },
  storyContent: { 
    fontSize: 16, 
    lineHeight: 24, 
    color: '#444', 
    paddingHorizontal: 15, 
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  storyContentBlockText: { // New style for individual text blocks from storyBlocks
    fontSize: 16,
    lineHeight: 24,
    color: '#444',
    paddingHorizontal: 15,
    paddingVertical: 10, // Or adjust spacing as needed between blocks
    backgroundColor: '#FFFFFF', // Assuming blocks are on a white background
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
    paddingTop: 20,
    paddingHorizontal: 15,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
  },
  commentsTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  commentItem: { flexDirection: 'row', marginBottom: 15 },
  commentAvatar: { width: 35, height: 35, borderRadius: 17.5, marginRight: 10 },
  commentContent: { flex: 1, backgroundColor: '#F7F7F7', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#EAEAEA' },
  commentUserName: { fontWeight: 'bold', fontSize: 14, color: '#444', marginBottom: 3 },
  commentText: { fontSize: 14, color: '#555', lineHeight: 20 },
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