import React, { ReactNode } from 'react';
import { 
  View, 
  ScrollView, 
  SafeAreaView, 
  StyleSheet, 
  StyleProp, 
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
  RefreshControl
} from 'react-native';
import { useBackgroundColor } from '../../hooks/useThemeColor';
import { Layout, Spacing } from '../../constants/Spacing';

export type ScrollOptions = {
  enabled?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewStyle?: StyleProp<ViewStyle>;
  showsVerticalScrollIndicator?: boolean;
};

export interface ScreenProps {
  // Content
  children: ReactNode;
  
  // Layout options
  safeArea?: boolean;
  padding?: boolean | number;
  scroll?: boolean | ScrollOptions;
  keyboardAvoid?: boolean;
  
  // Style
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  
  // Optional
  testID?: string;
}

/**
 * Screen Component
 * 
 * A wrapper component for screens with consistent styling and layout options.
 * Provides safe area insets, scrolling, padding, and keyboard avoiding behavior.
 */
const Screen: React.FC<ScreenProps> = ({
  children,
  safeArea = true,
  padding = true,
  scroll = false,
  keyboardAvoid = false,
  style,
  contentContainerStyle,
  testID,
}) => {
  // Get theme background color
  const backgroundColor = useBackgroundColor('secondary');
  
  // Determine padding value
  const paddingValue = typeof padding === 'number' 
    ? padding 
    : (padding ? Layout.screenPadding : 0);
  
  // Process scroll options
  const scrollOptions: ScrollOptions = typeof scroll === 'boolean' 
    ? { enabled: scroll } 
    : { enabled: true, ...scroll };

  // Base content container style
  const baseContentStyle: StyleProp<ViewStyle> = [
    styles.content,
    paddingValue ? { padding: paddingValue } : null,
    contentContainerStyle,
  ];
  
  // Main component content
  const renderContent = () => {
    // If scrolling is enabled
    if (scrollOptions.enabled) {
      return (
        <ScrollView
          style={[styles.scrollView, scrollOptions.scrollViewStyle]}
          contentContainerStyle={[baseContentStyle, scrollOptions.contentContainerStyle]}
          showsVerticalScrollIndicator={scrollOptions.showsVerticalScrollIndicator ?? true}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            scrollOptions.onRefresh ? (
              <RefreshControl
                refreshing={scrollOptions.refreshing || false}
                onRefresh={scrollOptions.onRefresh}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      );
    }
    
    // If scrolling is disabled
    return (
      <View style={baseContentStyle}>
        {children}
      </View>
    );
  };
  
  // Wrap content with KeyboardAvoidingView if needed
  const keyboardContent = keyboardAvoid ? (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {renderContent()}
    </KeyboardAvoidingView>
  ) : (
    renderContent()
  );
  
  // Wrap with SafeAreaView if needed
  return safeArea ? (
    <SafeAreaView 
      style={[styles.safeArea, { backgroundColor }, style]}
      testID={testID}
    >
      {keyboardContent}
    </SafeAreaView>
  ) : (
    <View 
      style={[styles.container, { backgroundColor }, style]}
      testID={testID}
    >
      {keyboardContent}
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

export default Screen;