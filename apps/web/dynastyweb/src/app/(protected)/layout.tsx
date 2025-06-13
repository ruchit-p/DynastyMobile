"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/firebase"
import { User } from "firebase/auth"
import Navbar from "@/components/Navbar"
import { OnboardingProvider } from "@/context/OnboardingContext"

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user)
      } else {
        router.push("/login")
      }
    })

    return () => unsubscribe()
  }, [router])

  if (!user) {
    return null // or a loading spinner
  }

  return (
    <OnboardingProvider>
      <div className="min-h-screen bg-gray-50 pt-16">
        <Navbar user={user} />
        {children}
      </div>
    </OnboardingProvider>
  )
} 