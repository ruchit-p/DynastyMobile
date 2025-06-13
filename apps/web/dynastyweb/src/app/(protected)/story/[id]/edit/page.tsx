"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/context/AuthContext"
import { uploadMedia } from "@/utils/mediaUtils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { 
  CalendarIcon, 
  Type, 
  Image as ImageIcon, 
  Video, 
  Mic, 
  GripVertical, 
  X, 
  Users,
  Lock,
  MapPin
} from "lucide-react"
import { format } from "date-fns"
import MediaUpload from "@/components/MediaUpload"
import AudioRecorder from "@/components/AudioRecorder"
import LocationPicker from "@/components/LocationPicker"
import { useToast } from "@/components/ui/use-toast"
import { FamilyMemberSelect } from "@/components/FamilyMemberSelect"
import { updateStory } from "@/utils/functionUtils"
import "react-responsive-carousel/lib/styles/carousel.min.css"
import DynastyCarousel from "@/components/DynastyCarousel"

type BlockType = "text" | "image" | "video" | "audio"
type PrivacyLevel = "family" | "personal" | "custom"

interface Block {
  id: string
  type: BlockType
  content: string | File | string[] | File[]
  uploadProgress?: number
  error?: string
  isMultipleFiles?: boolean
}

interface Location {
  lat: number
  lng: number
  address: string
}

interface StoryBlock {
  localId: string;
  type: BlockType;
  data: string | string[];
}

