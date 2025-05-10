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
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close action sheet"
      >
        <SafeAreaView style={styles.safeAreaForCancel} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.actionSheetContainer,
              { transform: [{ translateY: slideAnim }] },
              containerStyle
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[
              styles.actionsGroup,
              { backgroundColor, borderColor }
            ]}>
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
                    index > 0 && [styles.subsequentActionButton, { borderTopColor: borderColor }]
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={action.title}
                >
                  <ThemedText
                    style={[
                      styles.actionButtonText,
                      { color: action.style === 'destructive' ? destructiveColor : actionColor }
                    ]}
                  >
                    {action.title}
                  </ThemedText>
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
      </TouchableOpacity>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  subsequentActionButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButtonText: {
    fontSize: 20,
    textAlign: 'center',
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