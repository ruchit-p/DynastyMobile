"use client"

import { useState } from "react"
import Image from "next/image"
import { format, isPast, parseISO } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Calendar, Clock, MapPin, Check, X, HelpCircle, MoreHorizontal, Edit, Share2, Trash2, Eye, Loader2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { ensureAccessibleStorageUrl } from "@/utils/mediaUtils"
import { deleteEvent as deleteEventUtil } from "@/utils/eventUtils"
import { useCSRFClient } from "@/context/CSRFContext"

// Event categories
export const EVENT_CATEGORIES = [
  { id: "all", name: "All Events" },
  { id: "birthday", name: "Birthday" },
  { id: "anniversary", name: "Anniversary" },
  { id: "reunion", name: "Family Reunion" },
  { id: "holiday", name: "Holiday" },
  { id: "graduation", name: "Graduation" },
  { id: "wedding", name: "Wedding" },
  { id: "memorial", name: "Memorial" },
  { id: "other", name: "Other" },
]

// RSVP status colors
export const STATUS_COLORS = {
  going: "bg-green-100 text-green-800 border-green-200",
  maybe: "bg-yellow-100 text-yellow-800 border-yellow-200",
  pending: "bg-blue-100 text-blue-800 border-blue-200",
  invited: "bg-blue-100 text-blue-800 border-blue-200",
  no: "bg-red-100 text-red-800 border-red-200",
  declined: "bg-red-100 text-red-800 border-red-200",
  went: "bg-gray-100 text-gray-800 border-gray-200",
  yes: "bg-green-100 text-green-800 border-green-200",
  hosting: "bg-purple-100 text-purple-800 border-purple-200"
}

// Category colors
export const CATEGORY_COLORS = {
  birthday: "bg-blue-100 text-blue-800",
  anniversary: "bg-purple-100 text-purple-800",
  reunion: "bg-green-100 text-green-800",
  holiday: "bg-red-100 text-red-800",
  graduation: "bg-yellow-100 text-yellow-800",
  wedding: "bg-pink-100 text-pink-800",
  memorial: "bg-gray-100 text-gray-800",
  other: "bg-slate-100 text-slate-800",
}

export interface EventHost {
  id: string;
  name: string;
  avatar?: string;
}

export interface EventAttendee {
  id: string;
  name: string;
  avatar?: string;
  status: 'going' | 'maybe' | 'no' | 'pending' | 'yes' | 'went' | 'declined' | 'invited';
}

export interface EventCardProps {
  id: string;
  title: string;
  category?: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  daySpecificTimes?: {
    [date: string]: {
      startTime: string;
      endTime: string;
    };
  } | null;
  hasVaryingTimes?: boolean;
  location?: string;
  isVirtual: boolean;
  virtualLink?: string;
  coverImage?: string;
  description?: string;
  host: EventHost;
  attendees: EventAttendee[];
  userStatus: 'going' | 'maybe' | 'no' | 'pending' | 'yes' | 'went' | 'declined' | 'invited';
  isCreator: boolean;
  onRsvpChange?: (eventId: string, status: 'yes' | 'maybe' | 'no' | 'declined') => void;
  onDelete?: (eventId: string) => void;
  hideActions?: boolean;
  showDescription?: boolean;
}

