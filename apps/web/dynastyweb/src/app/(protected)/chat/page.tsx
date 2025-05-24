'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Card } from '@/components/ui/card';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Button } from '@/components/ui/button';
import { Plus, Search, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { Spinner } from '@/components/ui/spinner';
import { useCachedData, cacheKeys } from '@/services/CacheService';
import { useOffline } from '@/context/OfflineContext';
import { SyncStatus } from '@/components/ui/SyncStatus';

interface ChatRoom {
  id: string;
  name: string;
  type: 'direct' | 'group';
  participants: Array<{
    userId: string;
    displayName: string;
    profilePicture?: string;
  }>;
  lastMessage?: {
    text: string;
    senderId: string;
    timestamp: Date;
    type: 'text' | 'image' | 'voice' | 'file';
  };
  unreadCount: number;
  isEncrypted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default function ChatListPage() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const { isOnline } = useOffline();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Use cached data with auto-refresh
  const { data: chats, loading } = useCachedData<ChatRoom[]>(
    cacheKeys.user(`${currentUser?.uid}-chats`),
    async () => {
      const getChats = httpsCallable(functions, 'getUserChats');
      const result = await getChats();
      return (result.data as { chats: ChatRoom[] }).chats || [];
    },
    { ttl: 5 * 60 * 1000, persist: true }
  );

  const filteredChats = chats?.filter(chat => 
    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.participants.some(p => 
      p.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    )
  ) || [];

  const getChatAvatar = (chat: ChatRoom) => {
    if (chat.type === 'direct') {
      const otherParticipant = chat.participants.find(p => p.userId !== currentUser?.uid);
      return otherParticipant?.profilePicture || '/avatar.svg';
    }
    return '/avatar.svg'; // Group chat default avatar
  };

  const getChatName = (chat: ChatRoom) => {
    if (chat.type === 'direct') {
      const otherParticipant = chat.participants.find(p => p.userId !== currentUser?.uid);
      return otherParticipant?.displayName || 'Unknown User';
    }
    return chat.name;
  };

  const formatLastMessageTime = (timestamp: Date) => {
    const messageDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return format(messageDate, 'HH:mm');
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return format(messageDate, 'dd/MM/yyyy');
    }
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Messages</h1>
          <p className="text-sm text-gray-600">
            {isOnline ? 'All conversations' : 'Offline mode - cached messages'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncStatus showDetails />
          <Button
            onClick={() => router.push('/chat/new')}
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Chat
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Chat List */}
      {filteredChats.length === 0 ? (
        <Card className="p-8 text-center">
          <MessageSquare className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-semibold">No conversations yet</h3>
          <p className="mb-4 text-sm text-gray-600">
            Start a new conversation with your family members
          </p>
          <Button onClick={() => router.push('/chat/new')}>
            Start a conversation
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredChats.map((chat) => (
            <Card
              key={chat.id}
              className="cursor-pointer p-4 transition-colors hover:bg-gray-50"
              onClick={() => router.push(`/chat/${chat.id}`)}
            >
              <div className="flex items-start gap-3">
                <UserAvatar
                  src={getChatAvatar(chat)}
                  alt={getChatName(chat)}
                  size="md"
                />
                
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">
                        {getChatName(chat)}
                        {chat.isEncrypted && (
                          <span className="ml-2 text-xs text-green-600">🔒</span>
                        )}
                      </h3>
                      {chat.lastMessage && (
                        <p className="mt-1 truncate text-sm text-gray-600">
                          {chat.lastMessage.type === 'image' ? '📷 Photo' :
                           chat.lastMessage.type === 'voice' ? '🎤 Voice message' :
                           chat.lastMessage.type === 'file' ? '📎 File' :
                           chat.lastMessage.text}
                        </p>
                      )}
                    </div>
                    
                    <div className="ml-2 flex flex-col items-end">
                      {chat.lastMessage && (
                        <span className="text-xs text-gray-500">
                          {formatLastMessageTime(chat.lastMessage.timestamp)}
                        </span>
                      )}
                      {chat.unreadCount > 0 && (
                        <span className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white">
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}