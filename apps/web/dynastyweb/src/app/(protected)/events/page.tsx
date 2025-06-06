"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Calendar, Plus, Search } from "lucide-react"
import { isPast, isFuture, parseISO } from "date-fns"
import { EventCard } from "@/components/EventCard"
import { EventData, getAllEvents, formatEventData } from "@/utils/eventUtils"
import { useAuth } from "@/context/AuthContext"
import { Spinner } from "@/components/ui/spinner"

export default function EventsPage() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const [activeTab, setActiveTab] = useState("upcoming")
  const [searchQuery, setSearchQuery] = useState("")
  const [events, setEvents] = useState<EventData[]>([])
  const [filteredEvents, setFilteredEvents] = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch events from Firebase
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true)
        setError(null)

        if (!currentUser) {
          setError("You must be logged in to view events")
          setLoading(false)
          return
        }

        const { events: fetchedEvents } = await getAllEvents()
        
        // Format events for display
        const formattedEvents = fetchedEvents.map(event => 
          formatEventData(event, currentUser.uid)
        )
        
        setEvents(formattedEvents)
      } catch (error) {
        console.error("Error fetching events:", error)
        setError("Failed to load events. Please try again later.")
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()
  }, [currentUser])

  // Filter events based on active tab and search query (remove category filtering)
  useEffect(() => {
    if (!events.length) {
      setFilteredEvents([])
      return
    }

    let filtered = [...events]

    // Filter by tab
    if (activeTab === "upcoming") {
      filtered = filtered.filter((event) => isFuture(parseISO(event.eventDate)))
    } else if (activeTab === "past") {
      filtered = filtered.filter((event) => isPast(parseISO(event.eventDate)))
    } else if (activeTab === "myEvents") {
      filtered = filtered.filter((event) => event.isCreator)
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (event) =>
          event.title.toLowerCase().includes(query) ||
          (event.description && event.description.toLowerCase().includes(query)) ||
          (event.location?.address && event.location.address.toLowerCase().includes(query)) ||
          (event.host?.name && event.host.name.toLowerCase().includes(query))
      )
    }

    setFilteredEvents(filtered)
  }, [events, activeTab, searchQuery])

  // Handle RSVP status change
  const handleRsvpChange = (eventId: string, status: 'yes' | 'maybe' | 'no' | 'declined') => {
    // Update the events array with the new RSVP status
    setEvents(prevEvents => 
      prevEvents.map(event => {
        if (event.id === eventId) {
          return {
            ...event,
            userStatus: status === 'yes' ? 'going' : status
          }
        }
        return event
      })
    )
  }

  // Handle event deletion
  const handleDeleteEvent = (eventId: string) => {
    // Remove the event from the local state
    setEvents(prevEvents => prevEvents.filter(event => event.id !== eventId))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" variant="primary" className="mb-4" />
          <p className="text-[#0A5C36] font-medium">Loading events...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-red-500 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={() => router.refresh()}>Try Again</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div className="mt-6">
            <h1 className="text-2xl font-bold text-gray-900">Family Events</h1>
          </div>
          <Link href="/create-event">
            <Button className="mt-4 md:mt-0 bg-[#0A5C36] hover:bg-[#084c2b]">
              <Plus className="mr-2 h-4 w-4" />
              Create Event
            </Button>
          </Link>
        </div>

        {/* Main Tabs */}
        <div className="mb-6">
          <Tabs defaultValue="upcoming" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger
                value="upcoming"
                className="data-[state=active]:bg-green-50 data-[state=active]:text-[#0A5C36]"
              >
                Upcoming
              </TabsTrigger>
              <TabsTrigger
                value="past"
                className="data-[state=active]:bg-green-50 data-[state=active]:text-[#0A5C36]"
              >
                Past Events
              </TabsTrigger>
              <TabsTrigger
                value="myEvents"
                className="data-[state=active]:bg-green-50 data-[state=active]:text-[#0A5C36]"
              >
                My Events
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Search */}
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Events Grid */}
        {filteredEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {filteredEvents.map((event) => (
              <EventCard 
                key={event.id}
                id={event.id}
                title={event.title}
                date={event.eventDate}
                endDate={event.endDate}
                startTime={event.startTime}
                endTime={event.endTime}
                timezone={event.timezone}
                hasVaryingTimes={Boolean(event.daySpecificTimes && Object.keys(event.daySpecificTimes).length > 0)}
                location={event.location?.address}
                isVirtual={event.isVirtual}
                virtualLink={event.virtualLink || ""}
                coverImage={event.coverPhotoUrls?.[0]}
                description={event.description}
                host={{
                  id: event.hostId,
                  name: event.host?.name || "Unknown Host",
                  avatar: event.host?.avatar
                }}
                attendees={(event.attendees || []).map(attendee => ({
                  ...attendee,
                  status: attendee.status as 'going' | 'maybe' | 'no' | 'pending' | 'yes' | 'went' | 'declined' | 'invited'
                }))}
                userStatus={event.userStatus as 'going' | 'maybe' | 'no' | 'pending' | 'yes' | 'went' | 'declined' | 'invited' || "invited"}
                isCreator={event.isCreator || false}
                onRsvpChange={handleRsvpChange}
                onDelete={handleDeleteEvent}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Calendar className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No events found</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              {activeTab === "upcoming"
                ? "You don't have any upcoming events. Create a new event to get started!"
                : activeTab === "past"
                  ? "You don't have any past events."
                  : "You haven't created any events yet."}
            </p>
            <Link href="/create-event">
              <Button className="bg-[#0A5C36] hover:bg-[#084c2b]">
                <Plus className="mr-2 h-4 w-4" />
                Create New Event
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
} 