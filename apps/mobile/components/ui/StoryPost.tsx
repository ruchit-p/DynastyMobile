import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity, StyleProp, ViewStyle, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import ThemedText from '../ThemedText';
import ProfilePicture from './ProfilePicture';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import type { Story } from '../../src/lib/storyUtils';
import { formatDate, formatTimeAgo } from '../../src/lib/dateUtils';

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

  const textBlock = story.blocks.find(b => b.type === 'text');
  const imgBlock = story.blocks.find(b => b.type === 'image');
  const mediaCount = story.blocks.filter(b => b.type === 'image' || b.type === 'video').length;

  return (
    <TouchableOpacity onPress={() => onPress(story)} style={[styles.container, style]} activeOpacity={0.8}>
      <Card variant="elevated" noPadding>
        <View style={styles.header}>
          <ProfilePicture 
            source={story.author?.profilePicture} 
            name={story.author?.displayName || story.authorID} 
            size="sm" 
            style={styles.avatar} 
          />
          <View style={styles.headerInfo}>
            <ThemedText variant="bodyMedium" style={styles.authorName}>
              {story.author?.displayName || story.authorID}
            </ThemedText>
            <View style={styles.timestampContainer}>
              <Text style={styles.datePill}>{dateLabel}</Text>
              <View style={styles.dotSeparator} />
              <Text style={styles.timestamp}>{timeAgoLabel}</Text>
            </View>
            {storyTitle && (
              <ThemedText variant="bodySmall" style={styles.storyTitleText} numberOfLines={2}>
                {storyTitle}
              </ThemedText>
            )}
          </View>
          {onMorePress && (
            <TouchableOpacity onPress={() => onMorePress(story)} style={styles.moreButton}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>
        {textBlock && (
          <ThemedText variant="bodyMedium" style={styles.textContent} numberOfLines={3}>
            {textBlock.data as string}
          </ThemedText>
        )}
        {imgBlock && Array.isArray(imgBlock.data) && imgBlock.data.length > 0 && (
          <Image source={{ uri: imgBlock.data[0] }} style={styles.image} />
        )}
        {story.location && (
          <View style={styles.locationContainer}>
            <Ionicons name="location-sharp" size={16} color="#555" />
            <ThemedText variant="caption" color="secondary" style={styles.locationText} numberOfLines={1}>
              {story.location.address}
            </ThemedText>
          </View>
        )}
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
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.sm, // Reduced from md (16) to sm (8)
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  avatar: {
    marginRight: Spacing.sm,
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
  storyTitleText: {
    marginTop: Spacing.xxs,
    fontWeight: '500',
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
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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