'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  users?: string[];
  className?: string;
}

export function TypingIndicator({ users = [], className }: TypingIndicatorProps) {
  if (users.length === 0) return null;

  const getTypingText = () => {
    if (users.length === 1) {
      return `${users[0]} is typing`;
    } else if (users.length === 2) {
      return `${users[0]} and ${users[1]} are typing`;
    } else if (users.length === 3) {
      return `${users[0]}, ${users[1]}, and ${users[2]} are typing`;
    } else {
      return `${users[0]}, ${users[1]}, and ${users.length - 2} others are typing`;
    }
  };

  return (
    <div className={cn('flex items-center gap-2 text-sm text-gray-500', className)}>
      <div className="flex gap-1">
        <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" />
      </div>
      <span>{getTypingText()}</span>
    </div>
  );
}