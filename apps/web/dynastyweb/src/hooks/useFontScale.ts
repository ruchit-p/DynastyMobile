import { useEffect, useState } from 'react';
import FontSizeService from '../services/FontSizeService';

export function useFontScale() {
  const fontService = FontSizeService.getInstance();
  const [fontScale, setFontScale] = useState(fontService.getFontScale());

  useEffect(() => {
    // Subscribe to font scale changes
    const unsubscribe = fontService.addListener((scale) => {
      setFontScale(scale);
    });

    return unsubscribe;
  }, [fontService]);

  const getScaledFontSize = (size: number) => {
    return fontService.getScaledFontSize(size);
  };

  const getScaledLineHeight = (lineHeight: number) => {
    return fontService.getScaledLineHeight(lineHeight);
  };

  const getScaledSpacing = (spacing: number) => {
    return fontService.getScaledSpacing(spacing);
  };

  // Get scaled font size as rem string
  const getScaledRem = (rem: number) => {
    return `${rem * fontScale}rem`;
  };

  // Get scaled pixel value as string
  const getScaledPx = (px: number) => {
    return `${Math.round(px * fontScale)}px`;
  };

  return {
    fontScale,
    getScaledFontSize,
    getScaledLineHeight,
    getScaledSpacing,
    getScaledRem,
    getScaledPx,
    setFontScale: (scale: number) => fontService.setFontScale(scale),
    setUseDeviceSettings: (use: boolean) => fontService.setUseDeviceSettings(use),
  };
}