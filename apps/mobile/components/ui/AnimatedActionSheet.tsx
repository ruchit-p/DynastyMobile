import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Animated,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
} from 'react-native';

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
  message?: string; // Optional message below title like iOS
}

const AnimatedActionSheet: React.FC<AnimatedActionSheetProps> = ({
  isVisible,
  onClose,
  title,
  actions,
  message,
}) => {
  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const [modalActualVisible, setModalActualVisible] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setModalActualVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250, // Slightly faster
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: Dimensions.get('window').height,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setModalActualVisible(false);
      });
    }
  }, [isVisible, slideAnim]);

  const handleActionPress = (actionOnPress: () => void) => {
    // The onClose callback (which should set isVisible to false) will trigger the animation.
    // Then the action can be performed.
    // If the action navigates, it should ideally happen after the sheet is fully closed.
    // For simplicity here, we call onClose first then the action.
    // Parent might need to delay navigation if animation interruption is an issue.
    onClose(); // Request close (triggers animation)
    setTimeout(actionOnPress, 50); // Give a slight delay for animation to start
  };
  
  const regularActions = actions.filter(a => a.style !== 'cancel');
  const cancelAction = actions.find(a => a.style === 'cancel');

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={modalActualVisible}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose} // Close when tapping overlay
      >
        {/* Use SafeAreaView for the bottom part if it contains the cancel button */}
        <SafeAreaView style={styles.safeAreaForCancel} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.actionSheetContainer,
              { transform: [{ translateY: slideAnim }] },
            ]}
            onStartShouldSetResponder={() => true} // Prevents taps from passing through to overlay
          >
            <View style={styles.actionsGroup}>
              {(title || message) && (
                <View style={styles.titleContainer}>
                  {title && <Text style={styles.titleText}>{title}</Text>}
                  {message && <Text style={styles.messageText}>{message}</Text>}
                </View>
              )}
              {regularActions.map((action, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleActionPress(action.onPress)}
                  style={[
                    styles.actionButton,
                    index === 0 && !(title || message) ? styles.firstActionButtonNoTitle : {},
                    index === regularActions.length - 1 ? styles.lastActionButton : {},
                    index > 0 ? styles.subsequentActionButton : {},

                  ]}
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      action.style === 'destructive' && styles.destructiveText,
                    ]}
                  >
                    {action.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {cancelAction && (
              <View style={styles.cancelGroup}>
                <TouchableOpacity
                  onPress={() => handleActionPress(cancelAction.onPress)}
                  style={[styles.actionButton, styles.cancelButton]}
                >
                  <Text style={[styles.actionButtonText, styles.cancelButtonText]}>
                    {cancelAction.title}
                  </Text>
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
    backgroundColor: 'rgba(0,0,0,0.4)', // Standard overlay color
  },
  safeAreaForCancel: { // Ensures cancel button group respects safe area
    justifyContent: 'flex-end',
    width: '100%',
  },
  actionSheetContainer: {
    width: '100%',
    paddingHorizontal: 10,
    paddingBottom: Platform.OS === 'ios' ? 0 : 10, // Padding already in SafeAreaView for iOS
  },
  actionsGroup: {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(240,240,240,0.95)' : '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
  },
  titleContainer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C7C7CD', // iOS separator color
  },
  titleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8A8E', // iOS subtle title color
    textAlign: 'center',
  },
  messageText: {
    fontSize: 13,
    color: '#8A8A8E',
    textAlign: 'center',
    marginTop: 4,
  },
  actionButton: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent', // Handled by group background
  },
  firstActionButtonNoTitle: { // If no title, the first button needs top radius effect
    // No specific style needed if group has overflow:hidden and borderRadius
  },
  lastActionButton: {
    // No border if it's the last
  },
  subsequentActionButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C7C7CD',
  },
  actionButtonText: {
    fontSize: 20,
    color: '#007AFF', // iOS blue
    textAlign: 'center',
  },
  destructiveText: {
    color: '#FF3B30', // iOS red
  },
  cancelGroup: {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(240,240,240,0.95)' : '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: Platform.OS === 'ios' ? 8 : 0, // iOS has a bit of margin at the very bottom due to safe area
  },
  cancelButton: {
    // Styles for cancel button are similar to actionButton but in its own group
  },
  cancelButtonText: {
    fontWeight: '600', // Cancel button text is often bolder on iOS
  },
});

export default AnimatedActionSheet; 