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

interface AddDetailsButtonProps {
  onPress: () => void;
  style?: any;
}

/**
 * AddDetailsButton Component
 * 
 * A button for adding additional details.
 */
const AddDetailsButton: React.FC<AddDetailsButtonProps> = ({
  onPress,
  style,
}) => {
  return (
    <TouchableOpacity 
      style={[styles.container, style]} 
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel="Add additional details"
      accessibilityRole="button"
    >
      <View style={styles.contentContainer}>
        <Ionicons 
          name="add-circle-outline" 
          size={20} 
          color={Colors.palette.dynastyGreen.dark} 
          style={styles.icon}
        />
        <Text style={styles.text}>
          Add Additional Details
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
    marginTop: Spacing.sm,
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

export default AddDetailsButton;