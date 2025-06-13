"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/context/AuthContext"
import { type Story } from "@/utils/storyUtils"
import { Button } from "@/components/ui/button"
import { PenSquare, BookOpen, Calendar } from "lucide-react"
import { StoryCard } from "@/components/Story"
import { getAccessibleStories } from "@/utils/functionUtils"
import { Spinner } from "@/components/ui/spinner"
import { getEventsForFeed } from "@/utils/functionUtils"
import { EventData } from "@/utils/eventUtils"
import { EventFeedCard } from "@/components/EventFeedCard"

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
interface FeedItem {
  id: string;
  type: 'story' | 'event';
  timestamp: string; // ISO date string
  data: EnrichedStory | EventData;
}

export default function FeedPage() {
  const { currentUser, firestoreUser } = useAuth()
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true;

    const loadFeedContent = async () => {
      
      try {
        setLoading(true);
        setError(null);

        if (!currentUser?.uid || !firestoreUser?.familyTreeId) {
          setError('Unable to load feed. Please try logging out and back in.');
          return;
        }

        
        // Load stories and events in parallel
        const [storiesResult, eventsResult] = await Promise.all([
          getAccessibleStories(currentUser.uid, firestoreUser.familyTreeId),
          getEventsForFeed(currentUser.uid, firestoreUser.familyTreeId)
        ]);
        
        if (!mounted) {
          return;
        }
        
        // Process stories
        let allFeedItems: FeedItem[] = [];
        
        if (storiesResult && Array.isArray(storiesResult.stories)) {
          const storyItems: FeedItem[] = storiesResult.stories.map(story => {
            let timestampStr: string;
            
            // Convert different timestamp types to ISO string
            if (story.createdAt) {
              if (typeof story.createdAt === 'string') {
                timestampStr = story.createdAt;
              } else if (typeof story.createdAt === 'object' && 'toDate' in story.createdAt && typeof story.createdAt.toDate === 'function') {
                // Handle Firebase timestamp-like objects
                timestampStr = story.createdAt.toDate().toISOString();
              } else if (story.createdAt instanceof Date) {
                timestampStr = story.createdAt.toISOString();
              } else {
                // Fallback
                timestampStr = new Date().toISOString();
              }
            } else {
              timestampStr = new Date().toISOString();
            }
            
            return {
              id: story.id,
              type: 'story',
              timestamp: timestampStr,
              data: story as EnrichedStory
            }
          });
          
          allFeedItems = [...allFeedItems, ...storyItems];
        }
        
        // Process events
        if (eventsResult && Array.isArray(eventsResult.events)) {
          const eventItems: FeedItem[] = eventsResult.events.map((event: unknown) => {
            const eventData = event as EventData;
            return {
              id: eventData.id,
              type: 'event' as const,
              timestamp: eventData.eventDate,
              data: eventData
            };
          });
          
          allFeedItems = [...allFeedItems, ...eventItems];
        }
        
        // Sort by timestamp, newest first
        allFeedItems.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        
        // Items have been processed; update state
        
        // Add more detailed logging for events
        const eventItems = allFeedItems.filter(item => item.type === 'event');

        setFeedItems(allFeedItems);
      } catch (error) {
        console.error('[Feed] Error loading feed content:', error);
        if (!mounted) return;
        setError(error instanceof Error ? error.message : 'Failed to load feed content');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    if (currentUser && firestoreUser?.familyTreeId) {
      loadFeedContent();
    }

    return () => {
      mounted = false;
    };
  }, [currentUser, firestoreUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB]">
        <main className="container py-6">
          <div className="text-center py-8">
            <Spinner size="lg" variant="primary" className="mb-4" />
            <p className="text-[#0A5C36] font-medium">Loading stories...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F9FAFB]">
        <main className="container py-6">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md shadow-sm" role="alert">
            <p className="font-medium">Error</p>
            <p>{error}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <main className="container py-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 mt-6 gap-4 sm:gap-0">
          <h1 className="text-2xl font-bold text-[#000000]">Family Feed</h1>
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 w-full sm:w-auto">
            <Link href="/create-story" className="w-full sm:w-auto">
              <Button 
                size="sm" 
                className="bg-[#0A5C36] hover:bg-[#084c2b] text-white w-full py-3 sm:py-2"
              >
                <PenSquare className="mr-2 h-4 w-4" />
                <span>Create Story</span>
              </Button>
            </Link>
            <Link href="/create-event" className="w-full sm:w-auto">
              <Button 
                size="sm" 
                variant="outline"
                className="border-[#0A5C36] text-[#0A5C36] hover:bg-green-50 w-full py-3 sm:py-2"
              >
                <Calendar className="mr-2 h-4 w-4" />
                <span>Create Event</span>
              </Button>
            </Link>
          </div>
        </div>

        {feedItems.length > 0 ? (
          <div className="space-y-6">
            {feedItems.map((item) => (
              <div key={`${item.type}-${item.id}`}>
                {item.type === 'story' && (
                  <StoryCard 
                    story={item.data as EnrichedStory} 
                    currentUserId={currentUser?.uid || ''}
                  />
                )}
                {item.type === 'event' && (
                  <EventFeedCard 
                    id={item.id}
                    title={(item.data as EventData).title}
                    date={(item.data as EventData).eventDate}
                    endDate={(item.data as EventData).endDate}
                    startTime={(item.data as EventData).startTime}
                    endTime={(item.data as EventData).endTime}
                    timezone={(item.data as EventData).timezone}
                    hasVaryingTimes={!!(item.data as EventData).daySpecificTimes && 
                      Object.keys((item.data as EventData).daySpecificTimes || {}).length > 0}
                    location={(item.data as EventData).location?.address}
                    isVirtual={(item.data as EventData).isVirtual}
                    coverImage={(item.data as EventData).coverPhotoUrls?.[0]}
                    host={{
                      id: (item.data as EventData).host?.id || 'unknown',
                      name: (item.data as EventData).host?.name || 'Unknown Host',
                      avatar: (item.data as EventData).host?.avatar
                    }}
                    attendees={((item.data as EventData).attendees || []).map(attendee => ({
                      id: attendee.id,
                      name: attendee.name,
                      avatar: attendee.avatar,
                      status: (attendee.status as 'going' | 'maybe' | 'no' | 'pending' | 'yes' | 'went' | 'declined' | 'invited') || 'invited'
                    }))}
                    userStatus={((item.data as EventData).userStatus as 'going' | 'maybe' | 'no' | 'pending' | 'yes' | 'went' | 'declined' | 'invited') || 'invited'}
                    isCreator={!!(item.data as EventData).isCreator}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <div className="mb-4">
              <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No items in your feed yet</h3>
            <p className="text-gray-500 mb-6">Start by creating stories and events to share with your family.</p>
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 justify-center">
              <Link href="/create-story" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto bg-[#0A5C36] hover:bg-[#084c2b] text-white py-3 sm:py-2">
                  <PenSquare className="mr-2 h-4 w-4" />
                  Create a Story
                </Button>
              </Link>
              <Link href="/create-event" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto border-[#0A5C36] text-[#0A5C36] hover:bg-green-50 py-3 sm:py-2">
                  <Calendar className="mr-2 h-4 w-4" />
                  Plan an Event
                </Button>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
} 