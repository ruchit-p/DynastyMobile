'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useOnboarding } from '@/context/OnboardingContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, firestoreUser } = useAuth();
  const { hasCompletedOnboarding } = useOnboarding();
  const router = useRouter();
  const { toast } = useToast();
  const notificationShown = useRef(false);

  useEffect(() => {
    if (!loading) {
      if (!currentUser) {
        router.push('/login');
        return;
      } 
      
      // For phone-verified users, we need to be more patient with firestoreUser loading
      // but we shouldn't wait forever
      if (currentUser && !firestoreUser) {
        console.log("ProtectedRoute: Waiting for firestoreUser to load...");
        
        // If user has a phone number, give more time for phone verification data to sync
        if (currentUser.phoneNumber) {
          console.log("ProtectedRoute: User has phone number, giving extra time for verification sync");
          
          // Set a reasonable timeout - don't wait forever
          const timeout = setTimeout(() => {
            console.log("ProtectedRoute: Timeout waiting for firestoreUser, checking phone verification");
            
            // If we have a phone number and the user exists in Firebase Auth,
            // we can proceed even if firestoreUser hasn't loaded yet
            if (currentUser.phoneNumber) {
              console.log("ProtectedRoute: Proceeding with phone-verified user even without firestoreUser");
              // Don't return here - let the verification check below handle it
            }
          }, 5000); // Wait max 5 seconds
          
          return () => clearTimeout(timeout);
        }
        
        return;
      }
      
      // Check if user has either email OR phone verification
      const hasEmailVerification = currentUser.emailVerified;
      const hasPhoneVerification = firestoreUser?.phoneNumberVerified;
      
      // Special case: if user has a phone number but firestoreUser is still null,
      // assume they're phone verified (this handles the race condition)
      const likelyPhoneVerified = currentUser.phoneNumber && !firestoreUser;
      
      console.log("ProtectedRoute: Verification check", {
        hasEmailVerification,
        hasPhoneVerification,
        likelyPhoneVerified,
        phoneNumber: currentUser.phoneNumber,
        firestoreUserLoaded: !!firestoreUser
      });
      
      // Only redirect to verify-email if NONE of the verification methods are satisfied
      if (!hasEmailVerification && !hasPhoneVerification && !likelyPhoneVerified && !notificationShown.current) {
        notificationShown.current = true;
        
        toast({
          title: "Verification required",
          description: "Please complete verification to access this page.",
          variant: "destructive",
        });
        router.push('/verify-email');
      }
    }
  }, [currentUser, firestoreUser, loading, router, toast]);

  // Show loading spinner while loading or waiting for firestoreUser (with timeout for phone users)
  if (loading || (currentUser && !firestoreUser && !currentUser.phoneNumber)) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0A5C36]"></div>
      </div>
    );
  }

  // Don't render children if user is not authenticated
  if (!currentUser) {
    return null;
  }

  // Check verification status (email OR phone must be verified OR user has phone number)
  const hasEmailVerification = currentUser.emailVerified;
  const hasPhoneVerification = firestoreUser?.phoneNumberVerified;
  const likelyPhoneVerified = currentUser.phoneNumber && !firestoreUser;
  
  if (!hasEmailVerification && !hasPhoneVerification && !likelyPhoneVerified) {
    return null;
  }

  // If we're showing family tree errors and user hasn't completed onboarding,
  // those errors should be suppressed since the family tree document doesn't exist yet
  if (!hasCompletedOnboarding) {
    // We're in onboarding flow, render the children and let onboarding handle it
    return <>{children}</>;
  }

  return <>{children}</>;
} 