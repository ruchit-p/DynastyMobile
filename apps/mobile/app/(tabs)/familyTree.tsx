import React, { useState, useEffect, useLayoutEffect } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Platform, Image, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import RelativesTree, { type RelativeItem, type RelativeItemProps as LibRelativeItemProps } from '../../react-native-relatives-tree/src';
import { useRouter, useNavigation } from 'expo-router';
import AnimatedActionSheet, { type ActionSheetAction } from '../../components/ui/AnimatedActionSheet';
import IconButton, { IconSet } from '../../components/ui/IconButton';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../src/contexts/AuthContext';
import { getFamilyTreeDataMobile } from '../../src/lib/firebaseUtils';

// Define the Items type for your specific data structure
type Items = RelativeItem & {
  id: string;
  name: string;
  spouse?: Items;
  dob: string;
  dod?: string;
  // Add any other properties your nodes might have, e.g., avatar
  avatar?: string; 
};

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

// Define props for our custom item component
type CustomRelativeItemProps = LibRelativeItemProps<Items> & {
  onPress: (item: Items) => void;
  isSelected: boolean;
};

const DYNASTY_PRIMARY_COLOR = '#1A4B44'; // TODO: Move to Colors.ts or Theme.ts

// Custom RelativeItem component to render each node
const CustomRelativeItem: React.FC<CustomRelativeItemProps> = ({
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
  const navigation = useNavigation();
  const [selectedNode, setSelectedNode] = useState<Items | null>(null);
  const [isNodeActionMenuVisible, setIsNodeActionMenuVisible] = useState(false);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const { user } = useAuth();
  const [relativesData, setRelativesData] = useState<Items[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          iconSet={IconSet.Ionicons}
          iconName="ellipsis-vertical"
          size={24}
          color={DYNASTY_PRIMARY_COLOR}
          onPress={openHeaderMenu}
          style={{ marginRight: Platform.OS === 'ios' ? 10 : 15 }}
          accessibilityLabel="Family tree options"
        />
      ),
    });
  }, [navigation]);

  useEffect(() => {
    if (!user) return;
    getFamilyTreeDataMobile(user.uid)
      .then(({ treeNodes }) => {
        const nodeMap = new Map(treeNodes.map((node: any) => [node.id, node]));
        const buildItem = (member: any): Items => {
          const children = (member.children || [])
            .map((c: any) => nodeMap.get(c.id))
            .filter((m: any) => m)
            .map((m: any) => buildItem(m));
          const spouseRel = member.spouses?.[0];
          let spouse: Items | undefined;
          if (spouseRel) {
            const spouseMember = nodeMap.get(spouseRel.id);
            if (spouseMember) {
              spouse = buildItem(spouseMember);
            }
          }
          return {
            id: member.id,
            name: member.attributes?.displayName || '',
            dob: '', // Map dateOfBirth if available
            dod: undefined,
            avatar: member.attributes?.profilePicture,
            spouse,
            children,
          };
        };
        const rootMember = treeNodes.find((n: any) => n.id === user.uid);
        if (rootMember) {
          setRelativesData([buildItem(rootMember)]);
        }
      })
      .catch((error) => console.error('Error fetching family tree:', error));
  }, [user]);

  const openHeaderMenu = () => {
    setIsHeaderMenuVisible(true);
  };

  const closeHeaderMenu = () => {
    setIsHeaderMenuVisible(false);
  };

  const handleFamilyTreeSettings = () => {
    closeHeaderMenu();
    console.log('Navigate to Family Tree Settings');
  };

  const handleInviteMembers = () => {
    closeHeaderMenu();
    console.log('Invite Members');
  };

  const headerMenuActions: ActionSheetAction[] = [
    {
      title: 'Family Tree Settings',
      onPress: handleFamilyTreeSettings,
    },
    {
      title: 'Invite Members',
      onPress: handleInviteMembers,
    },
    {
      title: 'Cancel',
      onPress: closeHeaderMenu,
      style: 'cancel',
    },
  ];

  const handleNodePress = (item: Items) => {
    setSelectedNode(item);
    setIsNodeActionMenuVisible(true);
  };

  const handleCloseNodeMenu = () => {
    setIsNodeActionMenuVisible(false);
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
      console.log(`Navigating to profile for ${selectedNode.name} (ID: ${selectedNode.id})`);
      router.push({
        pathname: '/(screens)/ViewProfileScreen',
        params: {
          memberId: selectedNode.id,
          memberName: selectedNode.name,
        }
      });
    } else {
      console.warn("No node selected for viewing profile.");
    }
  };

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
        onPress: handleCloseNodeMenu,
        style: 'cancel',
      },
    ];
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <RelativesTree<Items>
        data={relativesData}
        spouseKey="spouse"
        relativeItem={(props) => {
          return (
            <CustomRelativeItem
              {...props}
              onPress={handleNodePress}
              isSelected={selectedNode?.id === props.info.id}
            />
          );
        }}
        cardWidth={120}
        gap={20}
        pathColor="#006400"
        strokeWidth={2}
        style={styles.treeContainer}
      />

      {selectedNode && (
        <AnimatedActionSheet
          isVisible={isNodeActionMenuVisible}
          onClose={handleCloseNodeMenu}
          title={`Actions for ${selectedNode.name}`}
          actions={dynamicActions}
        />
      )}

      <AnimatedActionSheet
        isVisible={isHeaderMenuVisible}
        onClose={closeHeaderMenu}
        title="Family Tree Options"
        actions={headerMenuActions}
      />
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