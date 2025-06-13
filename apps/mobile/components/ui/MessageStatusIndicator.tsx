import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

interface MessageStatusIndicatorProps {
  status: MessageStatus;
  delivered: string[];
  read: string[];
  isOwnMessage: boolean;
  participantCount: number;
  color?: string;
}

export default function MessageStatusIndicator({
  status,
  delivered = [],
  read = [],
  isOwnMessage,
  participantCount,
  color = 'rgba(255,255,255,0.7)'
}: MessageStatusIndicatorProps) {
  if (!isOwnMessage) return null;

  // Calculate status based on arrays
  const getStatus = (): MessageStatus => {
    if (status === 'failed' || status === 'sending') return status;
    
    // For group chats, check if all participants have read/delivered
    const otherParticipants = participantCount - 1; // Exclude sender
    
    if (read.length >= otherParticipants) return 'read';
    if (delivered.length >= otherParticipants) return 'delivered';
    return 'sent';
  };

  const currentStatus = getStatus();

  const renderIcon = () => {
    switch (currentStatus) {
      case 'sending':
        return <Ionicons name="time-outline" size={14} color={color} />;
      
      case 'sent':
        return <Ionicons name="checkmark" size={14} color={color} />;
      
      case 'delivered':
        return (
          <View style={styles.doubleCheck}>
            <Ionicons name="checkmark-done" size={14} color={color} />
          </View>
        );
      
      case 'read':
        return (
          <View style={styles.doubleCheck}>
            <Ionicons name="checkmark-done" size={14} color={Colors.light.primary} />
          </View>
        );
      
      case 'failed':
        return <Ionicons name="alert-circle" size={14} color="#ff4444" />;
      
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {renderIcon()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doubleCheck: {
    flexDirection: 'row',
  },
});