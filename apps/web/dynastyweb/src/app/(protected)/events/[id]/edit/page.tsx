"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { 
  X, 
  Plus, 
  Users, 
  User, 
  Info, 
  Tag, 
  Globe, 
  Lock, 
  ChevronRight, 
  Shirt, 
  Loader2, 
  ImagePlus,
  ArrowLeft,
  AlertTriangle
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DateSelector } from "@/components/date-selector"
import { DateRangePicker } from "@/components/date-range-picker"
import { LocationSearch } from "@/components/location-search"
import { getEventDetails, updateEvent, EventData } from "@/utils/eventUtils"
import { useAuth } from "@/context/AuthContext"
import { parseISO } from "date-fns"
import React from "react"
import { useToast } from "@/components/ui/use-toast"
import { uploadMedia, ensureAccessibleStorageUrl } from "@/utils/mediaUtils"
import Image from "next/image"

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = React.use(params) as { id: string }
  const eventId = unwrappedParams.id
  
  const router = useRouter()
  const { currentUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Event details state
  const [title, setTitle] = useState("")
  const [eventDate, setEventDate] = useState<{ day: number; month: number; year: number }>({
    day: new Date().getDate(),
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  })
  const [endDate, setEndDate] = useState<{ day: number; month: number; year: number } | null>(null)
  const [isMultiDay, setIsMultiDay] = useState(false)
  const [startTime, setStartTime] = useState("12:00")
  const [endTime, setEndTime] = useState("14:00")
  const [daySpecificTimes, setDaySpecificTimes] = useState<Record<string, { startTime: string, endTime: string }>>({})
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
  )
  const [location, setLocation] = useState("")
  const [selectedLocation, setSelectedLocation] = useState<{
    address: string
    lat: number
    lng: number
  } | null>(null)
  const [isVirtual, setIsVirtual] = useState(false)
  const [virtualLink, setVirtualLink] = useState("")

  // Additional details
  const [showDressCode, setShowDressCode] = useState(false)
  const [showWhatToBring, setShowWhatToBring] = useState(false)
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false)
  const [dresscode, setDresscode] = useState("")
  const [whatToBring, setWhatToBring] = useState("")
  const [description, setDescription] = useState("")

  // Privacy settings
  const [privacy, setPrivacy] = useState<"family" | "private">("private")
  const [allowGuestPlusOne, setAllowGuestPlusOne] = useState(false)
  const [showGuestList, setShowGuestList] = useState(true)

  // RSVP settings
  const [requireRsvp, setRequireRsvp] = useState(true)
  const [rsvpDeadline, setRsvpDeadline] = useState<{ day: number; month: number; year: number }>({
    day: new Date().getDate() + 7,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  })

  // Cover photos
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([])
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number[]>([])
  const [photoUploadErrors, setPhotoUploadErrors] = useState<(string | null)[]>([])
  const [existingPhotos, setExistingPhotos] = useState<string[]>([])
  const photoInputRef = useRef<HTMLInputElement>(null)

  const { toast } = useToast()

  // Load existing event data
  useEffect(() => {
    const loadEventData = async () => {
      try {
        setLoading(true)
        setError(null)

        const { event } = await getEventDetails(eventId)

        // Verify user is the event creator
        if (event.hostId !== currentUser?.uid) {
          router.push(`/events/${eventId}`)
          return
        }

        
        // Set form data from event
        setTitle(event.title)
        
        // Set dates
        const startDate = parseISO(event.eventDate)
        setEventDate({
          day: startDate.getDate(),
          month: startDate.getMonth() + 1,
          year: startDate.getFullYear()
        })

        if (event.endDate) {
          const endDateObj = parseISO(event.endDate)
          setEndDate({
            day: endDateObj.getDate(),
            month: endDateObj.getMonth() + 1,
            year: endDateObj.getFullYear()
          })
          setIsMultiDay(true)
        }

        // Set time details
        setStartTime(event.startTime || "12:00")
        setEndTime(event.endTime || "14:00")
        setTimezone(event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
        
        // Initialize day-specific times if available
        if (event.daySpecificTimes && Object.keys(event.daySpecificTimes).length > 0) {
          setDaySpecificTimes(event.daySpecificTimes);
          
          // Ensure we're in multi-day mode if there are day-specific times
          if (!isMultiDay && event.endDate) {
            setIsMultiDay(true);
          }
        }

        // Set location
        if (event.isVirtual) {
          setIsVirtual(true)
          if (event.virtualLink) setVirtualLink(event.virtualLink)
        } else if (event.location) {
          setSelectedLocation(event.location)
          setLocation(event.location.address)
        }

        // Set additional details
        if (event.dressCode) {
          setShowDressCode(true)
          setDresscode(event.dressCode)
        }
        if (event.whatToBring) {
          setShowWhatToBring(true)
          setWhatToBring(event.whatToBring)
        }
        if (event.description) {
          setShowAdditionalInfo(true)
          setDescription(event.description)
        }

        // Set privacy settings
        setPrivacy(event.privacy as "family" | "private")
        setAllowGuestPlusOne(event.allowGuestPlusOne)
        setShowGuestList(event.showGuestList)

        // Set RSVP settings
        setRequireRsvp(event.requireRsvp)
        if (event.rsvpDeadline) {
          const rsvpDate = parseISO(event.rsvpDeadline)
          setRsvpDeadline({
            day: rsvpDate.getDate(),
            month: rsvpDate.getMonth() + 1,
            year: rsvpDate.getFullYear()
          })
        }

        // Set existing photos if available
        if (event.coverPhotoUrls) {
          const accessibleUrls = event.coverPhotoUrls.map(url => ensureAccessibleStorageUrl(url));
          setExistingPhotos(accessibleUrls);
          setPhotoPreviewUrls(accessibleUrls);
        }

      } catch (error) {
        console.error("Error loading event:", error)
        setError("Failed to load event details. Please try again later.")
      } finally {
        setLoading(false)
      }
    }

    loadEventData()
  }, [eventId, currentUser?.uid, router, isMultiDay])

  // Handle location selection
  const handleLocationSelect = (location: { address: string; lat: number; lng: number }) => {
    setSelectedLocation(location)
    setLocation(location.address)
  }

  // Handle photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)
      
      if (photos.length + existingPhotos.length + newFiles.length > 5) {
        toast({
          variant: "destructive",
          title: "Upload limit reached",
          description: "You can only upload up to 5 photos"
        })
        return
      }
      
      setPhotos(prev => [...prev, ...newFiles])
      
      // Create preview URLs
      const newPreviewUrls = newFiles.map(file => URL.createObjectURL(file))
      setPhotoPreviewUrls(prev => [...prev, ...newPreviewUrls])
      
      // Initialize progress and errors arrays for new photos
      setPhotoUploadProgress(prev => [...prev, ...newFiles.map(() => 0)])
      setPhotoUploadErrors(prev => [...prev, ...newFiles.map(() => null)])
    }
  }

  // Remove photo
  const removePhoto = (index: number) => {
    // If it's an existing photo
    if (index < existingPhotos.length) {
      setExistingPhotos(prev => prev.filter((_, i) => i !== index))
      setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index))
    } else {
      // If it's a new photo
      const adjustedIndex = index - existingPhotos.length
      setPhotos(prev => prev.filter((_, i) => i !== adjustedIndex))
      URL.revokeObjectURL(photoPreviewUrls[index])
      
      // Update progress and errors arrays
      const newProgress = [...photoUploadProgress]
      const newErrors = [...photoUploadErrors]
      newProgress.splice(adjustedIndex, 1)
      newErrors.splice(adjustedIndex, 1)
      setPhotoUploadProgress(newProgress)
      setPhotoUploadErrors(newErrors)
      
      setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index))
    }
  }

  // Handle timezone change specifically
  const handleTimezoneChange = (newTimezone: string) => {
    setTimezone(newTimezone)
    // Update timezone value for submission
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    try {
      if (!title.trim()) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Event title is required"
        })
        setSaving(false)
        return
      }
      
      if (eventDate.day === 0 || eventDate.month === 0 || eventDate.year === 0) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Please select a valid date for your event"
        })
        setSaving(false)
        return
      }

      // Upload new photos using the standardized uploadMedia function
      const photoUploadPromises = photos.map(async (file, index) => {
        try {
          return await uploadMedia(
            file, 
            eventId, // Use actual event ID for uploads
            'image',
            {
              onProgress: (progress) => {
                setPhotoUploadProgress(prev => {
                  const newProgress = [...prev]
                  newProgress[index] = progress
                  return newProgress
                })
              },
              onError: (error) => {
                setPhotoUploadErrors(prev => {
                  const newErrors = [...prev]
                  newErrors[index] = error.message
                  return newErrors
                })
                console.error(`Error uploading photo ${index}:`, error)
              }
            }
          )
        } catch (error) {
          console.error(`Failed to upload photo ${index}:`, error)
          throw error
        }
      })

      // Wait for all photos to upload and get their URLs
      const newPhotoUrls = await Promise.all(photoUploadPromises)
      
      // Combine existing and new photo URLs
      const allPhotos = [...existingPhotos, ...newPhotoUrls]

      // Format dates for API
      const formattedStartDate = `${eventDate.year}-${String(eventDate.month).padStart(2, '0')}-${String(eventDate.day).padStart(2, '0')}`
      
      // Format end date if multi-day
      let formattedEndDate = null
      if (isMultiDay && endDate) {
        formattedEndDate = `${endDate.year}-${String(endDate.month).padStart(2, '0')}-${String(endDate.day).padStart(2, '0')}`
      }
      
      // Format RSVP deadline if required
      let formattedRsvpDeadline = null
      if (requireRsvp && rsvpDeadline) {
        formattedRsvpDeadline = `${rsvpDeadline.year}-${String(rsvpDeadline.month).padStart(2, '0')}-${String(rsvpDeadline.day).padStart(2, '0')}`
      }

      // Ensure timezone is correctly set
      const eventTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

      // Prepare event data before submission
      
      // Ensure we're properly handling day-specific times for multi-day events
      const eventData: Partial<EventData> = {
        title,
        eventDate: formattedStartDate,
        endDate: formattedEndDate || undefined,
        startTime,
        endTime,
        timezone: eventTimezone,
        daySpecificTimes: !isMultiDay ? undefined : daySpecificTimes,
        location: isVirtual ? null : selectedLocation,
        virtualLink: isVirtual ? virtualLink : null,
        isVirtual,
        description,
        dressCode: showDressCode ? dresscode : null,
        whatToBring: showWhatToBring ? whatToBring : null,
        additionalInfo: showAdditionalInfo ? description : null,
        privacy,
        allowGuestPlusOne,
        showGuestList,
        requireRsvp,
        rsvpDeadline: formattedRsvpDeadline,
        coverPhotoUrls: allPhotos,
      }

      // Update the event
      const result = await updateEvent(eventId, eventData);
      
      toast({
        title: "Success",
        description: "Event updated successfully!"
      })
      
      // Force a complete page reload to ensure we get the latest data
      window.location.href = `/events/${eventId}`
    } catch (error) {
      console.error("Error updating event:", error)
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: `Failed to update event: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    } finally {
      setSaving(false)
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
          <Button onClick={() => router.push("/events")}>Back to Events</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 bg-gray-50 min-h-screen flex flex-col">
      {/* Navigation Header */}
      <div className="max-w-4xl mx-auto w-full my-2">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="text-[#0A5C36] hover:text-[#084c2b] hover:bg-green-50"
            onClick={() => router.push("/events")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Events
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-6 mt-2 mb-8 w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 pb-4 border-b">Edit Event</h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Event Basics Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center">
              <Info className="mr-2 h-5 w-5 text-[#0A5C36]" />
              Event Details
            </h2>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium text-gray-700">
                Event Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter event title"
                required
                className="border-gray-300 focus:border-[#0A5C36] focus:ring-[#0A5C36]"
              />
            </div>

            {/* Date and Time */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium text-gray-700">
                  Date and Time <span className="text-red-500">*</span>
                </Label>
              </div>

              <DateRangePicker 
                startDate={eventDate}
                endDate={endDate}
                startTime={startTime}
                endTime={endTime}
                timezone={timezone}
                isMultiDay={isMultiDay}
                onStartDateChange={setEventDate}
                onEndDateChange={(date) => setEndDate(date)}
                onStartTimeChange={setStartTime}
                onEndTimeChange={setEndTime}
                onTimezoneChange={handleTimezoneChange}
                onMultiDayChange={setIsMultiDay}
                onDaySpecificTimesChange={setDaySpecificTimes}
                initialDaySpecificTimes={daySpecificTimes}
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="location" className="text-sm font-medium text-gray-700">
                  Location
                </Label>
                <div className="flex items-center space-x-2">
                  <Switch id="isVirtual" checked={isVirtual} onCheckedChange={setIsVirtual} />
                  <Label htmlFor="isVirtual" className="text-sm text-gray-600">
                    Virtual Event
                  </Label>
                </div>
              </div>

              {isVirtual ? (
                <Input
                  id="virtualLink"
                  value={virtualLink}
                  onChange={(e) => setVirtualLink(e.target.value)}
                  placeholder="Enter meeting link (Zoom, Google Meet, etc.)"
                  className="border-gray-300 focus:border-[#0A5C36] focus:ring-[#0A5C36]"
                />
              ) : (
                <div className="space-y-2">
                  <LocationSearch
                    value={location}
                    onChange={setLocation}
                    onLocationSelect={handleLocationSelect}
                  />
                  {selectedLocation && (
                    <div className="mt-2 text-xs text-gray-500 italic">
                      Coordinates: {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Cover Photos Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center">
              <ImagePlus className="mr-2 h-5 w-5 text-[#0A5C36]" />
              Cover Photos
            </h2>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="grid grid-cols-5 gap-2 mt-4">
                {photoPreviewUrls.map((url, index) => (
                  <div key={index} className="relative rounded-md overflow-hidden h-24 bg-gray-100">
                    <Image 
                      src={url} 
                      width={100}
                      height={100}
                      alt={`Preview ${index + 1}`} 
                      className="w-full h-full object-cover" 
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    
                    {/* Show upload progress for new photos */}
                    {index >= existingPhotos.length && 
                     photoUploadProgress[index - existingPhotos.length] > 0 && 
                     photoUploadProgress[index - existingPhotos.length] < 100 && (
                      <div className="absolute bottom-0 left-0 w-full bg-gray-200 h-1">
                        <div 
                          className="bg-[#0A5C36] h-1 transition-all duration-300"
                          style={{ width: `${photoUploadProgress[index - existingPhotos.length]}%` }}
                        ></div>
                      </div>
                    )}
                    
                    {/* Show error if upload failed */}
                    {index >= existingPhotos.length && 
                     photoUploadErrors[index - existingPhotos.length] && (
                      <div className="absolute inset-0 bg-red-500 bg-opacity-60 flex items-center justify-center">
                        <AlertTriangle className="text-white h-8 w-8" />
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Photo upload button */}
                {photoPreviewUrls.length < 5 && (
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="flex items-center justify-center border-2 border-dashed border-gray-300 rounded-md h-24 hover:border-gray-400 transition"
                  >
                    <ImagePlus className="h-6 w-6 text-gray-400" />
                  </button>
                )}
              </div>

              <input
                type="file"
                ref={photoInputRef}
                className="hidden"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
              />
            </div>
          </div>

          {/* Additional Details */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800">Additional Details</h2>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-dashed border-gray-300 text-gray-600 hover:text-[#0A5C36] hover:border-[#0A5C36]"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Enhance Your Event
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {!showDressCode && (
                    <DropdownMenuItem onClick={() => setShowDressCode(true)}>
                      <Shirt className="mr-2 h-4 w-4 text-[#0A5C36]" />
                      <span>Dress Code</span>
                    </DropdownMenuItem>
                  )}
                  {!showWhatToBring && (
                    <DropdownMenuItem onClick={() => setShowWhatToBring(true)}>
                      <Tag className="mr-2 h-4 w-4 text-[#0A5C36]" />
                      <span>Items to Bring</span>
                    </DropdownMenuItem>
                  )}
                  {!showAdditionalInfo && (
                    <DropdownMenuItem onClick={() => setShowAdditionalInfo(true)}>
                      <Info className="mr-2 h-4 w-4 text-[#0A5C36]" />
                      <span>Event Description</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-4">
              {showDressCode && (
                <div className="space-y-2 relative p-4 bg-gray-50 rounded-lg">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowDressCode(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Label htmlFor="dresscode" className="text-sm font-medium text-gray-700">
                    Dress Code
                  </Label>
                  <Input
                    id="dresscode"
                    value={dresscode}
                    onChange={(e) => setDresscode(e.target.value)}
                    placeholder="e.g., Formal, Casual, etc."
                    className="border-gray-300 focus:border-[#0A5C36] focus:ring-[#0A5C36]"
                  />
                </div>
              )}

              {showWhatToBring && (
                <div className="space-y-2 relative p-4 bg-gray-50 rounded-lg">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowWhatToBring(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Label htmlFor="whatToBring" className="text-sm font-medium text-gray-700">
                    What to Bring
                  </Label>
                  <Input
                    id="whatToBring"
                    value={whatToBring}
                    onChange={(e) => setWhatToBring(e.target.value)}
                    placeholder="e.g., Swimwear, Gift, etc."
                    className="border-gray-300 focus:border-[#0A5C36] focus:ring-[#0A5C36]"
                  />
                </div>
              )}

              {showAdditionalInfo && (
                <div className="space-y-2 relative p-4 bg-gray-50 rounded-lg">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowAdditionalInfo(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Label htmlFor="additionalInfo" className="text-sm font-medium text-gray-700">
                    Event Description
                  </Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Any other details guests should know..."
                    className="min-h-[100px] border-gray-300 focus:border-[#0A5C36] focus:ring-[#0A5C36]"
                  />
                </div>
              )}

              {!showDressCode && !showWhatToBring && !showAdditionalInfo && (
                <div className="text-center py-6 text-gray-500 text-sm italic">
                  No additional details added yet. Click the button above to add more information.
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Privacy and RSVP Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                <Lock className="mr-2 h-5 w-5 text-[#0A5C36]" />
                Privacy Settings
              </h2>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="privacy" className="text-sm font-medium text-gray-700">
                      Who can see this event?
                    </Label>
                  </div>
                  <Select value={privacy} onValueChange={(value: "family" | "private") => setPrivacy(value)}>
                    <SelectTrigger className="w-[180px] border-gray-300">
                      <SelectValue placeholder="Select privacy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">
                        <div className="flex items-center">
                          <User className="h-4 w-4 mr-2 text-[#0A5C36]" />
                          <span>Invitees Only</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="family">
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-2 text-[#0A5C36]" />
                          <span>All Family</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="allowGuestPlusOne" className="text-sm font-medium text-gray-700">
                      Allow guests to bring others
                    </Label>
                    <p className="text-xs text-gray-500">Guests can bring a plus one to the event</p>
                  </div>
                  <Switch id="allowGuestPlusOne" checked={allowGuestPlusOne} onCheckedChange={setAllowGuestPlusOne} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="showGuestList" className="text-sm font-medium text-gray-700">
                      Show guest list
                    </Label>
                    <p className="text-xs text-gray-500">Let guests see who else is invited</p>
                  </div>
                  <Switch id="showGuestList" checked={showGuestList} onCheckedChange={setShowGuestList} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                <Globe className="mr-2 h-5 w-5 text-[#0A5C36]" />
                RSVP Settings
              </h2>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="requireRsvp" className="text-sm font-medium text-gray-700">
                      Require RSVP
                    </Label>
                    <p className="text-xs text-gray-500">Ask guests to confirm attendance</p>
                  </div>
                  <Switch id="requireRsvp" checked={requireRsvp} onCheckedChange={setRequireRsvp} />
                </div>

                {requireRsvp && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">RSVP Deadline</Label>
                    <DateSelector value={rsvpDeadline} onChange={setRsvpDeadline} />
                  </div>
                )}
              </div>
            </div>
          </div>

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-4 mt-8 border-t pt-6">
            <Button
              variant="outline"
              type="button"
              onClick={() => router.push(`/events/${eventId}`)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={saving}
              onClick={() => {
                // Trigger form submission
              }}
              className="bg-[#0A5C36] hover:bg-[#0A5C36]/90 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  Save Changes
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}