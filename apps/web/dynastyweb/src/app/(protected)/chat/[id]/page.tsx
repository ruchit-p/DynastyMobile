'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Spinner } from '@/components/ui/spinner';
import { 
  ArrowLeft, 
  Send, 
  Paperclip, 
  Mic, 
  MoreVertical,
  Check,
  CheckCheck,
  Lock
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useOffline } from '@/context/OfflineContext';
import { syncQueue } from '@/services/SyncQueueService';

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text?: string;
  type: 'text' | 'image' | 'voice' | 'file';
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number; // for voice messages
  status: 'sending' | 'sent' | 'delivered' | 'read';
  timestamp: Date;
  isEncrypted: boolean;
  replyTo?: {
    messageId: string;
    text: string;
    senderName: string;
  };
}

interface ChatDetails {
  id: string;
  name: string;
  type: 'direct' | 'group';
  participants: Array<{
    userId: string;
    displayName: string;
    profilePicture?: string;
    isOnline?: boolean;
  }>;
  isEncrypted: boolean;
}

export default function ChatDetailPage() {
  const params = useParams();
  const chatId = params.id as string;
  const { currentUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { isOnline } = useOffline();
  
  const [chatDetails, setChatDetails] = useState<ChatDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [typingUsers] = useState<string[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch chat details
  useEffect(() => {
    fetchChatDetails();
  }, [chatId, fetchChatDetails]);

  // Subscribe to messages
  useEffect(() => {
    if (!chatId) return;

    const messagesRef = collection(db, 'messages');
    const q = query(
      messagesRef,
      where('chatId', '==', chatId),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        newMessages.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate() || new Date()
        } as Message);
      });
      
      setMessages(newMessages.reverse());
      setLoading(false);
      
      // Mark messages as read
      markMessagesAsRead(newMessages.filter(m => 
        m.senderId !== currentUser?.uid && m.status !== 'read'
      ).map(m => m.id));
    });

    return () => unsubscribe();
  }, [chatId, currentUser?.uid, markMessagesAsRead]);

  // Auto scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchChatDetails = useCallback(async () => {
    try {
      const getChat = httpsCallable(functions, 'getChatDetails');
      const result = await getChat({ chatId });
      setChatDetails((result.data as {
        chat: ChatDetails;
      }).chat);
    } catch (error) {
      console.error('Error fetching chat details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load chat details',
        variant: 'destructive'
      });
    }
  }, [chatId, toast]);

  const sendMessage = async () => {
    if (!messageText.trim() || sending) return;

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      chatId,
      senderId: currentUser!.uid,
      senderName: currentUser!.displayName || 'Unknown',
      text: messageText,
      type: 'text',
      status: 'sending',
      timestamp: new Date(),
      isEncrypted: chatDetails?.isEncrypted || false
    };

    // Optimistically add message
    setMessages(prev => [...prev, tempMessage]);
    setMessageText('');
    setSending(true);

    try {
      if (isOnline) {
        const sendChatMessage = httpsCallable(functions, 'sendChatMessage');
        await sendChatMessage({
          chatId,
          text: messageText,
          type: 'text'
        });
      } else {
        // Queue for offline sync
        await syncQueue.enqueueOperation({
          type: 'create',
          collection: 'messages',
          data: {
            chatId,
            text: messageText,
            type: 'text'
          },
          userId: currentUser!.uid
        });
        
        toast({
          title: 'Message queued',
          description: 'Your message will be sent when you\'re back online'
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive'
      });
      
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // TODO: Implement file upload
    toast({
      title: 'Coming soon',
      description: 'File sharing will be available soon'
    });
  };

  const markMessagesAsRead = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0 || !isOnline) return;

    try {
      const markAsRead = httpsCallable(functions, 'markMessagesAsRead');
      await markAsRead({ messageIds });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [isOnline]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getChatTitle = () => {
    if (!chatDetails) return '';
    
    if (chatDetails.type === 'direct') {
      const otherParticipant = chatDetails.participants.find(
        p => p.userId !== currentUser?.uid
      );
      return otherParticipant?.displayName || 'Unknown User';
    }
    
    return chatDetails.name;
  };

  const formatMessageTime = (timestamp: Date) => {
    return format(timestamp, 'HH:mm');
  };

  const renderMessageStatus = (message: Message) => {
    if (message.senderId !== currentUser?.uid) return null;

    switch (message.status) {
      case 'sending':
        return <div className="h-3 w-3 animate-pulse rounded-full bg-gray-400" />;
      case 'sent':
        return <Check className="h-3 w-3 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-gray-400" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="border-b bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/chat')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <UserAvatar
              src={chatDetails?.participants[0]?.profilePicture || '/avatar.svg'}
              alt={getChatTitle()}
              size="md"
            />
            
            <div>
              <h2 className="font-semibold">
                {getChatTitle()}
                {chatDetails?.isEncrypted && (
                  <Lock className="ml-1 inline h-3 w-3 text-green-600" />
                )}
              </h2>
              {typingUsers.length > 0 && (
                <p className="text-xs text-gray-500">typing...</p>
              )}
            </div>
          </div>
          
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        <div className="space-y-2">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.senderId === currentUser?.uid ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 ${
                  message.senderId === currentUser?.uid
                    ? 'bg-blue-500 text-white'
                    : 'bg-white'
                }`}
              >
                {message.senderId !== currentUser?.uid && chatDetails?.type === 'group' && (
                  <p className="mb-1 text-xs font-medium opacity-70">
                    {message.senderName}
                  </p>
                )}
                
                <p className="break-words">{message.text}</p>
                
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-xs opacity-70">
                    {formatMessageTime(message.timestamp)}
                  </span>
                  {renderMessageStatus(message)}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t bg-white p-4">
        <div className="flex items-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          
          <textarea
            ref={messageInputRef}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={isOnline ? "Type a message..." : "Type a message (offline mode)..."}
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none"
            rows={1}
          />
          
          <Button
            variant="ghost"
            size="icon"
          >
            <Mic className="h-5 w-5" />
          </Button>
          
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!messageText.trim() || sending}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx"
        />
      </div>
    </div>
  );
}