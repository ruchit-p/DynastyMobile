import React, { ReactNode } from 'react';
import { 
  StyleProp,
  ViewStyle,
  StatusBar 
} from 'react-native';
import { useColorScheme } from '../../hooks/useColorScheme';
import Screen, { ScrollOptions } from './Screen';

export type ScrollBehavior = 'always' | 'never' | 'auto';

export interface ScreenLayoutProps {
  // Content
  children: ReactNode;
  
  // Behavior
  scroll?: ScrollBehavior;
  refreshing?: boolean;
  onRefresh?: () => void;
  
  // Appearance
  useSafeArea?: boolean;
  withStatusBar?: boolean;
  padding?: boolean | number;
  
  // Style overrides
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  
  // Optional props
  testID?: string;
}

/**
 * ScreenLayout Component
 * 
 * A standardized layout for screens with consistent padding, safe area handling,
 * and scrolling behavior.
 * 
 * This component now uses the new Screen component from our design system while
 * maintaining the same API for backward compatibility.
 */
const ScreenLayout: React.FC<ScreenLayoutProps> = ({
  children,
  scroll = 'auto',
  refreshing = false,
  onRefresh,
  useSafeArea = true,
  withStatusBar = true,
  padding = true,
  style,
  contentContainerStyle,
  testID,
}) => {
  const colorScheme = useColorScheme();
  const theme = colorScheme || 'light';
  
  // Convert scroll behavior to ScrollOptions
  let scrollOptions: boolean | ScrollOptions = false;
  
  if (scroll === 'always') {
    scrollOptions = {
      enabled: true,
      refreshing,
      onRefresh,
      showsVerticalScrollIndicator: false
    };
  } else if (scroll === 'auto') {
    // Auto means it will scroll if content is too large
    scrollOptions = {
      enabled: true,
      refreshing,
      onRefresh,
      showsVerticalScrollIndicator: false
    };
  }
  
  return (
    <>
      {withStatusBar && (
        <StatusBar 
          barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} 
          backgroundColor="transparent"
          translucent
        />
      )}
      
      <Screen
        safeArea={useSafeArea}
        padding={padding}
        scroll={scrollOptions}
        style={style}
        contentContainerStyle={contentContainerStyle}
        testID={testID}
      >
        {children}
      </Screen>
    </>
  );
};

export default ScreenLayout;