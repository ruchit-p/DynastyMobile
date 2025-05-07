import React from 'react';
import { SafeAreaView, StyleSheet, Text, View, Platform, Image } from 'react-native';
import RelativesTree, { type RelativeItemComponent, type RelativeItem as RelativeItemType } from '../../react-native-relatives-tree/src';

// Define the Items type for your specific data structure
type Items = RelativeItemType & {
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
    name: 'John',
    dob: '01/05/2004',
    spouse: {
      name: 'Anne',
      dob: '04/05/2007',
    },
    children: [
      {
        name: 'Dan',
        dob: '01/05/2024',
        spouse: {
          name: 'Ella',
          dob: '04/05/2027',
        },
        children: [
          {
            name: 'Olivia',
            dob: '01/05/2044',
          },
          {
            name: 'Mary',
            dob: '01/05/2045',
          },
        ],
      },
      {
        name: 'Jack',
        dob: '01/05/2025',
        dod: '03/03/2057',
        spouse: {
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
const CustomRelativeItem: RelativeItemComponent<Items> = ({ level, info, style }) => (
  <View style={[styles.itemContainer, style]}>
    {info.avatar ? (
      <Image source={{ uri: info.avatar }} style={styles.avatar} />
    ) : (
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarPlaceholderText}>{getInitials(info.name)}</Text>
      </View>
    )}
    <Text style={styles.nameText}>{info.name}</Text>
  </View>
);

const FamilyTreeScreen = () => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <RelativesTree
        data={relatives}
        spouseKey="spouse"    // Key for spouse object in your data
        // childrenKey="children" // Key for children array in your data - Commented out to check linter error
        relativeItem={CustomRelativeItem} // Your custom component for rendering nodes
        cardWidth={120}       // Width of each node card
        gap={20}              // Gap between nodes
        pathColor="#006400"   // Color of the connecting lines (Dynasty Green)
        strokeWidth={2}       // Width of the connecting lines
        style={styles.treeContainer} // Style for the main tree container
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
    backgroundColor: '#F4F4F4', // Light background for the tree area
    padding: 10,
  },
  itemContainer: {
    // cardWidth and cardHeight from RelativesTree props will be applied here
    // Ensure your content fits within these dimensions or adjust props
    borderWidth: 1,
    borderColor: '#1A4B44', // Dynasty Dark Green for border
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9', // Light Dynasty Green
    padding: 5,
  },
  avatar: { // Example style if you use avatars in CustomRelativeItem
    width: 30,
    height: 30,
    borderRadius: 15,
    marginBottom: 4,
  },
  avatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#B0BEC5', // A neutral placeholder color
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