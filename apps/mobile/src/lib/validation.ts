import { z } from 'zod';

// Email validation (RFC 5322 standard)
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

// Password validation with strength requirements
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Phone number validation (international format)
export const phoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .regex(/^\+?[1-9]\d{9,14}$/, 'Please enter a valid phone number');

// Name validation
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .regex(/^[a-zA-Z\s\-']+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes');

// Date of birth validation (must be at least 13 years old)
export const dateOfBirthSchema = z
  .date()
  .refine((date) => {
    const age = new Date().getFullYear() - date.getFullYear();
    return age >= 13;
  }, 'You must be at least 13 years old')
  .refine((date) => {
    const age = new Date().getFullYear() - date.getFullYear();
    return age <= 150;
  }, 'Please enter a valid date of birth');

// Gender validation
export const genderSchema = z.enum(['male', 'female', 'other'], {
  errorMap: () => ({ message: 'Please select a gender' }),
});

// Form schemas
export const loginFormSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const signupFormSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const profileSetupSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  dateOfBirth: dateOfBirthSchema.optional(),
  gender: genderSchema.optional(),
  phoneNumber: phoneSchema.optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const phoneSignInSchema = z.object({
  phoneNumber: phoneSchema,
});

export const verifyOtpSchema = z.object({
  code: z.string().length(6, 'Verification code must be 6 digits').regex(/^\d+$/, 'Code must contain only numbers'),
});

// Event validation schemas
export const eventTitleSchema = z
  .string()
  .trim()
  .min(3, 'Event title must be at least 3 characters')
  .max(100, 'Event title must be less than 100 characters');

export const eventDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)');

export const eventTimeSchema = z
  .string()
  .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)');

export const eventLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(1, 'Address is required').trim(),
});

export const virtualLinkSchema = z
  .string()
  .url('Please enter a valid URL')
  .trim();

export const createEventSchema = z.object({
  title: eventTitleSchema,
  description: z.string().optional(),
  eventDate: eventDateSchema,
  endDate: eventDateSchema.optional(),
  startTime: eventTimeSchema.optional(),
  endTime: eventTimeSchema.optional(),
  isVirtual: z.boolean(),
  location: eventLocationSchema.optional(),
  virtualLink: virtualLinkSchema.optional(),
  privacy: z.enum(['public', 'family_tree', 'invite_only']),
  requireRsvp: z.boolean(),
  allowGuestPlusOne: z.boolean(),
  rsvpDeadline: eventDateSchema.optional(),
}).refine((data) => {
  if (data.endDate && data.eventDate) {
    return data.endDate >= data.eventDate;
  }
  return true;
}, {
  message: 'End date must be after start date',
  path: ['endDate'],
}).refine((data) => {
  if (data.isVirtual && !data.virtualLink) {
    return false;
  }
  return true;
}, {
  message: 'Virtual link is required for virtual events',
  path: ['virtualLink'],
}).refine((data) => {
  if (!data.isVirtual && !data.location) {
    return false;
  }
  return true;
}, {
  message: 'Location is required for in-person events',
  path: ['location'],
});

// Story validation schemas
export const storyTitleSchema = z
  .string()
  .trim()
  .min(1, 'Story title is required')
  .max(200, 'Story title must be less than 200 characters');

export const createStorySchema = z.object({
  title: storyTitleSchema,
  content: z.array(z.any()).min(1, 'Story must have at least one content block'),
  familyTreeId: z.string().min(1, 'Family tree is required'),
  privacy: z.enum(['public', 'family_tree', 'private']),
  taggedPeople: z.array(z.string()).optional(),
});

// Family member validation
export const addFamilyMemberSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  gender: genderSchema,
  dateOfBirth: dateOfBirthSchema.optional(),
  email: emailSchema.optional(),
  phoneNumber: phoneSchema.optional(),
  relationshipType: z.string().min(1, 'Relationship type is required'),
});

// Helper function to validate form data
export const validateFormData = <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: boolean; data?: T; errors?: z.ZodError['errors'] } => {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error.errors };
    }
    throw error;
  }
};

// Helper function to format validation errors
export const formatValidationErrors = (errors: z.ZodError['errors']): Record<string, string> => {
  const formattedErrors: Record<string, string> = {};
  errors.forEach((error) => {
    const field = error.path.join('.');
    formattedErrors[field] = error.message;
  });
  return formattedErrors;
};

// Password strength calculation
export interface PasswordStrength {
  score: number; // 0-4
  feedback: string[];
  color: string;
  label: string;
}

export const calculatePasswordStrength = (password: string): PasswordStrength => {
  let score = 0;
  const feedback: string[] = [];

  if (!password) {
    return {
      score: 0,
      feedback: ['Password is required'],
      color: '#FF0000',
      label: 'None',
    };
  }

  // Length check
  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('Use at least 8 characters');
  }

  // Uppercase check
  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include uppercase letter');
  }

  // Lowercase check
  if (/[a-z]/.test(password)) {
    score += 0.5;
  } else {
    feedback.push('Include lowercase letter');
  }

  // Number check
  if (/[0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include a number');
  }

  // Special character check
  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include special character');
  }

  // Extra length bonus
  if (password.length >= 12) {
    score += 0.5;
  }

  // Determine color and label based on score
  let color = '#FF0000'; // Red
  let label = 'Weak';

  if (score >= 4) {
    color = '#00AA00'; // Green
    label = 'Strong';
  } else if (score >= 3) {
    color = '#FFA500'; // Orange
    label = 'Medium';
  } else if (score >= 2) {
    color = '#FF6600'; // Dark Orange
    label = 'Fair';
  }

  return {
    score: Math.min(score, 4),
    feedback,
    color,
    label,
  };
};