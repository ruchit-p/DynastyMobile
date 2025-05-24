import React from 'react';
import { render } from '@testing-library/react-native';
import MessageStatusIndicator from '../MessageStatusIndicator';

describe('MessageStatusIndicator', () => {
  const defaultProps = {
    status: 'sent' as const,
    delivered: [],
    read: [],
    isOwnMessage: true,
    participantCount: 2,
  };

  it('should render sending status', () => {
    const { getByTestId } = render(
      <MessageStatusIndicator {...defaultProps} status="sending" />
    );

    expect(getByTestId('status-icon')).toHaveAccessibleName('time-outline');
  });

  it('should render sent status with single checkmark', () => {
    const { getByTestId } = render(
      <MessageStatusIndicator {...defaultProps} status="sent" />
    );

    expect(getByTestId('status-icon')).toHaveAccessibleName('checkmark');
  });

  it('should render delivered status with double checkmark', () => {
    const { getByTestId } = render(
      <MessageStatusIndicator 
        {...defaultProps} 
        status="delivered"
        delivered={['user-2']}
      />
    );

    expect(getByTestId('status-icon')).toHaveAccessibleName('checkmark-done');
  });

  it('should render read status with colored double checkmark', () => {
    const { getByTestId } = render(
      <MessageStatusIndicator 
        {...defaultProps} 
        status="read"
        read={['user-2']}
      />
    );

    const icon = getByTestId('status-icon');
    expect(icon).toHaveAccessibleName('checkmark-done');
    expect(icon.props.color).toBe('#007AFF'); // iOS blue
  });

  it('should render failed status', () => {
    const { getByTestId } = render(
      <MessageStatusIndicator {...defaultProps} status="failed" />
    );

    expect(getByTestId('status-icon')).toHaveAccessibleName('alert-circle');
  });

  it('should not render for non-own messages', () => {
    const { queryByTestId } = render(
      <MessageStatusIndicator {...defaultProps} isOwnMessage={false} />
    );

    expect(queryByTestId('status-icon')).toBeNull();
  });

  it('should calculate status for group chats correctly', () => {
    const { getByTestId, rerender } = render(
      <MessageStatusIndicator 
        {...defaultProps}
        participantCount={4} // 3 other participants
        delivered={['user-2']}
        read={[]}
      />
    );

    // Not all delivered
    expect(getByTestId('status-icon')).toHaveAccessibleName('checkmark');

    // All delivered
    rerender(
      <MessageStatusIndicator 
        {...defaultProps}
        participantCount={4}
        delivered={['user-2', 'user-3', 'user-4']}
        read={[]}
      />
    );
    expect(getByTestId('status-icon')).toHaveAccessibleName('checkmark-done');

    // All read
    rerender(
      <MessageStatusIndicator 
        {...defaultProps}
        participantCount={4}
        delivered={['user-2', 'user-3', 'user-4']}
        read={['user-2', 'user-3', 'user-4']}
      />
    );
    expect(getByTestId('status-icon').props.color).toBe('#007AFF');
  });

  it('should use custom color when provided', () => {
    const { getByTestId } = render(
      <MessageStatusIndicator 
        {...defaultProps} 
        status="sent"
        color="red"
      />
    );

    expect(getByTestId('status-icon').props.color).toBe('red');
  });
});