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

interface AddContentButtonProps {
  onPress: () => void;
  style?: any;
}

/**
 * AddContentButton Component
 * 
 * A button for adding content blocks to a story.
 */
const AddContentButton: React.FC<AddContentButtonProps> = ({
  onPress,
  style,
}) => {
  return (
    <TouchableOpacity 
      style={[styles.container, style]} 
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel="Add content block"
      accessibilityRole="button"
    >
      <View style={styles.contentContainer}>
        <Ionicons 
          name="add-circle" 
          size={20} 
          color={Colors.palette.dynastyGreen.dark} 
          style={styles.icon}
        />
        <Text style={styles.text}>
          Add Content Block
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

export default AddContentButton;