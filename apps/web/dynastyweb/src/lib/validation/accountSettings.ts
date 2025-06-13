import { z } from "zod";

// Personal Information validation schema
export const personalInfoSchema = z.object({
  firstName: z.string()
    .min(1, "First name is required")
    .max(50, "First name must be less than 50 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters, spaces, hyphens, and apostrophes"),
  
  lastName: z.string()
    .min(1, "Last name is required")
    .max(50, "Last name must be less than 50 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters, spaces, hyphens, and apostrophes"),
  
  phoneNumber: z.string()
    .optional()
    .refine((val) => !val || /^[\d\s\-\(\)\+]+$/.test(val), {
      message: "Invalid phone number format"
    }),
  
  dateOfBirth: z.object({
    month: z.string().optional(),
    day: z.string().optional(),
    year: z.string().optional()
  }).refine((dob) => {
    if (!dob.month || !dob.day || !dob.year) return true; // All optional
    
    const month = parseInt(dob.month);
    const day = parseInt(dob.day);
    const year = parseInt(dob.year);
    
    // Validate date
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && 
           date.getMonth() === month - 1 && 
           date.getDate() === day;
  }, "Invalid date"),
  
  gender: z.enum(["male", "female", "non-binary", "prefer-not-to-say", ""])
    .optional()
});

// Notification settings validation schema
export const notificationSettingsSchema = z.object({
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  newMessageEnabled: z.boolean(),
  friendRequestsEnabled: z.boolean(),
  eventRemindersEnabled: z.boolean()
});

// Profile picture validation
export const profilePictureSchema = z.object({
  file: z.instanceof(File)
    .refine((file) => file.size <= 5 * 1024 * 1024, "File size must be less than 5MB")
    .refine((file) => {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      return validTypes.includes(file.type);
    }, "File must be a valid image (JPEG, PNG, or WebP)")
});

// Privacy settings validation schema
export const privacySettingsSchema = z.object({
  profileVisibility: z.enum(["public", "family", "private"]),
  showEmail: z.boolean(),
  showPhoneNumber: z.boolean(),
  showDateOfBirth: z.boolean(),
  allowFamilyInvites: z.boolean()
});

// Account management validation schema
export const accountManagementSchema = z.object({
  twoFactorEnabled: z.boolean(),
  sessionTimeout: z.number().min(5).max(120), // minutes
  loginAlerts: z.boolean(),
  dataExportEnabled: z.boolean()
});