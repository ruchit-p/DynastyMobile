"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Carousel } from "react-responsive-carousel"
import "react-responsive-carousel/lib/styles/carousel.min.css"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import AudioPlayer from "@/components/AudioPlayer"
import VideoPlayer from "@/components/VideoPlayer"
import { ensureAccessibleStorageUrl } from "@/utils/mediaUtils"

// Add global styles to prevent highlighting in carousels
import "./dynastyCarousel.css"

// Define the types of media our carousel can handle
type MediaType = "image" | "video" | "audio" | "unknown"

// Define the structure of our media items
type MediaItem = string | File | { url: string; caption?: string; alt?: string }

interface DynastyCarouselProps {
  // Accept array of media items of different types
  items: MediaItem[]
  
  // Customization options
  type?: MediaType
  className?: string
  showThumbs?: boolean
  showIndicators?: boolean
  showStatus?: boolean
  infiniteLoop?: boolean
  emulateTouch?: boolean
  swipeable?: boolean
  useKeyboardArrows?: boolean
  title?: string
  imageHeight?: number // For fixed height image containers
  
  // Callback events
  onItemClick?: (index: number) => void
  onSlideChange?: (index: number) => void
  
  // If the items are File objects or specific media type
  itemType?: MediaType
  
  // Additional filter for items (like filtering out audioUrl in the storyDetails page)
  filterItem?: (item: MediaItem, index: number) => boolean
}

// Helper function to get URL from different item types
const getItemUrl = (item: MediaItem): string => {
  let url = '';
  if (typeof item === 'string') url = item;
  else if (item instanceof File) url = URL.createObjectURL(item);
  else url = item.url;
  
  // Fix Firebase Storage URLs by ensuring they have proper access parameters
  if (url && (url.includes('storage.googleapis.com') || url.includes('firebasestorage.googleapis.com'))) {
    return ensureAccessibleStorageUrl(url);
  }
  
  return url;
}

