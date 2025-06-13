import { useState, useCallback, useRef } from 'react'
import { useToast } from '@/components/ui/use-toast'

interface UseGalleryRateLimitProps {
  maxSwipesPerMinute?: number
  maxUploadsPerHour?: number
}

interface RateLimitState {
  swipeCount: number
  uploadCount: number
  lastSwipeReset: number
  lastUploadReset: number
}

export function useGalleryRateLimit({
  maxSwipesPerMinute = 100,
  maxUploadsPerHour = 10,
}: UseGalleryRateLimitProps = {}) {
  const { toast } = useToast()
  const [isRateLimited, setIsRateLimited] = useState(false)
  const rateLimitRef = useRef<RateLimitState>({
    swipeCount: 0,
    uploadCount: 0,
    lastSwipeReset: Date.now(),
    lastUploadReset: Date.now(),
  })

  // Check and update swipe rate limit
  const checkSwipeLimit = useCallback(() => {
    const now = Date.now()
    const state = rateLimitRef.current
    const minuteElapsed = now - state.lastSwipeReset > 60000

    if (minuteElapsed) {
      // Reset counter after a minute
      state.swipeCount = 0
      state.lastSwipeReset = now
    }

    if (state.swipeCount >= maxSwipesPerMinute) {
      setIsRateLimited(true)
      toast({
        title: 'Rate Limit Reached',
        description: 'You\'re browsing too quickly. Please slow down.',
        variant: 'destructive',
      })
      return false
    }

    state.swipeCount++
    return true
  }, [maxSwipesPerMinute, toast])

  // Check and update upload rate limit
  const checkUploadLimit = useCallback((fileCount: number = 1) => {
    const now = Date.now()
    const state = rateLimitRef.current
    const hourElapsed = now - state.lastUploadReset > 3600000

    if (hourElapsed) {
      // Reset counter after an hour
      state.uploadCount = 0
      state.lastUploadReset = now
    }

    if (state.uploadCount + fileCount > maxUploadsPerHour) {
      const remaining = maxUploadsPerHour - state.uploadCount
      toast({
        title: 'Upload Limit Reached',
        description: remaining > 0 
          ? `You can only upload ${remaining} more file(s) this hour.`
          : 'You\'ve reached the hourly upload limit. Please try again later.',
        variant: 'destructive',
      })
      return false
    }

    state.uploadCount += fileCount
    return true
  }, [maxUploadsPerHour, toast])

  // Rate-limited swipe handler
  const handleSwipe = useCallback((callback: () => void) => {
    if (checkSwipeLimit()) {
      callback()
    }
  }, [checkSwipeLimit])

  // Rate-limited upload handler
  const handleUpload = useCallback((files: File[], callback: (files: File[]) => void) => {
    if (checkUploadLimit(files.length)) {
      callback(files)
    }
  }, [checkUploadLimit])

  // Get remaining limits
  const getRemainingLimits = useCallback(() => {
    const now = Date.now()
    const state = rateLimitRef.current
    
    const swipesRemaining = maxSwipesPerMinute - state.swipeCount
    const uploadsRemaining = maxUploadsPerHour - state.uploadCount
    
    const swipeResetIn = Math.max(0, 60000 - (now - state.lastSwipeReset))
    const uploadResetIn = Math.max(0, 3600000 - (now - state.lastUploadReset))
    
    return {
      swipesRemaining: Math.max(0, swipesRemaining),
      uploadsRemaining: Math.max(0, uploadsRemaining),
      swipeResetIn: Math.ceil(swipeResetIn / 1000), // seconds
      uploadResetIn: Math.ceil(uploadResetIn / 60000), // minutes
    }
  }, [maxSwipesPerMinute, maxUploadsPerHour])

  return {
    isRateLimited,
    handleSwipe,
    handleUpload,
    getRemainingLimits,
    checkSwipeLimit,
    checkUploadLimit,
  }
}