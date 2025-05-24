import { renderHook, act, waitFor } from '@testing-library/react-native';
import useOptimizedChat from '../useOptimizedChat';
import { MessageOptimizationService } from '../../src/services/MessageOptimizationService';
import { MessageSyncService } from '../../src/services/MessageSyncService';
import { ChatEncryptionService } from '../../src/services/encryption/ChatEncryptionService';
import { InteractionManager, AppState } from 'react-native';

// Mock services
jest.mock('../../src/services/MessageOptimizationService');
jest.mock('../../src/services/MessageSyncService');
jest.mock('../../src/services/encryption/ChatEncryptionService');

// Mock React Native modules
jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  InteractionManager: {
    runAfterInteractions: jest.fn((callback) => {
      callback();
      return { cancel: jest.fn() };
    }),
  },
  AppState: {
    addEventListener: jest.fn(),
    currentState: 'active',
  },
}));

describe('useOptimizedChat', () => {
  const mockChatId = 'chat-123';
  const mockMessages = [
    {
      id: 'msg-1',
      text: 'Message 1',
      senderId: 'user-1',
      timestamp: new Date('2025-01-23T10:00:00'),
      status: 'delivered' as const,
    },
    {
      id: 'msg-2',
      text: 'Message 2',
      senderId: 'user-2',
      timestamp: new Date('2025-01-23T10:01:00'),
      status: 'read' as const,
    },
    {
      id: 'msg-3',
      text: 'Message 3',
      senderId: 'user-1',
      timestamp: new Date('2025-01-23T10:02:00'),
      status: 'sent' as const,
    },
  ];

  const mockOptimizedMessages = [
    {
      ...mockMessages[0],
      _optimized: true,
      _batchId: 'batch-1',
    },
    {
      ...mockMessages[1],
      _optimized: true,
      _batchId: 'batch-1',
    },
    {
      ...mockMessages[2],
      _optimized: true,
      _batchId: 'batch-2',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    (MessageOptimizationService.optimizeMessages as jest.Mock).mockReturnValue(mockOptimizedMessages);
    (MessageSyncService.getMessagesForChat as jest.Mock).mockResolvedValue(mockMessages);
    (MessageOptimizationService.subscribeToOptimizedMessages as jest.Mock).mockReturnValue(() => {});
    (MessageOptimizationService.cacheMessages as jest.Mock).mockResolvedValue(undefined);
    (MessageOptimizationService.getCachedMessages as jest.Mock).mockResolvedValue(null);
  });

  it('should load and optimize messages', async () => {
    const { result } = renderHook(() => useOptimizedChat(mockChatId));

    expect(result.current.loading).toBe(true);
    expect(result.current.messages).toEqual([]);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.messages).toEqual(mockOptimizedMessages);
      expect(result.current.hasMore).toBe(true);
    });

    expect(MessageSyncService.getMessagesForChat).toHaveBeenCalledWith(mockChatId, {
      limit: 50,
    });
    expect(MessageOptimizationService.optimizeMessages).toHaveBeenCalledWith(mockMessages);
  });

  it('should load messages from cache first', async () => {
    const cachedMessages = mockOptimizedMessages.slice(0, 2);
    (MessageOptimizationService.getCachedMessages as jest.Mock).mockResolvedValue(cachedMessages);

    const { result } = renderHook(() => useOptimizedChat(mockChatId));

    // Should immediately show cached messages
    await waitFor(() => {
      expect(result.current.messages).toEqual(cachedMessages);
      expect(result.current.loading).toBe(true); // Still loading fresh data
    });

    // Then load fresh messages
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.messages).toEqual(mockOptimizedMessages);
    });
  });

  it('should handle virtual scrolling viewport', async () => {
    const manyMessages = Array.from({ length: 100 }, (_, i) => ({
      id: `msg-${i}`,
      text: `Message ${i}`,
      senderId: 'user-1',
      timestamp: new Date(Date.now() - i * 60000),
      status: 'delivered' as const,
    }));

    (MessageSyncService.getMessagesForChat as jest.Mock).mockResolvedValue(manyMessages);
    (MessageOptimizationService.optimizeMessages as jest.Mock).mockReturnValue(manyMessages);

    const { result } = renderHook(() => useOptimizedChat(mockChatId, {
      virtualScrolling: true,
      viewportSize: 10,
    }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Initially should show first viewport
    expect(result.current.visibleMessages).toHaveLength(10);
    expect(result.current.visibleMessages[0].id).toBe('msg-0');

    // Update viewport
    act(() => {
      result.current.updateViewport(10, 20);
    });

    expect(result.current.visibleMessages).toHaveLength(10);
    expect(result.current.visibleMessages[0].id).toBe('msg-10');
  });

  it('should handle batch operations', async () => {
    const { result } = renderHook(() => useOptimizedChat(mockChatId, {
      enableBatchOperations: true,
    }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const messageIds = ['msg-1', 'msg-2'];
    
    // Batch mark as read
    await act(async () => {
      await result.current.batchMarkAsRead(messageIds);
    });

    expect(MessageOptimizationService.batchUpdateMessages).toHaveBeenCalledWith(
      mockChatId,
      messageIds,
      { status: 'read' }
    );

    // Batch delete
    await act(async () => {
      await result.current.batchDelete(messageIds);
    });

    expect(MessageOptimizationService.batchDeleteMessages).toHaveBeenCalledWith(
      mockChatId,
      messageIds
    );
  });

  it('should handle real-time message updates', async () => {
    let messageCallback: any;

    (MessageOptimizationService.subscribeToOptimizedMessages as jest.Mock).mockImplementation(
      (chatId, callback) => {
        messageCallback = callback;
        return jest.fn();
      }
    );

    const { result } = renderHook(() => useOptimizedChat(mockChatId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate new message
    const newMessage = {
      id: 'msg-4',
      text: 'New message',
      senderId: 'user-2',
      timestamp: new Date(),
      status: 'sent' as const,
      _optimized: true,
    };

    act(() => {
      messageCallback({
        type: 'added',
        message: newMessage,
      });
    });

    expect(result.current.messages).toContainEqual(newMessage);

    // Simulate message update
    const updatedMessage = {
      ...mockOptimizedMessages[0],
      status: 'read' as const,
    };

    act(() => {
      messageCallback({
        type: 'modified',
        message: updatedMessage,
      });
    });

    expect(result.current.messages.find(m => m.id === 'msg-1')?.status).toBe('read');

    // Simulate message deletion
    act(() => {
      messageCallback({
        type: 'removed',
        messageId: 'msg-2',
      });
    });

    expect(result.current.messages.find(m => m.id === 'msg-2')).toBeUndefined();
  });

  it('should handle pagination with optimization', async () => {
    const { result } = renderHook(() => useOptimizedChat(mockChatId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const olderMessages = [
      {
        id: 'msg-older-1',
        text: 'Older message',
        senderId: 'user-1',
        timestamp: new Date('2025-01-22T10:00:00'),
        status: 'read' as const,
      },
    ];

    (MessageSyncService.getMessagesForChat as jest.Mock).mockResolvedValue(olderMessages);
    (MessageOptimizationService.optimizeMessages as jest.Mock).mockReturnValue(olderMessages);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(MessageSyncService.getMessagesForChat).toHaveBeenCalledWith(mockChatId, {
      before: expect.any(Date),
      limit: 50,
    });

    expect(result.current.messages).toHaveLength(mockOptimizedMessages.length + olderMessages.length);
  });

  it('should debounce search operations', async () => {
    const { result } = renderHook(() => useOptimizedChat(mockChatId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const searchResults = [mockOptimizedMessages[0]];
    (ChatEncryptionService.searchMessages as jest.Mock).mockResolvedValue(searchResults);

    // Trigger multiple searches rapidly
    act(() => {
      result.current.searchMessages('test');
      result.current.searchMessages('test 2');
      result.current.searchMessages('test 3');
    });

    // Should only call search once after debounce
    await waitFor(() => {
      expect(ChatEncryptionService.searchMessages).toHaveBeenCalledTimes(1);
      expect(ChatEncryptionService.searchMessages).toHaveBeenCalledWith(mockChatId, 'test 3');
    });

    expect(result.current.searchResults).toEqual(searchResults);
  });

  it('should handle memory pressure', async () => {
    const manyMessages = Array.from({ length: 1000 }, (_, i) => ({
      id: `msg-${i}`,
      text: `Message ${i}`,
      senderId: 'user-1',
      timestamp: new Date(Date.now() - i * 60000),
      status: 'delivered' as const,
    }));

    (MessageSyncService.getMessagesForChat as jest.Mock).mockResolvedValue(manyMessages);
    (MessageOptimizationService.optimizeMessages as jest.Mock).mockReturnValue(manyMessages);

    const { result } = renderHook(() => useOptimizedChat(mockChatId, {
      maxMessagesInMemory: 100,
    }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Should only keep maxMessagesInMemory in memory
    expect(result.current.messages).toHaveLength(100);
    expect(MessageOptimizationService.cacheMessages).toHaveBeenCalled();
  });

  it('should handle app state changes', async () => {
    let appStateCallback: any;

    (AppState.addEventListener as jest.Mock).mockImplementation((event, callback) => {
      if (event === 'change') {
        appStateCallback = callback;
      }
      return { remove: jest.fn() };
    });

    const { result } = renderHook(() => useOptimizedChat(mockChatId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate app going to background
    act(() => {
      appStateCallback('background');
    });

    expect(MessageOptimizationService.cacheMessages).toHaveBeenCalledWith(
      mockChatId,
      mockOptimizedMessages
    );

    // Simulate app coming to foreground
    act(() => {
      appStateCallback('active');
    });

    expect(MessageSyncService.syncMessages).toHaveBeenCalledWith(mockChatId);
  });

  it('should handle performance monitoring', async () => {
    const { result } = renderHook(() => useOptimizedChat(mockChatId, {
      enablePerformanceMonitoring: true,
    }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.performanceMetrics).toBeDefined();
    expect(result.current.performanceMetrics).toHaveProperty('loadTime');
    expect(result.current.performanceMetrics).toHaveProperty('messageCount');
    expect(result.current.performanceMetrics).toHaveProperty('renderTime');
  });

  it('should cleanup on unmount', async () => {
    const unsubscribe = jest.fn();
    (MessageOptimizationService.subscribeToOptimizedMessages as jest.Mock).mockReturnValue(unsubscribe);

    const { result, unmount } = renderHook(() => useOptimizedChat(mockChatId));

    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
    expect(MessageOptimizationService.cleanup).toHaveBeenCalledWith(mockChatId);
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Failed to load messages');
    (MessageSyncService.getMessagesForChat as jest.Mock).mockRejectedValue(error);

    const { result } = renderHook(() => useOptimizedChat(mockChatId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(error.message);
      expect(result.current.messages).toEqual([]);
    });

    // Should be able to retry
    (MessageSyncService.getMessagesForChat as jest.Mock).mockResolvedValue(mockMessages);

    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.messages).toEqual(mockOptimizedMessages);
    });
  });
});