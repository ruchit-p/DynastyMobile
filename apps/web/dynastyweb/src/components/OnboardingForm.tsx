"use client"

import type React from "react"

import { useState, useMemo, useEffect, forwardRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ChevronRight, TreePine } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import Image from "next/image"

// Custom DialogContent without close button
const DialogContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      {/* Close button removed */}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

interface OnboardingFormProps {
  isOpen: boolean
  onComplete: (userData: {
    firstName: string
    lastName: string
    dateOfBirth: Date | undefined
    gender?: 'male' | 'female' | 'other' | 'unspecified'
  }) => Promise<void>
  userEmail?: string
  prefillData?: {
    firstName?: string
    lastName?: string
    dateOfBirth?: Date | null
    gender?: string
    phoneNumber?: string
  } | null
}

export default function OnboardingForm({ isOpen, onComplete, userEmail, prefillData }: OnboardingFormProps) {
  const [firstName, setFirstName] = useState(prefillData?.firstName || "")
  const [lastName, setLastName] = useState(prefillData?.lastName || "")
  const [birthMonth, setBirthMonth] = useState<string>("")
  const [birthDay, setBirthDay] = useState<string>("")
  const [birthYear, setBirthYear] = useState<string>("")
  const [gender, setGender] = useState<string>(prefillData?.gender || "unspecified")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
  })
  const { toast } = useToast()

  // Set date of birth from prefillData if available
  useEffect(() => {
    if (prefillData?.dateOfBirth) {
      const date = new Date(prefillData.dateOfBirth);
      
      if (!isNaN(date.getTime())) {
        setBirthYear(date.getFullYear().toString());
        setBirthMonth((date.getMonth() + 1).toString());
        setBirthDay(date.getDate().toString());
      }
    }
  }, [prefillData]);

  const months = useMemo(() => [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ], [])

  const daysInMonth = useMemo(() => {
    if (!birthMonth || !birthYear) return 31

    const year = parseInt(birthYear)
    const month = parseInt(birthMonth)
    
    if (month === 2) {
      if ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) {
        return 29
      } else {
        return 28
      }
    }
    
    if ([4, 6, 9, 11].includes(month)) {
      return 30
    }
    
    return 31
  }, [birthMonth, birthYear])

  const days = useMemo(() => {
    const daysArray = []
    for (let i = 1; i <= daysInMonth; i++) {
      daysArray.push({ value: i.toString(), label: i.toString() })
    }
    return daysArray
  }, [daysInMonth])

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const yearsArray = []
    for (let i = currentYear; i >= 1900; i--) {
      yearsArray.push({ value: i.toString(), label: i.toString() })
    }
    return yearsArray
  }, [])

  const genderOptions = useMemo(() => [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
    { value: "unspecified", label: "Prefer not to say" },
  ], [])

  useEffect(() => {
    if (birthDay && parseInt(birthDay) > daysInMonth) {
      setBirthDay("")
    }
  }, [birthMonth, birthYear, birthDay, daysInMonth])

  const getDateOfBirth = (): Date | undefined => {
    if (!birthYear || !birthMonth || !birthDay) return undefined
    
    const date = new Date(
      parseInt(birthYear),
      parseInt(birthMonth) - 1,
      parseInt(birthDay)
    )
    return date
  }

  const validateForm = () => {
    const newErrors = {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gender: "",
    }
    let isValid = true

    if (!firstName.trim()) {
      newErrors.firstName = "First name is required"
      isValid = false
    }

    if (!lastName.trim()) {
      newErrors.lastName = "Last name is required"
      isValid = false
    }

    if (!birthYear || !birthMonth || !birthDay) {
      newErrors.dateOfBirth = "Complete date of birth is required"
      isValid = false
    } else {
      const dateOfBirth = getDateOfBirth()
      if (!dateOfBirth) {
        newErrors.dateOfBirth = "Invalid date of birth"
        isValid = false
        return isValid
      }
      
      const today = new Date()
      
      if (dateOfBirth > today) {
        newErrors.dateOfBirth = "Date of birth cannot be in the future"
        isValid = false
      }
      
      const maxAge = 120
      const oldestAllowed = new Date()
      oldestAllowed.setFullYear(today.getFullYear() - maxAge)
      
      if (dateOfBirth < oldestAllowed) {
        newErrors.dateOfBirth = `Date of birth cannot be more than ${maxAge} years ago`
        isValid = false
      }
    }

    if (!gender) {
      newErrors.gender = "Please select a gender option"
      isValid = false
    }

    setErrors(newErrors)
    return isValid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const dateOfBirth = getDateOfBirth()
      await onComplete({
        firstName,
        lastName,
        dateOfBirth,
        gender: gender as 'male' | 'female' | 'other' | 'unspecified',
      })
      
      // Show success toast message
      toast({
        title: "Account setup complete!",
        description: "Redirecting you to your family tree...",
        variant: "default",
      })
      
      // Add a small delay to ensure all data is properly created in Firestore
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Refresh the page to ensure new data is loaded properly
      window.location.href = "/family-tree"
    } catch (error) {
      console.error("Error saving user data:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}} modal>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden rounded-xl border-none shadow-xl transition-all">
        <div className="bg-gradient-to-r from-[#0A5C36] to-[#0C6A3E] text-white p-6 relative overflow-hidden">
          <div className="absolute -top-5 -right-5 w-40 h-40 opacity-10 animate-pulse">
            {/* Dynasty Logo */}
            <Image src="/dynasty.png" alt="Dynasty Logo" width={100} height={100} className="w-full h-full" priority style={{ height: 'auto' }} />
          </div>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">Welcome to Dynasty</DialogTitle>
            <DialogDescription className="text-white/80">
              Let&apos;s set up your profile to start building your family tree
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 bg-white">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="font-medium">First Name</Label>
                  <Input
                    id="firstName"
                    placeholder="Enter your first name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={cn(
                      "transition-all focus:outline-none focus:ring-2 focus:ring-[#0A5C36]/20", 
                      errors.firstName ? "border-red-500 focus:border-red-500" : "border-gray-200 focus:border-[#0A5C36]"
                    )}
                  />
                  {errors.firstName && (
                    <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="font-medium">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Enter your last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={cn(
                      "transition-all focus:outline-none focus:ring-2 focus:ring-[#0A5C36]/20",
                      errors.lastName ? "border-red-500 focus:border-red-500" : "border-gray-200 focus:border-[#0A5C36]"
                    )}
                  />
                  {errors.lastName && (
                    <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateOfBirth" className="font-medium">Date of Birth</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Select value={birthMonth} onValueChange={setBirthMonth}>
                    <SelectTrigger 
                      className={cn(
                        "transition-all focus:outline-none focus:ring-2 focus:ring-[#0A5C36]/20",
                        errors.dateOfBirth && !birthMonth ? "border-red-500" : "border-gray-200 focus:border-[#0A5C36]"
                      )}
                      tabIndex={0}
                    >
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="max-h-[240px]">
                      {months.map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select 
                    value={birthDay} 
                    onValueChange={setBirthDay}
                  >
                    <SelectTrigger 
                      className={cn(
                        "transition-all focus:outline-none focus:ring-2 focus:ring-[#0A5C36]/20",
                        errors.dateOfBirth && !birthDay ? "border-red-500" : "border-gray-200 focus:border-[#0A5C36]"
                      )}
                      tabIndex={0}
                    >
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="max-h-[240px]">
                      {days.map((day) => (
                        <SelectItem key={day.value} value={day.value}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={birthYear} onValueChange={setBirthYear}>
                    <SelectTrigger 
                      className={cn(
                        "transition-all focus:outline-none focus:ring-2 focus:ring-[#0A5C36]/20",
                        errors.dateOfBirth && !birthYear ? "border-red-500" : "border-gray-200 focus:border-[#0A5C36]"
                      )}
                      tabIndex={0}
                    >
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="max-h-[240px]">
                      {years.map((year) => (
                        <SelectItem key={year.value} value={year.value}>
                          {year.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {errors.dateOfBirth && (
                  <p className="text-xs text-red-500 mt-1">{errors.dateOfBirth}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender" className="font-medium">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger 
                    className={cn(
                      "transition-all focus:outline-none focus:ring-2 focus:ring-[#0A5C36]/20",
                      errors.gender ? "border-red-500" : "border-gray-200 focus:border-[#0A5C36]"
                    )}
                    tabIndex={0}
                  >
                    <SelectValue placeholder="Select your gender" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {genderOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.gender && (
                  <p className="text-xs text-red-500 mt-1">{errors.gender}</p>
                )}
              </div>
            </div>

            {userEmail && (
              <div className="rounded-md bg-[#F9FAFB] p-2 border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-[#0A5C36]/10 p-2 flex items-center justify-center">
                    <svg className="h-4 w-4 text-[#0A5C36]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div className="">
                    <p className="text-sm text-gray-600 leading-none pt-2 mt-1">{userEmail}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg bg-[#0A5C36]/5 p-4 border border-[#0A5C36]/10 shadow-sm">
              <div className="flex">
                <div className="flex-shrink-0">
                  <TreePine className="h-5 w-5 text-[#0A5C36]" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-[#0A5C36]">Your Family Tree</h3>
                  <div className="mt-2 text-sm text-[#0A5C36]/80">
                    <p>
                      This information will be used to create your node in your family tree. You can add more family members after completing this step.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="submit" 
              tabIndex={0}
              className="w-full py-6 bg-gradient-to-r from-[#0A5C36] to-[#0C6A3E] hover:from-[#094C2D] hover:to-[#0A5C36] border border-[#0A5C36]/20 transition-all shadow-md hover:shadow-lg text-white relative overflow-hidden group focus:outline-none focus:ring-2 focus:ring-[#0A5C36]/20"
              disabled={isSubmitting}
            >
              <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-[#C4A55C]/0 via-[#C4A55C]/30 to-[#C4A55C]/0 opacity-0 group-hover:opacity-100 transform -translate-x-full group-hover:translate-x-full transition-all duration-700"></span>
              <span className="relative flex items-center justify-center">
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Setting Up Your Account
                  </>
                ) : (
                  <>
                    Complete Setup
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 