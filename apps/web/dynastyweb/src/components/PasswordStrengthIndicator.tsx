import React from 'react';
import { Progress } from '@/components/ui/progress';

interface PasswordStrengthIndicatorProps {
  password: string;
}

function calculateStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return (score / 5) * 100; // return percent
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const strength = calculateStrength(password);
  return (
    <div className="space-y-1">
      <Progress value={strength} />
      <p className="text-xs text-muted-foreground">
        Strength: {strength >= 80 ? 'Strong' : strength >= 50 ? 'Medium' : 'Weak'}
      </p>
    </div>
  );
}

export default PasswordStrengthIndicator; 