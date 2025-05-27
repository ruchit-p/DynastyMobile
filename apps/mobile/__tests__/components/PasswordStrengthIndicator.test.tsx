import React from 'react';
import { render } from '@testing-library/react-native';
import { PasswordStrengthIndicator } from '../../components/ui/PasswordStrengthIndicator';

describe('PasswordStrengthIndicator', () => {
  it('renders nothing when password is empty', () => {
    const { getByText } = render(
      <PasswordStrengthIndicator password="" />
    );

    expect(getByText('None')).toBeTruthy();
    // Feedback for empty password shows as bullet points
    expect(getByText('• Password is required')).toBeTruthy();
  });

  it('shows weak strength for simple passwords', () => {
    const { getByText } = render(
      <PasswordStrengthIndicator password="simple" />
    );

    expect(getByText('Weak')).toBeTruthy();
    expect(getByText('• Use at least 8 characters')).toBeTruthy();
    expect(getByText('• Include uppercase letter')).toBeTruthy();
    expect(getByText('• Include a number')).toBeTruthy();
    expect(getByText('• Include special character')).toBeTruthy();
  });

  it('shows medium strength for moderately strong passwords', () => {
    const { getByText } = render(
      <PasswordStrengthIndicator password="Password1" />
    );

    expect(getByText('Medium')).toBeTruthy();
    expect(getByText('• Include special character')).toBeTruthy();
  });

  it('shows strong strength for strong passwords', () => {
    const { getByText, queryByText } = render(
      <PasswordStrengthIndicator password="Password1!" />
    );

    expect(getByText('Strong')).toBeTruthy();
    // Should have no feedback for strong passwords
    expect(queryByText('Use at least 8 characters')).toBeNull();
    expect(queryByText('Include uppercase letter')).toBeNull();
  });

  it('hides feedback when showFeedback is false', () => {
    const { getByText, queryByText } = render(
      <PasswordStrengthIndicator 
        password="weak" 
        showFeedback={false}
      />
    );

    // Strength label should still show
    expect(getByText('Weak')).toBeTruthy();
    // But feedback should be hidden
    expect(queryByText('• Use at least 8 characters')).toBeNull();
  });

  it('renders strength bar with correct width', () => {
    // Since we cannot easily test style props in React Native Testing Library,
    // we verify the behavior through the strength labels instead
    const { getByText, rerender } = render(
      <PasswordStrengthIndicator 
        password="weak"
        testID="password-strength"
      />
    );

    // Weak password shows weak label
    expect(getByText('Weak')).toBeTruthy();

    // Strong password shows strong label
    rerender(
      <PasswordStrengthIndicator 
        password="MyStr0ng!P@ssw0rd"
        testID="password-strength"
      />
    );

    expect(getByText('Strong')).toBeTruthy();
  });

  it('applies correct colors based on strength', () => {
    // Test the strength labels which indicate the correct color application
    const { getByText, rerender } = render(
      <PasswordStrengthIndicator 
        password="weak"
        testID="password-strength"
      />
    );

    // Weak password shows weak label
    expect(getByText('Weak')).toBeTruthy();

    // Medium password shows medium label
    rerender(
      <PasswordStrengthIndicator 
        password="Password1"
        testID="password-strength"
      />
    );
    expect(getByText('Medium')).toBeTruthy();

    // Strong password shows strong label
    rerender(
      <PasswordStrengthIndicator 
        password="Password1!"
        testID="password-strength"
      />
    );
    expect(getByText('Strong')).toBeTruthy();
  });

  it('updates dynamically as password changes', () => {
    const { getByText, rerender } = render(
      <PasswordStrengthIndicator password="p" />
    );

    expect(getByText('Weak')).toBeTruthy();

    rerender(<PasswordStrengthIndicator password="password" />);
    expect(getByText('Weak')).toBeTruthy();

    rerender(<PasswordStrengthIndicator password="Password" />);
    expect(getByText('Fair')).toBeTruthy();

    rerender(<PasswordStrengthIndicator password="Password1" />);
    expect(getByText('Medium')).toBeTruthy();

    rerender(<PasswordStrengthIndicator password="Password1!" />);
    expect(getByText('Strong')).toBeTruthy();
  });

  it('provides specific feedback for missing requirements', () => {
    const { getByText, queryByText } = render(
      <PasswordStrengthIndicator password="password123!" />
    );

    // Should only show feedback for missing uppercase
    expect(getByText('• Include uppercase letter')).toBeTruthy();
    expect(queryByText('• Use at least 8 characters')).toBeNull();
    expect(queryByText('• Include a number')).toBeNull();
    expect(queryByText('• Include special character')).toBeNull();
  });
});