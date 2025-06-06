"use client"

import React, { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { X, ChevronLeft, ChevronRight, Download, Expand, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MediaItem, MediaType } from './MediaGallery'
import MediaGalleryItem from './MediaGalleryItem'
import { cn } from '@/lib/utils'

// Dynamically import LightGallery to avoid SSR issues
const LightGallery = dynamic(() => import('lightgallery/react'), {
  ssr: false,
})

// Import LightGallery plugins
import lgZoom from 'lightgallery/plugins/zoom'
import lgVideo from 'lightgallery/plugins/video'
import lgFullscreen from 'lightgallery/plugins/fullscreen'
import lgAutoplay from 'lightgallery/plugins/autoplay'

// Import LightGallery styles
import 'lightgallery/css/lightgallery.css'
import 'lightgallery/css/lg-zoom.css'
import 'lightgallery/css/lg-video.css'
import 'lightgallery/css/lg-fullscreen.css'
import 'lightgallery/css/lg-autoplay.css'

interface MediaGalleryLightboxProps {
  items: (MediaItem & { type?: MediaType })[]
  initialIndex?: number
  isOpen: boolean
  onClose: () => void
}

export default function MediaGalleryLightbox({
  items,
  initialIndex = 0,
  isOpen,
  onClose,
}: MediaGalleryLightboxProps) {
  const [mounted, setMounted] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setCurrentIndex(initialIndex)
  }, [initialIndex])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          navigatePrev()
          break
        case 'ArrowRight':
          navigateNext()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentIndex, items.length])

  const navigatePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length)
  }, [items.length])

  const navigateNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % items.length)
  }, [items.length])

  const handleDownload = () => {
    const item = items[currentIndex]
    const link = document.createElement('a')
    link.href = item.url
    link.download = item.alt || `media-${currentIndex + 1}`
    link.click()
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  if (!mounted || !isOpen) return null

  const currentItem = items[currentIndex]
  const showNavigation = items.length > 1

  // For non-image media types, use custom lightbox
  if (currentItem.type !== 'image') {
    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="text-white">
              {showNavigation && (
                <span className="text-sm">
                  {currentIndex + 1} / {items.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className="text-white hover:bg-white/20"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Expand className="h-5 w-5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDownload}
                className="text-white hover:bg-white/20"
              >
                <Download className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="relative w-full max-w-4xl">
            <MediaGalleryItem
              item={currentItem}
              mode="lightbox"
              className="mx-auto"
            />
          </div>
        </div>

        {/* Navigation */}
        {showNavigation && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={navigatePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={navigateNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          </>
        )}

        {/* Thumbnails */}
        {showNavigation && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
            <div className="flex gap-2 justify-center overflow-x-auto max-w-full">
              {items.map((item, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={cn(
                    "relative w-16 h-16 rounded overflow-hidden border-2 transition-all",
                    index === currentIndex
                      ? "border-white scale-110"
                      : "border-transparent opacity-70 hover:opacity-100"
                  )}
                >
                  {item.type === 'image' ? (
                    <img
                      src={item.thumbnail || item.url}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                      <span className="text-xs text-white uppercase">{item.type}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // For images, use LightGallery
  const galleryItems = items.map((item) => ({
    src: item.url,
    thumb: item.thumbnail || item.url,
    subHtml: item.caption ? `<h4>${item.caption}</h4>` : '',
  }))

  return (
    <LightGallery
      dynamic
      dynamicEl={galleryItems}
      index={currentIndex}
      onCloseAfter={onClose}
      plugins={[lgZoom, lgVideo, lgFullscreen, lgAutoplay]}
      speed={500}
      download={true}
      counter={true}
      mousewheel={true}
      mobileSettings={{
        controls: true,
        showCloseIcon: true,
        download: true,
      }}
      licenseKey="your-license-key"
    />
  )
}