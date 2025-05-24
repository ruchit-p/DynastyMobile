import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

// Simple mock of MessageStatusIndicator for testing
const MessageStatusIndicator = ({ status, isGroup = false, readBy = [] }: any) => {
  const getStatusText = () => {
    if (isGroup && status === 'delivered') {
      const readCount = readBy.length;
      if (readCount === 0) return 'Delivered';
      return `Read by ${readCount}`;
    }
    
    switch (status) {
      case 'sending':
        return 'Sending...';
      case 'sent':
        return 'Sent';
      case 'delivered':
        return 'Delivered';
      case 'read':
        return 'Read';
      case 'failed':
        return 'Failed';
      default:
        return '';
    }
  };

  return (
    <View testID="message-status-indicator">
      <Text testID={`status-${status}`}>{getStatusText()}</Text>
    </View>
  );
};

describe('MessageStatusIndicator', () => {
  it('should render sending status', () => {
    const { getByText, getByTestId } = render(
      <MessageStatusIndicator status="sending" />
    );

    expect(getByTestId('message-status-indicator')).toBeTruthy();
    expect(getByText('Sending...')).toBeTruthy();
  });

  it('should render sent status', () => {
    const { getByText } = render(
      <MessageStatusIndicator status="sent" />
    );

    expect(getByText('Sent')).toBeTruthy();
  });

  it('should render delivered status', () => {
    const { getByText } = render(
      <MessageStatusIndicator status="delivered" />
    );

    expect(getByText('Delivered')).toBeTruthy();
  });

  it('should render read status', () => {
    const { getByText } = render(
      <MessageStatusIndicator status="read" />
    );

    expect(getByText('Read')).toBeTruthy();
  });

  it('should render failed status', () => {
    const { getByText } = render(
      <MessageStatusIndicator status="failed" />
    );

    expect(getByText('Failed')).toBeTruthy();
  });

  it('should render group read count', () => {
    const { getByText } = render(
      <MessageStatusIndicator 
        status="delivered" 
        isGroup={true} 
        readBy={['user1', 'user2', 'user3']} 
      />
    );

    expect(getByText('Read by 3')).toBeTruthy();
  });

  it('should render group delivered when no one has read', () => {
    const { getByText } = render(
      <MessageStatusIndicator 
        status="delivered" 
        isGroup={true} 
        readBy={[]} 
      />
    );

    expect(getByText('Delivered')).toBeTruthy();
  });
});