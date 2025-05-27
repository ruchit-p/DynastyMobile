import React, { useCallback, useEffect, useMemo, useRef, memo } from 'react';
import { ViewToken } from 'react-native';
import { FlashList } from './FlashList';
import MessageOptimizationService from '../../src/services/MessageOptimizationService';
import { Message } from '../../src/services/encryption/ChatEncryptionService';

interface OptimizedMessageListProps {
  messages: Message[];
  renderMessage: (props: { item: Message; index: number }) => React.ReactElement;
  onEndReached?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  inverted?: boolean;
  onViewableItemsChanged?: (info: { viewableItems: ViewToken[]; changed: ViewToken[] }) => void;
  estimatedItemSize?: number;
  keyExtractor?: (item: Message) => string;
  contentContainerStyle?: any;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement;
  ListFooterComponent?: React.ComponentType<any> | React.ReactElement;
  ListEmptyComponent?: React.ComponentType<any> | React.ReactElement;
}

// Memoized message item wrapper
const MemoizedMessageItem = memo(({ 
  item, 
  renderMessage 
}: { 
  item: Message; 
  renderMessage: (props: { item: Message }) => React.ReactElement;
}) => {
  return renderMessage({ item });
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  const prev = prevProps.item;
  const next = nextProps.item;
  
  return (
    prev.id === next.id &&
    prev.text === next.text &&
    prev.status === next.status &&
    prev.delivered?.length === next.delivered?.length &&
    prev.read?.length === next.read?.length &&
    JSON.stringify(prev.reactions) === JSON.stringify(next.reactions)
  );
});

MemoizedMessageItem.displayName = 'MemoizedMessageItem';

export default function OptimizedMessageList({
  messages,
  renderMessage,
  onEndReached,
  onRefresh,
  refreshing = false,
  inverted = true,
  onViewableItemsChanged,
  estimatedItemSize = 80,
  keyExtractor = (item) => item.id,
  contentContainerStyle,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
}: OptimizedMessageListProps) {
  const flashListRef = useRef<any>(null);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 500,
  }).current;

  // Batch size for rendering
  const batchSize = useMemo(() => {
    return MessageOptimizationService.getOptimalBatchSize();
  }, []);

  // Handle viewable items change with media preloading
  const handleViewableItemsChanged = useCallback((info: { 
    viewableItems: ViewToken[]; 
    changed: ViewToken[] 
  }) => {
    // Preload media for visible messages
    const visibleMessages = info.viewableItems
      .map(item => item.item as Message)
      .filter(Boolean);
    
    MessageOptimizationService.preloadMedia(visibleMessages);

    // Call original handler
    onViewableItemsChanged?.(info);
  }, [onViewableItemsChanged]);

  // Optimized render item with memoization
  const renderItem = useCallback(({ item, index }: { item: Message; index: number }) => {
    return (
      <MemoizedMessageItem
        item={item}
        renderMessage={renderMessage}
      />
    );
  }, [renderMessage]);

  // Calculate dynamic item size based on message type
  const getItemLayout = useCallback((data: Message[] | null | undefined, index: number) => {
    if (!data || index < 0 || index >= data.length) {
      return { length: estimatedItemSize, offset: estimatedItemSize * index, index };
    }

    const item = data[index];
    let itemHeight = estimatedItemSize;

    // Adjust height based on content
    if (item.type === 'text' && item.text) {
      // Rough estimation: 20px per line, assuming ~40 chars per line
      const lines = Math.ceil(item.text.length / 40);
      itemHeight = Math.max(60, 40 + (lines * 20));
    } else if (item.type === 'media') {
      itemHeight = 220; // Fixed height for media
    } else if (item.type === 'voice') {
      itemHeight = 80; // Fixed height for voice messages
    }

    // Add height for reactions if present
    if (item.reactions && item.reactions.length > 0) {
      itemHeight += 30;
    }

    return {
      length: itemHeight,
      offset: estimatedItemSize * index, // Approximation
      index,
    };
  }, [estimatedItemSize]);

  // Performance optimizations
  const extraData = useMemo(() => ({
    refreshing,
    timestamp: Date.now(),
  }), [refreshing]);

  return (
    <FlashList
      ref={flashListRef}
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      estimatedItemSize={estimatedItemSize}
      inverted={inverted}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.1}
      onRefresh={onRefresh}
      refreshing={refreshing}
      contentContainerStyle={contentContainerStyle}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
      // Performance optimizations
      removeClippedSubviews={true}
      maxToRenderPerBatch={batchSize}
      updateCellsBatchingPeriod={50}
      windowSize={10}
      initialNumToRender={20}
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      extraData={extraData}
      // FlashList specific optimizations
      estimatedListSize={{
        height: 600,
        width: 375,
      }}
      overrideItemLayout={getItemLayout}
      drawDistance={500}
    />
  );
}

// Export utility functions
export const messageListUtils = {
  /**
   * Scroll to a specific message
   */
  scrollToMessage: (ref: React.RefObject<any>, messageId: string, messages: Message[]) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1 && ref.current) {
      ref.current.scrollToIndex({ index, animated: true });
    }
  },

  /**
   * Scroll to bottom
   */
  scrollToEnd: (ref: React.RefObject<any>) => {
    if (ref.current) {
      ref.current.scrollToEnd({ animated: true });
    }
  },

  /**
   * Prepare messages for optimal rendering
   */
  prepareMessages: (messages: Message[]): Message[] => {
    // Sort by timestamp if needed
    const sorted = [...messages].sort((a, b) => {
      const aTime = a.timestamp instanceof Date ? a.timestamp.getTime() : a.timestamp.toMillis();
      const bTime = b.timestamp instanceof Date ? b.timestamp.getTime() : b.timestamp.toMillis();
      return aTime - bTime;
    });

    // Cache messages
    sorted.forEach(msg => {
      MessageOptimizationService.cacheMessage(msg);
    });

    return sorted;
  },
};