export function EventCard({ 
  id, 
  title, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  category = 'other', 
  date, 
  endDate, 
  startTime,
  endTime,
  timezone,
  hasVaryingTimes,
  location, 
  isVirtual, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  virtualLink, 
  coverImage, 
  description,
  host, 
  attendees, 
  userStatus, 
  isCreator,
  onRsvpChange,
  onDelete,
  hideActions = false,
  showDescription = false
}: EventCardProps) {
  const router = useRouter()
  const { csrfClient } = useCSRFClient()
  const isPastEvent = isPast(parseISO(date))
  const [isDeleting, setIsDeleting] = useState(false)
  
  const handleRsvpChange = async (status: 'yes' | 'maybe' | 'no') => {
    if (onRsvpChange) {
      onRsvpChange(id, status)
    } else {
      try {
        await csrfClient.callFunction('updateEventRsvp', { eventId: id, status })
        // You could update local state here or trigger a refresh
        router.refresh()
      } catch (error) {
        console.error("Error updating RSVP:", error)
      }
    }
  }
  
  const handleDeleteEvent = async () => {
    if (onDelete) {
      onDelete(id)
    } else {
      try {
        setIsDeleting(true)
        await deleteEventUtil(id)
        router.refresh()
      } catch (error) {
        console.error("Error deleting event:", error)
        setIsDeleting(false)
      }
    }
  }

  // Get readable status label
  const getStatusLabel = (status: string) => {
    // If user is the creator, show "Hosting" regardless of status
    if (isCreator) return 'Hosting';
    
    switch (status) {
      case 'going': return 'Going'
      case 'yes': return 'Going'
      case 'maybe': return 'Maybe'
      case 'no': return 'Declined'
      case 'declined': return 'Declined'
      case 'went': return 'Attended'
      case 'pending': return 'Invited'
      case 'invited': return 'Invited'
      default: return status
    }
  }

  // Date formatting functions
  const formatDate = (dateString: string) => {
    return format(parseISO(dateString), "EEEE, MMMM d, yyyy")
  }

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

  // Format the time display string based on whether times vary
  const getTimeDisplay = () => {
    if (hasVaryingTimes) {
      return "Varying times (see details)";
    } else if (startTime) {
      let timeStr = formatTime(startTime);
      if (endTime) {
        timeStr += ` - ${formatTime(endTime)}`;
      }
      if (timezone) {
        timeStr += ` (${formatTimezone(timezone)})`;
      }
      return timeStr;
    }
    return "";
  }

  // Check if event spans multiple days by comparing the formatted date strings
  const isMultiDay = endDate && formatDate(date) !== formatDate(endDate);

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div 
        className="cursor-pointer" 
        onClick={() => router.push(`/events/${id}`)}
      >
        {coverImage && (
          <div className="relative h-48">
            <Image 
              src={ensureAccessibleStorageUrl(coverImage)} 
              alt={title} 
              fill 
              className="object-cover" 
            />
            {isCreator && !hideActions && (
              <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-black/50 text-white hover:bg-black/70 rounded-full"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push(`/events/${id}/edit`)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        navigator.clipboard.writeText(`${window.location.origin}/events/${id}`);
                        // You could add a toast notification here
                      }}
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => handleDeleteEvent()}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        )}

        <CardContent className="p-4">
          {/* Event title and category */}
          <div className="mb-3">
            <h3 className="font-semibold text-lg text-gray-900 mb-1">{title}</h3>
            
            {/* Date and Time Display */}
            <div className="flex items-center text-sm text-gray-500 mb-1">
              <Calendar className="h-4 w-4 mr-1 flex-shrink-0" />
              {isMultiDay ? (
                <span>From {formatDate(date)} to {formatDate(endDate)}</span>
              ) : (
                <span>{formatDate(date)}</span>
              )}
            </div>
            
            {(startTime || endTime || hasVaryingTimes) && (
              <div className="flex items-center text-sm text-gray-500 mb-1">
                <Clock className="h-4 w-4 mr-1 flex-shrink-0" />
                {getTimeDisplay()}
              </div>
            )}
            
            {/* Location display */}
            {isVirtual ? (
              <div className="flex items-center text-sm text-gray-500">
                <svg
                  className="h-4 w-4 mr-1 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span>Virtual Event</span>
              </div>
            ) : location ? (
              <div className="flex items-start text-sm text-gray-500">
                <MapPin className="h-4 w-4 mr-1 flex-shrink-0 mt-0.5" />
                <span className="line-clamp-1">{location}</span>
              </div>
            ) : null}
          </div>
          
          {/* Optional description */}
          {showDescription && description && (
            <div className="mb-3">
              <p className="text-sm text-gray-600 line-clamp-3">{description}</p>
            </div>
          )}

          {/* Host and attendees */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center">
              <Avatar className="h-6 w-6 mr-2">
                <AvatarImage src={host.avatar} alt={host.name} />
                <AvatarFallback>{host.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="text-xs text-gray-500">
                Hosted by <span className="font-medium">{host.name}</span>
              </span>
            </div>
            {attendees.length > 0 && (
              <div className="flex -space-x-2">
                {attendees.slice(0, 3).map((attendee, index) => (
                  <Avatar key={index} className="h-6 w-6 border-2 border-white">
                    <AvatarImage src={attendee.avatar} alt={attendee.name} />
                    <AvatarFallback>{attendee.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                ))}
                {attendees.length > 3 && (
                  <div className="h-6 w-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-xs text-gray-600">
                    +{attendees.length - 3}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </div>

      {/* RSVP Status and Actions - Separate from clickable area */}
      <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mt-1">
          <div>
            <Badge variant="outline" className={isCreator ? STATUS_COLORS.hosting : STATUS_COLORS[userStatus]}>
              {getStatusLabel(userStatus)}
            </Badge>
          </div>
          
          {!hideActions && (
            <div className="flex space-x-1 items-center">
              {!isPastEvent && !isCreator && (
                <div className="flex space-x-1 mr-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`rounded-full p-0 w-8 h-8 ${
                      userStatus === "going" || userStatus === "yes" ? "bg-green-100 text-green-700" : ""
                    }`}
                    onClick={() => handleRsvpChange("yes")}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`rounded-full p-0 w-8 h-8 ${
                      userStatus === "maybe" ? "bg-yellow-100 text-yellow-700" : ""
                    }`}
                    onClick={() => handleRsvpChange("maybe")}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`rounded-full p-0 w-8 h-8 ${
                      userStatus === "no" || userStatus === "declined" ? "bg-red-100 text-red-700" : ""
                    }`}
                    onClick={() => handleRsvpChange("no")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              
              <Button
                variant="outline"
                size="sm"
                className="text-[#0A5C36] border-[#0A5C36] hover:bg-green-50"
                onClick={() => router.push(`/events/${id}`)}
              >
                <Eye className="mr-1 h-4 w-4" />
                View Details
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}