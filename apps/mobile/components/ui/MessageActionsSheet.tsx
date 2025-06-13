import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActionSheetIOS,
  Platform,
  Alert,
  Share,
} from 'react-native';
import { BottomSheetModal, BottomSheetModalProvider, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '../../constants/Colors';
import { Spacing } from '../../constants/Spacing';

export interface MessageAction {
  id: string;
  title: string;
  icon: string;
  destructive?: boolean;
  onPress: () => void;
}

interface MessageActionsSheetProps {
  visible: boolean;
  message: {
    id: string;
    text?: string;
    senderId: string;
    timestamp: any;
  };
  isOwnMessage: boolean;
  onClose: () => void;
  onCopy?: () => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: (forEveryone: boolean) => void;
  onForward?: () => void;
  onShare?: () => void;
}

export default function MessageActionsSheet({
  visible,
  message,
  isOwnMessage,
  onClose,
  onCopy,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onShare,
}: MessageActionsSheetProps) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  const showIOSActionSheet = useCallback(() => {
    const options: string[] = [];
    const actions: (() => void)[] = [];
    
    // Copy
    if (message.text) {
      options.push('Copy');
      actions.push(async () => {
        if (message.text) {
          await Clipboard.setStringAsync(message.text);
          onCopy?.();
        }
        onClose();
      });
    }
    
    // Reply
    options.push('Reply');
    actions.push(() => {
      onReply?.();
      onClose();
    });
    
    // Edit (for own messages)
    if (isOwnMessage) {
      options.push('Edit');
      actions.push(() => {
        const messageTime = new Date(message.timestamp);
        const now = new Date();
        const diffMinutes = (now.getTime() - messageTime.getTime()) / (1000 * 60);
        
        if (diffMinutes > 5) {
          Alert.alert(
            'Cannot Edit',
            'Messages can only be edited within 5 minutes of sending.',
            [{ text: 'OK' }]
          );
          onClose();
          return;
        }
        
        onEdit?.();
        onClose();
      });
    }
    
    // Delete
    if (isOwnMessage) {
      options.push('Delete for Everyone');
      actions.push(() => {
        onDelete?.(true);
        onClose();
      });
    }
    options.push('Delete for Me');
    actions.push(() => {
      onDelete?.(false);
      onClose();
    });
    
    // Cancel
    options.push('Cancel');
    
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: options.length - 1,
        destructiveButtonIndex: isOwnMessage ? options.length - 3 : options.length - 2,
      },
      (buttonIndex) => {
        if (buttonIndex !== options.length - 1) {
          actions[buttonIndex]?.();
        }
        onClose();
      }
    );
  }, [message, isOwnMessage, onClose, onCopy, onReply, onEdit, onDelete]);

  useEffect(() => {
    if (visible) {
      if (Platform.OS === 'ios') {
        showIOSActionSheet();
      } else {
        bottomSheetRef.current?.present();
      }
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible, showIOSActionSheet]);

  const handleCopy = async () => {
    if (message.text) {
      await Clipboard.setStringAsync(message.text);
      onCopy?.();
    }
    onClose();
  };

  const handleReply = () => {
    onReply?.();
    onClose();
  };

  const handleEdit = () => {
    const messageTime = new Date(message.timestamp);
    const now = new Date();
    const diffMinutes = (now.getTime() - messageTime.getTime()) / (1000 * 60);
    
    if (diffMinutes > 5) {
      Alert.alert(
        'Cannot Edit',
        'Messages can only be edited within 5 minutes of sending.',
        [{ text: 'OK' }]
      );
      onClose();
      return;
    }
    
    onEdit?.();
    onClose();
  };

  const handleDelete = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Delete Message',
          options: ['Delete for me', 'Delete for everyone', 'Cancel'],
          destructiveButtonIndex: isOwnMessage ? 1 : 0,
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            onDelete?.(false);
          } else if (buttonIndex === 1 && isOwnMessage) {
            onDelete?.(true);
          }
          onClose();
        }
      );
    } else {
      Alert.alert(
        'Delete Message',
        isOwnMessage 
          ? 'Delete this message for everyone or just for you?'
          : 'Delete this message for you?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete for me', onPress: () => { onDelete?.(false); onClose(); } },
          ...(isOwnMessage ? [{ 
            text: 'Delete for everyone', 
            style: 'destructive' as const,
            onPress: () => { onDelete?.(true); onClose(); } 
          }] : []),
        ]
      );
    }
  };

  const handleShare = async () => {
    if (message.text) {
      try {
        await Share.share({
          message: message.text,
        });
      } catch (error) {
        console.error('Error sharing message:', error);
      }
    }
    onClose();
  };


  const renderAction = (action: MessageAction) => (
    <TouchableOpacity
      key={action.id}
      style={styles.actionItem}
      onPress={() => {
        action.onPress();
        onClose();
      }}
    >
      <Ionicons
        name={action.icon as any}
        size={24}
        color={action.destructive ? '#FF4444' : Colors.light.text.primary}
      />
      <Text style={[
        styles.actionText,
        action.destructive && styles.destructiveText
      ]}>
        {action.title}
      </Text>
    </TouchableOpacity>
  );

  const actions: MessageAction[] = [
    {
      id: 'copy',
      title: 'Copy',
      icon: 'copy-outline',
      onPress: handleCopy,
    },
    {
      id: 'reply',
      title: 'Reply',
      icon: 'arrow-undo-outline',
      onPress: handleReply,
    },
  ];

  if (isOwnMessage) {
    const messageTime = new Date(message.timestamp);
    const now = new Date();
    const diffMinutes = (now.getTime() - messageTime.getTime()) / (1000 * 60);
    
    if (diffMinutes <= 5) {
      actions.push({
        id: 'edit',
        title: 'Edit',
        icon: 'create-outline',
        onPress: handleEdit,
      });
    }
  }

  if (onForward) {
    actions.push({
      id: 'forward',
      title: 'Forward',
      icon: 'arrow-redo-outline',
      onPress: () => {
        onForward();
        onClose();
      },
    });
  }

  if (message.text) {
    actions.push({
      id: 'share',
      title: 'Share',
      icon: 'share-outline',
      onPress: handleShare,
    });
  }

  actions.push({
    id: 'delete',
    title: 'Delete',
    icon: 'trash-outline',
    destructive: true,
    onPress: handleDelete,
  });

  // iOS uses native action sheet
  if (Platform.OS === 'ios') {
    return null;
  }

  // Android uses bottom sheet
  return (
    <BottomSheetModalProvider>
      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={['40%']}
        onDismiss={onClose}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerText}>Message Options</Text>
          </View>
          <View style={styles.actionsList}>
            {actions.map(renderAction)}
          </View>
        </View>
      </BottomSheetModal>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text.primary,
  },
  actionsList: {
    paddingVertical: Spacing.sm,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  actionText: {
    fontSize: 16,
    marginLeft: Spacing.md,
    color: Colors.light.text.primary,
  },
  destructiveText: {
    color: '#FF4444',
  },
});