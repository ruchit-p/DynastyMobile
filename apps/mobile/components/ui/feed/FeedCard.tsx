import React from 'react';
import { 
  View, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  StyleProp, 
  ViewStyle 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import design system components and utilities
import Card from '../Card';
import { ThemedText } from '../../ThemedText';
import Avatar from '../Avatar';
import { Spacing, BorderRadius } from '../../../constants/Spacing';
import { useBorderColor, useTextColor, useIconColor } from '../../../hooks/useThemeColor';

// Define the Post interface
export interface Post {
  id: string;
  authorId: string;
  createdAt: Date;
  text?: string;
  imageUrl?: string;
  location?: string;
  authorName?: string;
  authorAvatar?: string;
  commentsCount?: number;
  likesCount?: number;
}

interface FeedCardProps {
  post: Post;
  onPress: (post: Post) => void;
  onMorePress?: (post: Post) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * FeedCard Component
 * 
 * A card component for displaying posts in the feed screen.
 */
const FeedCard: React.FC<FeedCardProps> = ({
  post,
  onPress,
  onMorePress,
  style,
  testID,
}) => {
  // Get theme colors
  const borderColor = useBorderColor();
  const secondaryTextColor = useTextColor('secondary');
  const tertiaryTextColor = useTextColor('tertiary');
  const iconColor = useIconColor('secondary');
  
  // Helper function to format timestamp
  const formatTimestamp = (date: Date | null): string => {
    if (!date) return '';
    
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);
    
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  const handleMorePress = (e: any) => {
    e.stopPropagation();
    if (onMorePress) {
      onMorePress(post);
    }
  };
  
  return (
    <TouchableOpacity
      onPress={() => onPress(post)}
      style={style}
      testID={testID}
      activeOpacity={0.8}
    >
      <Card variant="elevated" noPadding>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Avatar
              source={post.authorAvatar}
              size="sm"
              style={styles.avatar}
            />
            
            <View style={styles.headerInfo}>
              <ThemedText variant="bodyMedium" style={styles.authorName}>
                {post.authorName || 'User'}
              </ThemedText>
              
              <ThemedText variant="caption" color="tertiary" style={styles.timestamp}>
                {formatTimestamp(post.createdAt)}
              </ThemedText>
            </View>
            
            <TouchableOpacity 
              style={styles.moreButton} 
              onPress={handleMorePress}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={iconColor} />
            </TouchableOpacity>
          </View>
          
          {/* Content */}
          {post.text && (
            <ThemedText 
              variant="bodyMedium" 
              style={styles.textContent} 
              numberOfLines={3}
            >
              {post.text}
            </ThemedText>
          )}
          
          {post.imageUrl && (
            <Image 
              source={{ uri: post.imageUrl }} 
              style={styles.image} 
              resizeMode="cover"
            />
          )}
          
          {/* Location */}
          {post.location && (
            <View style={styles.locationContainer}>
              <Ionicons name="location-sharp" size={16} color={iconColor} />
              <ThemedText variant="caption" color="secondary" style={styles.locationText}>
                {post.location}
              </ThemedText>
            </View>
          )}
          
          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: borderColor }]}>
            <View style={styles.statItem}>
              <Ionicons name="chatbubbles-outline" size={16} color={iconColor} />
              <ThemedText variant="caption" color="secondary" style={styles.statText}>
                {post.commentsCount || 0} Comments
              </ThemedText>
            </View>
            
            {post.likesCount !== undefined && (
              <View style={styles.statItem}>
                <Ionicons name="heart-outline" size={16} color={iconColor} />
                <ThemedText variant="caption" color="secondary" style={styles.statText}>
                  {post.likesCount} Likes
                </ThemedText>
              </View>
            )}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
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
  timestamp: {
    marginTop: 2,
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
    borderTopWidth: 1,
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

export default FeedCard;