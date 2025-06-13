"use client"

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { initialSignupFormSchema, type InitialSignupFormData, validateFormData } from '@/lib/validation';
import { GoogleSignInButton } from '@/components/ui/google-sign-in-button';
import { AppleSignInButton } from '@/components/ui/apple-sign-in-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CountryDropdown, type Country } from '@/components/CountryDropdown';
import { VerificationCodeInput } from '@/components/ui/verification-code-input';

export default function SignupPage() {
  const [formData, setFormData] = useState<InitialSignupFormData>({
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
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isPhoneLoading, setIsPhoneLoading] = useState(false);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [showAccountExistsModal, setShowAccountExistsModal] = useState(false);
  const router = useRouter();
  const { signUp, signInWithGoogle, signInWithApple, signInWithPhone, confirmPhoneSignIn, refreshFirestoreUser } = useAuth();
  const { toast } = useToast();

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

  const handleVerificationCodeChange = (value: string) => {
    setPhoneFormData((prev) => ({ ...prev, verificationCode: value }));
    // Clear error when user starts typing
    if (phoneErrors.verificationCode) {
      setPhoneErrors((prev) => ({ ...prev, verificationCode: "" }));
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
    const validation = validateFormData(initialSignupFormSchema, formData);
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
      await signUp(
        formData.email,
        formData.password
      );
      toast({
        title: "Account created!",
        description: "Please check your email to verify your account.",
      });
      router.push('/verify-email');
    } catch (error) {
      console.error("Signup error:", error);
      
      // Handle Firebase-specific authentication errors with user-friendly messages
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        const errorCode = errorMessage.includes('auth/') 
          ? errorMessage.split('auth/')[1].split(')')[0].trim() 
          : '';
        
        // Check if the error contains "already exists" text or has the already-exists code
        if (errorCode === 'email-already-in-use' || 
            errorMessage.includes('already exists') || 
            errorMessage.includes('already-exists')) {
          setShowAccountExistsModal(true);
          return; // Return early to prevent the generic toast from showing
        }
        
        // Handle other error types
        switch (errorCode) {
          case 'invalid-email':
            toast({
              title: "Invalid email",
              description: "Please enter a valid email address.",
              variant: "destructive",
            });
            break;
          case 'weak-password':
            toast({
              title: "Weak password",
              description: "Your password is too weak. Please use a stronger password.",
              variant: "destructive",
            });
            break;
          default:
            // Check JSON error object if it exists
            try {
              const errorObj = JSON.parse(errorMessage);
              if (errorObj.code === 'already-exists') {
                setShowAccountExistsModal(true);
                return; // Return early to prevent the generic toast from showing
              }
            } catch {
              // Not a JSON error, continue with default handling
            }
            
            toast({
              title: "Signup failed",
              description: "Unable to create your account. Please try again.",
              variant: "destructive",
            });
        }
      } else {
        // Fallback for non-Error objects
        toast({
          title: "Signup error",
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
        description: "You have successfully signed up with your phone number.",
      });

      // Add additional delay and force refresh for phone auth to ensure data is properly synced
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Force refresh of auth context user data
      if (refreshFirestoreUser) {
        await refreshFirestoreUser();
      }

      // For new users, redirect to onboarding via onboarding-redirect page
      if (isNewUser) {
        console.log("New phone user detected, redirecting to onboarding");
        router.push('/onboarding-redirect');
      } else {
        // For existing users
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
      const isNewUser = await signInWithGoogle();
      toast({
        title: "Welcome!",
        description: "You have successfully signed up with Google.",
      });
      
      // For new users, redirect to onboarding
      if (isNewUser) {
        router.push('/onboarding-redirect');
      } else {
        router.push('/family-tree');
      }
    } catch (error) {
      console.error("Google signup error:", error);
      toast({
        title: "Sign-up Failed",
        description: "Unable to sign up with Google. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    try {
      const isNewUser = await signInWithApple();
      toast({
        title: "Welcome!",
        description: "You have successfully signed up with Apple.",
      });
      
      // For new users, redirect to onboarding
      if (isNewUser) {
        router.push('/onboarding-redirect');
      } else {
        router.push('/family-tree');
      }
    } catch (error) {
      console.error("Apple signup error:", error);
      toast({
        title: "Sign-up Failed",
        description: "Unable to sign up with Apple. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAppleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {showAccountExistsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Account Already Exists</h3>
            <p className="text-gray-600 mb-6">
              An account with this email already exists. Please sign in with your existing credentials.
            </p>
            <div className="flex flex-col space-y-3">
              <Button
                onClick={() => router.push('/login')}
                className="w-full bg-[#0A5C36] hover:bg-[#0A5C36]/80"
              >
                Go to Sign In
              </Button>
              <Button
                onClick={() => setShowAccountExistsModal(false)}
                variant="ghost"
                className="w-full"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}
      
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
          Create Your Account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-[#0A5C36] hover:text-[#0A5C36]/80"
          >
            Sign In
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
                      autoComplete="new-password"
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

                <div>
                  <Button
                    type="submit"
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#0A5C36] hover:bg-[#0A5C36]/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0A5C36]"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>Creating Account...</span>
                      </>
                    ) : (
                      "Create Account"
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>
            
            <TabsContent value="phone">
              <form className="space-y-6" onSubmit={codeSent ? handleVerifyCode : handleSendVerificationCode}>
                {!codeSent ? (
                  <div>
                    <Label htmlFor="phoneNumber-input">Phone Number</Label>
                    <div className="mt-1 flex gap-2 items-center">
                      <CountryDropdown
                        slim={true}
                        onChange={handleCountryChange}
                        placeholder="Country"
                        className="shrink-0"
                      />
                      <Input
                        id="phoneNumber-input"
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
                    <Label htmlFor="verificationCode-input">Verification Code</Label>
                    <div className="mt-1">
                      <VerificationCodeInput
                        length={6}
                        value={phoneFormData.verificationCode}
                        onChange={handleVerificationCodeChange}
                        error={!!phoneErrors.verificationCode}
                        className="justify-center"
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
                    id="phone-submit-button"
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
                      id="change-phone-button"
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

            <div className="mt-6 space-y-3">
              <GoogleSignInButton
                onClick={handleGoogleSignIn}
                loading={isGoogleLoading}
                label="Sign up with Google"
              />
              <AppleSignInButton
                onClick={handleAppleSignIn}
                loading={isAppleLoading}
                label="Sign up with Apple"
              />
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-gray-500">
            By signing up, you agree to our{" "}
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