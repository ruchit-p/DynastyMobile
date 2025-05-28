import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { useFontScale } from '../src/hooks/useFontScale';

interface ScaledTextProps extends TextProps {
  style?: TextStyle | TextStyle[];
}

export const ScaledText: React.FC<ScaledTextProps> = ({ style, children, ...props }) => {
  const { getScaledFontSize, getScaledLineHeight } = useFontScale();

  const getScaledStyle = (originalStyle: TextStyle | TextStyle[] | undefined) => {
    if (!originalStyle) return undefined;

    const processStyle = (s: TextStyle): TextStyle => {
      const scaledStyle: TextStyle = { ...s };
      
      if (s.fontSize) {
        scaledStyle.fontSize = getScaledFontSize(s.fontSize);
      }
      
      if (s.lineHeight) {
        scaledStyle.lineHeight = getScaledLineHeight(s.lineHeight);
      }
      
      return scaledStyle;
    };

    if (Array.isArray(originalStyle)) {
      return originalStyle.map(s => (s && typeof s === 'object' ? processStyle(s) : s));
    }
    
    return processStyle(originalStyle);
  };

  return (
    <Text {...props} style={getScaledStyle(style)}>
      {children}
    </Text>
  );
};