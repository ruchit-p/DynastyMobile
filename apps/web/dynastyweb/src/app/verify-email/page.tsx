"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { auth } from "@/lib/firebase"

export default function VerifyEmailPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const { currentUser, firestoreUser, sendVerificationEmail, signOut } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const hasRedirected = useRef(false)
  const verificationNotified = useRef(false)

  useEffect(() => {
    if ((currentUser?.emailVerified || firestoreUser?.phoneNumberVerified) && !hasRedirected.current) {
      hasRedirected.current = true
      
      if (firestoreUser?.phoneNumberVerified) {
        toast({
          title: "Phone verified",
          description: "Your phone number is verified. You can now access all features.",
        })
      } else {
        toast({
          title: "Email verified",
          description: "Your email has been verified. You can now access all features.",
        })
      }
      
      router.push("/family-tree")
    }
  }, [currentUser, firestoreUser, router, toast])

  useEffect(() => {
    if (!currentUser || currentUser.emailVerified || firestoreUser?.phoneNumberVerified) return
    
    const checkVerification = async () => {
      try {
        await currentUser.reload()
        const freshUser = currentUser
        
        if (freshUser?.emailVerified && !verificationNotified.current) {
          verificationNotified.current = true
          toast({
            title: "Email verified",
            description: "Your email has been verified. You can now access all features.",
          })
          router.push("/family-tree")
        }
      } catch (error) {
        console.error("Error checking verification status:", error)
      }
    }
    
    checkVerification()
    
    const interval = setInterval(checkVerification, 5000)
    
    return () => clearInterval(interval)
  }, [currentUser, firestoreUser, router, toast])

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user?.emailVerified && !verificationNotified.current) {
        verificationNotified.current = true
        toast({
          title: "Email verified",
          description: "Your email has been verified. You can now access all features.",
        })
        router.push("/family-tree")
      }
    })
    
    return () => unsubscribe()
  }, [router, toast])

  const handleResendEmail = async () => {
    setIsLoading(true)
    try {
      await sendVerificationEmail()
      setEmailSent(true)
      toast({
        title: "Email sent",
        description: "A verification email has been sent to your email address.",
      })
    } catch (error) {
      console.error("Error sending verification email:", error)
      toast({
        title: "Error",
        description: "Failed to send verification email. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleBackToSignIn = async () => {
    setIsLoading(true)
    try {
      await signOut()
      toast({
        title: "Signed out",
        description: "You have been signed out successfully.",
      })
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      })
      router.push("/login")
    } finally {
      setIsLoading(false)
    }
  }

  if (!currentUser) {
    return null
  }

  if (firestoreUser?.phoneNumberVerified) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
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
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Phone Number Verified
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Your phone number has been verified. Redirecting you to your family tree...
          </p>
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#0A5C36]" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
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
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Verify Your Email
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          We&apos;ve sent a verification email to {currentUser.email}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-sm text-gray-700 mb-4">
                Please check your email and click the verification link to continue.
              </p>
              <p className="text-sm text-gray-700 mb-4">
                If you don&apos;t see the email, check your spam folder.
              </p>
            </div>

            <div className="flex flex-col space-y-4">
              <Button
                onClick={handleResendEmail}
                disabled={isLoading || emailSent}
                className="w-full bg-[#0A5C36] hover:bg-[#0A5C36]/80"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : emailSent ? (
                  "Email Sent"
                ) : (
                  "Resend Verification Email"
                )}
              </Button>

              <div className="text-center">
                <Button
                  onClick={handleBackToSignIn}
                  variant="link"
                  className="text-sm font-medium text-[#0A5C36] hover:text-[#0A5C36]/80"
                >
                  Back to Sign In
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 