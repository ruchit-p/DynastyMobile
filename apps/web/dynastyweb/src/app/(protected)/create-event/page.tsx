"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { X, Plus, Users, User, Info, Tag, Globe, Lock, ChevronRight, Search, Shirt, Loader2, AlertTriangle, ImagePlus} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DateSelector } from "@/components/date-selector"
import { DateRangePicker, SimpleDate } from "@/components/date-range-picker"
import { LocationSearch } from "@/components/location-search"
import { useAuth } from "@/context/AuthContext"
import { useToast } from "@/components/ui/use-toast"
import { uploadMedia } from "@/utils/mediaUtils"
import { useCSRFClient } from "@/context/CSRFContext"
import { getFamilyManagementData } from "@/utils/functionUtils"

export default function CreateEventPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { currentUser } = useAuth()
  const { toast } = useToast()
  const { csrfClient } = useCSRFClient()
  
  // Use refs for tracking state that shouldn't trigger re-renders
  const formStateTracker = useRef({
    lastTimezoneUpdate: Date.now(),
    isUpdatingDates: false,
    pendingMultiDayUpdate: false
  });

  // Family members state
  const [familyMembers, setFamilyMembers] = useState<Array<{
    id: string;
    displayName: string;
    profilePicture: string | null;
  }>>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [membersError, setMembersError] = useState<string | null>(null)

  // Event details
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
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Invite settings
  const [inviteType, setInviteType] = useState<"all" | "select">("all")
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  // Memoize handlers with improved state management
  const handleStartDateChange = useCallback((date: SimpleDate) => {
    if (date.day === 0 && date.month === 0 && date.year === 0) {
      // Date was cleared, reset all date-related fields
      setEventDate({ day: 0, month: 0, year: 0 });
      setEndDate(null);
      setIsMultiDay(false);
      return;
    }
    
    setEventDate(date);
  }, []);

  const handleEndDateChange = useCallback((date: SimpleDate) => {
    if (date.day === 0 && date.month === 0 && date.year === 0) {
      // End date was cleared
      setEndDate(null);
      
      // If end date is cleared but we have a start date, we're back to single day
      if (eventDate.day !== 0) {
        setIsMultiDay(false);
      }
      return;
    }
    
    setEndDate(date);
  }, [eventDate]);

  const handleStartTimeChange = useCallback((time: string) => {
    setStartTime(time);
  }, []);

  const handleEndTimeChange = useCallback((time: string) => {
    setEndTime(time);
  }, []);

  const handleTimezoneChange = useCallback((tz: string) => {
    // Debounce timezone changes
    const now = Date.now();
    if (now - formStateTracker.current.lastTimezoneUpdate < 100) {
      return;
    }
    formStateTracker.current.lastTimezoneUpdate = now;
    setTimezone(tz);
  }, []);

  const handleMultiDayChange = useCallback((isMulti: boolean) => {
    // Prevent repeated toggles and only update if different
    if (formStateTracker.current.isUpdatingDates) {
      formStateTracker.current.pendingMultiDayUpdate = true;
      return;
    }
    
    if (isMulti !== isMultiDay) {
      setIsMultiDay(isMulti);
      
      // If switching to single-day, clear end date
      if (!isMulti && endDate) {
        setEndDate(null);
      }
    }
  }, [isMultiDay, endDate]);

  // Reset pending updates after date updates are complete
  useEffect(() => {
    if (formStateTracker.current.pendingMultiDayUpdate) {
      formStateTracker.current.pendingMultiDayUpdate = false;
      // Any additional cleanup if needed
    }
  }, [eventDate, endDate]);

  // Memoize the DateRangePicker component to prevent unnecessary re-renders
  const memoizedDateRangePicker = useMemo(() => (
    <DateRangePicker 
      startDate={eventDate}
      endDate={endDate}
      startTime={startTime}
      endTime={endTime}
      timezone={timezone}
      isMultiDay={isMultiDay}
      onStartDateChange={handleStartDateChange}
      onEndDateChange={handleEndDateChange}
      onStartTimeChange={handleStartTimeChange}
      onEndTimeChange={handleEndTimeChange}
      onTimezoneChange={handleTimezoneChange}
      onMultiDayChange={handleMultiDayChange}
    />
  ), [
    eventDate, 
    endDate, 
    startTime, 
    endTime, 
    timezone, 
    isMultiDay, 
    handleStartDateChange, 
    handleEndDateChange, 
    handleStartTimeChange, 
    handleEndTimeChange, 
    handleTimezoneChange, 
    handleMultiDayChange
  ]);

  // Fetch family members from Firebase
  useEffect(() => {
    const fetchFamilyMembers = async () => {
      try {
        setLoadingMembers(true)
        setMembersError(null)
        
        const result = await csrfClient.callFunction('getFamilyManagementData', {})
        
        // Validate and transform the data
        const data = result.data as { members?: Array<{id: string, displayName: string, profilePicture?: string}> }
        if (data && Array.isArray(data.members)) {
          // Filter out the current user from the family members list
          const filteredMembers = data.members
            .filter(member => member.id !== currentUser?.uid)
            .map(member => ({
              id: member.id || '',
              displayName: member.displayName || 'Unnamed Family Member',
              profilePicture: member.profilePicture || null
            }));
          
          setFamilyMembers(filteredMembers)
        } else {
          console.error('Invalid family members data structure:', data)
          setMembersError('Received invalid data format from server.')
        }
      } catch (error) {
        console.error('Error fetching family members:', error)
        setMembersError('Failed to load family members. Please try again later.')
      } finally {
        setLoadingMembers(false)
      }
    }
    
    fetchFamilyMembers()
  }, [currentUser?.uid, csrfClient])

  // Handle photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Limit to 5 photos total
    const newFiles = files.slice(0, 5 - photos.length)
    if (newFiles.length === 0) return

    setPhotos([...photos, ...newFiles])

    // Create preview URLs
    const newPreviewUrls = newFiles.map((file) => URL.createObjectURL(file))
    setPhotoPreviewUrls([...photoPreviewUrls, ...newPreviewUrls])
    
    // Initialize progress and errors arrays for new photos
    setPhotoUploadProgress(prev => [...prev, ...newFiles.map(() => 0)])
    setPhotoUploadErrors(prev => [...prev, ...newFiles.map(() => null)])
  }

  // Remove a photo
  const removePhoto = (index: number) => {
    const newPhotos = [...photos]
    const newPreviewUrls = [...photoPreviewUrls]
    const newProgress = [...photoUploadProgress]
    const newErrors = [...photoUploadErrors]

    // Revoke the object URL to avoid memory leaks
    URL.revokeObjectURL(newPreviewUrls[index])

    newPhotos.splice(index, 1)
    newPreviewUrls.splice(index, 1)
    newProgress.splice(index, 1)
    newErrors.splice(index, 1)

    setPhotos(newPhotos)
    setPhotoPreviewUrls(newPreviewUrls)
    setPhotoUploadProgress(newProgress)
    setPhotoUploadErrors(newErrors)
  }

  // Toggle member selection
  const toggleMemberSelection = (memberId: string) => {
    if (selectedMembers.includes(memberId)) {
      setSelectedMembers(selectedMembers.filter((id) => id !== memberId))
    } else {
      setSelectedMembers([...selectedMembers, memberId])
    }
  }

  // Filter family members based on search query
  const filteredMembers = familyMembers.filter(
    (member) => member.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Handle location selection
  const handleLocationSelect = (location: { address: string; lat: number; lng: number }) => {
    setSelectedLocation(location)
    setLocation(location.address)
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Event title is required"
      })
      return
    }

    // Check if a valid date has been selected
    if (eventDate.day === 0 || eventDate.month === 0 || eventDate.year === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select a valid date for your event"
      })
      return
    }

    try {
      setLoading(true)

      // Generate a temporary ID for the event (will be replaced by actual ID after creation)
      const tempEventId = `temp_event_${Date.now()}_${Math.random().toString(36).substring(2)}`
      
      // Upload photos using the standardized uploadMedia function instead of base64 conversion
      const photoUploadPromises = photos.map(async (file, index) => {
        try {
          return await uploadMedia(
            file, 
            tempEventId, 
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
      const photoUrls = await Promise.all(photoUploadPromises)
      console.log(`Successfully uploaded ${photoUrls.length} photos for event`)

      // Format dates for API
      const formattedStartDate = `${eventDate.year}-${String(eventDate.month).padStart(2, '0')}-${String(eventDate.day).padStart(2, '0')}`;
      
      // Format end date if multi-day
      let formattedEndDate = null;
      if (isMultiDay && endDate) {
        formattedEndDate = `${endDate.year}-${String(endDate.month).padStart(2, '0')}-${String(endDate.day).padStart(2, '0')}`;
      }
      
      // Format RSVP deadline if required
      let formattedRsvpDeadline = null;
      if (requireRsvp && rsvpDeadline) {
        formattedRsvpDeadline = `${rsvpDeadline.year}-${String(rsvpDeadline.month).padStart(2, '0')}-${String(rsvpDeadline.day).padStart(2, '0')}`;
      }

      // Gather event data
      const eventData = {
        title,
        eventDate: formattedStartDate,
        endDate: formattedEndDate,
        startTime,
        endTime,
        timezone,
        location: isVirtual ? null : selectedLocation,
        virtualLink: isVirtual ? virtualLink : null,
        isVirtual,
        description,
        dresscode: showDressCode ? dresscode : null,
        whatToBring: showWhatToBring ? whatToBring : null,
        additionalInfo: showAdditionalInfo ? description : null,
        privacy,
        allowGuestPlusOne,
        showGuestList,
        requireRsvp,
        rsvpDeadline: formattedRsvpDeadline,
        hostId: currentUser?.uid, 
        invitedMembers: inviteType === "all" ? familyMembers.map(member => member.id) : selectedMembers,
        coverPhotos: photoUrls,
      }

      console.log("Submitting event data to Firebase...");
      
      // Call the createEvent Firebase callable function
      const result = await csrfClient.callFunction('createEvent', eventData);
      
      console.log("Event created successfully:", result.data);
      
      if (result.data && typeof result.data === 'object') {
        toast({
          title: "Success",
          description: "Event created successfully!"
        })
        
        router.push("/events");
      } else {
        throw new Error('Failed to create event: Invalid response')
      }
    } catch (error) {
      console.error("Error creating event:", error);
      toast({
        variant: "destructive",
        title: "Creation Failed",
        description: `Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 bg-gray-50 min-h-screen flex flex-col">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-6 mt-8 mb-8 w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 pb-4 border-b">Create New Event</h1>

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

              {memoizedDateRangePicker}
            </div>

            {/* Timezone Selection - Now handled by DateRangePicker */}

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
                    <Image src={url} width={100} height={100} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    
                    {/* Show upload progress if this is a new photo being uploaded */}
                    {photoUploadProgress[index] > 0 && photoUploadProgress[index] < 100 && (
                      <div className="absolute bottom-0 left-0 w-full bg-gray-200 h-1">
                        <div 
                          className="bg-[#0A5C36] h-1 transition-all duration-300"
                          style={{ width: `${photoUploadProgress[index]}%` }}
                        ></div>
                      </div>
                    )}
                    
                    {/* Show error if upload failed */}
                    {photoUploadErrors[index] && (
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

          {/* Invite Settings */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center">
              <Users className="mr-2 h-5 w-5 text-[#0A5C36]" />
              Invite Family Members
            </h2>

            <Tabs defaultValue="all" onValueChange={(value) => setInviteType(value as "all" | "select")}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger
                  value="all"
                  className="data-[state=active]:bg-[#0A5C36]/10 data-[state=active]:text-[#0A5C36]"
                >
                  Invite All Family
                </TabsTrigger>
                <TabsTrigger
                  value="select"
                  className="data-[state=active]:bg-[#0A5C36]/10 data-[state=active]:text-[#0A5C36]"
                >
                  Select Individuals
                </TabsTrigger>
              </TabsList>

              {inviteType === "select" && (
                <div className="space-y-4">
                  <div className="bg-[#0A5C36]/10 p-4 rounded-lg mb-4">
                    <div className="flex items-start">
                      <User className="h-5 w-5 text-[#0A5C36] mt-0.5 mr-3 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">You are the host</p>
                        <p className="text-xs text-gray-600 mt-1">
                          You&apos;ll be automatically added as the host of this event.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search family members..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 border-gray-300 focus:border-[#0A5C36] focus:ring-[#0A5C36]"
                    />
                  </div>

                  {loadingMembers && (
                    <div className="text-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#0A5C36]" />
                      <p className="mt-2 text-gray-600">Loading family members...</p>
                    </div>
                  )}

                  {membersError && (
                    <div className="text-center py-6 bg-red-50 rounded-lg">
                      <AlertTriangle className="h-8 w-8 text-red-500 mx-auto" />
                      <p className="mt-2 text-red-600">{membersError}</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => {
                          setLoadingMembers(true);
                          setMembersError(null);
                          
                          getFamilyManagementData()
                            .then((result) => {
                              if (result && Array.isArray(result.members)) {
                                // Filter out the current user from the family members list
                                const filteredMembers = result.members
                                  .filter(member => member.id !== currentUser?.uid)
                                  .map(member => ({
                                    id: member.id || '',
                                    displayName: member.displayName || 'Unnamed Family Member',
                                    profilePicture: member.profilePicture
                                  }));
                                
                                setFamilyMembers(filteredMembers);
                              } else {
                                console.error('Invalid family members data structure:', result);
                                setMembersError('Received invalid data format from server.');
                              }
                              setLoadingMembers(false);
                            })
                            .catch((error) => {
                              console.error('Error fetching family members:', error);
                              setMembersError('Failed to load family members. Please try again later.');
                              setLoadingMembers(false);
                            });
                        }}
                      >
                        Try Again
                      </Button>
                    </div>
                  )}

                  {!loadingMembers && !membersError && filteredMembers.length === 0 && (
                    <div className="text-center py-6 text-gray-500 italic">
                      No family members found. Try a different search term or invite all family.
                    </div>
                  )}

                  {!loadingMembers && !membersError && filteredMembers.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto p-1">
                      {filteredMembers.map((member) => (
                        <Card
                          key={member.id}
                          className={`cursor-pointer transition-colors ${
                            selectedMembers.includes(member.id)
                              ? "border-[#0A5C36] bg-[#0A5C36]/10"
                              : "hover:border-gray-300"
                          }`}
                          onClick={() => toggleMemberSelection(member.id)}
                        >
                          <CardContent className="p-3 flex items-center">
                            <div className="relative h-10 w-10 mr-3 flex-shrink-0">
                              {member.profilePicture ? (
                                <Image
                                  src={member.profilePicture}
                                  alt={member.displayName}
                                  fill
                                  className="rounded-full object-cover"
                                />
                              ) : (
                                <div className="absolute inset-0 rounded-full bg-[#0A5C36]/20 flex items-center justify-center text-[#0A5C36] font-medium">
                                  {member.displayName
                                    .split(' ')
                                    .map(name => name[0])
                                    .join('')
                                    .toUpperCase()
                                    .substring(0, 2)}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">{member.displayName}</p>
                            </div>
                            <Checkbox
                              checked={selectedMembers.includes(member.id)}
                              className="ml-2 data-[state=checked]:bg-[#0A5C36] data-[state=checked]:border-[#0A5C36]"
                              onCheckedChange={() => toggleMemberSelection(member.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                    <span className="text-sm text-gray-700">{selectedMembers.length} family members selected</span>
                    <Button
                      type="button"
                      variant="outline"
                      className="text-[#0A5C36] border-[#0A5C36] hover:bg-[#0A5C36]/10"
                      onClick={() => {
                        if (selectedMembers.length === familyMembers.length) {
                          // If all are selected, deselect all
                          setSelectedMembers([]);
                        } else {
                          // Otherwise, select all
                          setSelectedMembers(familyMembers.map((m) => m.id));
                        }
                      }}
                    >
                      {selectedMembers.length === familyMembers.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                </div>
              )}

              {inviteType === "all" && (
                <div className="bg-[#0A5C36]/10 p-4 rounded-lg">
                  <div className="flex items-start">
                    <Users className="h-5 w-5 text-[#0A5C36] mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">All family members will be invited</p>
                      <p className="text-xs text-gray-600 mt-1">
                        This will send an invitation to all {familyMembers.length} members of your family.
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        You&apos;ll be automatically added as the host.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </Tabs>
          </div>

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
          <div className="flex flex-col sm:flex-row sm:justify-end gap-3 sm:gap-4 mt-8 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading} 
              className="w-full sm:w-auto bg-[#0A5C36] hover:bg-[#0A5C36]/90 text-white"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Creating Event...
                </>
              ) : (
                <>
                  Create Event
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