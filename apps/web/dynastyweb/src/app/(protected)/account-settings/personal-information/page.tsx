"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Camera, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import Image from "next/image"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import ImageCropper from "@/components/ImageCropper"
import { uploadProfilePicture } from "@/utils/mediaUtils"
import { useCSRFClient } from "@/context/CSRFContext"

// MARK: - Helper Constants
const MONTHS = [
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
];

export default function PersonalInformationPage() {
  const { currentUser, firestoreUser, refreshFirestoreUser } = useAuth()
  const { toast } = useToast()
  const { csrfClient } = useCSRFClient()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newProfilePicture, setNewProfilePicture] = useState<File | null>(null)
  const [showCropModal, setShowCropModal] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [croppedImage, setCroppedImage] = useState<Blob | null>(null)
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    gender: ""
  })
  const [dobData, setDobData] = useState({
    day: "",
    month: "",
    year: ""
  })
  const [imageLoaded, setImageLoaded] = useState(false);

  // Generate arrays for days and years
  const getDaysInMonth = (month: number, year: number): number[] => {
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }

  const days = dobData.month && dobData.year 
    ? getDaysInMonth(parseInt(dobData.month), parseInt(dobData.year)) 
    : Array.from({ length: 31 }, (_, i) => i + 1);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

  // Format date from Firestore Date object to our day/month/year selections
  const formatDateForInputs = (date: Date | null | undefined) => {
    if (!date) return { day: "", month: "", year: "" };
    try {
      // Handle both native Date objects and Firestore Timestamp objects
      let jsDate;
      if (typeof date === 'object' && date !== null && 'toDate' in date && typeof date.toDate === 'function') {
        // If it's a Firestore Timestamp object
        jsDate = date.toDate();
      } else {
        // If it's already a Date or can be converted to one
        jsDate = date instanceof Date ? date : new Date(date);
      }
      
      return {
        day: jsDate.getDate().toString(),
        month: (jsDate.getMonth() + 1).toString(),
        year: jsDate.getFullYear().toString()
      };
    } catch (e) {
      console.error("Error formatting date:", e);
      return { day: "", month: "", year: "" };
    }
  };

  useEffect(() => {
    if (firestoreUser) {
      setFormData({
        firstName: firestoreUser.firstName,
        lastName: firestoreUser.lastName,
        phoneNumber: firestoreUser.phoneNumber || "",
        gender: firestoreUser.gender || ""
      })
      
      setDobData(formatDateForInputs(firestoreUser.dateOfBirth));
      
      // Reset image loaded state when firestoreUser changes
      // The Image component will handle setting it to true via onLoadingComplete
      setImageLoaded(false);
    }
  }, [firestoreUser])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleDobChange = (field: "day" | "month" | "year", value: string) => {
    setDobData((prev: {day: string, month: string, year: string}) => ({ ...prev, [field]: value }));
    
    // If month changed, make sure day is valid for the new month
    if (field === "month" || field === "year") {
      const newMonth = field === "month" ? parseInt(value) : parseInt(dobData.month);
      const newYear = field === "year" ? parseInt(value) : parseInt(dobData.year);
      
      if (newMonth && newYear) {
        const daysInNewMonth = new Date(newYear, newMonth, 0).getDate();
        const currentDay = parseInt(dobData.day);
        
        if (currentDay > daysInNewMonth) {
          setDobData((prev: {day: string, month: string, year: string}) => ({ ...prev, day: daysInNewMonth.toString() }));
        }
      }
    }
  };

  const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      // Create a temporary URL for the selected file
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      
      // Store the URL and show the crop modal
      setTempImageUrl(url);
      setShowCropModal(true);
    }
  }
  
  const handleCropComplete = (croppedBlob: Blob) => {
    // Store the cropped blob and close the modal
    setCroppedImage(croppedBlob);
    setShowCropModal(false);
    
    // Convert blob to File for preview
    const croppedFile = new File([croppedBlob], 'cropped-profile.jpg', { type: 'image/jpeg' });
    setNewProfilePicture(croppedFile);
    
    // Clean up the temporary URL
    if (tempImageUrl) {
      URL.revokeObjectURL(tempImageUrl);
    }
  }
  
  const handleCropCancel = () => {
    setShowCropModal(false);
    
    // Clean up the temporary URL
    if (tempImageUrl) {
      URL.revokeObjectURL(tempImageUrl);
      setTempImageUrl(null);
    }
  }

  const handleSave = async () => {
    if (!currentUser?.uid) return

    try {
      setIsSaving(true)

      let profilePictureUrl = firestoreUser?.profilePicture

      // Upload new profile picture if one was cropped and selected
      if (croppedImage) {
        try {
          // Use the standardized uploadProfilePicture function
          profilePictureUrl = await uploadProfilePicture(
            croppedImage,
            currentUser.uid,
            {
              onProgress: (progress) => {
                console.log(`Profile picture upload progress: ${progress}%`)
              },
              onError: (error) => {
                console.error("Profile picture upload error:", error)
                toast({
                  title: "Upload Error",
                  description: error.message || "Failed to upload profile picture",
                  variant: "destructive",
                })
              }
            }
          )
          
          console.log("Profile picture uploaded successfully:", profilePictureUrl)
          
          // Clean up the cropped image and new profile picture state to prevent memory leaks
          setCroppedImage(null)
          
          // Clean up any object URLs to prevent memory leaks
          if (newProfilePicture) {
            URL.revokeObjectURL(URL.createObjectURL(newProfilePicture))
            setNewProfilePicture(null)
          }
          setTempImageUrl(null)
        } catch (error) {
          console.error("Failed to upload profile picture:", error)
          toast({
            title: "Upload Error",
            description: "Failed to upload profile picture. Please try again.",
            variant: "destructive",
          })
          setIsSaving(false)
          return
        }
      }

      // Parse date of birth into Date object if all parts exist
      let dateOfBirth = null
      if (dobData.day && dobData.month && dobData.year) {
        // JavaScript months are 0-indexed, so subtract 1 from month
        dateOfBirth = new Date(
          parseInt(dobData.year),
          parseInt(dobData.month) - 1,
          parseInt(dobData.day)
        )
      }

      // Prepare the update data
      const updateData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneNumber: formData.phoneNumber || null,
        gender: formData.gender,
        dateOfBirth: dateOfBirth,
        profilePicture: profilePictureUrl,
      }

      // Call the Firebase function to update the user profile
      await csrfClient.callFunction('updateUserProfile', {
        userId: currentUser.uid,
        updates: updateData
      })

      // Immediately refresh user data in context to update UI across all components
      await refreshFirestoreUser()
      
      // Reset UI state
      setIsEditing(false)
      
      toast({
        title: "Profile updated",
        description: "Your personal information has been saved successfully.",
        variant: "default",
      })
    } catch (error) {
      console.error("Error updating profile:", error)
      toast({
        title: "Update failed",
        description: "There was a problem updating your profile. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (!firestoreUser) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0A5C36]" />
      </div>
    )
  }

  // Format DOB for display in read-only mode
  const formatDobForDisplay = () => {
    if (!dobData.day || !dobData.month || !dobData.year) return "Not set";
    
    const monthName = MONTHS.find(m => m.value === dobData.month)?.label || "";
    return `${monthName} ${dobData.day}, ${dobData.year}`;
  };

  // Format phone number for display
  const formatPhoneNumber = (phone: string | null | undefined) => {
    if (!phone) return "";
    // Simple formatting for international phone numbers
    return phone;
  };

  return (
    <>
      <h1 className="text-2xl font-bold mb-6 text-[#0A5C36]">Personal Information</h1>
      
      <div className="space-y-6">
        {/* Profile picture section */}
        <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6 pb-6 border-b border-gray-200">
          <div className="relative">
            <div className="relative h-24 w-24 rounded-full overflow-hidden border-4 border-[#F9FAFB]">
              <Image
                src={newProfilePicture ? URL.createObjectURL(newProfilePicture) : firestoreUser.profilePicture || "/avatar.svg"}
                alt="Profile"
                fill
                className="object-cover"
                priority={true}
                unoptimized={Boolean(
                  !newProfilePicture && 
                  firestoreUser.profilePicture && (
                    firestoreUser.profilePicture.includes('firebasestorage.googleapis.com') || 
                    firestoreUser.profilePicture.includes('dynasty-eba63.firebasestorage.app')
                  )
                )}
                onLoadingComplete={() => setImageLoaded(true)}
              />
              {!imageLoaded && !newProfilePicture && firestoreUser.profilePicture && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              )}
            </div>
            {isEditing && (
              <div className="absolute bottom-0 right-0">
                <label
                  htmlFor="profile-upload"
                  className="flex items-center justify-center h-8 w-8 rounded-full bg-[#0A5C36] text-white cursor-pointer shadow-md"
                >
                  <Camera className="h-4 w-4" />
                  <input
                    id="profile-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleProfilePictureChange}
                  />
                </label>
              </div>
            )}
          </div>
          
          {/* Image Cropper Dialog */}
          <Dialog open={showCropModal} onOpenChange={setShowCropModal}>
            <DialogContent className="sm:max-w-md md:max-w-xl max-h-[90vh] p-0 flex flex-col items-center justify-center overflow-hidden w-full">
              {tempImageUrl && (
                <ImageCropper
                  imageSrc={tempImageUrl}
                  onCropComplete={handleCropComplete}
                  onCancel={handleCropCancel}
                  aspectRatio={1} // 1:1 aspect ratio for circle
                  title="Crop Profile Picture"
                  circleOverlay={true} // Enable circular overlay
                />
              )}
            </DialogContent>
          </Dialog>
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-1">
              {firestoreUser.firstName} {firestoreUser.lastName}
            </h2>
            {firestoreUser.email ? (
              <p className="text-gray-500 mb-4">{firestoreUser.email}</p>
            ) : firestoreUser.phoneNumber ? (
              <p className="text-gray-500 mb-4">{formatPhoneNumber(firestoreUser.phoneNumber)}</p>
            ) : (
              <p className="text-gray-500 mb-4">No contact information</p>
            )}
            <p className="text-sm text-gray-600">
              Your profile picture and personal details will be visible to family members.
            </p>
          </div>
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                disabled={!isEditing}
              />
            </div>
            <div>
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                disabled={!isEditing}
              />
            </div>
          </div>
          
          {/* Email field - only show if user has an email */}
          {firestoreUser.email !== undefined && (
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={firestoreUser.email || ""}
                disabled={true} // Email cannot be changed
                className="bg-gray-50"
              />
              {firestoreUser.emailVerified && firestoreUser.email ? (
                <span className="text-xs text-emerald-600 mt-1 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Verified
                </span>
              ) : firestoreUser.email ? (
                <span className="text-xs text-amber-600 mt-1 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Not verified
                </span>
              ) : null}
            </div>
          )}
          
          {/* Phone number field - always show, but make it more prominent when there's no email */}
          <div>
            <Label htmlFor="phoneNumber" className={!firestoreUser.email ? "font-semibold text-[#0A5C36]" : ""}>
              Phone Number {!firestoreUser.email && "(Primary Contact)"}
            </Label>
            <Input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              value={formData.phoneNumber || ""}
              onChange={handleInputChange}
              disabled={!isEditing}
              className={!firestoreUser.email ? "border-[#0A5C36]" : ""}
            />
            {firestoreUser.phoneNumberVerified && firestoreUser.phoneNumber ? (
              <span className="text-xs text-emerald-600 mt-1 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Verified
              </span>
            ) : null}
          </div>
          
          {/* Date of Birth - three dropdown fields */}
          <div>
            <Label htmlFor="dateOfBirth">Date of Birth</Label>
            {isEditing ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Select 
                    value={dobData.month} 
                    onValueChange={(value) => handleDobChange("month", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select 
                    value={dobData.day} 
                    onValueChange={(value) => handleDobChange("day", value)}
                    disabled={!dobData.month || !dobData.year}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                      {days.map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select 
                    value={dobData.year} 
                    onValueChange={(value) => handleDobChange("year", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <Input
                value={formatDobForDisplay()}
                disabled={true}
              />
            )}
          </div>
          
          <div>
            <Label htmlFor="gender">Gender</Label>
            {isEditing ? (
              <Select 
                value={formData.gender} 
                onValueChange={(value) => handleSelectChange("gender", value)}
                disabled={!isEditing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select your gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non-binary">Non-binary</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="gender"
                name="gender"
                value={formData.gender === "prefer-not-to-say" 
                  ? "Prefer not to say" 
                  : formData.gender.charAt(0).toUpperCase() + formData.gender.slice(1) || ""}
                disabled={true}
              />
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-4">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button variant="gold" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </>
          ) : (
            <Button variant="gold" onClick={() => setIsEditing(true)}>Edit Profile</Button>
          )}
        </div>
      </div>
    </>
  )
} 