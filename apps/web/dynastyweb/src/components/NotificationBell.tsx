"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, Check } from "lucide-react";
import { useNotificationContext } from "@/context/NotificationContext";
import { useRouter } from "next/navigation";
import { Notification } from "@/utils/notificationUtils";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { logNotificationInteraction } from "@/utils/notificationUtils";

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { 
    notifications, 
    unreadCount, 
    loading, 
    markAsRead, 
    markAllAsRead 
  } = useNotificationContext();
  
  const router = useRouter();
  
  // Filter to only show unread notifications in the dropdown
  const unreadNotifications = notifications.filter(notification => !notification.isRead);
  
  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }
    
    // Log the interaction
    logNotificationInteraction(notification.id, 'clicked');
    
    // Close dropdown
    setIsOpen(false);
    
    // Navigate to the link if available
    if (notification.link) {
      router.push(notification.link);
    }
  };
  
  const handleMarkAsRead = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    try {
      await markAsRead(notificationId);
      // Log the interaction
      logNotificationInteraction(notificationId, 'dismissed');
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };
  
  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await markAllAsRead();
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  };
  
  const getTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    return format(date, "MMM d");
  };
  
  const getNotificationIcon = () => {
    // You can customize icons based on notification type
    return <Bell className="h-4 w-4" />;
  };
  
  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-gray-600 hover:text-[#0A5C36]">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full p-0 text-[10px]">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-auto">
        <div className="flex items-center justify-between p-4">
          <h3 className="text-sm font-medium">Notifications</h3>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs font-medium text-[#0A5C36] hover:bg-[#0A5C36]/10"
              onClick={handleMarkAllAsRead}
            >
              Mark all as read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin h-5 w-5 border-t-2 border-[#0A5C36] border-r-2 rounded-full"></div>
          </div>
        ) : unreadNotifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">
            No unread notifications
          </div>
        ) : (
          unreadNotifications.slice(0, 8).map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="flex flex-col items-start p-3 cursor-pointer bg-slate-50 hover:bg-[#0A5C36]/10 transition-colors duration-150"
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex w-full justify-between items-start">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 text-[#0A5C36]">
                    {getNotificationIcon()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{notification.title}</span>
                    <span className="text-xs text-gray-500 line-clamp-2">{notification.body}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full hover:bg-[#0A5C36]/10 text-gray-400 hover:text-[#0A5C36]"
                    onClick={(e) => handleMarkAsRead(e, notification.id)}
                    title="Mark as read"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span className="sr-only">Mark as read</span>
                  </Button>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {getTimeAgo(notification.createdAt)}
                  </span>
                </div>
              </div>
              <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#0A5C36]" />
            </DropdownMenuItem>
          ))
        )}
        
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="flex justify-center py-2 text-sm text-[#0A5C36] hover:bg-[#0A5C36]/10 hover:text-[#0A5C36]"
              onClick={() => {
                setIsOpen(false);
                router.push('/notifications');
              }}
            >
              View all notifications
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 