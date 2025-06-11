"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AccountSettingsPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to personal information page by default
    router.replace("/account-settings/personal-information")
    
    // Prefetch other subpages for smooth transitions
    router.prefetch("/account-settings/subscription")
    router.prefetch("/account-settings/notifications")
    router.prefetch("/account-settings/privacy-security")
    router.prefetch("/account-settings/help-support")
  }, [router])

  // Return null since we're redirecting
  return null
} 