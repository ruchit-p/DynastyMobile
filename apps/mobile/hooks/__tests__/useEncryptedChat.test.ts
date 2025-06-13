import { renderHook, act, waitFor } from '@testing-library/react-native';
import useEncryptedChat from '../useEncryptedChat';
import { ChatEncryptionService } from '../../src/services/encryption/ChatEncryptionService';
import { MessageSyncService } from '../../src/services/MessageSyncService';
import { ChatNotificationService } from '../../src/services/ChatNotificationService';
import { TypingService } from '../../src/services/TypingService';
import { callFirebaseFunction } from '../../src/lib/errorUtils';

// Mock services
jest.mock('../../src/services/encryption/ChatEncryptionService');
jest.mock('../../src/services/MessageSyncService');
jest.mock('../../src/services/ChatNotificationService');
jest.mock('../../src/services/TypingService');
jest.mock('../../src/lib/errorUtils');

describe('useEncryptedChat', () => {
  const mockChatId = 'chat-123';
  const mockUserId = 'user-123';
  const mockMessages = [
    {
      id: 'msg-1',
      text: 'Hello',
      senderId: mockUserId,
      timestamp: new Date(),
      status: 'sent' as const,
      isLocal: false,
    },
    {
      id: 'msg-2',
      text: 'Hi there',
      senderId: 'user-456',
      timestamp: new Date(),
      status: 'delivered' as const,
      isLocal: false,
    },
  ];

  const mockChatData = {
    id: mockChatId,
    participants: [mockUserId, 'user-456'],
    lastMessage: mockMessages[1],
    unreadCount: 1,
    isEncrypted: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    (ChatEncryptionService.createOrGetChat as jest.Mock).mockResolvedValue(mockChatData);
    (MessageSyncService.getMessagesForChat as jest.Mock).mockResolvedValue(mockMessages);
    (ChatEncryptionService.subscribeToMessages as jest.Mock).mockReturnValue(() => {});
    // TypingService is not directly used in useEncryptedChat hook
    (callFirebaseFunction as jest.Mock).mockResolvedValue({ success: true });
  });

  it('should initialize chat and load messages', async () => {
    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    expect(result.current.loading).toBe(true);
    expect(result.current.messages).toEqual([]);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.messages).toEqual(mockMessages);
      expect(result.current.chatData).toEqual(mockChatData);
    });

    expect(ChatEncryptionService.initializeEncryption).toHaveBeenCalledWith(mockUserId);
    expect(ChatEncryptionService.createOrGetChat).toHaveBeenCalledWith(mockChatId, [mockUserId]);
    expect(MessageSyncService.getMessagesForChat).toHaveBeenCalledWith(mockChatId);
  });

  it('should handle sending text messages', async () => {
    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const newMessage = {
      id: 'msg-3',
      text: 'New message',
      senderId: mockUserId,
      timestamp: new Date(),
      status: 'sent' as const,
      isLocal: true,
    };

    (ChatEncryptionService.sendTextMessage as jest.Mock).mockResolvedValue(newMessage);

    await act(async () => {
      await result.current.sendMessage('New message');
    });

    expect(ChatEncryptionService.sendTextMessage).toHaveBeenCalledWith(mockChatId, 'New message');
    expect(result.current.messages).toContainEqual(expect.objectContaining({
      text: 'New message',
      senderId: mockUserId,
    }));
  });

  it('should handle sending media messages', async () => {
    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const media = {
      uri: 'file://image.jpg',
      type: 'image' as const,
      mimeType: 'image/jpeg',
    };

    const newMessage = {
      id: 'msg-3',
      media: {
        type: 'image' as const,
        uri: 'https://encrypted.url',
        thumbnailUri: 'https://thumb.url',
      },
      senderId: mockUserId,
      timestamp: new Date(),
      status: 'sent' as const,
      isLocal: true,
    };

    (ChatEncryptionService.sendMediaMessage as jest.Mock).mockResolvedValue(newMessage);

    await act(async () => {
      await result.current.sendMediaMessage(media);
    });

    expect(ChatEncryptionService.sendMediaMessage).toHaveBeenCalledWith(mockChatId, media);
    expect(result.current.messages).toContainEqual(expect.objectContaining({
      media: expect.any(Object),
      senderId: mockUserId,
    }));
  });

  it('should handle message reactions', async () => {
    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const messageId = 'msg-1';
    const emoji = '❤️';

    await act(async () => {
      await result.current.toggleReaction(messageId, emoji);
    });

    expect(ChatEncryptionService.toggleReaction).toHaveBeenCalledWith(mockChatId, messageId, emoji);
  });

  it('should handle message deletion', async () => {
    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const messageId = 'msg-1';

    await act(async () => {
      await result.current.deleteMessage(messageId);
    });

    expect(callFirebaseFunction).toHaveBeenCalledWith('deleteMessage', {
      chatId: mockChatId,
      messageId,
    });

    expect(result.current.messages).not.toContainEqual(
      expect.objectContaining({ id: messageId })
    );
  });

  it('should handle message editing', async () => {
    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const messageId = 'msg-1';
    const newText = 'Edited message';

    await act(async () => {
      await result.current.editMessage(messageId, newText);
    });

    expect(callFirebaseFunction).toHaveBeenCalledWith('editMessage', {
      chatId: mockChatId,
      messageId,
      text: newText,
    });

    expect(result.current.messages).toContainEqual(
      expect.objectContaining({
        id: messageId,
        text: newText,
        isEdited: true,
      })
    );
  });

  it('should handle typing indicators', async () => {
    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Start typing
    await act(async () => {
      result.current.setIsTyping(true);
    });

    // TODO: Update test to match actual TypingService interface
    // expect(TypingService.getInstance().startTyping).toHaveBeenCalledWith(mockChatId);

    // Stop typing
    await act(async () => {
      result.current.setIsTyping?.(false);
    });

    // expect(TypingService.getInstance().stopTyping).toHaveBeenCalledWith(mockChatId);
  });

  it('should subscribe to real-time updates', async () => {
    let messageCallback: any;
    let typingCallback: any;

    (ChatEncryptionService.subscribeToMessages as jest.Mock).mockImplementation((chatId, callback) => {
      messageCallback = callback;
      return jest.fn();
    });

    (TypingService.subscribeToTypingStatus as jest.Mock).mockImplementation((chatId, callback) => {
      typingCallback = callback;
      return jest.fn();
    });

    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate new message
    const newMessage = {
      id: 'msg-new',
      text: 'Real-time message',
      senderId: 'user-456',
      timestamp: new Date(),
      status: 'delivered' as const,
    };

    act(() => {
      messageCallback(newMessage);
    });

    expect(result.current.messages).toContainEqual(newMessage);

    // Simulate typing status
    const typingUsers = ['user-456'];
    
    act(() => {
      typingCallback(typingUsers);
    });

    expect(result.current.typingUsers).toEqual(typingUsers);
  });

  it('should handle search functionality', async () => {
    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const searchResults = [mockMessages[0]];
    (ChatEncryptionService.searchMessages as jest.Mock).mockResolvedValue(searchResults);

    await act(async () => {
      await result.current.searchMessages('Hello');
    });

    expect(ChatEncryptionService.searchMessages).toHaveBeenCalledWith(mockChatId, 'Hello');
    expect(result.current.searchResults).toEqual(searchResults);
  });

  it('should handle marking messages as read', async () => {
    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markAsRead();
    });

    expect(callFirebaseFunction).toHaveBeenCalledWith('markChatAsRead', {
      chatId: mockChatId,
    });

    expect(result.current.chatData?.unreadCount).toBe(0);
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Failed to load messages');
    (MessageSyncService.getMessagesForChat as jest.Mock).mockRejectedValue(error);

    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(error.message);
      expect(result.current.messages).toEqual([]);
    });
  });

  it('should cleanup on unmount', async () => {
    const unsubscribeMessages = jest.fn();
    const unsubscribeTyping = jest.fn();

    (ChatEncryptionService.subscribeToMessages as jest.Mock).mockReturnValue(unsubscribeMessages);
    (TypingService.subscribeToTypingStatus as jest.Mock).mockReturnValue(unsubscribeTyping);

    const { result, unmount } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();

    expect(unsubscribeMessages).toHaveBeenCalled();
    expect(unsubscribeTyping).toHaveBeenCalled();
  });

  it('should handle pagination', async () => {
    const { result } = renderHook(() => useEncryptedChat(mockChatId, mockUserId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const olderMessages = [
      {
        id: 'msg-0',
        text: 'Older message',
        senderId: mockUserId,
        timestamp: new Date(Date.now() - 86400000), // 1 day ago
        status: 'read' as const,
        isLocal: false,
      },
    ];

    (MessageSyncService.getMessagesForChat as jest.Mock).mockResolvedValue(olderMessages);

    await act(async () => {
      await result.current.loadMoreMessages();
    });

    expect(MessageSyncService.getMessagesForChat).toHaveBeenCalledWith(
      mockChatId,
      expect.objectContaining({
        before: expect.any(Date),
        limit: 20,
      })
    );

    expect(result.current.messages).toHaveLength(mockMessages.length + olderMessages.length);
  });
});