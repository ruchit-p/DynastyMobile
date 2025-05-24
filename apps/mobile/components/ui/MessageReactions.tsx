import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  PanResponder,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useThemeColor } from '../../hooks/useThemeColor';
import { BlurView } from 'expo-blur';

interface Reaction {
  emoji: string;
  userIds: string[];
}

interface MessageReactionsProps {
  reactions?: Reaction[];
  onReact: (emoji: string) => void;
  currentUserId: string;
}

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '👏'];
const ALL_REACTIONS = [
  { category: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😊', '😇', '🥰', '😍'] },
  { category: 'Gestures', emojis: ['👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '✨'] },
  { category: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💕'] },
  { category: 'Faces', emojis: ['😂', '🤣', '😭', '😢', '😮', '😱', '🤔', '😴'] },
  { category: 'Celebrations', emojis: ['🎉', '🎊', '🎈', '🎁', '🎂', '🍾', '🥳', '✨'] },
];

export function MessageReactions({ reactions = [], onReact, currentUserId }: MessageReactionsProps) {
  const [showAllReactions, setShowAllReactions] = useState(false);
  
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({}, 'border');

  const handleQuickReaction = useCallback((emoji: string) => {
    onReact(emoji);
  }, [onReact]);

  const getUserReaction = useCallback(() => {
    for (const reaction of reactions) {
      if (reaction.userIds.includes(currentUserId)) {
        return reaction.emoji;
      }
    }
    return null;
  }, [reactions, currentUserId]);

  const userReaction = getUserReaction();

  if (reactions.length === 0 && !showAllReactions) {
    return null;
  }

  return (
    <>
      {/* Reaction Summary */}
      {reactions.length > 0 && (
        <View style={styles.reactionContainer}>
          {reactions.slice(0, 3).map((reaction, index) => (
            <TouchableOpacity
              key={`${reaction.emoji}-${index}`}
              style={[
                styles.reactionBubble,
                { 
                  backgroundColor: reaction.userIds.includes(currentUserId) 
                    ? Colors.light.primary + '20' 
                    : borderColor 
                }
              ]}
              onPress={() => handleQuickReaction(reaction.emoji)}
            >
              <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
              {reaction.userIds.length > 1 && (
                <Text style={[styles.reactionCount, { color: textColor }]}>
                  {reaction.userIds.length}
                </Text>
              )}
            </TouchableOpacity>
          ))}
          
          {reactions.length > 3 && (
            <TouchableOpacity
              style={[styles.moreReactions, { backgroundColor: borderColor }]}
              onPress={() => setShowAllReactions(true)}
            >
              <Text style={[styles.moreText, { color: textColor }]}>
                +{reactions.length - 3}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* All Reactions Modal */}
      <Modal
        visible={showAllReactions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAllReactions(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1}
          onPress={() => setShowAllReactions(false)}
        >
          <BlurView intensity={80} style={styles.blurView}>
            <View style={[styles.modalContent, { backgroundColor }]}>
              {/* Quick Reactions */}
              <View style={styles.quickReactionsRow}>
                {QUICK_REACTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.quickReactionButton,
                      { 
                        backgroundColor: userReaction === emoji 
                          ? Colors.light.primary + '20' 
                          : borderColor 
                      }
                    ]}
                    onPress={() => {
                      handleQuickReaction(emoji);
                      setShowAllReactions(false);
                    }}
                  >
                    <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* All Reactions */}
              <ScrollView style={styles.allReactionsScroll} showsVerticalScrollIndicator={false}>
                {ALL_REACTIONS.map((category) => (
                  <View key={category.category} style={styles.categorySection}>
                    <Text style={[styles.categoryTitle, { color: textColor }]}>
                      {category.category}
                    </Text>
                    <View style={styles.emojiGrid}>
                      {category.emojis.map((emoji) => (
                        <TouchableOpacity
                          key={emoji}
                          style={[
                            styles.emojiButton,
                            { 
                              backgroundColor: userReaction === emoji 
                                ? Colors.light.primary + '20' 
                                : 'transparent' 
                            }
                          ]}
                          onPress={() => {
                            handleQuickReaction(emoji);
                            setShowAllReactions(false);
                          }}
                        >
                          <Text style={styles.emoji}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </BlurView>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export function ReactionPicker({ 
  visible, 
  onSelect, 
  onClose, 
  anchorPosition 
}: {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  anchorPosition?: { x: number; y: number };
}) {
  const backgroundColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({}, 'border');
  const scaleAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 5,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible, scaleAnim]);

  if (!visible) return null;

  return (
    <TouchableOpacity 
      style={styles.pickerOverlay} 
      activeOpacity={1}
      onPress={onClose}
    >
      <Animated.View 
        style={[
          styles.pickerContainer,
          { 
            backgroundColor,
            borderColor,
            transform: [{ scale: scaleAnim }],
            ...(anchorPosition && {
              position: 'absolute',
              top: anchorPosition.y - 60,
              left: anchorPosition.x - 150,
            })
          }
        ]}
      >
        <View style={styles.pickerContent}>
          {QUICK_REACTIONS.map((emoji, index) => (
            <TouchableOpacity
              key={emoji}
              style={styles.pickerEmoji}
              onPress={() => {
                onSelect(emoji);
                onClose();
              }}
            >
              <Animated.Text 
                style={[
                  styles.pickerEmojiText,
                  {
                    transform: [{
                      scale: scaleAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1],
                      })
                    }]
                  }
                ]}
              >
                {emoji}
              </Animated.Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  reactionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 12,
    marginLeft: 4,
  },
  moreReactions: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurView: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  quickReactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  quickReactionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickReactionEmoji: {
    fontSize: 24,
  },
  allReactionsScroll: {
    maxHeight: 300,
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emojiButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 24,
  },
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  pickerContainer: {
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  pickerContent: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
  },
  pickerEmoji: {
    padding: 8,
  },
  pickerEmojiText: {
    fontSize: 28,
  },
});