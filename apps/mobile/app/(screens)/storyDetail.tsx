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
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { 
  fetchAccessibleStoriesMobile, 
  getStoryCommentsMobile,
  checkStoryLikeStatusMobile,
  toggleStoryLikeMobile,
  addCommentMobile,
  toggleCommentLikeMobile,
  deleteStoryMobile,
  Story as FetchedStory, // Assuming Story type is exported from storyUtils
} from '../../src/lib/storyUtils';
import { commonHeaderOptions } from '../../constants/headerConfig';
import ProfilePicture from '../../components/ui/ProfilePicture';
import { formatDate, formatTimeAgo } from '../../src/lib/dateUtils';
import Avatar from '../../components/ui/Avatar';
import AnimatedActionSheet, { ActionSheetAction } from '../../components/ui/AnimatedActionSheet';
import MediaGallery from '../../components/ui/MediaGallery';
import TaggedPeopleBadges, { PersonInfo as BadgePersonInfo } from '../../components/ui/TaggedPeopleBadges';
import { fetchUserProfilesByIds, UserProfile } from '../../src/lib/userUtils'; // Import fetch function
import { showErrorAlert } from '../../src/lib/errorUtils'; // Added import
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { logger } from '../../src/services/LoggingService';

interface StoryComment {
  id: string;
  user: UserInfo; 
  text: string;
  createdAt: any; 
  timestamp: string; 
  parentId?: string | null;
  depth: number;
  likes: string[]; 
  isLikedByMe?: boolean;
  replies: StoryComment[];
  isOptimistic?: boolean;
  avatarUrl?: string; 
  userName?: string; 
  commentText?: string; 
}

interface UserInfo {
  id: string;
  displayName: string;
  profilePicture?: string;
}

// No need for PersonInfoForDetail, use BadgePersonInfo directly or UserProfile from userUtils
// interface PersonInfoForDetail {
//   id: string;
//   displayName: string;
//   profilePicture?: string;
// }

interface StoryDetail {
  id: string;
  userName: string;
  userAvatar: string | undefined;
  timestamp: string;
  date: string; 
  title: string; 
  storyBlocks: { type: string; data: any; localId: string }[]; 
  location?: string;
  likesCount: number;
  commentsCount: number;
  isLiked?: boolean;
  authorId: string;
  subtitle?: string;
  peopleInvolved?: BadgePersonInfo[]; // Store fetched user details here
  peopleInvolvedIds?: string[]; // Store the raw IDs from the story
}

const StoryDetailScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ storyId: string }>();
  const storyId = params.storyId as string;
  const { user, firestoreUser } = useAuth();
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Story Detail Error',
    trackCurrentScreen: true
  });

  const [story, setStory] = useState<StoryDetail | null>(null);
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ parentId: string; userName: string } | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isLoadingLikeStatus, setIsLoadingLikeStatus] = useState(true);
  const commentInputRef = useRef<TextInput>(null);
  const [isActionSheetVisible, setActionSheetVisible] = useState(false);
  const [isLoadingStory, setIsLoadingStory] = useState(true); // For overall story loading

  useEffect(() => {
    if (!isError) {
      // Clear any local errors when global error state resets
    }
  }, [isError]);

  useEffect(() => {
    let isMounted = true;
    if (storyId && user?.uid && firestoreUser?.familyTreeId) {
      navigation.setOptions({ ...commonHeaderOptions, title: 'Loading...', headerRight: undefined });
      setIsLoadingStory(true);
      const loadStoryData = withErrorHandling(async () => {
        reset();
        try {
          const stories = await fetchAccessibleStoriesMobile(user.uid, firestoreUser.familyTreeId);
          const foundStory = stories.find(s => s.id === storyId) as FetchedStory | undefined;

          if (!isMounted) return;
          if (!foundStory) {
            Alert.alert("Story not found", "This story could not be loaded.", [{ text: "OK", onPress: () => router.back() }]);
            setIsLoadingStory(false);
            return;
          }

          const extractedTitle = (foundStory as any).title;
          const firstTextBlockData = foundStory.blocks.find(b => b.type === 'text')?.data as string || '';
          const peopleIds = (foundStory as any).peopleInvolved as string[] || [];

          let fetchedPeopleDetails: BadgePersonInfo[] = [];
          if (peopleIds.length > 0) {
            try {
              fetchedPeopleDetails = (await fetchUserProfilesByIds(peopleIds)) as BadgePersonInfo[];
            } catch (peopleError) {
              logger.error("Error fetching tagged people for StoryDetail:", peopleError);
              // Continue without people details if fetch fails
            }
          }
          
          if (!isMounted) return;

          const detail: StoryDetail = {
            id: foundStory.id,
            userName: foundStory.author?.displayName || foundStory.authorID,
            userAvatar: foundStory.author?.profilePicture || undefined,
            date: formatDate(foundStory.createdAt),
            timestamp: formatTimeAgo(foundStory.createdAt),
            title: extractedTitle || firstTextBlockData || '',
            storyBlocks: foundStory.blocks,
            location: foundStory.location?.address,
            likesCount: foundStory.likeCount || 0,
            commentsCount: foundStory.commentCount || 0,
            authorId: foundStory.authorID,
            subtitle: (foundStory as any).subtitle || undefined,
            peopleInvolvedIds: peopleIds,
            peopleInvolved: fetchedPeopleDetails,
          };
          setStory(detail);
          setLikesCount(foundStory.likeCount || 0);

          // Fetch like status and comments after basic story is set
          setIsLoadingLikeStatus(true);
          checkStoryLikeStatusMobile(storyId).then(status => {
            if (isMounted) setIsLiked(status);
          }).catch(err => logger.error("Failed to get like status", err))
            .finally(() => { if (isMounted) setIsLoadingLikeStatus(false); });

          getStoryCommentsMobile(storyId).then(rawComments => {
            if (!isMounted) return;
            const mapRawCommentsRecursively = (raw: any[], parentDepth = 0): StoryComment[] => {
              return raw.map(c => ({
                id: c.id,
                user: c.user || { id: c.userId, displayName: 'Unknown' },
                text: c.text || '',
                createdAt: c.createdAt,
                timestamp: formatTimeAgo(c.createdAt),
                parentId: c.parentId,
                depth: c.depth || parentDepth,
                likes: c.likes || [],
                isLikedByMe: c.isLikedByMe || false,
                replies: c.replies && c.replies.length > 0 
                           ? mapRawCommentsRecursively(c.replies, (c.depth || parentDepth) + 1).reverse()
                           : [],
              }));
            };
            setComments(mapRawCommentsRecursively(rawComments).reverse());
          }).catch(err => logger.error("Failed to get comments", err));

          navigation.setOptions({
            ...commonHeaderOptions,
            title: detail.title.length > 25 ? `${detail.title.substring(0, 25)}...` : detail.title,
            headerRight: () => {
              if (user?.uid === detail.authorId) {
                return (
                  <TouchableOpacity onPress={() => setActionSheetVisible(true)} style={{ marginRight: 15 }}>
                    <Ionicons name="ellipsis-horizontal" size={24} color={commonHeaderOptions.headerTintColor} />
                  </TouchableOpacity>
                );
              }
              return null;
            },
          });

        } catch (error: any) {
          if (isMounted) {
            logger.error(error);
            
            handleError(error, {
              action: 'loadStoryData',
              metadata: {
                storyId,
                userId: user?.uid,
                familyTreeId: firestoreUser?.familyTreeId,
                errorCode: error.code,
                errorMessage: error.message
              }
            });

            Alert.alert("Error", "Failed to load story details.", [{ text: "OK", onPress: () => router.back() }]);
          }
        } finally {
          if (isMounted) setIsLoadingStory(false);
        }
      });
      loadStoryData();
    }
    return () => { isMounted = false; };
  }, [storyId, user, firestoreUser, navigation, router]); // Removed story from dependencies to avoid re-fetch loop on setStory

  const handleLikePress = withErrorHandling(async () => {
    reset();
    if (isLoadingLikeStatus || !story) return;

    const originalIsLiked = isLiked;
    const originalLikesCount = likesCount;

    setIsLiked(!originalIsLiked);
    setLikesCount(prev => originalIsLiked ? prev - 1 : prev + 1);

    try {
      await toggleStoryLikeMobile(story.id, originalIsLiked);
    } catch (error: any) {
      logger.error("Error toggling like:", error);
      
      handleError(error, {
        action: 'handleLikePress',
        metadata: {
          storyId: story.id,
          originalIsLiked,
          originalLikesCount,
          errorCode: error.code,
          errorMessage: error.message
        }
      });

      setIsLiked(originalIsLiked);
      setLikesCount(originalLikesCount);
      showErrorAlert(error, "Error Updating Like");
    }
  });

  const handlePostComment = async (parentId?: string) => {
    const commentTextToPost = newComment.trim();
    if (commentTextToPost.length === 0 || !story) return;

    const tempId = `temp_${Date.now()}`;
    const optimisticComment: StoryComment = {
        id: tempId,
        user: { 
          id: user?.uid || 'temp-user', 
          displayName: firestoreUser?.displayName || user?.displayName || 'You', 
          profilePicture: firestoreUser?.profilePictureUrl || user?.photoURL || ''
        },
        text: commentTextToPost,
        createdAt: new Date().toISOString(),
        timestamp: 'Sending...',
        parentId: parentId,
        depth: 0, 
        likes: [],
        isLikedByMe: false,
        replies: [],
        isOptimistic: true,
    };

    if (parentId) {
      const addReplyToParent = (existingComments: StoryComment[]): StoryComment[] => {
        return existingComments.map(comment => {
          if (comment.id === parentId) {
            const parentDepth = comment.depth || 0;
            return {
              ...comment,
              replies: [
                ...(comment.replies || []),
                { ...optimisticComment, depth: parentDepth + 1 },
              ],
            };
          }
          if (comment.replies && comment.replies.length > 0) {
            return { ...comment, replies: addReplyToParent(comment.replies) };
          }
          return comment;
        });
      };
      setComments(prev => addReplyToParent(prev));
    } else {
      setComments(prev => [...prev, optimisticComment]);
    }
    
    setNewComment('');
    setReplyingTo(null);

    try {
      const serverResponse = await addCommentMobile(story.id, commentTextToPost, parentId);
      
      if (serverResponse && serverResponse.success && serverResponse.comment && serverResponse.comment.id) {
        const serverComment = serverResponse.comment;
        const finalComment: StoryComment = {
          id: serverComment.id,
          user: serverComment.user || { id: serverComment.userId, displayName: 'User' },
          text: serverComment.text,
          createdAt: serverComment.createdAt,
          timestamp: serverComment.createdAt ? formatTimeAgo(serverComment.createdAt) : 'Just now',
          parentId: serverComment.parentId,
          depth: serverComment.depth || 0,
          likes: serverComment.likes || [],
          isLikedByMe: serverComment.likes?.includes(user?.uid || ''),
          replies: [],
        };

        const replaceOptimistic = (existingComments: StoryComment[]): StoryComment[] => {
          return existingComments.map(c => {
            if (c.id === tempId) {
              return finalComment;
            }
            if (c.replies && c.replies.length > 0) {
              const updatedReplies = replaceOptimistic(c.replies);
              if (updatedReplies !== c.replies) {
                return { ...c, replies: updatedReplies };
              }
            }
            return c;
          });
        };
        setComments(prev => replaceOptimistic(prev));

      } else {
        logger.warn("Failed to post comment. Server response issue. Data:", JSON.stringify(serverResponse, null, 2));
        Alert.alert("Comment Error", serverResponse?.error || "Failed to post comment. Please try again.");
        const removeOptimistic = (existingComments: StoryComment[]): StoryComment[] => {
          return existingComments.filter(c => c.id !== tempId).map(c => {
            if (c.replies) {
              return { ...c, replies: removeOptimistic(c.replies) };
            }
            return c;
          });
        };
        setComments(prev => removeOptimistic(prev));
      }
    } catch (error) {
      logger.error("Error posting comment:", error);
      const removeOptimisticOnError = (existingComments: StoryComment[]): StoryComment[] => {
        return existingComments.filter(c => c.id !== tempId).map(c => {
          if (c.replies) {
            return { ...c, replies: removeOptimisticOnError(c.replies) };
          }
          return c;
        });
      };
      setComments(prev => removeOptimisticOnError(prev));
      Alert.alert("Error", "Could not post comment. Please try again.");
      setNewComment(commentTextToPost);
      if (parentId) setReplyingTo({ parentId, userName: 'previous user' });
    }
  };

  const handleToggleCommentLike = async (commentId: string) => {
    let originalCommentState: StoryComment | undefined;
    let parentCommentForReplyRevert: StoryComment | undefined;

    const updateLikeStatusRecursively = (commentsToSearch: StoryComment[], parent?: StoryComment): StoryComment[] => {
      return commentsToSearch.map(comment => {
        if (comment.id === commentId) {
          originalCommentState = { ...comment, likes: [...(comment.likes || [])] };
          parentCommentForReplyRevert = parent;
          
          const newIsLiked = !comment.isLikedByMe;
          let newLikesArray = [...(comment.likes || [])];
          if (newIsLiked) {
            if (!newLikesArray.includes(user!.uid)) {
              newLikesArray.push(user!.uid);
            }
          } else {
            newLikesArray = newLikesArray.filter(uid => uid !== user!.uid);
          }
          return { ...comment, isLikedByMe: newIsLiked, likes: newLikesArray };
        }
        if (comment.replies && comment.replies.length > 0) {
          return { ...comment, replies: updateLikeStatusRecursively(comment.replies, comment) };
        }
        return comment;
      });
    };
    setComments(prev => updateLikeStatusRecursively(prev));

    try {
      const result = await toggleCommentLikeMobile(commentId);

      if (!result || !result.success) {
        const errorMessage = result?.error || "Failed to toggle like on server. Unknown error.";
        throw new Error(errorMessage);
      }

      setComments(prevComments => {
        const reconcileLikes = (commentsToSearch: StoryComment[]): StoryComment[] => {
          return commentsToSearch.map(c => {
            if (c.id === commentId) {
              let reconciledLikes = c.likes || [];
              if (result.liked && !reconciledLikes.includes(user!.uid)) {
                reconciledLikes = [...reconciledLikes, user!.uid];
              } else if (!result.liked && reconciledLikes.includes(user!.uid)) {
                reconciledLikes = reconciledLikes.filter(uid => uid !== user!.uid);
              }
              return { ...c, isLikedByMe: result.liked, likes: reconciledLikes };
            }
            if (c.replies && c.replies.length > 0) {
              return { ...c, replies: reconcileLikes(c.replies) };
            }
            return c;
          });
        };
        return reconcileLikes(prevComments);
      });

    } catch (error) {
      logger.error("Error toggling comment like:", error);
      if (originalCommentState) {
        const revertLikeStatus = (commentsToSearch: StoryComment[]): StoryComment[] => {
          return commentsToSearch.map(c => {
            if (c.id === commentId) {
              return originalCommentState!;
            }
            if (c.replies && c.replies.length > 0) {
              if (parentCommentForReplyRevert && parentCommentForReplyRevert.id === c.id) {
                const originalReplyIndex = parentCommentForReplyRevert.replies.findIndex(r => r.id === commentId);
                if (originalReplyIndex !== -1) {
                  const updatedReplies = [...parentCommentForReplyRevert.replies];
                  updatedReplies[originalReplyIndex] = originalCommentState!;
                  return { ...c, replies: updatedReplies }; 
                }
              }
              return { ...c, replies: revertLikeStatus(c.replies) };
            }
            return c;
          });
        };
        setComments(prev => revertLikeStatus(prev));
      }
      Alert.alert("Error", "Could not update like for the comment. Please try again.");
    }
  };

  const handleEditStory = () => {
    if (!story) return;
    router.push({
      pathname: '/(screens)/createStory',
      params: { storyId: story.id, editMode: 'true' },
    });
  };

  const handleDeleteStory = async () => {
    if (!story || !user) return;

    Alert.alert(
      "Delete Story",
      "Are you sure you want to delete this story? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const success = await deleteStoryMobile(story.id, user.uid);
              if (success) {
                Alert.alert("Story Deleted", "The story has been successfully deleted.");
                router.back();
              } else {
                Alert.alert("Error", "Failed to delete the story. Please try again.");
              }
            } catch (error) {
              logger.error("Error deleting story:", error);
              showErrorAlert(error, "Error Deleting Story");
            }
          },
        },
      ]
    );
  };

  const storyActions: ActionSheetAction[] = [
    {
      title: 'Edit Story',
      icon: 'create-outline',
      onPress: handleEditStory,
    },
    {
      title: 'Delete Story',
      icon: 'trash-outline',
      style: 'destructive',
      onPress: handleDeleteStory,
    },
    {
      title: 'Cancel',
      style: 'cancel',
      onPress: () => setActionSheetVisible(false),
    },
  ];

  const getInitials = (name?: string): string => {
    if (!name || name.trim() === '') {
      return '?'; 
    }
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    if (parts.length > 1) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return '?';
  };

  const CommentItem: React.FC<{ comment: StoryComment; level: number; onReplyPress: (parentId: string, userName: string) => void }> = ({ comment, level, onReplyPress }) => {
    return (
      <View style={[styles.commentItemContainer, { marginLeft: Math.min(level, 1) * 20 }]}>
        <View style={styles.commentItem}>
          <Avatar 
            source={comment.user.profilePicture || comment.avatarUrl}
            fallback={getInitials(comment.user.displayName || comment.userName)}
            size={35}
            style={{ marginRight: styles.commentAvatar.marginRight }} 
          />
          <View style={styles.commentContent}>
            <Text style={styles.commentUserName}>{comment.user.displayName || comment.userName}</Text>
            <Text style={styles.commentText}>{comment.text || comment.commentText}</Text>
            <View style={styles.commentFooter}>
              <View style={styles.commentActionsGroup}> 
                <TouchableOpacity onPress={() => handleToggleCommentLike(comment.id)} style={styles.commentAction}>
                  <Ionicons name={comment.isLikedByMe ? "heart" : "heart-outline"} size={16} color={comment.isLikedByMe ? '#E91E63' : '#555'} />
                  <Text style={styles.commentActionText}>{comment.likes?.length || 0}</Text>
                </TouchableOpacity>
                {!comment.isOptimistic && (
                  <TouchableOpacity onPress={() => onReplyPress(comment.id, comment.user.displayName || comment.userName || 'User')} style={[styles.commentAction, { marginLeft: 10 }]}>
                    <Ionicons name="arrow-undo-outline" size={16} color="#555" />
                    <Text style={styles.commentActionText}>Reply</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.commentTimestamp}>{comment.isOptimistic ? 'Sending...' : comment.timestamp}</Text>
            </View>
          </View>
        </View>
        {comment.replies && comment.replies.length > 0 && (
          <View style={styles.repliesContainer}>
            {comment.replies.map(reply => (
              <CommentItem key={reply.id} comment={reply} level={level + 1} onReplyPress={onReplyPress} />
            ))}
          </View>
        )}
      </View>
    );
  };

  if (isLoadingStory || !story) { // Check isLoadingStory here
    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.loadingContainer}><Text>Loading story...</Text></View>
        </SafeAreaView>
    );
  }

  return (
    <ErrorBoundary screenName="StoryDetailScreen">
      <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{flex: 1}}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView style={styles.scrollContainer}>
          <View style={styles.storyHeader}>
            <View style={styles.topRowInfo}>
              <View style={styles.userInfoContainer}>
                <ProfilePicture source={story.userAvatar} name={story.userName} size={45} style={styles.avatar} />
                <View style={styles.userNameAndTimestamp}>
                  <Text style={styles.userName}>{story.userName}</Text>
                  <View style={styles.timestampContainer}>
                    <Text style={styles.datePill}>{story.date}</Text>
                    <View style={styles.dotSeparator} />
                    <Text style={styles.timestamp}>{story.timestamp}</Text>
                  </View>
                </View>
              </View>
              {/* Display badges if peopleInvolved (fetched details) exist and are not empty */}
              {story.peopleInvolved && story.peopleInvolved.length > 0 && (
                <TaggedPeopleBadges people={story.peopleInvolved} badgeSize={24} fontSize={10} />
              )}
            </View>

            <View style={styles.titleSubtitleContainer}>
              {story.title && <Text style={styles.storyTitleMain}>{story.title}</Text>}
              {story.subtitle && <Text style={styles.storySubtitle}>{story.subtitle}</Text>}
              {story.location && (
                <View style={styles.locationContainerInHeader}>
                  <Ionicons name="location-sharp" size={16} color="#555" />
                  <Text style={styles.locationText}>{story.location}</Text>
                </View>
              )}
            </View>
          </View>

          {story.storyBlocks && story.storyBlocks.map((block, index) => {
            if (block.type === 'text') {
              return (
                <Text key={`block-${block.localId || index}`} style={styles.storyContentBlockText}>
                  {block.data as string}
                </Text>
              );
            }
            if (block.type === 'image') {
              const mediaItemsForBlock: { uri: string; type: 'image' | 'video'; duration?: number; width?: number; height?: number; asset?: ImagePicker.ImagePickerAsset }[] = [];
              if (Array.isArray(block.data)) {
                (block.data as any[]).forEach(mediaData => {
                  if (typeof mediaData === 'string') {
                    const url = mediaData;
                    const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(url.toLowerCase());
                    const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';
                    mediaItemsForBlock.push({ uri: url, type: mediaType, duration: isVideo ? 0 : undefined });
                  } else if (typeof mediaData === 'object' && mediaData !== null && mediaData.uri) {
                    mediaItemsForBlock.push({
                      uri: mediaData.uri,
                      type: mediaData.type || (/\.(mp4|mov|avi|mkv|webm)$/i.test(mediaData.uri?.toLowerCase() || '') ? 'video' : 'image'),
                      width: mediaData.width,
                      height: mediaData.height,
                      duration: mediaData.duration,
                    });
                  }
                });
              }
              if (mediaItemsForBlock.length > 0) {
                return (
                  <View key={`block-gallery-${block.localId || index}`} style={styles.galleryContainer}>
                    <MediaGallery
                      media={mediaItemsForBlock}
                      onAddMedia={() => {}} 
                      onRemoveMedia={() => {}}
                      onReplaceMedia={() => {}}
                      showRemoveButton={false}
                      showReplaceButton={false}
                      allowAddingMore={false}
                    />
                  </View>
                );
              }
              return null;
            }
            return null;
          })}

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
            <Text style={styles.commentsTitle}>Comments ({story.commentsCount})</Text>
            {comments.map(comment => (
              <CommentItem 
                key={comment.id} 
                comment={comment} 
                level={0} 
                onReplyPress={(parentId, userName) => {
                  setReplyingTo({ parentId, userName });
                  commentInputRef.current?.focus();
                }} 
              />
            ))}
            {comments.length === 0 && !replyingTo && <Text style={styles.noCommentsText}>Be the first to comment!</Text>}
          </View>
        </ScrollView>
        
        <View style={styles.commentInputContainer}>
            {replyingTo && (
              <View style={styles.replyingToBanner}>
                <Text style={styles.replyingToText}>Replying to {replyingTo.userName}</Text>
                <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyingToCloseButton}>
                  <Ionicons name="close-circle" size={22} color="#888" />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.commentInputInnerContainer}> 
            <TextInput
                ref={commentInputRef}
                style={styles.commentInput}
                  placeholder={replyingTo ? `Reply to ${replyingTo.userName}...` : "Add a comment..."}
                value={newComment}
                onChangeText={setNewComment}
                placeholderTextColor="#888"
                multiline
            />
              <TouchableOpacity 
                  onPress={() => handlePostComment(replyingTo ? replyingTo.parentId : undefined)} 
                  style={styles.sendButton} 
                  disabled={!newComment.trim()}
              >
                <Ionicons name="send" size={24} color={newComment.trim() ? '#1A4B44' : '#B0B0B0'} />
            </TouchableOpacity>
            </View>
        </View>
      </KeyboardAvoidingView>
        {story && user?.uid === story.authorId && (
          <AnimatedActionSheet
            isVisible={isActionSheetVisible}
            onClose={() => setActionSheetVisible(false)}
            actions={storyActions}
            title="Story Options"
            message="Manage your story."
          />
        )}
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContainer: { flex: 1, backgroundColor: '#F9F9F9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' }, 
  storyHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  topRowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginRight: 8,
  },
  avatar: { 
    width: 45, 
    height: 45, 
    borderRadius: 22.5, 
  },
  userNameAndTimestamp: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    marginLeft: 12,
  },
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
  titleSubtitleContainer: {
    width: '100%',
  },
  storyTitleMain: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
  },
  storySubtitle: { 
    fontSize: 15,
    color: '#555',
    marginTop: 4,
  },
  storyContentBlockText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#444',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  galleryContainer: {
    marginVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  locationContainerInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
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
  commentTimestamp: { fontSize: 11, color: '#999', }, 
  noCommentsText: { color: '#777', textAlign: 'center', paddingVertical: 10 }, 
  commentFooter: { 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  commentActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentInputContainer: {
    flexDirection: 'column', 
    paddingHorizontal: 0,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#D0D0D0',
    backgroundColor: '#FFFFFF',
  },
  commentInputInnerContainer: { 
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 10,
  },
  replyingToBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15, 
    backgroundColor: '#F7F7F7', 
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
    borderRadius: 8,
    marginBottom: 8,
    marginHorizontal: 10,
  },
  replyingToText: {
    fontSize: 14, 
    color: '#444', 
    fontWeight: '500',
  },
  replyingToCloseButton: {
    padding: 5,
  },
  commentInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10, 
    fontSize: 15,
    marginRight: 8,
  },
  sendButton: { padding: 8 }, 
  commentAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 15,
  },
  commentActionText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#555',
  },
  repliesContainer: {
    borderLeftWidth: 1,
    borderLeftColor: '#DDD',
    paddingLeft: 10,
    marginTop: 10,
  },
  commentItemContainer: {
  },
});

export default StoryDetailScreen; 