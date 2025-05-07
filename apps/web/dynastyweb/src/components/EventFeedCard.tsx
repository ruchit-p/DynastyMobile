"use client"

import { useState } from "react"
import Image from "next/image"
import { format, isPast, parseISO } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Calendar, Clock, MapPin, Check, X, HelpCircle, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { EventCardProps, STATUS_COLORS } from "./EventCard"
import { updateEventRsvp } from "@/utils/eventUtils"
import { ensureAccessibleStorageUrl } from "@/utils/mediaUtils"

export function EventFeedCard({
  id,
  title,
  date,
  endDate,
  startTime,
  endTime,
  timezone,
  hasVaryingTimes,
  location,
  isVirtual,
  coverImage,
  host,
  attendees,
  userStatus,
  isCreator,
}: Omit<EventCardProps, 'virtualLink' | 'description' | 'onRsvpChange' | 'onDelete' | 'hideActions' | 'showDescription' | 'category'>) {
  const router = useRouter()
  const isPastEvent = isPast(parseISO(date))
  const [currentStatus, setCurrentStatus] = useState(userStatus)
  const [submittingRsvp, setSubmittingRsvp] = useState(false)

  // Handle RSVP status change
  const handleRsvpChange = async (status: 'yes' | 'maybe' | 'no') => {
    try {
      setSubmittingRsvp(true)
      await updateEventRsvp(id, status)
      setCurrentStatus(status === 'yes' ? 'going' : status)
    } catch (error) {
      console.error("Error updating RSVP:", error)
    } finally {
      setSubmittingRsvp(false)
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

  // Format the time display string based on whether times vary
  const getTimeDisplay = () => {
    if (hasVaryingTimes) {
      return "Varying times";
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

  // Check if event spans multiple days by comparing the formatted date strings
  const isMultiDay = endDate && formatDate(date) !== formatDate(endDate);

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow mb-4 relative">
      <div 
        className="cursor-pointer"
        onClick={() => router.push(`/events/${id}`)}
      >
        {coverImage && (
          <div className="relative h-40">
            <Image
              src={ensureAccessibleStorageUrl(coverImage)}
              alt={title}
              fill
              className="object-cover"
            />
          </div>
        )}

        <CardContent className="p-4">
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

          <div className="flex items-center justify-between mb-3">
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

        {/* RSVP Status and Actions - Move out of the clickable part */}
        <div className="mt-4 p-4 pt-0 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
          <div>
            <Badge
              variant="outline"
              className={`${isCreator 
                ? STATUS_COLORS.hosting 
                : (STATUS_COLORS[currentStatus as keyof typeof STATUS_COLORS] || STATUS_COLORS.invited)}`}
            >
              {getStatusLabel(currentStatus)}
            </Badge>
          </div>

          {/* Add a View Details button */}
          <div className="flex items-center space-x-2">
            {!isPastEvent && !isCreator && (
              <div className="flex space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`rounded-full p-0 w-8 h-8 ${
                    currentStatus === "going" || currentStatus === "yes" ? "bg-green-100 text-green-700" : ""
                  }`}
                  onClick={() => handleRsvpChange("yes")}
                  disabled={submittingRsvp}
                >
                  {submittingRsvp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`rounded-full p-0 w-8 h-8 ${
                    currentStatus === "maybe" ? "bg-yellow-100 text-yellow-700" : ""
                  }`}
                  onClick={() => handleRsvpChange("maybe")}
                  disabled={submittingRsvp}
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`rounded-full p-0 w-8 h-8 ${
                    currentStatus === "no" || currentStatus === "declined" ? "bg-red-100 text-red-700" : ""
                  }`}
                  onClick={() => handleRsvpChange("no")}
                  disabled={submittingRsvp}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/events/${id}`)}
              className="text-[#0A5C36] border-[#0A5C36] hover:bg-green-50"
            >
              View Details
            </Button>
          </div>
        </div>
    </Card>
  )
} 