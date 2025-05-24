'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/services/NotificationService';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  className?: string;
  showBadge?: boolean;
}

export function NotificationBell({ 
  className, 
  showBadge = true 
}: NotificationBellProps) {
  const router = useRouter();
  const { unreadCount } = useNotifications();

  const handleClick = () => {
    router.push('/notifications');
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      className={cn('relative', className)}
    >
      <Bell className="h-5 w-5" />
      {showBadge && unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Button>
  );
}