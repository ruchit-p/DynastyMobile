import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import ThemedText from '../ThemedText';
import ProfilePicture from './ProfilePicture';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import type { Story } from '../../src/lib/storyUtils';

export interface StoryPostProps {
  story: Story;
  onPress: (story: Story) => void;
  onMorePress?: (story: Story) => void;
  style?: StyleProp<ViewStyle>;
}

const StoryPost: React.FC<StoryPostProps> = ({ story, onPress, onMorePress, style }) => {
  // Parse createdAt robustly whether it's a Firestore Timestamp or raw object
  let createdDate: Date;
  if (story.createdAt && typeof (story.createdAt as any).toDate === 'function') {
    // Firestore Timestamp instance
    createdDate = (story.createdAt as any).toDate();
  } else if (story.createdAt && (story.createdAt as any).seconds) {
    // Serialized Timestamp
    createdDate = new Date((story.createdAt as any).seconds * 1000);
  } else {
    // Fallback for ISO string or number
    createdDate = new Date(story.createdAt as any);
  }
  const diffSeconds = Math.round((Date.now() - createdDate.getTime()) / 1000);
  const timeLabel = diffSeconds < 60 ? `${diffSeconds}s ago`
    : diffSeconds < 3600 ? `${Math.round(diffSeconds/60)}m ago`
    : diffSeconds < 86400 ? `${Math.round(diffSeconds/3600)}h ago`
    : createdDate.toLocaleDateString();

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
            <ThemedText variant="caption" color="tertiary">
              {timeLabel}
            </ThemedText>
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