// Helper function to determine media type from URL or File
const getMediaType = (item: MediaItem, providedType?: MediaType): MediaType => {
  if (providedType) return providedType
  
  // For string URLs, check extensions
  if (typeof item === 'string') {
    // Add logging for debugging
    console.log(`[DynastyCarousel] Determining media type for URL: ${item.substring(0, 50)}...`);
    
    if (item.startsWith('data:image') || item.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      console.log(`[DynastyCarousel] Detected as image`);
      return 'image'
    }
    if (item.match(/\.(mp4|webm|mov|avi)$/i)) {
      console.log(`[DynastyCarousel] Detected as video`);
      return 'video'
    }
    if (item.match(/\.(mp3|wav|m4a|aac)$/i)) {
      console.log(`[DynastyCarousel] Detected as audio`);
      return 'audio'
    }
    
    // Check for common image hosting patterns
    if (item.includes('firebasestorage.googleapis.com') || 
        item.includes('storage.googleapis.com') || 
        item.includes('dynasty-eba63.firebasestorage.app')) {
      // For Firebase storage URLs, check for image extensions in the full path
      if (item.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
        console.log(`[DynastyCarousel] Firebase URL detected as image`);
        return 'image'
      }
    }
    
    console.log(`[DynastyCarousel] Could not determine media type, defaulting to unknown`);
    return 'unknown'
  }
  
  // For File objects, check type
  if (item instanceof File) {
    if (item.type.startsWith('image/')) return 'image'
    if (item.type.startsWith('video/')) return 'video'
    if (item.type.startsWith('audio/')) return 'audio'
    return 'unknown'
  }
  
  // For object with url property
  const url = item.url
  if (url.startsWith('data:image') || url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return 'image'
  if (url.match(/\.(mp4|webm|mov|avi)$/i)) return 'video'
  if (url.match(/\.(mp3|wav|m4a|aac)$/i)) return 'audio'
  
  return 'unknown'
}

// Helper function to get caption or alt text
const getCaption = (item: MediaItem): string | undefined => {
  if (typeof item === 'object' && !(item instanceof File) && item.caption) {
    return item.caption
  }
  return undefined
}

// Helper function to get alt text
const getAlt = (item: MediaItem, index: number): string => {
  if (typeof item === 'object' && !(item instanceof File) && item.alt) {
    return item.alt
  }
  return `Media item ${index + 1}`
}

export default function DynastyCarousel({
  items,
  type,
  className = "",
  showThumbs = false,
  showIndicators,
  showStatus = false,
  infiniteLoop = true,
  emulateTouch = true,
  swipeable = true,
  useKeyboardArrows = true,
  title,
  imageHeight = 300,
  onItemClick,
  onSlideChange,
  itemType,
  filterItem
}: DynastyCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  
  // If no items or all items are filtered out, don't render anything
  const filteredItems = filterItem ? items.filter(filterItem) : items

  // Add logging to help debug image issues
  useEffect(() => {
    console.log("[DynastyCarousel] Rendering carousel with items:", 
      filteredItems.length > 0 
        ? filteredItems.map((item, i) => typeof item === 'string' 
            ? `Item ${i}: ${item.substring(0, 50)}...` 
            : `Item ${i}: ${item instanceof File ? 'File' : 'Object'}`)
        : 'No items');
  }, [filteredItems]);
  
  if (!filteredItems.length) return null
  
  // If only one item and showIndicators is not explicitly set, hide them
  const shouldShowIndicators = showIndicators !== undefined 
    ? showIndicators 
    : filteredItems.length > 1
  
  return (
    <div className={`dynasty-carousel ${className}`}>
      {title && <h4 className="text-sm font-medium mb-2">{title}</h4>}
      
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-500">
          {currentSlide + 1} of {filteredItems.length}
        </span>
      </div>
      
      <Carousel
        selectedItem={currentSlide}
        onChange={(index) => {
          setCurrentSlide(index)
          onSlideChange?.(index)
        }}
        showThumbs={showThumbs}
        showStatus={showStatus}
        showIndicators={shouldShowIndicators}
        infiniteLoop={infiniteLoop}
        emulateTouch={emulateTouch}
        swipeable={swipeable}
        useKeyboardArrows={useKeyboardArrows}
        renderArrowPrev={(clickHandler, hasPrev) => (
          hasPrev && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 bg-white/70 hover:bg-white/90 rounded-full"
              onClick={clickHandler}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )
        )}
        renderArrowNext={(clickHandler, hasNext) => (
          hasNext && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 bg-white/70 hover:bg-white/90 rounded-full"
              onClick={clickHandler}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          )
        )}
        className="dynasty-carousel-container select-none"
      >
        {filteredItems.map((item, index) => {
          const url = getItemUrl(item)
          const mediaType = itemType || getMediaType(item, type)
          const caption = getCaption(item)
          const alt = getAlt(item, index)
          
          return (
            <div 
              key={index} 
              className="relative"
              onClick={() => onItemClick && onItemClick(index)}
              onDragStart={(e) => e.preventDefault()}
              style={{ userSelect: 'none' }}
            >
              {mediaType === 'image' && (
                <div 
                  className="relative w-full h-full" 
                  style={{ 
                    minHeight: '250px',
                    height: '100%',
                    maxHeight: `${imageHeight}px`,
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                  onDragStart={(e) => e.preventDefault()}
                >
                  <Image
                    src={url}
                    alt={alt}
                    fill
                    className="object-contain pointer-events-none"
                    unoptimized={true}
                    draggable={false}
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 80vw, 60vw"
                  />
                  {caption && (
                    <div className="p-4 bg-gray-50 text-sm text-gray-700 mt-2">{caption}</div>
                  )}
                </div>
              )}
              
              {mediaType === 'video' && (
                <div 
                  className="video-container"
                  style={{ 
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                  onDragStart={(e) => e.preventDefault()}
                >
                  <VideoPlayer url={url} />
                  {caption && (
                    <div className="p-4 bg-gray-50 text-sm text-gray-700 mt-2">{caption}</div>
                  )}
                </div>
              )}
              
              {mediaType === 'audio' && (
                <div 
                  className="audio-container py-4 flex justify-center items-center bg-gray-50 rounded-lg"
                  style={{ 
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                  onDragStart={(e) => e.preventDefault()}
                >
                  <AudioPlayer url={url} />
                  {caption && (
                    <div className="text-sm text-gray-700 mt-2">{caption}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </Carousel>
    </div>
  )
} 