import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  InteractionManager,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import calcTree from 'relatives-tree';
import type { Node, ExtNode, Options } from 'relatives-tree/lib/types';

import { VirtualizationEngine } from './core/VirtualizationEngine';
import { SpatialIndex } from './core/SpatialIndex';
import { NodeRenderer } from './renderers/NodeRenderer';
import { ConnectorRenderer } from './renderers/ConnectorRenderer';
import { useTreeCalculation } from './hooks/useTreeCalculation';
import { useViewport } from './hooks/useViewport';
import { measurePerformance } from './utils/performance';
import type { FamilyTreeProps, ViewportBounds } from './types';

const SCALE_FACTOR = 40;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.0;

export const FamilyTree: React.FC<FamilyTreeProps> = ({
  nodes,
  rootId,
  renderNode,
  onNodePress,
  selectedNodeId,
  style,
  onTreeReady,
  performanceMode = 'balanced',
}) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const [isReady, setIsReady] = useState(false);
  const virtualizationEngine = useRef<VirtualizationEngine>();
  const spatialIndex = useRef<SpatialIndex>();

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  const treeData = useTreeCalculation(nodes, rootId);
  const { viewport, updateViewport } = useViewport(scrollViewRef, scale.value);

  useEffect(() => {
    if (treeData) {
      measurePerformance('InitializeEngines', () => {
        virtualizationEngine.current = new VirtualizationEngine(
          treeData.nodes,
          SCALE_FACTOR,
          performanceMode
        );
        spatialIndex.current = new SpatialIndex(treeData.nodes, SCALE_FACTOR);
      });

      InteractionManager.runAfterInteractions(() => {
        setIsReady(true);
        opacity.value = withSpring(1);
        onTreeReady?.();
      });
    }
  }, [treeData, performanceMode]);

  const visibleNodes = useMemo(() => {
    if (!virtualizationEngine.current || !viewport) return [];

    return measurePerformance('CalculateVisibleNodes', () => {
      return virtualizationEngine.current!.getVisibleNodes(viewport);
    });
  }, [viewport, treeData]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, event.scale));
    })
    .onEnd(() => {
      runOnJS(updateViewport)();
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd(() => {
      runOnJS(updateViewport)();
    });

  const composedGestures = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const centerOnNode = useCallback((nodeId: string, animated = true) => {
    if (!treeData || !scrollViewRef.current) return;

    const node = treeData.nodes.find(n => n.id === nodeId);
    if (node) {
      const { width, height } = Dimensions.get('window');
      const x = node.left * SCALE_FACTOR - width / 2;
      const y = node.top * SCALE_FACTOR - height / 2;

      scrollViewRef.current.scrollTo({ x, y, animated });
    }
  }, [treeData]);

  useEffect(() => {
    if (isReady) {
      centerOnNode(rootId, false);
    }
  }, [isReady, rootId, centerOnNode]);

  if (!treeData) {
    return <View style={[styles.container, style]} />;
  }

  const canvasWidth = treeData.canvas.width * SCALE_FACTOR;
  const canvasHeight = treeData.canvas.height * SCALE_FACTOR;

  return (
    <GestureHandlerRootView style={[styles.container, style]}>
      <GestureDetector gesture={composedGestures}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={{
            width: canvasWidth,
            height: canvasHeight,
          }}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={updateViewport}
          removeClippedSubviews
          renderToHardwareTextureAndroid
          decelerationRate="fast"
        >
          <Animated.View style={[styles.canvas, animatedStyle]}>
            <ConnectorRenderer
              connectors={treeData.connectors}
              viewport={viewport}
              scale={scale.value}
              scaleFactor={SCALE_FACTOR}
            />

            {visibleNodes.map((node) => (
              <NodeRenderer
                key={node.id}
                node={node}
                isSelected={node.id === selectedNodeId}
                scale={scale.value}
                scaleFactor={SCALE_FACTOR}
                onPress={() => onNodePress?.(node)}
                renderContent={renderNode}
              />
            ))}
          </Animated.View>
        </ScrollView>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});