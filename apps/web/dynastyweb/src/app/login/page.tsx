"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { loginFormSchema, type LoginFormData, validateFormData } from '@/lib/validation';
import { GoogleSignInButton } from '@/components/ui/google-sign-in-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CountryDropdown, type Country } from '@/components/CountryDropdown';

export default function LoginPage() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
  });
  const [phoneFormData, setPhoneFormData] = useState({
    phoneNumber: "",
    verificationCode: "",
  });
  const [selectedCountry, setSelectedCountry] = useState<Country | undefined>(undefined);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [phoneErrors, setPhoneErrors] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isPhoneLoading, setIsPhoneLoading] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [googleRedirectHandled, setGoogleRedirectHandled] = useState(false);
  const router = useRouter();
  const { signIn, signInWithGoogle, signInWithPhone, confirmPhoneSignIn, currentUser, firestoreUser } = useAuth();
  const { toast } = useToast();

  // Add effect to handle post-login navigation
  useEffect(() => {
    if (currentUser && !googleRedirectHandled) {
      // Check if the user is verified through phone or email
      if (!currentUser.emailVerified && !firestoreUser?.phoneNumberVerified) {
        toast({
          title: "Email verification required",
          description: "Please verify your email address to continue.",
        });
        router.push('/verify-email');
      } else {
        // For verified users, redirect to family tree
        // The OnboardingContext will handle showing onboarding modal if needed
        router.push('/family-tree');
      }
    }
  }, [currentUser, firestoreUser, router, toast, googleRedirectHandled]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPhoneFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (phoneErrors[name]) {
      setPhoneErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleCountryChange = (country: Country) => {
    setSelectedCountry(country);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    // Validate form data
    const validation = validateFormData(loginFormSchema, formData);
    if (!validation.success) {
      const newErrors: { [key: string]: string } = {};
      validation.errors?.forEach((error) => {
        newErrors[error.field] = error.message;
      });
      setErrors(newErrors);
      setIsLoading(false);
      return;
    }

    try {
      await signIn(formData.email, formData.password);
      toast({
        title: "Welcome back!",
        description: "You have successfully logged in.",
      });
    } catch (error) {
      console.error("Login error:", error);
      
      // Handle Firebase-specific authentication errors with user-friendly messages
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        const errorCode = errorMessage.includes('auth/') 
          ? errorMessage.split('auth/')[1].split(')')[0].trim() 
          : '';
        
        switch (errorCode) {
          case 'invalid-credential':
            toast({
              title: "Invalid Credentials",
              description: "The email or password you entered is incorrect. Please try again.",
              variant: "destructive",
            });
            break;
          case 'user-not-found':
            toast({
              title: "User not found",
              description: "No account exists with this email address. Please check your email or create a new account.",
              variant: "destructive",
            });
            break;
          case 'wrong-password':
            toast({
              title: "Invalid Credentials",
              description: "The email or password you entered is incorrect. Please try again.",
              variant: "destructive",
            });
            break;
          case 'too-many-requests':
            toast({
              title: "Too many attempts",
              description: "Access to this account has been temporarily disabled due to many failed login attempts. Please try again later.",
              variant: "destructive",
            });
            break;
          case 'user-disabled':
            toast({
              title: "Account disabled",
              description: "This account has been disabled. Please contact support for help.",
              variant: "destructive",
            });
            break;
          default:
            toast({
              title: "Login failed",
              description: "Unable to sign in. Please check your credentials and try again.",
              variant: "destructive",
            });
        }
      } else {
        // Fallback for non-Error objects
        toast({
          title: "Login error",
          description: "An unexpected error occurred. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendVerificationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPhoneLoading(true);
    setPhoneErrors({});

    // Basic validation
    if (!phoneFormData.phoneNumber) {
      setPhoneErrors({ phoneNumber: "Phone number is required" });
      setIsPhoneLoading(false);
      return;
    }

    if (!selectedCountry || !selectedCountry.countryCallingCodes[0]) {
      setPhoneErrors({ phoneNumber: "Please select a country code" });
      setIsPhoneLoading(false);
      return;
    }

    // Format phone number with the selected country code
    let formattedPhoneNumber = phoneFormData.phoneNumber;
    
    // Remove any existing leading + or country code
    formattedPhoneNumber = formattedPhoneNumber.replace(/^\+/, '').trim();
    
    // If number starts with the country code without +, remove it to avoid duplication
    const countryCodeWithoutPlus = selectedCountry.countryCallingCodes[0].replace(/^\+/, '');
    if (formattedPhoneNumber.startsWith(countryCodeWithoutPlus)) {
      formattedPhoneNumber = formattedPhoneNumber.substring(countryCodeWithoutPlus.length).trim();
    }
    
    // Apply the selected country code
    formattedPhoneNumber = `${selectedCountry.countryCallingCodes[0]}${formattedPhoneNumber}`;

    try {
      // Create invisible reCAPTCHA and send verification code
      const result = await signInWithPhone(formattedPhoneNumber);
      setVerificationId(result.verificationId);
      setCodeSent(true);
      toast({
        title: "Verification code sent",
        description: "Please check your phone for the verification code.",
      });
    } catch (error) {
      console.error("Error sending verification code:", error);
      toast({
        title: "Failed to send code",
        description: "Unable to send verification code. Please check your phone number and try again.",
        variant: "destructive",
      });
    } finally {
      setIsPhoneLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPhoneLoading(true);
    setPhoneErrors({});

    // Basic validation
    if (!phoneFormData.verificationCode) {
      setPhoneErrors({ verificationCode: "Verification code is required" });
      setIsPhoneLoading(false);
      return;
    }

    try {
      // Confirm the verification code
      const isNewUser = await confirmPhoneSignIn(verificationId!, phoneFormData.verificationCode);
      
      toast({
        title: "Welcome!",
        description: "You have successfully signed in with your phone number.",
      });

      // For new users, redirect to onboarding
      if (isNewUser) {
        console.log("New phone user detected, ensuring onboarding is checked");
        setGoogleRedirectHandled(true); // Prevent the useEffect from overriding this redirect
        router.push('/onboarding-redirect');
      } else {
        // For existing users, redirect directly to family tree
        router.push('/family-tree');
      }
    } catch (error) {
      console.error("Error verifying code:", error);
      toast({
        title: "Verification failed",
        description: "The verification code is invalid or has expired. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPhoneLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      // Check if this is a new Google user or a user who hasn't completed onboarding
      const isNewUser = await signInWithGoogle();
      
      // Only show success toast if no errors occurred
      toast({
        title: "Welcome!",
        description: "You have successfully signed in with Google.",
      });
      
      // For new users, redirect to onboarding-redirect page to ensure the onboarding form shows
      if (isNewUser) {
        console.log("New Google user detected, ensuring onboarding is checked");
        setGoogleRedirectHandled(true); // Prevent the useEffect from overriding this redirect
        router.push('/onboarding-redirect');
      }
      // For existing users with completed onboarding, the useEffect at the top of 
      // this component will handle the redirection based on email verification status
    } catch (error: any) {
      console.error("Google login error:", error);
      
      // Handle specific Firebase Auth errors
      let errorMessage = "Unable to sign in with Google. Please try again.";
      
      if (error?.code) {
        switch (error.code) {
          case 'auth/popup-closed-by-user':
            errorMessage = "Sign-in was cancelled. Please try again.";
            break;
          case 'auth/popup-blocked':
            errorMessage = "Popup was blocked by your browser. Please allow popups and try again.";
            break;
          case 'auth/cancelled-popup-request':
            errorMessage = "Another sign-in request is already in progress.";
            break;
          case 'auth/account-exists-with-different-credential':
            errorMessage = "An account already exists with the same email address but different sign-in credentials.";
            break;
          case 'auth/network-request-failed':
            errorMessage = "Network error. Please check your connection and try again.";
            break;
          default:
            // For internal Firebase errors that don't prevent authentication,
            // check if user was actually signed in despite the error
            if (error.message?.includes('internal') && !error.message?.includes('failed')) {
              console.warn('Google Sign-in had internal warning but may have succeeded');
              // Don't show error toast for internal warnings - let the auth state change handle it
              return;
            }
        }
      }
      
      toast({
        title: "Sign-in Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/">
          <Image
            src="/dynasty.png"
            alt="Dynasty Logo"
            width={60}
            height={60}
            className="mx-auto"
            priority
            style={{ height: 'auto' }}
          />
        </Link>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Sign In to Dynasty
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-[#0A5C36] hover:text-[#0A5C36]/80"
          >
            Create a New Account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Hidden recaptcha container for phone auth */}
          <div id="recaptcha-container"></div>
          
          <Tabs defaultValue="email" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="phone">Phone</TabsTrigger>
            </TabsList>
            
            <TabsContent value="email">
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <div className="mt-1">
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className={errors.email ? "border-red-500" : ""}
                    />
                    {errors.email && (
                      <p className="mt-1 text-xs text-red-500">{errors.email}</p>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="mt-1">
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className={errors.password ? "border-red-500" : ""}
                    />
                    {errors.password && (
                      <p className="mt-1 text-xs text-red-500">{errors.password}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <div className="text-sm">
                    <Link
                      href="/forgot-password"
                      className="font-medium text-[#0A5C36] hover:text-[#0A5C36]/80"
                    >
                      Forgot Your Password?
                    </Link>
                  </div>
                </div>

                <div>
                  <Button
                    type="submit"
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#0A5C36] hover:bg-[#0A5C36]/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0A5C36]"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>Signing In...</span>
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>
            
            <TabsContent value="phone">
              <form className="space-y-6" onSubmit={codeSent ? handleVerifyCode : handleSendVerificationCode}>
                {!codeSent ? (
                  <div>
                    <Label htmlFor="login-phoneNumber-input">Phone Number</Label>
                    <div className="mt-1 flex gap-2 items-center">
                      <CountryDropdown
                        slim={true}
                        onChange={handleCountryChange}
                        placeholder="Country"
                        className="shrink-0"
                      />
                      <Input
                        id="login-phoneNumber-input"
                        name="phoneNumber"
                        type="tel"
                        placeholder="(555) 555-5555"
                        autoComplete="tel"
                        required
                        value={phoneFormData.phoneNumber}
                        onChange={handlePhoneChange}
                        className={`flex-1 h-10 ${phoneErrors.phoneNumber ? "border-red-500" : ""}`}
                      />
                    </div>
                    {phoneErrors.phoneNumber && (
                      <p className="mt-1 text-xs text-red-500">{phoneErrors.phoneNumber}</p>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      We&apos;ll send a verification code to this number.
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="login-verificationCode-input">Verification Code</Label>
                    <div className="mt-1">
                      <Input
                        id="login-verificationCode-input"
                        name="verificationCode"
                        type="text"
                        placeholder="123456"
                        required
                        value={phoneFormData.verificationCode}
                        onChange={handlePhoneChange}
                        className={`h-10 ${phoneErrors.verificationCode ? "border-red-500" : ""}`}
                      />
                      {phoneErrors.verificationCode && (
                        <p className="mt-1 text-xs text-red-500">{phoneErrors.verificationCode}</p>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Enter the verification code sent to your phone.
                    </p>
                  </div>
                )}

                <div>
                  <Button
                    id="login-phone-submit-button"
                    type="submit"
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#0A5C36] hover:bg-[#0A5C36]/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0A5C36]"
                    disabled={isPhoneLoading}
                  >
                    {isPhoneLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>{codeSent ? "Verifying..." : "Sending Code..."}</span>
                      </>
                    ) : (
                      codeSent ? "Verify Code" : "Send Verification Code"
                    )}
                  </Button>
                </div>
                
                {codeSent && (
                  <div className="text-center">
                    <button
                      id="login-change-phone-button"
                      type="button"
                      onClick={() => setCodeSent(false)}
                      className="text-sm text-[#0A5C36] hover:text-[#0A5C36]/80"
                    >
                      Change phone number
                    </button>
                  </div>
                )}
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="mt-6">
              <GoogleSignInButton
                onClick={handleGoogleSignIn}
                loading={isGoogleLoading}
                label="Sign in with Google"
              />
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-gray-500">
            By signing in, you agree to our{" "}
            <Link href="/terms" className="text-[#0A5C36] hover:text-[#0A5C36]/80">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-[#0A5C36] hover:text-[#0A5C36]/80">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 