export default function EditStoryPage() {
  const { id } = useParams()
  const router = useRouter()
  const { currentUser } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState("")
  const [subtitle, setSubtitle] = useState("")
  const [date, setDate] = useState<Date>(new Date())
  const [location, setLocation] = useState<Location | undefined>(undefined)
  const [privacy, setPrivacy] = useState<"family" | "personal" | "custom">("family")
  const [customAccessMembers, setCustomAccessMembers] = useState<string[]>([])
  const [taggedMembers, setTaggedMembers] = useState<string[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [showLocationPicker, setShowLocationPicker] = useState(false)

  // Handle setting members to ensure current user is filtered
  const setFilteredCustomAccessMembers = useCallback((members: string[]) => {
    if (currentUser?.uid) {
      setCustomAccessMembers(members.filter(id => id !== currentUser.uid));
    } else {
      setCustomAccessMembers(members);
    }
  }, [currentUser?.uid]);
  
  const setFilteredTaggedMembers = useCallback((members: string[]) => {
    if (currentUser?.uid) {
      setTaggedMembers(members.filter(id => id !== currentUser.uid));
    } else {
      setTaggedMembers(members);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    const fetchStory = async () => {
      if (!id || !currentUser) return

      try {
        const storyDoc = await getDoc(doc(db, "stories", id as string))
        if (!storyDoc.exists()) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Story not found",
          })
          router.push("/feed")
          return
        }

        const storyData = storyDoc.data()
        
        // Verify ownership
        if (storyData.authorID !== currentUser.uid) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "You don't have permission to edit this story",
          })
          router.push("/feed")
          return
        }

        // Set form data
        setTitle(storyData.title)
        setSubtitle(storyData.subtitle || "")
        setDate(storyData.eventDate ? new Date(storyData.eventDate.seconds * 1000) : new Date())
        setLocation(storyData.location)
        setPrivacy(storyData.privacy === "privateAccess" ? "personal" : storyData.privacy)
        setFilteredCustomAccessMembers(storyData.customAccessMembers || [])
        setFilteredTaggedMembers(storyData.peopleInvolved || [])

        // Convert story blocks to form blocks
        const formBlocks = storyData.blocks.map((block: StoryBlock) => ({
          id: block.localId,
          type: block.type,
          content: block.data
        }))
        setBlocks(formBlocks)
      } catch (error) {
        console.error("Error fetching story:", error)
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load story",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchStory()
  }, [id, currentUser, router, toast, setFilteredCustomAccessMembers, setFilteredTaggedMembers])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Title is required"
      })
      return
    }

    if (!id || !currentUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Missing required data"
      })
      return
    }

    try {
      setLoading(true)

      // Process all blocks and upload media if needed
      const processedBlocks = await Promise.all(
        blocks.map(async (block) => {
          if (block.type === 'text') {
            return {
              data: block.content as string,
              localId: block.id,
              type: block.type
            }
          }

          // For media blocks, check if the content is a File/File[] (new upload) or URL/URL[] (already uploaded)
          if (block.content instanceof File) {
            try {
              const url = await uploadMedia(
                block.content,
                id as string,
                block.type,
                {
                  onProgress: (progress) => {
                    setBlocks(currentBlocks =>
                      currentBlocks.map(b =>
                        b.id === block.id
                          ? { ...b, uploadProgress: progress }
                          : b
                      )
                    )
                  },
                  onError: (error) => {
                    setBlocks(currentBlocks =>
                      currentBlocks.map(b =>
                        b.id === block.id
                          ? { ...b, error: error.message }
                          : b
                      )
                    )
                    throw error // Re-throw to handle in the outer catch
                  }
                }
              )
              return {
                data: url,
                localId: block.id,
                type: block.type
              }
            } catch (error) {
              console.error(`Error uploading ${block.type}:`, error)
              throw error
            }
          } else if (Array.isArray(block.content)) {
            // Handle multiple files
            try {
              // Check if the array contains Files (new uploads) or strings (existing URLs)
              if (block.content.length > 0 && typeof block.content[0] !== 'string') {
                // Upload all files and collect URLs
                const files = block.content as unknown as File[];
                const uploadPromises = files.map(file => 
                  uploadMedia(
                    file,
                    id as string,
                    block.type as 'image' | 'video' | 'audio',
                    {
                      onProgress: (progress) => {
                        // Progress tracking for multiple files is simplified
                        setBlocks(currentBlocks =>
                          currentBlocks.map(b =>
                            b.id === block.id
                              ? { ...b, uploadProgress: progress }
                              : b
                          )
                        )
                      },
                      onError: (error) => {
                        setBlocks(currentBlocks =>
                          currentBlocks.map(b =>
                            b.id === block.id
                              ? { ...b, error: error.message }
                              : b
                          )
                        )
                        throw error
                      }
                    }
                  )
                );
                
                const urls = await Promise.all(uploadPromises);
                
                return {
                  data: urls,
                  localId: block.id,
                  type: block.type
                }
              } else {
                // Array of existing URLs, no need to upload
                return {
                  data: block.content as string[],
                  localId: block.id,
                  type: block.type
                }
              }
            } catch (error) {
              console.error(`Error uploading multiple ${block.type}:`, error)
              throw error
            }
          }

          // Existing URL or other content
          return {
            data: block.content as string,
            localId: block.id,
            type: block.type
          }
        })
      )

      // Update the story using the Cloud Function
      await updateStory(
        id as string,
        currentUser.uid,
        {
          title: title.trim(),
          subtitle: subtitle.trim() || undefined,
          eventDate: date,
          location,
          privacy: privacy === "personal" ? "privateAccess" : privacy,
          customAccessMembers: privacy === "custom" ? 
            customAccessMembers.filter(uid => uid !== currentUser.uid) : 
            undefined,
          blocks: processedBlocks as StoryBlock[],
          peopleInvolved: taggedMembers.filter(uid => uid !== currentUser.uid)
        }
      );
      
      toast({
        title: "Success",
        description: "Story updated successfully!"
      })
      router.push(`/story/${id}`) // Redirect to story page after successful update
    } catch (error) {
      console.error("Error updating story:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update story. Please try again."
      })
    } finally {
      setLoading(false)
    }
  }

  const addBlock = (type: BlockType) => {
    const newBlock: Block = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: "",
    }
    setBlocks([...blocks, newBlock])
  }

  const updateBlock = (id: string, content: string | File) => {
    setBlocks(blocks.map(block => 
      block.id === id ? { ...block, content } : block
    ))
  }

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(block => block.id !== id))
  }

  const handleFileSelect = async (id: string, file: File) => {
    updateBlock(id, file)
  }

  const handleMultipleFilesSelect = (id: string, files: File[]) => {
    // Mark the block as having multiple files
    setBlocks(blocks.map(block => 
      block.id === id ? { 
        ...block, 
        content: files,
        isMultipleFiles: true
      } : block
    ))
  }

  const handleAudioRecord = async (id: string, blob: Blob) => {
    const file = new File([blob], `audio_${Date.now()}.wav`, { type: 'audio/wav' })
    updateBlock(id, file)
  }

  const handleLocationSelect = (loc: Location) => {
    setLocation(loc)
    setShowLocationPicker(false)
  }

  const handleDateSelect = (newDate: Date | undefined) => {
    if (newDate) {
      setDate(newDate)
    }
  }

  // Add a function to remove media items from a block
  const removeMediaItem = (blockId: string, index: number) => {
    setBlocks(blocks.map(block => {
      if (block.id === blockId && Array.isArray(block.content)) {
        // Create a copy of the array
        const newContent = [...block.content] as (string | File)[];
        // Remove the item at the specified index
        newContent.splice(index, 1);
        
        return {
          ...block,
          content: newContent as typeof block.content,
          // If content is now empty, reset it
          isMultipleFiles: newContent.length > 1
        };
      }
      return block;
    }));
  }

  const privacyLabels = {
    family: "Shared with Family",
    personal: "Private (Only You)",
    custom: "Custom Access"
  };

  const privacyIcons = {
    family: <Users className="h-4 w-4 mr-2" />,
    personal: <Lock className="h-4 w-4 mr-2" />,
    custom: <Users className="h-4 w-4 mr-2" />
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0A5C36]"></div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8">
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-6">
            {/* Title - Always shown */}
            <div>
              <Label htmlFor="title" className="text-base font-medium">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter your story title"
                className="mt-1"
                required
              />
            </div>

            {/* Subtitle */}
            <div className="relative">
              <Label htmlFor="subtitle" className="text-base font-medium">
                Subtitle
              </Label>
              <Input
                id="subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Add a subtitle (optional)"
                className="mt-1"
              />
            </div>

            {/* Date and Location in a grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="date" className="text-base font-medium">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal mt-1"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(date, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar 
                      mode="single" 
                      selected={date} 
                      onSelect={handleDateSelect}
                      initialFocus 
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label className="text-base font-medium">Location</Label>
                <div className="relative mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    onClick={() => setShowLocationPicker(!showLocationPicker)}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    {location ? (
                      <span className="truncate">{location.address}</span>
                    ) : (
                      <span className="text-muted-foreground">Select location</span>
                    )}
                  </Button>
                  {showLocationPicker && (
                    <div 
                      className="absolute z-10 mt-1 bg-white rounded-lg shadow-lg border p-4"
                      style={{ 
                        width: "100%",
                        maxWidth: "600px",
                        left: "0",
                      }}
                    >
                      <LocationPicker
                        onLocationSelect={handleLocationSelect}
                        defaultLocation={location}
                        isOpen={showLocationPicker}
                        onClose={() => setShowLocationPicker(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Privacy and Tag People in a grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="privacy" className="text-base font-medium">
                  Privacy
                </Label>
                <Select 
                  value={privacy} 
                  onValueChange={(value: PrivacyLevel) => setPrivacy(value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue>
                      <div className="flex items-center">
                        {privacyIcons[privacy]}
                        {privacyLabels[privacy]}
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="family">
                      <div className="flex items-center">
                        <Users className="h-4 w-4 mr-2" />
                        Shared with Family
                      </div>
                    </SelectItem>
                    <SelectItem value="personal">
                      <div className="flex items-center">
                        <Lock className="h-4 w-4 mr-2" />
                        Private (Only You)
                      </div>
                    </SelectItem>
                    <SelectItem value="custom">
                      <div className="flex items-center">
                        <Users className="h-4 w-4 mr-2" />
                        Custom Access
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-base font-medium">
                  Tag People
                </Label>
                <div className="mt-1">
                  <FamilyMemberSelect
                    selectedMembers={taggedMembers}
                    onMemberSelect={setFilteredTaggedMembers}
                    placeholder="Tag family members in this story"
                  />
                </div>
              </div>
            </div>

            {privacy === "custom" && (
              <div>
                <Label className="text-base font-medium">
                  Custom Access
                </Label>
                <div className="mt-1">
                  <FamilyMemberSelect
                    selectedMembers={customAccessMembers}
                    onMemberSelect={setFilteredCustomAccessMembers}
                    placeholder="Select family members who can access this story"
                  />
                </div>
              </div>
            )}

            {/* Story Content Section */}
            <div className="border-t pt-6 mt-6">
              <div className="flex items-center gap-2 mb-6">
                <h2 className="text-lg font-semibold">Story Content</h2>
                <div className="flex items-center gap-2 ml-auto">
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock("text")}>
                    <Type className="h-4 w-4 mr-2" />
                    Add Text
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock("image")}>
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Add Image
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock("video")}>
                    <Video className="h-4 w-4 mr-2" />
                    Add Video
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addBlock("audio")}>
                    <Mic className="h-4 w-4 mr-2" />
                    Add Audio
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                {blocks.map((block) => (
                  <div key={block.id} className="group relative border rounded-lg p-4 hover:border-gray-400 transition-colors">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-sm hover:bg-gray-100"
                      onClick={() => removeBlock(block.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-move">
                      <GripVertical className="h-4 w-4 text-gray-400" />
                    </div>
                    {block.type === "text" && (
                      <textarea
                        value={block.content as string}
                        onChange={(e) => updateBlock(block.id, e.target.value)}
                        placeholder="Start writing..."
                        className="w-full min-h-[100px] p-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-[#0A5C36] focus:border-transparent"
                      />
                    )}
                    {(block.type === "image" || block.type === "video" || block.type === "audio") && (
                      <div className="space-y-2">
                        {/* Only show MediaUpload if there's no carousel (no multiple items) */}
                        {!(Array.isArray(block.content) && block.content.length > 1) && (
                          <MediaUpload
                            type={block.type}
                            onFileSelect={(file) => handleFileSelect(block.id, file)}
                            onMultipleFilesSelect={(files) => handleMultipleFilesSelect(block.id, files)}
                            value={block.content instanceof File ? '' : block.content}
                            onRemove={() => updateBlock(block.id, "")}
                          />
                        )}
                        
                        {block.uploadProgress !== undefined && block.uploadProgress < 100 && (
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                              className="bg-[#0A5C36] h-2.5 rounded-full transition-all duration-300"
                              style={{ width: `${block.uploadProgress}%` }}
                            />
                          </div>
                        )}
                        {block.error && (
                          <div className="text-sm text-red-500 mt-1">
                            {block.error}
                          </div>
                        )}
                        {block.type === "audio" && !(Array.isArray(block.content) && block.content.length > 1) && (
                          <>
                            <div className="text-sm text-gray-500 text-center">or</div>
                            <AudioRecorder
                              onRecordingComplete={(blob) => handleAudioRecord(block.id, blob)}
                            />
                          </>
                        )}
                        {block.type === "image" && Array.isArray(block.content) && block.content.length > 1 && (
                          <div className="mt-4">
                            <DynastyCarousel
                              items={block.content}
                              type="image"
                              title="All Images"
                              imageHeight={300}
                              onItemClick={(index) => removeMediaItem(block.id, index)}
                            />
                            <p className="text-xs text-gray-500 mt-2 text-center">Click on an item to remove it</p>
                          </div>
                        )}
                        {block.type === "video" && Array.isArray(block.content) && block.content.length > 1 && (
                          <div className="mt-4">
                            <DynastyCarousel
                              items={block.content}
                              type="video"
                              title="All Videos"
                              onItemClick={(index) => removeMediaItem(block.id, index)}
                            />
                            <p className="text-xs text-gray-500 mt-2 text-center">Click on an item to remove it</p>
                          </div>
                        )}
                        {block.type === "audio" && Array.isArray(block.content) && block.content.length > 1 && (
                          <div className="mt-4">
                            <DynastyCarousel
                              items={block.content}
                              type="audio"
                              title="All Audio Files"
                              onItemClick={(index) => removeMediaItem(block.id, index)}
                            />
                            <p className="text-xs text-gray-500 mt-2 text-center">Click on an item to remove it</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-8 pt-4 border-t">
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
                className="w-full sm:w-auto"
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
} 