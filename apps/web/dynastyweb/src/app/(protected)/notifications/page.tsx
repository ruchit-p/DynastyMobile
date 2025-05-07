"use client";

import { useState } from "react";
import { useNotificationContext } from "@/context/NotificationContext";
import { format } from "date-fns";
import { Bell, Trash2, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logNotificationInteraction } from "@/utils/notificationUtils";
import { Notification } from "@/utils/notificationUtils";

export default function NotificationsPage() {
  const { 
    notifications, 
    loading, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification 
  } = useNotificationContext();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const router = useRouter();
  
  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }
    
    // Log the interaction
    logNotificationInteraction(notification.id, 'clicked');
    
    // Navigate to the link if available
    if (notification.link) {
      router.push(notification.link);
    }
  };
  
  const handleDelete = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    try {
      await deleteNotification(notificationId);
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  };
  
  const filteredNotifications = filter === 'all' 
    ? notifications 
    : notifications.filter(n => !n.isRead);
  
  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <div className="flex items-center mb-6 mt-6">
        <span className="text-2xl font-bold">
        <Link href="/feed" className="mr-4">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
          Notifications
        </span>
      </div>
      
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          <Button 
            variant={filter === 'all' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button 
            variant={filter === 'unread' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setFilter('unread')}
          >
            Unread
          </Button>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={async () => {
            await markAllAsRead();
          }}
        >
          Mark all as read
        </Button>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin h-6 w-6 border-t-2 border-[#0A5C36] border-r-2 rounded-full"></div>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium">No notifications</h3>
          <p className="text-gray-500">
            You don&apos;t have any {filter === 'unread' ? 'unread' : ''} notifications
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredNotifications.map((notification) => (
            <Card 
              key={notification.id}
              className={`p-4 cursor-pointer ${!notification.isRead ? 'border-l-4 border-l-[#0A5C36]' : ''}`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex items-start justify-between">
                <div className="flex gap-3">
                  <div className="mt-1 text-[#0A5C36]">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">{notification.title}</h3>
                    <p className="text-gray-600 text-sm mt-1">{notification.body}</p>
                    <p className="text-gray-400 text-xs mt-2">
                      {format(new Date(notification.createdAt), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-gray-400 hover:text-red-600"
                  onClick={(e) => handleDelete(e, notification.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
} 