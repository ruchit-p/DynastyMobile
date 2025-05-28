import { useEffect, useState } from 'react';
import FontSizeService from '../services/FontSizeService';
import Typography from '../constants/Typography';

export function useFontScale() {
  const fontService = FontSizeService.getInstance();
  const [fontScale, setFontScale] = useState(fontService.getFontScale());

  useEffect(() => {
    // Subscribe to font scale changes
    const unsubscribe = fontService.addListener((scale) => {
      setFontScale(scale);
    });

    return unsubscribe;
  }, []);

  const getScaledFontSize = (size: number) => {
    return fontService.getScaledFontSize(size);
  };

  const getScaledLineHeight = (lineHeight: number) => {
    return fontService.getScaledLineHeight(lineHeight);
  };

  const getScaledSpacing = (spacing: number) => {
    return fontService.getScaledSpacing(spacing);
  };

  // Get scaled typography styles
  const getScaledTypography = () => {
    const scaledStyles: any = {};
    
    Object.entries(Typography.styles).forEach(([key, style]) => {
      scaledStyles[key] = {
        ...style,
        fontSize: getScaledFontSize(style.fontSize),
        lineHeight: style.lineHeight ? getScaledLineHeight(style.lineHeight) : undefined,
      };
    });

    return scaledStyles;
  };

  return {
    fontScale,
    getScaledFontSize,
    getScaledLineHeight,
    getScaledSpacing,
    getScaledTypography,
    setFontScale: (scale: number) => fontService.setFontScale(scale),
  };
}