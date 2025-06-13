import type { SharedValue } from 'react-native-reanimated';

export interface GestureState {
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  focalX: SharedValue<number>;
  focalY: SharedValue<number>;
}

export class GestureHandler {
  private minScale: number;
  private maxScale: number;

  constructor(minScale = 0.3, maxScale = 2.0) {
    this.minScale = minScale;
    this.maxScale = maxScale;
  }

  clampScale(scale: number): number {
    return Math.max(this.minScale, Math.min(this.maxScale, scale));
  }

  calculateFocalPoint(
    centerX: number,
    centerY: number,
    scale: number,
    viewportWidth: number,
    viewportHeight: number
  ): { x: number; y: number } {
    const focalX = (centerX - viewportWidth / 2) * scale;
    const focalY = (centerY - viewportHeight / 2) * scale;
    return { x: focalX, y: focalY };
  }

  limitTranslation(
    translateX: number,
    translateY: number,
    scale: number,
    contentWidth: number,
    contentHeight: number,
    viewportWidth: number,
    viewportHeight: number
  ): { x: number; y: number } {
    const scaledContentWidth = contentWidth * scale;
    const scaledContentHeight = contentHeight * scale;

    const maxTranslateX = Math.max(0, (scaledContentWidth - viewportWidth) / 2);
    const maxTranslateY = Math.max(0, (scaledContentHeight - viewportHeight) / 2);

    const limitedX = Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX));
    const limitedY = Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY));

    return { x: limitedX, y: limitedY };
  }
}