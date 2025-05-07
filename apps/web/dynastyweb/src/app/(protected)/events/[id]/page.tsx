"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users,
  ArrowLeft,
  Edit,
  Check,
  X,
  HelpCircle,
  // MessageSquare,
  // ImageIcon,
  // Video,
  Loader2,
  CalendarPlus
} from "lucide-react"
import { format, isPast, parseISO } from "date-fns"
import { getEventDetails, updateEventRsvp, EventData, downloadEventCalendar } from "@/utils/eventUtils"
import { ensureAccessibleStorageUrl } from "@/utils/mediaUtils"
import { useAuth } from "@/context/AuthContext"
import DynastyCarousel from "@/components/DynastyCarousel"

export default function EventDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { currentUser } = useAuth()
  const [activeTab, setActiveTab] = useState("details")
  const [event, setEvent] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userStatus, setUserStatus] = useState<string | null>(null)
  const [submittingRsvp, setSubmittingRsvp] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Unwrap params Promise to access id
  const { id } = use(params)

  // Format time for display
  const formatTime = (timeString?: string) => {
    if (!timeString) return "";
    
    // Parse the time string (expecting format like "14:30")
    const [hours, minutes] = timeString.split(":").map(Number);
    
    // Create a date object with the time (using today's date)
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    
    return format(date, "h:mm a");
  }

  // Format timezone for display
  const formatTimezone = (tz?: string) => {
    if (!tz) return "";
    
    try {
      // Get abbreviated timezone name
      const now = new Date();
      const timeZoneName = now.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop();
      return timeZoneName;
    } catch {
      // If we can't get the abbreviated name, just return the timezone as is
      return tz.split('/').pop()?.replace('_', ' ') || tz;
    }
  }

  // Fetch event details
  useEffect(() => {
    const fetchEventDetails = async () => {
      try {
        setLoading(true)
        setError(null)

        if (!currentUser) {
          setError("You must be logged in to view this event")
          setLoading(false)
          return
        }

        const { event: eventData } = await getEventDetails(id)
        
        setEvent(eventData)
        setUserStatus(eventData.userStatus || "invited")
      } catch (error) {
        console.error("Error fetching event details:", error)
        setError("Failed to load event details. Please try again later.")
      } finally {
        setLoading(false)
      }
    }

    fetchEventDetails()
  }, [id, currentUser, refreshKey])

  // Add effect to refresh data when component is focused 
  useEffect(() => {
    const handleFocus = () => {
      // Force a refresh when the window regains focus
      setRefreshKey(prevKey => prevKey + 1);
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Handle RSVP status change
  const handleRsvpChange = async (status: 'yes' | 'maybe' | 'no') => {
    if (!event) return

    try {
      setSubmittingRsvp(true)
      
      // Call the Firebase function to update the RSVP status
      await updateEventRsvp(event.id, status)
      
      // Update the local state
      setUserStatus(status === 'yes' ? 'going' : status)
      
      // Update the event object
      setEvent(prev => {
        if (!prev) return null
        
        return {
          ...prev,
          userStatus: status === 'yes' ? 'going' : status
        }
      })
    } catch (error) {
      console.error("Error updating RSVP:", error)
    } finally {
      setSubmittingRsvp(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-[#0A5C36] mx-auto mb-4" />
          <p className="text-[#0A5C36] font-medium">Loading event details...</p>
        </div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-red-500 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-4">{error || "Unable to load this event."}</p>
          <Button onClick={() => router.push("/events")}>Back to Events</Button>
        </div>
      </div>
    )
  }

  const isPastEvent = isPast(parseISO(event.eventDate))
  const coverPhotos = event.coverPhotoUrls?.map(url => ensureAccessibleStorageUrl(url)) || []
  const eventDate = parseISO(event.eventDate)
  // const comments = event.comments || [] // Commented out as discussion feature is temporarily removed
  const isCreator = currentUser?.uid === event.hostId
  
  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          className="my-4 text-[#0A5C36] hover:text-[#084c2b] hover:bg-green-50 -ml-2"
          onClick={() => router.push("/events")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Events
        </Button>

        {/* Event Header */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-6">
          {/* Cover Image Carousel */}
          {coverPhotos.length > 0 && (
            <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] md:h-80">
              <DynastyCarousel
                items={coverPhotos}
                infiniteLoop={true}
                showIndicators={coverPhotos.length > 1}
                showThumbs={false}
                className="h-full"
                imageHeight={400}
              />
            </div>
          )}

          <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{event.title}</h1>
                
                {/* Date and Time Display */}
                {event.endDate && event.endDate !== event.eventDate ? (
                  <>
                    {/* Multi-day event display */}
                    <div className="flex items-start mb-1">
                      <CalendarIcon className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">
                        From {format(parseISO(event.eventDate), "EEEE, MMMM d, yyyy")} to {format(parseISO(event.endDate), "EEEE, MMMM d, yyyy")}
                      </span>
                    </div>
                    
                    {/* Time display for multi-day events */}
                    {event.daySpecificTimes && Object.keys(event.daySpecificTimes).length > 0 ? (
                      <div className="mt-3 mb-3">
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Schedule:</h3>
                        <div className="space-y-2 pl-6">
                          {Object.entries(event.daySpecificTimes).map(([date, times]) => (
                            <div key={date} className="flex items-start">
                              <Clock className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="text-gray-700 font-medium">
                                  {format(parseISO(date), "EEEE, MMMM d")}:
                                </div>
                                <div className="text-gray-600">
                                  {times.startTime && formatTime(times.startTime)}
                                  {times.startTime && times.endTime && " - "}
                                  {times.endTime && formatTime(times.endTime)}
                                  {event.timezone ? ` (${formatTimezone(event.timezone)})` : ""}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start mb-1">
                        <Clock className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">
                          {event.startTime && formatTime(event.startTime)}
                          {event.startTime && event.endTime && " - "}
                          {event.endTime && formatTime(event.endTime)}
                          {event.timezone ? ` (${formatTimezone(event.timezone)})` : ""}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Single-day event display */}
                    <div className="flex items-start mb-1">
                      <CalendarIcon className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700 break-words">{format(eventDate, "EEEE, MMMM d, yyyy")}</span>
                    </div>
                    {event.startTime && (
                      <div className="flex items-start mb-1">
                        <Clock className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">
                          {formatTime(event.startTime)}
                          {event.startTime && event.endTime && " - "}
                          {event.endTime && formatTime(event.endTime)}
                          {event.timezone ? ` (${formatTimezone(event.timezone)})` : ""}
                        </span>
                      </div>
                    )}
                  </>
                )}
                
                {/* Location display */}
                {event.isVirtual ? (
                  <div className="flex items-start">
                    <svg className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <div>
                      <span className="text-gray-700">Virtual Event</span>
                      {event.virtualLink && (
                        <a 
                          href={event.virtualLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="ml-2 text-[#0A5C36] underline block sm:inline"
                        >
                          Join Meeting
                        </a>
                      )}
                    </div>
                  </div>
                ) : event.location && (
                  <div className="flex items-start">
                    <MapPin className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 break-words">{event.location.address}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-4 sm:mt-0 md:items-start md:justify-end">
                {!isPastEvent && !isCreator && (
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button
                      variant={userStatus === "going" || userStatus === "yes" ? "default" : "outline"}
                      className={`${userStatus === "going" || userStatus === "yes" ? "bg-[#0A5C36] hover:bg-[#084c2b]" : ""} flex-1 sm:flex-none`}
                      onClick={() => handleRsvpChange("yes")}
                      disabled={submittingRsvp}
                    >
                      {submittingRsvp ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Going
                    </Button>
                    <Button
                      variant={userStatus === "maybe" ? "default" : "outline"}
                      className={`${userStatus === "maybe" ? "bg-yellow-500 hover:bg-yellow-600 text-white" : ""} flex-1 sm:flex-none`}
                      onClick={() => handleRsvpChange("maybe")}
                      disabled={submittingRsvp}
                    >
                      <HelpCircle className="mr-2 h-4 w-4" />
                      Maybe
                    </Button>
                    <Button
                      variant={userStatus === "no" || userStatus === "declined" ? "default" : "outline"}
                      className={`${userStatus === "no" || userStatus === "declined" ? "bg-red-500 hover:bg-red-600 text-white" : ""} flex-1 sm:flex-none`}
                      onClick={() => handleRsvpChange("no")}
                      disabled={submittingRsvp}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Decline
                    </Button>
                  </div>
                )}

                {isCreator && (
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button
                      variant="default"
                      className="bg-[#0A5C36] hover:bg-[#084c2b] flex-1 sm:flex-none"
                      disabled={true}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Hosting
                    </Button>
                    <Button
                      variant="outline"
                      className="text-[#0A5C36] border-[#0A5C36] hover:bg-green-50 flex-1 sm:flex-none"
                      onClick={() => router.push(`/events/${event.id}/edit`)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Event
                    </Button>
                  </div>
                )}
                
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button 
                    variant="outline" 
                    className="flex-1 sm:flex-none text-[#0A5C36] border-[#0A5C36] hover:bg-green-50"
                    onClick={() => downloadEventCalendar(event)}
                  >
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    Add to Calendar
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center">
              <Avatar className="h-8 w-8 mr-2">
                <AvatarImage src={event.host?.avatar} alt={event.host?.name || "Host"} />
                <AvatarFallback>{(event.host?.name || "H").charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-gray-600">
                Hosted by <span className="font-medium">{event.host?.name || "Unknown Host"}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <Tabs defaultValue="details" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="details"
                className="data-[state=active]:bg-green-50 data-[state=active]:text-[#0A5C36] text-xs sm:text-sm px-1 sm:px-2"
              >
                Details
              </TabsTrigger>
              <TabsTrigger
                value="attendees"
                className="data-[state=active]:bg-green-50 data-[state=active]:text-[#0A5C36] text-xs sm:text-sm px-1 sm:px-2"
              >
                Attendees ({(event.attendees || []).filter(a => a.status === "going" || a.status === "yes").length})
              </TabsTrigger>
              {/* Discussion tab temporarily removed
              <TabsTrigger
                value="discussion"
                className="data-[state=active]:bg-green-50 data-[state=active]:text-[#0A5C36] text-xs sm:text-sm px-1 sm:px-2"
              >
                Discussion ({comments.length})
              </TabsTrigger>
              */}
            </TabsList>
          </Tabs>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
          {/* Details Tab */}
          {activeTab === "details" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">About this event</h2>
                <p className="text-gray-700 whitespace-pre-line">{event.description || "No description provided."}</p>
              </div>

              <Separator />

              {(event.dresscode || event.whatToBring || event.additionalInfo) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {event.dresscode && (
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                      <h3 className="font-medium text-gray-900 mb-2">Dress Code</h3>
                      <p className="text-gray-700 text-sm sm:text-base">{event.dresscode}</p>
                    </div>
                  )}

                  {event.whatToBring && (
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                      <h3 className="font-medium text-gray-900 mb-2">What to Bring</h3>
                      <p className="text-gray-700 text-sm sm:text-base">{event.whatToBring}</p>
                    </div>
                  )}

                  {event.additionalInfo && (
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg md:col-span-2">
                      <h3 className="font-medium text-gray-900 mb-2">Additional Information</h3>
                      <p className="text-gray-700 text-sm sm:text-base">{event.additionalInfo}</p>
                    </div>
                  )}
                </div>
              )}

              {/* {isPastEvent && (
                <div className="bg-green-50 p-3 sm:p-4 rounded-lg">
                  <div className="flex flex-col sm:flex-row items-start">
                    <ImageIcon className="h-5 w-5 text-[#0A5C36] mt-0.5 mr-3 mb-2 sm:mb-0" />
                    <div>
                      <h3 className="font-medium text-gray-900">Share your memories</h3>
                      <p className="text-sm text-gray-600 mb-3">
                        This event has passed. Share photos and videos from the event with other attendees.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button className="bg-[#0A5C36] hover:bg-[#084c2b] text-sm sm:text-base">
                          <ImageIcon className="mr-2 h-4 w-4" />
                          Add Photos
                        </Button>
                        <Button variant="outline" className="text-sm sm:text-base">
                          <Video className="mr-2 h-4 w-4" />
                          Add Videos
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )} */}
            </div>
          )}

          {/* Attendees Tab */}
          {activeTab === "attendees" && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  {(event.attendees || []).filter(a => a.status === "going" || a.status === "yes").length} people going
                </h2>
                {isCreator && (
                  <Button variant="outline" className="text-[#0A5C36] border-[#0A5C36] hover:bg-green-50 w-full sm:w-auto" onClick={() => router.push(`/events/${event.id}/edit`)}>
                    <Users className="mr-2 h-4 w-4" />
                    Invite More
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {(event.attendees || []).map((attendee, index) => (
                  <div
                    key={attendee.id || index}
                    className="flex items-center p-2 sm:p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                  >
                    <Avatar className="h-8 w-8 sm:h-10 sm:w-10 mr-2 sm:mr-3">
                      <AvatarImage src={attendee.avatar} alt={attendee.name} />
                      <AvatarFallback>{attendee.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-gray-900 text-sm sm:text-base">{attendee.name}</div>
                      <div className="text-xs text-gray-500 capitalize">
                        {attendee.status === "yes" ? "Going" : 
                         attendee.status === "going" ? "Going" : 
                         attendee.status === "no" ? "Declined" : 
                         attendee.status === "declined" ? "Declined" : 
                         attendee.status === "maybe" ? "Maybe" : 
                         attendee.status === "went" ? "Attended" : "Invited"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Discussion Tab */}
          {/* COMMENTING OUT DISCUSSION TAB FOR NOW
          {activeTab === "discussion" && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Discussion</h2>

              <form onSubmit={handleCommentSubmit} className="mb-6">
                <div className="flex gap-2 sm:gap-3">
                  <Avatar className="h-8 w-8 hidden sm:flex">
                    <AvatarImage src={currentUser?.photoURL || undefined} alt="Your avatar" />
                    <AvatarFallback>{currentUser?.displayName?.[0] || "Y"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 relative">
                    <textarea
                      className="w-full border rounded-lg p-2 sm:p-3 pr-12 resize-none focus:outline-none focus:ring-2 focus:ring-[#0A5C36] focus:border-transparent text-sm sm:text-base"
                      placeholder="Write a comment..."
                      rows={2}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      disabled={submittingComment}
                    ></textarea>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 bottom-2 text-[#0A5C36] hover:bg-green-50"
                      disabled={!commentText.trim() || submittingComment}
                    >
                      {submittingComment ? (
                        <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      ) : (
                        <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                          />
                        </svg>
                      )}
                    </Button>
                  </div>
                </div>
              </form>

              {comments.length > 0 ? (
                <div className="space-y-4">
                  {comments.map((comment, index) => (
                    <div key={comment.id || index} className="flex gap-2 sm:gap-3">
                      <Avatar className="h-6 w-6 sm:h-8 sm:w-8 mt-1">
                        <AvatarImage src={comment.user?.avatar} alt={comment.user?.name} />
                        <AvatarFallback>{comment.user?.name?.[0] || "U"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
                          <div className="font-medium text-gray-900 text-sm sm:text-base">{comment.user?.name}</div>
                          <p className="text-gray-700 text-sm sm:text-base break-words">{comment.text}</p>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {comment.timestamp ? formatTimestamp(comment.timestamp) : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 sm:py-8">
                  <MessageSquare className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No comments yet</h3>
                  <p className="text-gray-500">Be the first to start the discussion!</p>
                </div>
              )}
            </div>
          )}
          */}
        </div>
      </div>
    </div>
  )
} 