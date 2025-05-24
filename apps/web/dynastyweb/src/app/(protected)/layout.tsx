"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/EnhancedAuthContext"
import Navbar from "@/components/Navbar"
import { OnboardingProvider } from "@/context/OnboardingContext"
import { OfflineIndicator } from "@/components/ui/OfflineIndicator"
import { Spinner } from "@/components/ui/spinner"

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { currentUser, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/login")
    }
  }, [currentUser, loading, router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!currentUser) {
    return null
  }

  return (
    <OnboardingProvider>
      <div className="min-h-screen bg-gray-50 pt-16">
        <Navbar user={currentUser} />
        {children}
        <OfflineIndicator />
      </div>
    </OnboardingProvider>
  )
} 