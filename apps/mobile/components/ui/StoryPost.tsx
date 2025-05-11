import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import ThemedText from '../ThemedText';
import Divider from './Divider';
import { useBorderColor, useTextColor, useIconColor } from '../../hooks/useThemeColor';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import type { Story } from '../../src/lib/storyUtils';

interface StoryPostProps {
  story: Story;
  onPress?: () => void;
  onMorePress?: () => void;
}

const StoryPost: React.FC<StoryPostProps> = ({ story, onPress, onMorePress }) => {
  const borderColor = useBorderColor('primary');
  const iconColor = useIconColor('secondary');

  // Extract first text and image blocks
  const textBlock = story.blocks.find(b => b.type === 'text');
  const imageBlock = story.blocks.find(b => b.type === 'image');

  const createdDate = new Date(story.createdAt.seconds * 1000);
  const dateString = createdDate.toLocaleDateString();
  const timeString = createdDate.toLocaleTimeString();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.wrapper}>
      <Card variant="elevated" noPadding>
        <View style={styles.container}>
          <View style={styles.header}>
            <Image
              source={ story.authorAvatar ? { uri: story.authorAvatar } : undefined }
              style={styles.avatar}
            />
            <View style={styles.headerInfo}>
              <ThemedText variant="bodyMedium" style={styles.authorName}>
                {story.authorName || story.authorID}
              </ThemedText>
              <ThemedText variant="caption" color="tertiary">
                {dateString} {timeString}
              </ThemedText>
            </View>
            {onMorePress && (
              <TouchableOpacity onPress={onMorePress} style={styles.moreButton}>
                <Ionicons name="ellipsis-horizontal" size={20} color={iconColor} />
              </TouchableOpacity>
            )}
          </View>

          {textBlock && (
            <ThemedText variant="bodyMedium" style={styles.textContent} numberOfLines={2}>
              {textBlock.data as string}
            </ThemedText>
          )}

          {imageBlock && Array.isArray(imageBlock.data) && imageBlock.data.length > 0 && (
            <Image source={{ uri: imageBlock.data[0] as string }} style={styles.image} />
          )}

          {story.location && (
            <View style={styles.locationContainer}>
              <Ionicons name="location-sharp" size={16} color={iconColor} />
              <ThemedText variant="caption" color="secondary" style={styles.locationText}>
                {story.location.address}
              </ThemedText>
            </View>
          )}

          <Divider />

          <View style={[styles.footer, { borderTopColor: borderColor }]}>  
            <View style={styles.statItem}>
              <Ionicons name="chatbubbles-outline" size={16} color={iconColor} />
              <ThemedText variant="caption" color="secondary" style={styles.statText}>
                {story.commentCount || 0} Comments
              </ThemedText>
            </View>
            <View style={styles.statItem}>
              <Ionicons name={story.isLiked ? 'heart' : 'heart-outline'} size={16} color={story.isLiked ? '#E91E63' : iconColor} />
              <ThemedText variant="caption" color="secondary" style={styles.statText}>
                {story.likeCount || 0} Likes
              </ThemedText>
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
  },
  container: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: '#CCC',
    marginRight: Spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  authorName: {
    fontWeight: '600',
  },
  moreButton: {
    padding: Spacing.xs,
  },
  textContent: {
    marginBottom: Spacing.sm,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  locationText: {
    marginLeft: Spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    paddingTop: Spacing.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.lg,
  },
  statText: {
    marginLeft: Spacing.xs,
  },
});

export default StoryPost; 