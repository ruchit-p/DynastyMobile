import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Platform, Image, TouchableOpacity } from 'react-native';
import RelativesTree, { type RelativeItemComponent, type RelativeItem as RelativeItemType } from '../../react-native-relatives-tree/src';
import { useRouter } from 'expo-router';
import AnimatedActionSheet, { type ActionSheetAction } from '../../components/ui/AnimatedActionSheet';

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

// Custom RelativeItem component to render each node
const CustomRelativeItem: RelativeItemComponent<Items, { onPress: (item: Items) => void; isSelected: boolean }> = ({
  level,
  info,
  style,
  onPress,
  isSelected,
}) => (
  <TouchableOpacity onPress={() => onPress(info)} style={[styles.itemContainer, style, isSelected && styles.selectedItemContainer]}>
    {info.avatar ? (
      <Image source={{ uri: info.avatar }} style={styles.avatar} />
    ) : (
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarPlaceholderText}>{getInitials(info.name)}</Text>
      </View>
    )}
    <Text style={styles.nameText}>{info.name}</Text>
  </TouchableOpacity>
);

const FamilyTreeScreen = () => {
  const router = useRouter();
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
    if (selectedNode) {
      router.push({
        pathname: '/(screens)/addFamilyMember',
        params: {
          selectedNodeId: selectedNode.id,
          relationType: relationType,
          selectedNodeName: selectedNode.name
        }
      });
    } else {
      console.warn("No node selected for adding member.");
    }
  };

  const onViewProfile = () => {
    if (selectedNode) {
      console.log(`View profile for ${selectedNode.name} (ID: ${selectedNode.id})`);
    } else {
      console.warn("No node selected for viewing profile.");
    }
  };

  // Prepare actions for the ActionSheet
  let dynamicActions: ActionSheetAction[] = [];
  if (selectedNode) {
    dynamicActions = [
      {
        title: 'View Profile',
        onPress: onViewProfile,
      },
      {
        title: 'Add Parent',
        onPress: () => onAddMember('parent'),
      },
      {
        title: 'Add Spouse',
        onPress: () => onAddMember('spouse'),
      },
      {
        title: 'Add Child',
        onPress: () => onAddMember('child'),
      },
      {
        title: 'Cancel',
        onPress: handleCloseMenu,
        style: 'cancel',
      },
    ];
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <RelativesTree
        data={relatives}
        spouseKey="spouse"
        relativeItem={(props) => (
          <CustomRelativeItem
            {...props}
            onPress={handleNodePress}
            isSelected={selectedNode?.id === props.info.id}
          />
        )}
        cardWidth={120}
        gap={20}
        pathColor="#006400"
        strokeWidth={2}
        style={styles.treeContainer}
      />

      {selectedNode && (
        <AnimatedActionSheet
          isVisible={isActionMenuVisible}
          onClose={handleCloseMenu}
          title={`Actions for ${selectedNode.name}`}
          actions={dynamicActions}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  pageHeader: {
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'ios' ? 15 : 40,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#000000',
  },
  treeContainer: {
    flex: 1,
    backgroundColor: '#F4F4F4',
    padding: 10,
  },
  itemContainer: {
    borderWidth: 1,
    borderColor: '#1A4B44',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    padding: 5,
  },
  selectedItemContainer: {
    borderColor: '#C4A55C',
    borderWidth: 2,
    backgroundColor: '#FFFDE7',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginBottom: 4,
  },
  avatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#B0BEC5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  avatarPlaceholderText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  nameText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1A4B44',
  },
  dobText: {
    fontSize: 10,
    color: '#555',
  },
  dodText: {
    fontSize: 10,
    color: '#888',
  },
  levelText: {
    fontSize: 9,
    color: '#777',
  },
});

export default FamilyTreeScreen; 