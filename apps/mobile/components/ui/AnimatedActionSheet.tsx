import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Animated,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import design system components and utilities
import ThemedText from '../ThemedText';
import { Spacing, BorderRadius, Shadows } from '../../constants/Spacing';
import { useBackgroundColor, useTextColor, useBorderColor } from '../../hooks/useThemeColor';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';

export interface ActionSheetAction {
  title: string;
  onPress: () => void;
  style?: 'cancel' | 'destructive' | 'default';
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  disabled?: boolean;
}

interface AnimatedActionSheetProps {
  isVisible: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionSheetAction[];
  message?: string;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * AnimatedActionSheet Component
 * 
 * A slide-up sheet with a list of actions, similar to iOS action sheet.
 */
const AnimatedActionSheet: React.FC<AnimatedActionSheetProps> = ({
  isVisible,
  onClose,
  title,
  actions,
  message,
  containerStyle,
  testID,
}) => {
  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const [modalActualVisible, setModalActualVisible] = useState(false);
  
  // Get theme colors
  const colorScheme = useColorScheme();
  const theme = colorScheme || 'light';
  
  const backgroundColor = useBackgroundColor('primary');
  const borderColor = useBorderColor('primary');
  const textColor = useTextColor('primary');
  const secondaryTextColor = useTextColor('secondary');
  
  // Color for action buttons
  const actionColor = Colors.palette.dynastyGreen.dark; // Primary color for actions
  const destructiveColor = Colors.palette.status.error; // Red for destructive actions

  useEffect(() => {
    if (isVisible) {
      setModalActualVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: Dimensions.get('window').height,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        requestAnimationFrame(() => {
          setModalActualVisible(false);
        });
      });
    }
  }, [isVisible, slideAnim]);

  const handleActionPress = (actionOnPress: () => void) => {
    onClose();
    setTimeout(actionOnPress, 50);
  };
  
  // Separate regular actions from cancel action
  const regularActions = actions.filter(a => a.style !== 'cancel');
  const cancelAction = actions.find(a => a.style === 'cancel');

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={modalActualVisible}
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.modalOverlay} pointerEvents="box-none">
        {/* Background touchable to close the sheet on taps outside content */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <SafeAreaView style={styles.safeAreaForCancel} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.actionSheetContainer,
              { transform: [{ translateY: slideAnim }] },
              containerStyle
            ]}
            // Allow touch events to bubble to children
            pointerEvents="box-none"
          >
            {/* Action sheet content captures touches via TouchableOpacity on buttons */}
            <View style={[
              styles.actionsGroup,
              { backgroundColor, borderColor }
            ]} pointerEvents="box-none">
              {(title || message) && (
                <View style={[styles.titleContainer, { borderBottomColor: borderColor }]}>
                  {title && (
                    <ThemedText 
                      variant="bodySmall" 
                      color="secondary" 
                      style={styles.titleText}
                    >
                      {title}
                    </ThemedText>
                  )}
                  
                  {message && (
                    <ThemedText 
                      variant="caption" 
                      color="tertiary" 
                      style={styles.messageText}
                    >
                      {message}
                    </ThemedText>
                  )}
                </View>
              )}
              
              {regularActions.map((action, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleActionPress(action.onPress)}
                  style={[
                    styles.actionButton,
                    index > 0 && [styles.subsequentActionButton, { borderTopColor: borderColor }],
                    action.disabled && styles.disabledActionButton
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={action.title}
                  accessibilityState={{ disabled: action.disabled }}
                  disabled={action.disabled}
                >
                  <View style={styles.actionContentWrapper}>
                    {action.icon && (
                      <Ionicons 
                        name={action.icon} 
                        size={22}
                        color={action.disabled ? Colors.palette.neutral.light : (action.iconColor || (action.style === 'destructive' ? destructiveColor : actionColor))} 
                        style={styles.actionIcon}
                      />
                    )}
                    <ThemedText
                      style={[
                        styles.actionButtonText,
                        { color: action.disabled ? Colors.palette.neutral.light : (action.style === 'destructive' ? destructiveColor : actionColor) },
                        action.icon ? styles.actionButtonTextWithIcon : null
                      ]}
                    >
                      {action.title}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {cancelAction && (
              <View style={[
                styles.cancelGroup,
                { backgroundColor, borderColor }
              ]}>
                <TouchableOpacity
                  onPress={() => handleActionPress(cancelAction.onPress)}
                  style={styles.actionButton}
                  accessibilityRole="button"
                  accessibilityLabel={cancelAction.title}
                >
                  <ThemedText
                    style={[styles.actionButtonText, styles.cancelButtonText, { color: actionColor }]}
                  >
                    {cancelAction.title}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  safeAreaForCancel: {
    justifyContent: 'flex-end',
    width: '100%',
  },
  actionSheetContainer: {
    width: '100%',
    paddingHorizontal: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 0 : Spacing.md,
  },
  actionsGroup: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    ...Shadows.md,
  },
  titleContainer: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  messageText: {
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  actionButton: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subsequentActionButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButtonText: {
    fontSize: 20,
    textAlign: 'center',
  },
  disabledActionButton: {
    opacity: 0.5,
  },
  actionButtonTextWithIcon: {
    // Add styles if needed to adjust text position when an icon is present
    // For example, marginLeft: Spacing.sm,
  },
  actionIcon: {
    marginRight: Spacing.md,
  },
  actionContentWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelGroup: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Platform.OS === 'ios' ? Spacing.sm : 0,
    ...Shadows.md,
  },
  cancelButtonText: {
    fontWeight: '600',
  },
});

export default AnimatedActionSheet;