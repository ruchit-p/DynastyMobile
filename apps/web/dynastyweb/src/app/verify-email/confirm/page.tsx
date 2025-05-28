"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, CheckCircle2, XCircle, Home } from "lucide-react"
import { functions } from "@/lib/firebase"
import { httpsCallable } from "firebase/functions"

export default function VerifyEmailConfirmPage() {
  const [isVerifying, setIsVerifying] = useState(true)
  const [isError, setIsError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  // Add ref to prevent multiple notifications
  const notificationShown = useRef(false)
  const hasRedirected = useRef(false)

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const uid = searchParams.get("uid")
        const token = searchParams.get("token")

        if (!uid || !token) {
          throw new Error("Invalid verification link. Missing required parameters.")
        }

        const verifyEmailFunction = httpsCallable(functions, "verifyEmail")
        await verifyEmailFunction({ userId: uid, token })

        setIsVerifying(false)
        
        // Only show toast if not already shown
        if (!notificationShown.current) {
          notificationShown.current = true
          toast({
            title: "Email verified successfully",
            description: "Your email has been verified. Redirecting to your family tree.",
          })
        }

        // Redirect after a slight delay to allow Firestore documents to be created
        if (!hasRedirected.current) {
          hasRedirected.current = true
          
          // Allow a small delay for Firebase/Firestore to sync
          setTimeout(() => {
            router.push("/family-tree")
          }, 1500)
        }
      } catch (error) {
        setIsVerifying(false)
        setIsError(true)
        const errorMessage = error instanceof Error ? error.message : "Failed to verify email"
        setErrorMessage(errorMessage)
      }
    }

    if (!hasRedirected.current) {
      verifyEmail()
    }
  }, [searchParams, router, toast])

  const handleResendVerification = async () => {
    try {
      const sendVerificationEmailFunction = httpsCallable(functions, "sendVerificationEmail")
      await sendVerificationEmailFunction({
        userId: searchParams.get("uid"),
        email: searchParams.get("email"),
        displayName: searchParams.get("displayName"),
      })

      toast({
        title: "New verification email sent",
        description: "Please check your inbox for the new verification link. The link will expire in 30 minutes.",
      })
    } catch (err) {
      console.error("Failed to send new verification email:", err)
      toast({
        title: "Error",
        description: "Failed to send new verification email. Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative">
        <div className="flex justify-center">
          <div className="relative w-20 h-20">
            <Image
              src="/dynasty.png"
              alt="Dynasty Logo"
              width={80}
              height={80}
              className="mx-auto"
              priority
              style={{ height: 'auto' }}
            />
          </div>
        </div>
        
        <div className="mt-8 bg-white py-8 px-6 shadow-lg sm:rounded-xl border border-gray-100 relative overflow-hidden">
          {isVerifying ? (
            <>
              <h2 className="text-center text-2xl font-bold text-[#0A5C36]">Verifying your email</h2>
              <div className="mt-8 flex justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[#0A5C36]" />
              </div>
              <p className="mt-6 text-center text-sm text-gray-600">
                Please wait while we verify your email address...
              </p>
            </>
          ) : isError ? (
            <>
              <div className="mt-2 flex justify-center">
                <XCircle className="h-16 w-16 text-red-500" />
              </div>
              <h2 className="mt-4 text-center text-2xl font-bold text-gray-900">Verification failed</h2>
              <p className="mt-2 text-center text-sm text-gray-600 mb-6">{errorMessage}</p>
              <div className="mt-6 space-y-4">
                <Button
                  onClick={handleResendVerification}
                  className="w-full flex justify-center items-center bg-[#0A5C36] hover:bg-[#0A5C36]/90 text-white"
                >
                  Send new verification email
                </Button>
                <Button
                  variant="outline"
                  className="w-full flex justify-center items-center border-[#C4A55C] text-[#C4A55C] hover:bg-[#C4A55C]/10 hover:text-[#C4A55C] hover:border-[#C4A55C]"
                  onClick={() => router.push("/")}
                >
                  <Home className="mr-2 h-4 w-4" />
                  Return to Dynasty Home
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 flex justify-center">
                <CheckCircle2 className="h-16 w-16 text-[#0A5C36]" />
              </div>
              <h2 className="mt-4 text-center text-2xl font-bold text-[#0A5C36]">Email verified</h2>
              <p className="mt-2 text-center text-sm text-gray-600 mb-6">
                Your email has been verified successfully. Redirecting you to your family tree...
              </p>
              <div className="mt-8 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#C4A55C]" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
} 