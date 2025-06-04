"use client"

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext'
import OnboardingForm from '@/components/OnboardingForm'
import { db, functions } from '@/lib/firebase'
import { usePathname } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'
import { doc, getDoc } from 'firebase/firestore'
import { createFirebaseClient } from '@/lib/functions-client'

type PrefillData = {
  firstName?: string
  lastName?: string
  dateOfBirth?: Date | null
  gender?: string
  phoneNumber?: string
}

type OnboardingContextType = {
  showOnboarding: boolean
  completeOnboarding: (userData: {
    firstName: string
    lastName: string
    dateOfBirth: Date | undefined
    gender?: 'male' | 'female' | 'other' | 'unspecified'
  }) => Promise<void>
  hasCompletedOnboarding: boolean
  isOnboardingLoading: boolean
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

// Initialize functions client at module level
const functionsClient = createFirebaseClient(functions)

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false)
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(true)
  const [prefillData, setPrefillData] = useState<PrefillData | null>(null)
  const { currentUser, loading, firestoreUser } = useAuth()
  const isCheckingRef = useRef(false)
  const lastCheckedUserIdRef = useRef<string | null>(null)
  const pathname = usePathname()
  const { toast } = useToast()
  // Using functionsClient directly for function calls
  
  // Add debugging for state changes
  useEffect(() => {
    console.log("🔄 OnboardingProvider state changed:", {
      hasCompletedOnboarding,
      showOnboarding,
      currentUser: !!currentUser,
      loading,
      isOnboardingLoading,
      pathname
    });
  }, [hasCompletedOnboarding, showOnboarding, currentUser, loading, isOnboardingLoading, pathname]);
  
  // Debugging log for initial state
  useEffect(() => {
    if (currentUser) {
      console.log("OnboardingProvider initialized with user:", currentUser.uid);
      console.log("Current pathname:", pathname);
      console.log("Email verified:", currentUser.emailVerified);
      console.log("Phone verified:", firestoreUser?.phoneNumberVerified);
    }
  }, [currentUser, firestoreUser, pathname]);
  
  // Skip onboarding paths
  const skipPaths = ['/login', '/signup', '/verify-email', '/reset-password']
  const shouldSkip = skipPaths.some(path => pathname?.startsWith(path))
  
  // Add public pages that don't require onboarding
  const publicPaths = ['/']
  const isPublicPage = publicPaths.some(path => pathname === path)
  
  // Check if path is the onboarding redirect page
  const isOnboardingRedirectPage = pathname === '/onboarding-redirect'

  const checkOnboardingStatus = useCallback(async () => {
    if (!currentUser || isCheckingRef.current) return
    
    console.log("Checking onboarding status for user:", currentUser.uid);
    
    isCheckingRef.current = true
    lastCheckedUserIdRef.current = currentUser.uid
    setIsOnboardingLoading(true)
    
    try {
      // Add a slight delay to ensure data is ready
      await new Promise(resolve => setTimeout(resolve, 800))
      
      // First try to get user data directly from Firestore
      // This avoids potential CORS issues with Cloud Functions
      try {
        console.log("Attempting to fetch user data from Firestore directly");
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log("Received user data from Firestore:", userData);
          
          const onboardingCompleted = userData.onboardingCompleted || false;
          console.log("User onboardingCompleted status:", onboardingCompleted);
          
          setHasCompletedOnboarding(onboardingCompleted);
          
          // Extract prefill data from user document
          if (!onboardingCompleted) {
            const dateOfBirth = userData.dateOfBirth;
            let parsedDate = null;
            
            if (dateOfBirth) {
              // Parse the date if it's a Firestore timestamp
              if (dateOfBirth.toDate) {
                parsedDate = dateOfBirth.toDate();
              } else if (typeof dateOfBirth === 'string') {
                parsedDate = new Date(dateOfBirth);
              }
            }
            
            setPrefillData({
              firstName: userData.firstName || '',
              lastName: userData.lastName || '',
              dateOfBirth: parsedDate,
              gender: userData.gender || 'unspecified',
              phoneNumber: userData.phoneNumber || ''
            });
            
            console.log("Setting prefill data:", {
              firstName: userData.firstName || '',
              lastName: userData.lastName || '',
              gender: userData.gender || 'unspecified',
            });
          }
          
          // Special handling for onboarding redirect page
          if (isOnboardingRedirectPage) {
            console.log("On onboarding redirect page, showing onboarding regardless of path skip");
            setShowOnboarding(!onboardingCompleted);
            return;
          }
          
          // Only show onboarding modal if onboarding is not completed
          // and we're not on a page that should skip the onboarding check
          if (!onboardingCompleted && !shouldSkip) {
            console.log("Setting showOnboarding to true");
            setShowOnboarding(true);
          } else {
            console.log("Setting showOnboarding to false");
            setShowOnboarding(false);
          }
          
          return;
        }
        
        console.log("User document not found in Firestore, trying cloud function...");
      } catch (firestoreError) {
        console.error("Error fetching from Firestore directly:", firestoreError);
        // Fall back to cloud function if direct Firestore access fails
      }
      
      // Use Cloud Function to get user data as fallback
      console.log("Calling getUserData cloud function for user:", currentUser.uid);
      const result = await functionsClient.callFunction('getUserData', { userId: currentUser.uid });
      const data = result.data as { 
        userData: {
          onboardingCompleted: boolean;
          firstName?: string;
          lastName?: string;
          dateOfBirth?: string | null;
          gender?: string;
          phoneNumber?: string;
        };
        success: boolean;
        message?: string;
      };
      console.log("getUserData response:", data);
      
      if (!data.success) {
        // If we get a 'not found' message, it means the user doesn't exist yet
        if (data.message === "User not found") {
          console.log("User not found in Firestore, showing onboarding");
          setHasCompletedOnboarding(false);
          setShowOnboarding(true);
          return;
        }
        
        throw new Error(data.message || 'Failed to fetch user data');
      }
      
      const userData = data.userData;
      
      if (!userData) {
        // If user document doesn't exist yet, assume onboarding not completed
        console.log("User data is null, showing onboarding");
        setHasCompletedOnboarding(false);
        setShowOnboarding(true);
        return;
      }
      
      // Check if onboarding has been completed
      const onboardingCompleted = userData.onboardingCompleted || false;
      
      console.log("User onboardingCompleted status:", onboardingCompleted);
      
      setHasCompletedOnboarding(onboardingCompleted);
      
      // Extract prefill data from user document
      if (!onboardingCompleted) {
        const dateOfBirth = userData.dateOfBirth;
        let parsedDate = null;
        
        if (dateOfBirth) {
          // Parse the date from the response
          parsedDate = new Date(dateOfBirth);
        }
        
        setPrefillData({
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          dateOfBirth: parsedDate,
          gender: userData.gender || 'unspecified',
          phoneNumber: userData.phoneNumber || ''
        });
        
        console.log("Setting prefill data:", {
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          gender: userData.gender || 'unspecified',
        });
      }
      
      // Special handling for onboarding redirect page
      if (isOnboardingRedirectPage) {
        console.log("On onboarding redirect page, showing onboarding regardless of path skip");
        setShowOnboarding(!onboardingCompleted);
        return;
      }
      
      // Only show onboarding modal if onboarding is not completed
      // and we're not on a page that should skip the onboarding check
      if (!onboardingCompleted && !shouldSkip) {
        console.log("Setting showOnboarding to true");
        setShowOnboarding(true);
      } else {
        console.log("Setting showOnboarding to false");
        setShowOnboarding(false);
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error)
      
      // Don't show the error toast for family tree if we're in onboarding
      // Only show generic error message about checking onboarding status
      if (!hasCompletedOnboarding) {
        toast({
          title: "Error",
          description: "There was an error checking your onboarding status. Please try again.",
          variant: "destructive",
        })
      }
    } finally {
      isCheckingRef.current = false
      setIsOnboardingLoading(false)
    }
  }, [currentUser, hasCompletedOnboarding, shouldSkip, toast, isOnboardingRedirectPage]);

  useEffect(() => {
    // Only check onboarding status if:
    // 1. User is authenticated and either email or phone is verified
    // 2. We're not already checking
    // 3. We're not on a skip path or public page (unless it's the onboarding redirect page)
    // 4. We haven't checked this user already or we need to re-check
    if (
      currentUser && 
      (currentUser.emailVerified || firestoreUser?.phoneNumberVerified) && 
      !isCheckingRef.current && 
      (!shouldSkip || isOnboardingRedirectPage) && 
      (!isPublicPage || isOnboardingRedirectPage) &&
      (lastCheckedUserIdRef.current !== currentUser.uid || isOnboardingRedirectPage)
    ) {
      console.log("Triggering onboarding check for user:", currentUser.uid);
      console.log("Email verified:", currentUser.emailVerified);
      console.log("Phone verified:", firestoreUser?.phoneNumberVerified);
      // Add a longer delay to ensure Firebase data is ready, especially for phone auth
      const timer = setTimeout(() => {
        console.log("Delayed check for onboarding completed");
        checkOnboardingStatus();
      }, 2000); // Increased from 1000ms to 2000ms
      
      return () => clearTimeout(timer);
    } else if (currentUser) {
      console.log("Skipping onboarding check for user:", currentUser.uid);
      console.log("Current user auth state:", {
        uid: currentUser.uid,
        emailVerified: currentUser.emailVerified,
        phoneNumber: currentUser.phoneNumber
      });
      console.log("Firestore user state:", {
        phoneNumberVerified: firestoreUser?.phoneNumberVerified,
        phoneNumber: firestoreUser?.phoneNumber,
        emailVerified: firestoreUser?.emailVerified
      });
      if (isCheckingRef.current) console.log("Reason: Already checking");
      if (shouldSkip && !isOnboardingRedirectPage) console.log("Reason: Should skip this path");
      if (isPublicPage && !isOnboardingRedirectPage) console.log("Reason: On a public page");
      if (lastCheckedUserIdRef.current === currentUser.uid && !isOnboardingRedirectPage) console.log("Reason: Already checked this user");
      if (!currentUser.emailVerified && !firestoreUser?.phoneNumberVerified) console.log("Reason: Neither email nor phone is verified");
    }
  }, [currentUser, firestoreUser, loading, pathname, checkOnboardingStatus, shouldSkip, isPublicPage, isOnboardingRedirectPage]);

  // Handle initial loading state when no user or auth loading is complete
  useEffect(() => {
    if (!loading && !currentUser) {
      setIsOnboardingLoading(false);
    }
  }, [loading, currentUser]);

  const handleOnboardingComplete = async (userData: {
    firstName: string
    lastName: string
    dateOfBirth: Date | undefined
    gender?: 'male' | 'female' | 'other' | 'unspecified'
  }) => {
    try {
      if (!currentUser) {
        throw new Error('User not authenticated')
      }

      // Using functionsClient directly, no need to check availability

      // Call the Cloud Function to complete onboarding
      // This will handle all database operations in one call
      console.log("🎯 Starting onboarding completion for user:", currentUser.uid);
      console.log("�� Onboarding data:", {
        userId: currentUser.uid,
        firstName: userData.firstName,
        lastName: userData.lastName,
        displayName: `${userData.firstName} ${userData.lastName}`,
        dateOfBirth: userData.dateOfBirth,
        gender: userData.gender || 'unspecified',
      });
      
      const response = await functionsClient.callFunction('completeOnboarding', {
        userId: currentUser.uid,
        firstName: userData.firstName,
        lastName: userData.lastName,
        displayName: `${userData.firstName} ${userData.lastName}`,
        dateOfBirth: userData.dateOfBirth,
        gender: userData.gender || 'unspecified',
      });
      
      console.log("✅ Onboarding completion response:", response);

      // Update local state
      console.log("🔄 Updating local onboarding state to completed");
      setHasCompletedOnboarding(true)
      setShowOnboarding(false)
      
      console.log("🎉 Onboarding state updated successfully", {
        hasCompletedOnboarding: true,
        showOnboarding: false
      });

      toast({
        title: "Onboarding completed!",
        description: "Your profile has been set up successfully.",
      })
    } catch (error) {
      console.error('❌ Error completing onboarding:', error)
      toast({
        title: "Error",
        description: "There was an error completing your onboarding. Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <OnboardingContext.Provider value={{ 
      showOnboarding, 
      completeOnboarding: handleOnboardingComplete,
      hasCompletedOnboarding,
      isOnboardingLoading
    }}>
      {children}
      {currentUser && showOnboarding && (
        <OnboardingForm
          isOpen={showOnboarding}
          onComplete={handleOnboardingComplete}
          userEmail={currentUser.email || undefined}
          prefillData={prefillData}
        />
      )}
    </OnboardingContext.Provider>
  )
}

export const useOnboarding = () => {
  const context = useContext(OnboardingContext)
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider')
  }
  return context
} 