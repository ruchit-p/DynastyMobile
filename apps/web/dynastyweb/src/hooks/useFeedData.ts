import { useState, useCallback, useEffect, useMemo } from 'react';
import { cacheService, cacheKeys } from '@/services/CacheService';
import { getAccessibleStoriesPaginated, getEventsForFeedPaginated } from '@/utils/functionUtils';
import type { Story } from '@/utils/storyUtils';
import type { EventData } from '@/utils/eventUtils';
import { errorHandler, ErrorSeverity } from '@/services/ErrorHandlingService';

// Define the enriched story type
type EnrichedStory = Story & {
  author: {
    id: string;
    displayName: string;
    profilePicture?: string;
  };
  taggedPeople: Array<{
    id: string;
    displayName: string;
  }>;
};

// Interface for feed items which can be either stories or events
export interface FeedItem {
  id: string;
  type: 'story' | 'event';
  timestamp: string; // ISO date string
  data: EnrichedStory | EventData;
}

interface UseFeedDataResult {
  feedItems: FeedItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMoreContent: () => Promise<void>;
  refresh: () => Promise<void>;
  error: string | null;
}

export function useFeedData(userId: string, familyTreeId: string): UseFeedDataResult {
  const [stories, setStories] = useState<EnrichedStory[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreStories, setHasMoreStories] = useState(true);
  const [hasMoreEvents, setHasMoreEvents] = useState(true);
  const [lastStoryId, setLastStoryId] = useState<string>();
  const [lastEventDate, setLastEventDate] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  
  const STORIES_PER_PAGE = 20;
  const EVENTS_PER_PAGE = 10;
  
  // Combine and sort feed items
  const feedItems = useMemo(() => {
    const items: FeedItem[] = [
      ...stories.map(story => ({
        id: story.id,
        type: 'story' as const,
        timestamp: typeof story.createdAt === 'string' 
          ? story.createdAt 
          : story.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        data: story
      })),
      ...events.map(event => ({
        id: event.id,
        type: 'event' as const,
        timestamp: event.eventDate,
        data: event
      }))
    ];
    
    return items.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [stories, events]);
  
  const loadFreshData = useCallback(async () => {
    try {
      const [storiesResult, eventsResult] = await Promise.all([
        getAccessibleStoriesPaginated(userId, familyTreeId, undefined, STORIES_PER_PAGE),
        getEventsForFeedPaginated(userId, familyTreeId, undefined, EVENTS_PER_PAGE)
      ]);
      
      // Cache the results
      const storiesCacheKey = cacheKeys.stories(familyTreeId, 0);
      const eventsCacheKey = cacheKeys.events(familyTreeId, 0);
      
      await Promise.all([
        cacheService.set(storiesCacheKey, storiesResult, {
          ttl: 60000, // 1 minute
          persist: true
        }),
        cacheService.set(eventsCacheKey, eventsResult, {
          ttl: 60000, // 1 minute
          persist: true
        })
      ]);
      
      setStories(storiesResult.stories);
      setEvents(eventsResult.events as EventData[]);
      setHasMoreStories(storiesResult.hasMore);
      setHasMoreEvents(eventsResult.hasMore);
      setLastStoryId(storiesResult.lastDocId);
      setLastEventDate(eventsResult.lastEventDate);
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'load-fresh-feed-data',
        context: { userId, familyTreeId }
      });
      if (!stories.length && !events.length) {
        // Only set error if we have no cached data to show
        setError(error instanceof Error ? error.message : 'Failed to load feed content');
      }
    }
  }, [userId, familyTreeId, stories.length, events.length]);
  
  const loadInitialData = useCallback(async () => {
    if (!userId || !familyTreeId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Check cache first for initial load
      const cachedStoriesKey = cacheKeys.stories(familyTreeId, 0);
      const cachedEventsKey = cacheKeys.events(familyTreeId, 0);
      
      const cachedStories = cacheService.get<{ stories: EnrichedStory[], hasMore: boolean, lastDocId?: string }>(cachedStoriesKey);
      const cachedEvents = cacheService.get<{ events: EventData[], hasMore: boolean, lastEventDate?: string }>(cachedEventsKey);
      
      if (cachedStories && cachedEvents) {
        // Use cached data immediately
        setStories(cachedStories.stories);
        setEvents(cachedEvents.events as EventData[]);
        setHasMoreStories(cachedStories.hasMore);
        setHasMoreEvents(cachedEvents.hasMore);
        setLastStoryId(cachedStories.lastDocId);
        setLastEventDate(cachedEvents.lastEventDate);
        setLoading(false);
        
        // Still fetch fresh data in background
        loadFreshData();
        return;
      }
      
      await loadFreshData();
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.MEDIUM, {
        action: 'load-initial-feed-data',
        context: { userId, familyTreeId }
      });
      setError(error instanceof Error ? error.message : 'Failed to load feed content');
    } finally {
      setLoading(false);
    }
  }, [userId, familyTreeId, loadFreshData]);
  
  const loadMoreContent = useCallback(async () => {
    if ((!hasMoreStories && !hasMoreEvents) || loadingMore) return;
    
    setLoadingMore(true);
    setError(null);
    
    try {
      type StoryResult = { type: 'stories'; result: { stories: EnrichedStory[], hasMore: boolean, lastDocId?: string } };
      type EventResult = { type: 'events'; result: { events: EventData[], hasMore: boolean, lastEventDate?: string } };
      const promises: Promise<StoryResult | EventResult>[] = [];
      
      // Load more stories if available
      if (hasMoreStories && lastStoryId) {
        promises.push(
          getAccessibleStoriesPaginated(userId, familyTreeId, lastStoryId, STORIES_PER_PAGE)
            .then(result => ({ type: 'stories' as const, result }))
        );
      }
      
      // Load more events if available
      if (hasMoreEvents && lastEventDate) {
        promises.push(
          getEventsForFeedPaginated(userId, familyTreeId, lastEventDate, EVENTS_PER_PAGE)
            .then(result => ({ type: 'events' as const, result }))
        );
      }
      
      if (promises.length === 0) return;
      
      const results = await Promise.all(promises);
      
      results.forEach((item) => {
        if (item.type === 'stories') {
          setStories(prev => [...prev, ...item.result.stories]);
          setHasMoreStories(item.result.hasMore);
          if (item.result.lastDocId) {
            setLastStoryId(item.result.lastDocId);
          }
        } else if (item.type === 'events') {
          setEvents(prev => [...prev, ...item.result.events]);
          setHasMoreEvents(item.result.hasMore);
          if (item.result.lastEventDate) {
            setLastEventDate(item.result.lastEventDate);
          }
        }
      });
    } catch (error) {
      errorHandler.handleError(error, ErrorSeverity.LOW, {
        action: 'load-more-feed-content',
        context: { userId, familyTreeId, lastStoryId, lastEventDate }
      });
      setError(error instanceof Error ? error.message : 'Failed to load more content');
    } finally {
      setLoadingMore(false);
    }
  }, [userId, familyTreeId, lastStoryId, lastEventDate, hasMoreStories, hasMoreEvents, loadingMore]);
  
  // Invalidate cache and refresh
  const refresh = useCallback(async () => {
    // Clear cache for this family tree
    cacheService.invalidatePattern(`stories:${familyTreeId}`);
    cacheService.invalidatePattern(`events:${familyTreeId}`);
    
    // Reset pagination state
    setStories([]);
    setEvents([]);
    setLastStoryId(undefined);
    setLastEventDate(undefined);
    setHasMoreStories(true);
    setHasMoreEvents(true);
    
    // Reload initial data
    await loadInitialData();
  }, [familyTreeId, loadInitialData]);
  
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);
  
  return {
    feedItems,
    loading,
    loadingMore,
    hasMore: hasMoreStories || hasMoreEvents,
    loadMoreContent,
    refresh,
    error
  };
}