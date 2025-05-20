import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, StyleProp, ViewStyle, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import ThemedText from '../ThemedText';
import ProfilePicture from './ProfilePicture';
import MediaGallery from './MediaGallery';
import TaggedPeopleBadges, { PersonInfo as BadgePersonInfo } from './TaggedPeopleBadges';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import type { Story } from '../../src/lib/storyUtils';
import { formatDate, formatTimeAgo } from '../../src/lib/dateUtils';
import * as ImagePicker from 'expo-image-picker';
import { fetchUserProfilesByIds, UserProfile } from '../../src/lib/userUtils';

// Define a local interface for props if needed, or use BadgePersonInfo directly
// interface PersonInfoForPost {
//   id: string;
//   displayName: string;
//   profilePicture?: string;
// }

export interface StoryPostProps {
  story: Story;
  onPress: (story: Story) => void;
  onMorePress?: (story: Story) => void;
  style?: StyleProp<ViewStyle>;
}

const StoryPost: React.FC<StoryPostProps> = ({ story, onPress, onMorePress, style }) => {
  const dateLabel = formatDate(story.createdAt);
  const timeAgoLabel = formatTimeAgo(story.createdAt);
  const storyTitle = (story as any).title || (story.blocks.find(b => b.type === 'text')?.data as string || '');
  const storySubtitle = (story as any).subtitle;
  const mediaCount = story.blocks.filter(b => b.type === 'image' || b.type === 'video').length;

  const [taggedPeopleDetails, setTaggedPeopleDetails] = useState<BadgePersonInfo[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);

  // Fetch tagged people details
  useEffect(() => {
    const storyPeopleInvolved = (story as any).peopleInvolved as string[] | undefined;
    if (storyPeopleInvolved && storyPeopleInvolved.length > 0) {
      setIsLoadingTags(true);
      fetchUserProfilesByIds(storyPeopleInvolved)
        .then(profiles => {
          // Map UserProfile[] to BadgePersonInfo[] if needed, or ensure types are compatible
          // Assuming UserProfile is compatible with BadgePersonInfo (id, displayName)
          setTaggedPeopleDetails(profiles as BadgePersonInfo[]); 
        })
        .catch(error => {
          console.error("Error fetching tagged people for StoryPost:", error);
          setTaggedPeopleDetails([]); // Set to empty on error
        })
        .finally(() => {
          setIsLoadingTags(false);
        });
    } else {
      setTaggedPeopleDetails([]); // Clear if no people involved
    }
  }, [story]); // Depend on the whole story object or story.id if peopleInvolved can change independently

  const galleryMediaItems = React.useMemo(() => {
    if (!story || !story.blocks) return [];
    const items: Array<{ uri: string; type: 'image' | 'video'; width?: number; height?: number; duration?: number; asset?: ImagePicker.ImagePickerAsset }> = [];
    story.blocks.forEach(block => {
      if (block.type === 'image' && Array.isArray(block.data)) {
        (block.data as Array<any>).forEach(mediaData => {
          if (typeof mediaData === 'string') {
            const url = mediaData;
            const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(url.toLowerCase());
            const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';
            items.push({ uri: url, type: mediaType, duration: isVideo ? 0 : undefined });
          } else if (typeof mediaData === 'object' && mediaData !== null && mediaData.uri) {
            items.push({
              uri: mediaData.uri,
              type: mediaData.type || (/\.(mp4|mov|avi|mkv|webm)$/i.test(mediaData.uri?.toLowerCase() || '') ? 'video' : 'image'),
              width: mediaData.width,
              height: mediaData.height,
              duration: mediaData.duration,
            });
          }
        });
      }
    });
    return items;
  }, [story]);

  // const peopleInvolved = (story as any).peopleInvolved as PersonInfoForPost[] || []; // Old way

  return (
    <View style={[styles.container, style]}>
      <Card variant="elevated" noPadding>
        <TouchableOpacity onPress={() => onPress(story)} activeOpacity={0.8}>
          <View style={styles.header}>
            <View style={styles.topRowInfo}> 
              <View style={styles.userInfoContainer}>
                <ProfilePicture 
                  source={story.author?.profilePicture} 
                  name={story.author?.displayName || story.authorID} 
                  size="sm" 
                  style={styles.avatar} 
                />
                <View style={styles.userNameAndTimestamp}>
                  <ThemedText variant="bodyMedium" style={styles.authorName}>
                    {story.author?.displayName || story.authorID}
                  </ThemedText>
                  <View style={styles.timestampContainer}>
                    <Text style={styles.datePill}>{dateLabel}</Text>
                    <View style={styles.dotSeparator} />
                    <Text style={styles.timestamp}>{timeAgoLabel}</Text>
                  </View>
                </View>
              </View>

              {!isLoadingTags && taggedPeopleDetails.length > 0 && (
                <TaggedPeopleBadges people={taggedPeopleDetails} badgeSize={22} fontSize={9} />
              )}
            </View>
            <View style={styles.titleSubtitleContainer}>
              {storyTitle && (
                <ThemedText variant="bodySmall" style={styles.storyTitleText} numberOfLines={2}>
                  {storyTitle}
                </ThemedText>
              )}
              {storySubtitle && (
                <ThemedText variant="caption" style={styles.storySubtitleText} numberOfLines={2}>
                  {storySubtitle}
                </ThemedText>
              )}
            </View>
          </View>
          {/* {textBlock && (
            <ThemedText variant="bodyMedium" style={styles.textContent} numberOfLines={3}>
              {textBlock.data as string}
            </ThemedText>
          )} */}
        </TouchableOpacity>
        {galleryMediaItems.length > 0 && (
          <MediaGallery
            media={galleryMediaItems}
            onAddMedia={() => {}}
            onRemoveMedia={() => {}}
            onReplaceMedia={() => {}}
            showRemoveButton={false}
            showReplaceButton={false}
            allowAddingMore={false}
            imageStyle={styles.galleryImage}
          />
        )}
        {story.location && (
          <View style={styles.locationContainer}>
            <Ionicons name="location-sharp" size={16} color="#555" />
            <ThemedText variant="caption" color="secondary" style={styles.locationText} numberOfLines={1}>
              {story.location.address}
            </ThemedText>
          </View>
        )}
        <TouchableOpacity onPress={() => onPress(story)} activeOpacity={0.8}>
          <View style={styles.footer}>
            <View style={styles.statItem}>
              <Ionicons name="chatbubbles-outline" size={16} color="#555" />
              <ThemedText variant="caption" color="secondary" style={styles.statText}>
                {story.commentCount ?? 0} Comments
              </ThemedText>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="images-outline" size={16} color="#555" />
              <ThemedText variant="caption" color="secondary" style={styles.statText}>
                {mediaCount} Media
              </ThemedText>
            </View>
            {typeof story.likeCount !== 'undefined' && (
              <View style={styles.statItem}>
                <Ionicons name="heart-outline" size={16} color="#555" />
                <ThemedText variant="caption" color="secondary" style={styles.statText}>
                  {story.likeCount} Likes
                </ThemedText>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: Spacing.md,
  },
  topRowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  userInfoContainer: { 
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1, 
    marginRight: Spacing.sm, 
  },
  avatar: {},
  userNameAndTimestamp: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    marginLeft: Spacing.sm,
  },
  authorName: {
    fontWeight: '600',
  },
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  datePill: {
    backgroundColor: '#E8F5E9',
    color: '#1A4B44',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 11,
    fontWeight: '500',
    overflow: 'hidden',
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#B0B0B0',
    marginHorizontal: 5,
  },
  timestamp: {
    fontSize: 11,
    color: '#777',
  },
  titleSubtitleContainer: {
    marginTop: Spacing.sm,
    width: '100%',
  },
  storyTitleText: {
    fontWeight: '500',
  },
  storySubtitleText: {
    marginTop: Spacing.xxs / 2,
    color: '#555',
  },
  moreButton: {
    padding: Spacing.xs,
  },
  textContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.sm,
    margin: Spacing.md,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  locationText: {
    marginLeft: Spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EFEFF4',
    padding: Spacing.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  statText: {
    marginLeft: Spacing.xs,
  },
});

export default StoryPost; 