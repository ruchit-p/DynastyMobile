import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity, StyleProp, ViewStyle, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import ThemedText from '../ThemedText';
import ProfilePicture from './ProfilePicture';
import MediaGallery from './MediaGallery';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import type { Story } from '../../src/lib/storyUtils';
import { formatDate, formatTimeAgo } from '../../src/lib/dateUtils';
import * as ImagePicker from 'expo-image-picker';

export interface StoryPostProps {
  story: Story;
  onPress: (story: Story) => void;
  onMorePress?: (story: Story) => void;
  style?: StyleProp<ViewStyle>;
}

const StoryPost: React.FC<StoryPostProps> = ({ story, onPress, onMorePress, style }) => {
  // Directly use story.createdAt with the utility functions
  // toDate within them will handle conversion and validation.
  const dateLabel = formatDate(story.createdAt);
  const timeAgoLabel = formatTimeAgo(story.createdAt);
  const storyTitle = (story as any).title || (story.blocks.find(b => b.type === 'text')?.data as string || '');
  const storySubtitle = (story as any).subtitle;

  const textBlock = story.blocks.find(b => b.type === 'text');
  const imgBlock = story.blocks.find(b => b.type === 'image');
  const mediaCount = story.blocks.filter(b => b.type === 'image' || b.type === 'video').length;

  // Prepare media for MediaGallery
  const galleryMediaItems = React.useMemo(() => {
    if (!story || !story.blocks) return [];
    const items: Array<{ uri: string; type: 'image' | 'video'; width?: number; height?: number; duration?: number; asset?: ImagePicker.ImagePickerAsset }> = [];
    story.blocks.forEach(block => {
      if (block.type === 'image' && Array.isArray(block.data)) {
        (block.data as Array<string | { uri: string; width?: number; height?: number }>).forEach(imgData => {
          if (typeof imgData === 'string') {
            items.push({ uri: imgData, type: 'image' });
          } else if (imgData && imgData.uri) {
            items.push({ uri: imgData.uri, type: 'image', width: imgData.width, height: imgData.height });
          }
        });
      }
      // TODO: Handle video blocks if story.blocks can include them for MediaGallery
      // e.g., else if (block.type === 'video' && block.data?.uri) { items.push({ ... }); }
    });
    return items;
  }, [story]);

  return (
    <View style={[styles.container, style]}>
      <Card variant="elevated" noPadding>
        <TouchableOpacity onPress={() => onPress(story)} activeOpacity={0.8}>
          <View style={styles.header}>
            <View style={styles.topRowInfo}>
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
    marginBottom: Spacing.sm, // Reduced from md (16) to sm (8)
  },
  header: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: Spacing.md,
  },
  topRowInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  avatar: {
    // marginRight: Spacing.sm, // This should be removed
  },
  userNameAndTimestamp: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    marginLeft: Spacing.sm,
    flex: 1,
  },
  headerInfo: {
    flex: 1,
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