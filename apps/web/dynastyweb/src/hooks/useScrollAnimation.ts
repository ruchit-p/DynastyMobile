"use client"

import { useEffect, useRef, useState } from 'react'

interface UseScrollAnimationOptions {
  threshold?: number
  rootMargin?: string
  animateOnce?: boolean
}

export function useScrollAnimation({
  threshold = 0.1,
  rootMargin = '0px',
  animateOnce = true
}: UseScrollAnimationOptions = {}) {
  const ref = useRef<HTMLElement>(null)
  const [isInView, setIsInView] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const inView = entry.isIntersecting
        
        if (inView && !hasAnimated) {
          setIsInView(true)
          if (animateOnce) {
            setHasAnimated(true)
          }
        } else if (!animateOnce) {
          setIsInView(inView)
        }
      },
      {
        threshold,
        rootMargin
      }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [threshold, rootMargin, animateOnce, hasAnimated])

  return {
    ref,
    isInView,
    hasAnimated
  }
}

// Pre-configured animation hooks
export function useFadeIn(options?: UseScrollAnimationOptions) {
  const { ref, isInView } = useScrollAnimation(options)
  
  return {
    ref,
    className: isInView ? 'animate-fade-in' : 'opacity-0'
  }
}

export function useSlideUp(options?: UseScrollAnimationOptions) {
  const { ref, isInView } = useScrollAnimation(options)
  
  return {
    ref,
    className: isInView ? 'animate-slide-up' : 'opacity-0 translate-y-10'
  }
}

export function useScaleIn(options?: UseScrollAnimationOptions) {
  const { ref, isInView } = useScrollAnimation(options)
  
  return {
    ref,
    className: isInView ? 'animate-scale-in' : 'opacity-0 scale-95'
  }
}

export function useStaggerChildren(options?: UseScrollAnimationOptions) {
  const { ref, isInView } = useScrollAnimation(options)
  
  return {
    ref,
    className: isInView ? 'stagger-animation' : ''
  }
}