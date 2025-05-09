import React, { useState, useEffect } from 'react';
import {
  // SafeAreaView, // AppHeader handles top safe area
  StyleSheet,
  Text,
  View,
  Platform,
  Image,
  TouchableOpacity,
  Alert // Keep Alert for moreOptionsButton
} from 'react-native';
import RelativesTree, { type RelativeItemComponent, type RelativeItem as RelativeItemType, type RelativeItemProps } from '../../react-native-relatives-tree/src';
import { useRouter } from 'expo-router';
import AppHeader from '../../components/ui/AppHeader'; // Import AppHeader
import { Colors } from '../../constants/Colors'; // Import Colors
import { useColorScheme } from 'react-native'; // Changed from '../../hooks/useColorScheme'
import AnimatedActionSheet, { type ActionSheetAction } from '../../components/ui/AnimatedActionSheet';
import { Ionicons } from '@expo/vector-icons'; // For headerRight icon

// Define the Items type for your specific data structure
type Items = RelativeItemType & {
  id: string;
  name: string;
  spouse?: Items;
  dob: string;
  dod?: string;
  // Add any other properties your nodes might have, e.g., avatar
  avatar?: string; 
};

// Example Data (as per the library's documentation)
const relatives: Items[] = [
  {
    id: 'john1',
    name: 'John',
    dob: '01/05/2004',
    spouse: {
      id: 'anne1',
      name: 'Anne',
      dob: '04/05/2007',
    },
    children: [
      {
        id: 'dan1',
        name: 'Dan',
        dob: '01/05/2024',
        spouse: {
          id: 'ella1',
          name: 'Ella',
          dob: '04/05/2027',
        },
        children: [
          {
            id: 'olivia1',
            name: 'Olivia',
            dob: '01/05/2044',
          },
          {
            id: 'mary1',
            name: 'Mary',
            dob: '01/05/2045',
          },
        ],
      },
      {
        id: 'jack1',
        name: 'Jack',
        dob: '01/05/2025',
        dod: '03/03/2057',
        spouse: {
          id: 'rachel1',
          name: 'Rachel',
          dob: '04/05/2027',
        },
      },
    ],
  },
];

// Helper function to get initials
const getInitials = (name: string): string => {
  if (!name) return '';
  const nameParts = name.trim().split(' ');
  if (nameParts.length === 1 && nameParts[0].length > 0) {
    return nameParts[0].substring(0, Math.min(2, nameParts[0].length)).toUpperCase();
  }
  return (
    (nameParts[0] ? nameParts[0][0] : '') +
    (nameParts.length > 1 && nameParts[nameParts.length - 1] ? nameParts[nameParts.length - 1][0] : '')
  ).toUpperCase();
};

// NodeDisplayComponent: Renders each node in the tree.
// This component is now a standard React.FC and receives themeColors for styling.
const NodeDisplayComponent: React.FC<
  RelativeItemProps<Items> & { // Includes info, style, level from the library
    onItemPress: (item: Items) => void;
    isItemSelected: boolean;
    themeColors: typeof Colors.light; 
  }
> = ({ info, style, onItemPress, isItemSelected, themeColors, level }) => {
  // Dynamic styles using themeColors
  const nodeStyles = StyleSheet.create({
    itemContainer: {
      padding: 8,
      alignItems: 'center',
      backgroundColor: themeColors.card, 
      borderRadius: 8, // Consistent rounding
      borderWidth: 1,
      borderColor: themeColors.border,
      minWidth: 90, // Ensure a minimum width for content
    },
    selectedItemContainer: {
      borderColor: themeColors.primary,
      borderWidth: 2, // Make selection more prominent
      shadowColor: themeColors.primary, // Use theme primary for shadow
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 4,
      elevation: 6, 
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      marginBottom: 6, // Adjusted spacing
      backgroundColor: themeColors.imagePlaceholder, // Use theme color for placeholder bg
    },
    avatarPlaceholder: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: themeColors.primary, 
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 6,
    },
    avatarPlaceholderText: {
      color: themeColors.headerText, // Use a color that contrasts well with primary
      fontWeight: 'bold',
      fontSize: 18,
    },
    nameText: {
      fontSize: 14,
      color: themeColors.text, 
      textAlign: 'center',
      fontWeight: '500', // Slightly bolder name
    },
  });

  return (
    <TouchableOpacity
      onPress={() => onItemPress(info)}
      // The `style` prop from RelativeItemProps contains positioning styles from the library.
      // Apply it first, then our custom styles.
      style={[nodeStyles.itemContainer, style, isItemSelected && nodeStyles.selectedItemContainer]}
    >
      {info.avatar ? (
        <Image source={{ uri: info.avatar }} style={nodeStyles.avatar} />
      ) : (
        <View style={nodeStyles.avatarPlaceholder}>
          <Text style={nodeStyles.avatarPlaceholderText}>{getInitials(info.name)}</Text>
        </View>
      )}
      <Text style={nodeStyles.nameText} numberOfLines={2} ellipsizeMode="tail">{info.name}</Text>
    </TouchableOpacity>
  );
};

