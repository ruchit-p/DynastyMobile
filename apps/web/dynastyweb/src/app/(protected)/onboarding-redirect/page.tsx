"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"
import { useOnboarding } from "@/context/OnboardingContext"
import { Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

/**
 * This page serves as a temporary stopping point for new Google users
 * to ensure the onboarding form is shown before redirecting to family-tree.
 * It forces the OnboardingContext to check the user's onboarding status.
 */
export default function OnboardingRedirectPage() {
  const router = useRouter()
  const { currentUser, loading, firestoreUser } = useAuth()
  const { hasCompletedOnboarding, showOnboarding } = useOnboarding()
  const { toast } = useToast()
  const [waitTime, setWaitTime] = useState(0)
  const [maxWaitReached, setMaxWaitReached] = useState(false)

  console.log("Onboarding redirect page loaded")
  console.log("hasCompletedOnboarding:", hasCompletedOnboarding)
  console.log("showOnboarding:", showOnboarding)
  
  // Increment wait time counter to detect if we're stuck
  useEffect(() => {
    if (!loading && currentUser && !hasCompletedOnboarding && !showOnboarding) {
      const timer = setTimeout(() => {
        setWaitTime(prev => {
          const newTime = prev + 1
          if (newTime >= 5 && !maxWaitReached) {
            setMaxWaitReached(true)
          }
          return newTime
        })
      }, 1000)
      
      return () => clearTimeout(timer)
    }
  }, [loading, currentUser, hasCompletedOnboarding, showOnboarding, maxWaitReached])
  
  // Handle max wait time reached
  useEffect(() => {
    if (maxWaitReached) {
      console.log("Max wait time reached, forcing redirect to family-tree")
      toast({
        title: "Welcome to Dynasty!",
        description: "Please complete the onboarding form to get started.",
        duration: 5000,
      })
      router.push("/family-tree")
    }
  }, [maxWaitReached, router, toast])
  
  useEffect(() => {
    // Only proceed if we're not loading
    if (!loading) {
      console.log("Auth loading complete")
      
      // If user is not logged in, redirect to login
      if (!currentUser) {
        console.log("No current user, redirecting to login")
        router.push("/login")
        return
      }

      console.log("Current user:", currentUser.uid)
      console.log("Email verified:", currentUser.emailVerified)
      console.log("Phone verified:", firestoreUser?.phoneNumberVerified)

      // If user has not verified either email or phone, redirect to verify email
      if (!currentUser.emailVerified && !firestoreUser?.phoneNumberVerified) {
        console.log("Neither email nor phone verified, redirecting to verify-email")
        router.push("/verify-email")
        return
      }

      // The onboarding status check
      if (hasCompletedOnboarding) {
        console.log("Onboarding completed, redirecting to family-tree")
        router.push("/family-tree")
      } else if (showOnboarding) {
        console.log("Onboarding is showing, will wait for completion")
        // We stay on this page while the onboarding modal is showing
      } else {
        console.log("Waiting for onboarding context to initialize")
        // We stay on this page while OnboardingContext initializes
      }
    }
  }, [currentUser, firestoreUser, loading, router, hasCompletedOnboarding, showOnboarding])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-[#0A5C36]" />
        <h2 className="mt-6 text-xl font-semibold text-gray-900">
          Setting up your account...
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Please wait while we prepare your Dynasty experience.
        </p>
        {waitTime > 2 && (
          <p className="mt-4 text-sm text-amber-600">
            This is taking longer than expected. Please be patient...
          </p>
        )}
        {maxWaitReached && (
          <p className="mt-4 text-sm text-blue-600">
            Redirecting you to continue...
          </p>
        )}
      </div>
    </div>
  )
} 