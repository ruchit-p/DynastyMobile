import React from 'react';
import { 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  View 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';

interface TagPeopleButtonProps {
  selectedCount: number;
  onPress: () => void;
  style?: any;
}

/**
 * TagPeopleButton Component
 * 
 * A button for tagging people with count indicator.
 */
const TagPeopleButton: React.FC<TagPeopleButtonProps> = ({
  selectedCount = 0,
  onPress,
  style,
}) => {
  return (
    <TouchableOpacity 
      style={[styles.container, style]} 
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`Tag people, ${selectedCount} currently tagged`}
      accessibilityRole="button"
    >
      <View style={styles.contentContainer}>
        <Ionicons 
          name="person-add-outline" 
          size={20} 
          color={Colors.palette.dynastyGreen.dark} 
          style={styles.icon}
        />
        <Text style={styles.text}>
          Tag People ({selectedCount})
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.palette.dynastyGreen.extraLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: Spacing.xs,
  },
  text: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.palette.dynastyGreen.dark,
  }
});

export default TagPeopleButton;