const FamilyTreeScreen = () => {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const currentColors = Colors[colorScheme as 'light' | 'dark']; // Explicit cast

  const [selectedNode, setSelectedNode] = useState<Items | null>(null);
  const [isActionMenuVisible, setIsActionMenuVisible] = useState(false);

  const handleNodePress = (item: Items) => {
    setSelectedNode(item);
    setIsActionMenuVisible(true);
  };

  const handleCloseMenu = () => {
    setIsActionMenuVisible(false);
  };

  const onAddMember = (relationType: 'parent' | 'spouse' | 'child') => {
    handleCloseMenu(); // Close menu first
    if (selectedNode) {
      router.push({
        pathname: '/(screens)/addFamilyMember' as any,
        params: {
          selectedNodeId: selectedNode.id,
          relationType: relationType,
          selectedNodeName: selectedNode.name
        }
      });
    } else {
      // This case should ideally not be reached if actions are only shown when a node is selected.
      Alert.alert("Error", "No node selected for adding member.");
    }
  };

  const onViewProfile = () => {
    handleCloseMenu();
    if (selectedNode) {
      // TODO: Implement actual navigation to a ViewProfileScreen if it exists
      Alert.alert("View Profile", `Viewing profile for ${selectedNode.name} (ID: ${selectedNode.id})`);
      // router.push({ pathname: '/(screens)/viewProfile', params: { userId: selectedNode.id } });
    } else {
      Alert.alert("Error", "No node selected for viewing profile.");
    }
  };
  
  const onEditMember = () => {
    handleCloseMenu();
    if (selectedNode) {
        Alert.alert("Edit Member", `Editing member ${selectedNode.name} (ID: ${selectedNode.id})`);
        // router.push({ pathname: '/(screens)/editFamilyMember', params: { memberId: selectedNode.id } });
    } else {
        Alert.alert("Error", "No node selected for editing.");
    }
  };

  let dynamicActions: ActionSheetAction[] = [];
  if (selectedNode) {
    dynamicActions = [
      { title: 'View Profile', onPress: onViewProfile }, // Removed icon
      { title: 'Edit Member', onPress: onEditMember }, // Removed icon
      { title: 'Add Parent', onPress: () => onAddMember('parent') }, // Removed icon
      { title: 'Add Spouse', onPress: () => onAddMember('spouse') }, // Removed icon
      { title: 'Add Child', onPress: () => onAddMember('child') }, // Removed icon
      { title: 'Cancel', onPress: handleCloseMenu, style: 'cancel' }, // Removed icon
    ];
  }
  
  // Header Right Action (previously in _layout.tsx)
  const headerRightFamilyTree = (
    <TouchableOpacity 
      onPress={() => {
        // This could open a different action sheet for general tree options
        // For now, directly triggering an alert as in _layout.tsx example
        Alert.alert(
          "Family Tree Options",
          "",
          [
            { text: "Add new member (root)", onPress: () => router.push('/(screens)/addFamilyMember' as any) }, // For adding a new root
            { text: "Family tree settings", onPress: () => router.push('/(screens)/familyTreeSettings' as any) },
            { text: "Invite members", onPress: () => router.push('/(screens)/inviteMembers' as any) },
            { text: "Cancel", style: "cancel" }
          ],
          { cancelable: true }
        );
      }}
      style={{ marginRight: 0 }} // AppHeader handles padding
    >
      <Ionicons name="ellipsis-vertical" size={24} color={currentColors.primary} />
    </TouchableOpacity>
  );

  // renderTreeItem: Function passed to RelativesTree to render each node.
  // It uses NodeDisplayComponent and provides necessary props from the FamilyTreeScreen scope.
  const renderTreeItem: RelativeItemComponent<Items> = (libProvidedProps) => {
    const { info, style, level } = libProvidedProps; // Destructure from library props
    const isSelected = selectedNode?.id === info.id;

    return (
      <NodeDisplayComponent
        info={info}
        style={style} // Pass style from libProvidedProps (for positioning)
        level={level} // Pass level
        onItemPress={handleNodePress} // Use handleNodePress from FamilyTreeScreen's scope
        isItemSelected={isSelected}   // Use isSelected state from FamilyTreeScreen's scope
        themeColors={currentColors}   // Pass current theme colors
      />
    );
  };

  return (
    <View style={[styles.safeArea, { backgroundColor: currentColors.background }]}>
      <AppHeader title="Family Tree" rightActions={headerRightFamilyTree} />
      <RelativesTree
        data={relatives} // Replace with your actual data source
        spouseKey="spouse"
        relativeItem={renderTreeItem} // Use the new render function
        cardWidth={100} // Adjusted for potentially smaller text/avatar
        gap={30} // Increased gap slightly
        pathColor={currentColors.primary} // Use theme color
        strokeWidth={2}
        style={[styles.treeContainer, { backgroundColor: currentColors.surface }]} // Theme background
      />

      {selectedNode && (
        <AnimatedActionSheet
          isVisible={isActionMenuVisible}
          onClose={handleCloseMenu}
          title={`Actions for ${selectedNode.name}`}
          actions={dynamicActions}
          // Pass currentColors to AnimatedActionSheet if it needs theming for its internal elements
        />
      )}
    </View>
  );
};

// Updated styles to use theme colors
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // backgroundColor: currentColors.background, // Set in component
  },
  treeContainer: {
    flex: 1,
    // backgroundColor: currentColors.surface, // Set in component
    padding: 10,
  },
  // Styles for NodeDisplayComponent are now defined within that component
  // to make them dynamically themeable.
  // itemContainer, selectedItemContainer, avatar, avatarPlaceholder, 
  // avatarPlaceholderText, nameText are removed from here.

  // Add any other styles specific to FamilyTreeScreen itself here, using currentColors if needed
  // For example, if there was a loading indicator or empty state message specific to this screen.
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor: currentColors.background, // Not needed if set on safeArea
  },
  emptyStateText: {
    fontSize: 16,
    // color: currentColors.textMuted,
    textAlign: 'center',
    marginTop: 20,
  }
});

export default FamilyTreeScreen; 