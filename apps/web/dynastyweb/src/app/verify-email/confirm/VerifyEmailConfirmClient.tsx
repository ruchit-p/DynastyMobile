"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, CheckCircle2, XCircle, Home } from "lucide-react"
import { functions } from "@/lib/firebase"
import { httpsCallable } from "firebase/functions"

export default function VerifyEmailConfirmClient() {
  const [isVerifying, setIsVerifying] = useState(true)
  const [isError, setIsError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  // Add ref to prevent multiple notifications
  const notificationShown = useRef(false)

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get("token")
      
      if (!token) {
        setIsError(true)
        setErrorMessage("Invalid verification link")
        setIsVerifying(false)
        return
      }

      try {
        const verifyEmailFunction = httpsCallable(functions, "verifyEmailToken")
        const result = await verifyEmailFunction({ token })
        const data = result.data as { success: boolean; message?: string; hasPassword?: boolean }
        
        if (data.success && !notificationShown.current) {
          notificationShown.current = true
          
          // Show success notification
          toast({
            title: "Email Verified!",
            description: "Your email has been successfully verified.",
          })
          
          // Navigate based on whether user has password
          if (data.hasPassword) {
            // User has password, redirect to login
            setTimeout(() => {
              router.push("/login")
            }, 2000)
          } else {
            // User needs to set password (likely Google/Apple sign-in user)
            setTimeout(() => {
              router.push("/set-password")
            }, 2000)
          }
        } else if (!data.success) {
          setIsError(true)
          setErrorMessage(data.message || "Verification failed")
        }
      } catch (error) {
        console.error("Verification error:", error)
        setIsError(true)
        setErrorMessage("An error occurred during verification")
      } finally {
        setIsVerifying(false)
      }
    }

    verifyEmail()
  }, [searchParams, router, toast])

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Image
          src="/dynasty.png"
          alt="Dynasty Logo"
          width={60}
          height={60}
          className="mx-auto"
          priority
          style={{ height: 'auto' }}
        />
        
        <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {isVerifying ? (
            <div className="text-center">
              <Loader2 className="mx-auto h-12 w-12 text-[#0A5C36] animate-spin" />
              <h2 className="mt-4 text-xl font-semibold text-gray-900">
                Verifying your email...
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Please wait while we confirm your email address.
              </p>
            </div>
          ) : isError ? (
            <div className="text-center">
              <XCircle className="mx-auto h-12 w-12 text-red-500" />
              <h2 className="mt-4 text-xl font-semibold text-gray-900">
                Verification Failed
              </h2>
              <p className="mt-2 text-sm text-gray-600">{errorMessage}</p>
              <div className="mt-6 space-y-3">
                <Button
                  onClick={() => router.push("/login")}
                  className="w-full bg-[#0A5C36] hover:bg-[#0A5C36]/90 text-white"
                >
                  Go to Login
                </Button>
                <Button
                  onClick={() => router.push("/")}
                  variant="outline"
                  className="w-full"
                >
                  <Home className="mr-2 h-4 w-4" />
                  Back to Home
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
              <h2 className="mt-4 text-xl font-semibold text-gray-900">
                Email Verified!
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Your email has been successfully verified. Redirecting you to login...
              </p>
              <div className="mt-6">
                <Button
                  onClick={() => router.push("/login")}
                  className="w-full bg-[#0A5C36] hover:bg-[#0A5C36]/90 text-white"
                >
                  Continue to Login
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}