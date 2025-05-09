import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  // SafeAreaView, // No longer seems to be used directly here
  // Platform, // No longer seems to be used directly here
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router'; // MARK: - Import useFocusEffect

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

// MARK: - Component
const FloatingActionMenu: React.FC<FloatingActionMenuProps> = ({
  menuItems,
  fabIconName = 'add',
  fabIconLibrary = 'Ionicons',
}) => {
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  // MARK: - Close menu on tab focus
  useFocusEffect(
    useCallback(() => {
      setIsMenuVisible(false);
      return () => {
        // Optional: any cleanup if needed when the screen goes out of focus
        // For this case, closing the menu on focus is enough.
      };
    }, []) // Empty dependency array means this callback is stable
  );

  const renderFabIcon = () => {
    const IconComponent = fabIconLibrary === 'MaterialCommunityIcons' ? MaterialCommunityIcons : Ionicons;
    // Explicitly cast fabIconName to any to satisfy the component's name prop,
    // as it's tricky to typehint a union of two different glyphMaps directly that satisfies both.
    // The `iconName` in FabMenuItemAction will also need this treatment.
    return <IconComponent name={fabIconName as any} size={30} color="#FFFFFF" />;
  };

  const renderMenuItemIcon = (item: FabMenuItemAction) => {
    const IconComponent = item.iconLibrary === 'MaterialCommunityIcons' ? MaterialCommunityIcons : Ionicons;
    return <IconComponent name={item.iconName as any} size={22} color="#333333" style={styles.fabMenuItemIcon} />;
  };

  return (
    <>
      {isMenuVisible && (
        <View style={styles.fabMenu}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.fabMenuItem,
                index < menuItems.length - 1 && styles.menuItemSeparator
              ]}
              onPress={() => {
                setIsMenuVisible(false);
                item.onPress();
              }}
              accessibilityLabel={item.text}
            >
              {renderMenuItemIcon(item)}
              <Text style={styles.fabMenuItemText}>{item.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => setIsMenuVisible(!isMenuVisible)}
        accessibilityLabel={isMenuVisible ? "Close menu" : "Open menu"}
      >
        {renderFabIcon()}
      </TouchableOpacity>
    </>
  );
};

// MARK: - Styles
const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1A4B44', // App theme green
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, // Shadow removed
    shadowRadius: 4,  // Kept for completeness, but no effect with opacity 0
    elevation: 4,     // Shadow removed for Android
    zIndex: 10, // Ensure FAB is above other content but below menu
  },
  fabMenu: {
    position: 'absolute',
    bottom: 95, 
    right: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, // Shadow removed
    shadowRadius: 5,  // Kept for completeness, but no effect with opacity 0
    elevation: 4,     // Shadow removed for Android
    minWidth: 200,
    zIndex: 20, // Ensure menu is above the FAB and other screen content
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  menuItemSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  fabMenuItemIcon: {
    marginRight: 15,
    color: '#333333', // Neutral dark gray for icon
  },
  fabMenuItemText: {
    fontSize: 16,
    color: '#333333', // Dark text for menu items
    fontWeight: '500',
  },
});

export default FloatingActionMenu; 