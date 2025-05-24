'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Smile } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Reaction {
  emoji: string;
  users: string[];
}

interface MessageReactionsProps {
  reactions?: Reaction[];
  currentUserId: string;
  onReact: (emoji: string) => void;
  className?: string;
}

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

export function MessageReactions({
  reactions = [],
  currentUserId,
  onReact,
  className,
}: MessageReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);

  const handleReaction = (emoji: string) => {
    onReact(emoji);
    setShowPicker(false);
  };

  const userHasReacted = (reaction: Reaction) => {
    return reaction.users.includes(currentUserId);
  };


  return (
    <div className={cn('flex items-center gap-1 flex-wrap', className)}>
      {/* Show existing reactions */}
      {reactions.map((reaction) => (
        <Button
          key={reaction.emoji}
          variant={userHasReacted(reaction) ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleReaction(reaction.emoji)}
          className="h-7 px-2 text-xs"
        >
          <span className="mr-1">{reaction.emoji}</span>
          <span>{reaction.users.length}</span>
        </Button>
      ))}

      {/* Add reaction button */}
      <Popover open={showPicker} onOpenChange={setShowPicker}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Smile className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-6 gap-1">
            {QUICK_REACTIONS.map((emoji) => (
              <Button
                key={emoji}
                variant="ghost"
                size="sm"
                onClick={() => handleReaction(emoji)}
                className="h-8 w-8 p-0 text-lg hover:bg-gray-100"
              >
                {emoji}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Reaction summary component for displaying who reacted
export function ReactionSummary({ reactions }: { reactions: Reaction[] }) {
  if (reactions.length === 0) return null;

  return (
    <div className="text-xs text-gray-500 mt-1">
      {reactions.map((reaction, index) => (
        <span key={reaction.emoji}>
          {index > 0 && ', '}
          <span className="font-medium">{reaction.users.join(', ')}</span>
          {' reacted with '}
          {reaction.emoji}
        </span>
      ))}
    </div>
  );
}