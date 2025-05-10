import React, { useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

// Import design system components
import ThemedText from '../ThemedText';
import { Spacing, BorderRadius, Shadows } from '../../constants/Spacing';
import { useBackgroundColor, useBorderColor, useIconColor } from '../../hooks/useThemeColor';
import { Colors } from '../../constants/Colors';

// MARK: - Types
export interface FabMenuItemAction {
  id: string;
  iconName: keyof typeof Ionicons.glyphMap | keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
  onPress: () => void;
  iconLibrary?: 'Ionicons' | 'MaterialCommunityIcons';
}

interface FloatingActionMenuProps {
  menuItems: FabMenuItemAction[];
  fabIconName?: keyof typeof Ionicons.glyphMap | keyof typeof MaterialCommunityIcons.glyphMap;
  fabIconLibrary?: 'Ionicons' | 'MaterialCommunityIcons';
}

export interface FloatingActionMenuRef {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

// MARK: - Component
const FloatingActionMenu = forwardRef<FloatingActionMenuRef, FloatingActionMenuProps>((
  {
    menuItems,
    fabIconName = 'add',
    fabIconLibrary = 'Ionicons',
  },
  ref
) => {
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  
  // Expose open, close, toggle methods via ref
  useImperativeHandle(ref, () => ({
    open: () => setIsMenuVisible(true),
    close: () => setIsMenuVisible(false),
    toggle: () => setIsMenuVisible(prevState => !prevState),
  }));

  // Get theme colors
  const primaryBackground = useBackgroundColor('primary');
  const secondaryBackground = useBackgroundColor('secondary');
  const borderColor = useBorderColor('primary');
  const iconColor = useIconColor('secondary');

  // MARK: - Close menu on tab focus
  useFocusEffect(
    useCallback(() => {
      setIsMenuVisible(false);
      return () => {
        // Optional: any cleanup if needed when the screen goes out of focus
      };
    }, [])
  );

  const renderFabIcon = () => {
    const IconComponent = fabIconLibrary === 'MaterialCommunityIcons' ? MaterialCommunityIcons : Ionicons;
    return <IconComponent name={fabIconName as any} size={30} color="#FFFFFF" />;
  };

  const renderMenuItemIcon = (item: FabMenuItemAction) => {
    const IconComponent = item.iconLibrary === 'MaterialCommunityIcons' ? MaterialCommunityIcons : Ionicons;
    return <IconComponent name={item.iconName as any} size={22} color={iconColor} style={styles.fabMenuItemIcon} />;
  };

  return (
    <>
      {isMenuVisible && (
        <View style={[
          styles.fabMenu, 
          { 
            backgroundColor: primaryBackground,
            ...Shadows.md
          }
        ]}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.fabMenuItem,
                index < menuItems.length - 1 && [
                  styles.menuItemSeparator, 
                  { borderBottomColor: borderColor }
                ]
              ]}
              onPress={() => {
                setIsMenuVisible(false);
                item.onPress();
              }}
              accessibilityLabel={item.text}
            >
              {renderMenuItemIcon(item)}
              <ThemedText variant="bodyMedium" style={styles.fabMenuItemText}>
                {item.text}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity 
        style={[
          styles.fab, 
          { backgroundColor: Colors.palette.dynastyGreen.dark },
          Shadows.md
        ]} 
        onPress={() => setIsMenuVisible(!isMenuVisible)}
        accessibilityLabel={isMenuVisible ? "Close menu" : "Open menu"}
        accessibilityRole="button"
      >
        {renderFabIcon()}
      </TouchableOpacity>
    </>
  );
});

// MARK: - Styles
const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  fabMenu: {
    position: 'absolute',
    bottom: 95, 
    right: 30,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    minWidth: 200,
    zIndex: 20,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  menuItemSeparator: {
    borderBottomWidth: 1,
  },
  fabMenuItemIcon: {
    marginRight: Spacing.md,
  },
  fabMenuItemText: {
    fontWeight: '500',
  },
});

export default FloatingActionMenu;