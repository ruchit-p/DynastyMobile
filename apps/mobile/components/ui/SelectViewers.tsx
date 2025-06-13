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

interface SelectViewersProps {
  selectedCount: number;
  onPress: () => void;
  style?: any;
}

/**
 * SelectViewers Component
 * 
 * A button for selecting viewers with count indicator, used in privacy settings.
 */
const SelectViewers: React.FC<SelectViewersProps> = ({
  selectedCount = 0,
  onPress,
  style,
}) => {
  return (
    <TouchableOpacity 
      style={[styles.container, style]} 
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`Select viewers, ${selectedCount} currently selected`}
      accessibilityRole="button"
    >
      <View style={styles.contentContainer}>
        <Ionicons 
          name="people-outline" 
          size={20} 
          color={Colors.palette.dynastyGreen.dark} 
          style={styles.icon}
        />
        <Text style={styles.text}>
          Select Viewers ({selectedCount})
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

export default SelectViewers;