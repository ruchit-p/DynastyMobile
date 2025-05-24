import React from 'react';
import { FlashList as ShopifyFlashList, FlashListProps } from '@shopify/flash-list';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';
import { Spacing } from '../../constants/Spacing';

interface DynastyFlashListProps<T> extends Omit<FlashListProps<T>, 'estimatedItemSize'> {
  estimatedItemSize?: number;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
}

export function FlashList<T>({
  estimatedItemSize = 100,
  showsVerticalScrollIndicator = false,
  showsHorizontalScrollIndicator = false,
  contentContainerStyle,
  style,
  ...props
}: DynastyFlashListProps<T>) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const defaultContentContainerStyle = {
    paddingHorizontal: Spacing.md,
    backgroundColor: colors.background.primary,
  };

  const defaultStyle = {
    backgroundColor: colors.background.primary,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ShopifyFlashList
        estimatedItemSize={estimatedItemSize}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
        contentContainerStyle={[defaultContentContainerStyle, contentContainerStyle]}
        style={[defaultStyle, style]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default FlashList;