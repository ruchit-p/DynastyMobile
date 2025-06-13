import React, { memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import type { NodeRendererProps } from '../types';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export const NodeRenderer = memo<NodeRendererProps>(({
  node,
  isSelected,
  scale,
  scaleFactor,
  onPress,
  renderContent,
}) => {
  const nodeStyle = useAnimatedStyle(() => {
    const nodeScale = isSelected ? withSpring(1.1) : withSpring(1);
    
    return {
      position: 'absolute',
      left: node.left * scaleFactor,
      top: node.top * scaleFactor,
      width: 150,
      height: 80,
      transform: [{ scale: nodeScale }],
    };
  });

  return (
    <AnimatedTouchableOpacity
      style={nodeStyle}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.nodeContent}>
        {renderContent ? renderContent(node, isSelected) : (
          <View style={[styles.defaultNode, isSelected && styles.selectedNode]} />
        )}
      </View>
    </AnimatedTouchableOpacity>
  );
});

NodeRenderer.displayName = 'NodeRenderer';

const styles = StyleSheet.create({
  nodeContent: {
    width: '100%',
    height: '100%',
  },
  defaultNode: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  selectedNode: {
    borderColor: '#FFB800',
    borderWidth: 2,
    backgroundColor: '#FFFDE7',
  },
});