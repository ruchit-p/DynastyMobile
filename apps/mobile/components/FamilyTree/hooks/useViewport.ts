import { useState, useCallback, useRef, RefObject } from 'react';
import { ScrollView, Dimensions, NativeScrollEvent } from 'react-native';
import type { ViewportBounds } from '../types';

export function useViewport(scrollViewRef: RefObject<ScrollView>, scale: number) {
  const [viewport, setViewport] = useState<ViewportBounds | null>(null);
  const scrollOffset = useRef({ x: 0, y: 0 });

  const updateViewport = useCallback((event?: { nativeEvent: NativeScrollEvent }) => {
    if (event) {
      scrollOffset.current = {
        x: event.nativeEvent.contentOffset.x,
        y: event.nativeEvent.contentOffset.y,
      };
    }

    const { width, height } = Dimensions.get('window');
    const { x, y } = scrollOffset.current;

    setViewport({
      minX: x / scale,
      maxX: (x + width) / scale,
      minY: y / scale,
      maxY: (y + height) / scale,
    });
  }, [scale]);

  return { viewport, updateViewport };
}