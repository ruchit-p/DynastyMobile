import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import Fonts from '../../constants/Fonts';
import { Typography } from '../../constants/Typography'; // For more specific font control

export interface PersonInfo {
  id: string;
  displayName: string;
  profilePicture?: string; // Future use, for now initials
}

interface TaggedPeopleBadgesProps {
  people?: PersonInfo[];
  maxVisible?: number;
  badgeSize?: number;
  fontSize?: number;
}

const getInitials = (name?: string): string => {
  if (!name || name.trim() === '') {
    return '?';
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  if (parts.length > 1) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return '?';
};

const TaggedPeopleBadges: React.FC<TaggedPeopleBadgesProps> = ({
  people = [],
  maxVisible = 3,
  badgeSize = 22, // Adjusted default size slightly
  fontSize = 10,   // Adjusted default font size slightly
}) => {
  if (!people || people.length === 0) {
    return null;
  }

  const visiblePeople = people.slice(0, maxVisible);
  const remainingCount = people.length - maxVisible;

  return (
    <View style={styles.container}>
      {visiblePeople.map((person, index) => (
        <View
          key={person.id || index}
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              marginLeft: index === 0 ? 0 : -badgeSize / 3.5, // Adjusted overlap
              zIndex: visiblePeople.length - index, 
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize }]}>
            {getInitials(person.displayName)}
          </Text>
        </View>
      ))}
      {remainingCount > 0 && (
        <View
          style={[
            styles.badge, // Use the same base style for consistency
            // styles.moreBadge, // Can remove if +N badge has same background
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              marginLeft: -badgeSize / 3.5, // Adjusted overlap
              zIndex: 0,
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize }]}>+{remainingCount}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: Colors.light.background.tertiary, // Light gray background like in image
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border.primary, // White border for slight separation, or Colors.neutral.lightest if no border needed
  },
  // moreBadge: { // Can be removed if +N badge has same background as others
  //   backgroundColor: Colors.neutral.lighter, 
  // },
  initials: {
    color: Colors.light.text.primary, // Dark text for initials
    fontWeight: Typography.weight.semiBold, // Use Typography constants
    fontFamily: Typography.family.semiBold || Typography.family.regular, // Fallback if semiBold is not loaded
  },
});

export default TaggedPeopleBadges; 