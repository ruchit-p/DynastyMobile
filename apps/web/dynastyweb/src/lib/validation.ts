import { z } from "zod";

// Email validation schema using RFC 5322 standard
export const emailSchema = z
  .string()
  .email("Please enter a valid email address")
  .min(1, "Email is required");

// Password validation schema
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[!@#$%^&*(),.?":{}|<>]/,
    "Password must contain at least one special character"
  );

// Phone number validation schema
export const phoneSchema = z
  .string()
  .regex(
    /^\+?[1-9]\d{1,14}$/,
    "Please enter a valid phone number"
  )
  .optional()
  .or(z.literal(""));

// Name validation schema
export const nameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters long")
  .regex(/^[a-zA-Z\s-']+$/, "Name can only contain letters, spaces, hyphens, and apostrophes");

// Date of birth validation schema (must be at least 13 years old)
export const dateOfBirthSchema = z.coerce
  .date()
  .refine((date: Date) => {
    const today = new Date();
    const birthDate = new Date(date);
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    // Adjust age if birthday hasn't occurred this year
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age >= 13;
  }, "You must be at least 13 years old to sign up");

// Gender validation schema
export const genderSchema = z.enum(["male", "female", "other"], {
  errorMap: () => ({ message: "Please select a valid gender option" }),
});

// Login form schema
export const loginFormSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

// Signup form schema (full version for onboarding)
export const signupFormSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  dateOfBirth: dateOfBirthSchema,
  gender: genderSchema,
});

// Simplified signup form schema for initial registration
export const initialSignupFormSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// Invited signup form schema
export const invitedSignupFormSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  invitationId: z.string(),
  token: z.string(),
});

// Types
export type LoginFormData = z.infer<typeof loginFormSchema>;
export type SignupFormData = z.infer<typeof signupFormSchema>;
export type InitialSignupFormData = z.infer<typeof initialSignupFormSchema>;
export type InvitedSignupFormData = z.infer<typeof invitedSignupFormSchema>;

// Helper function to format validation errors
export const formatValidationErrors = (errors: z.ZodError) => {
  return errors.errors.map((error) => ({
    field: error.path.join("."),
    message: error.message,
  }));
};

// Helper function to validate form data
export const validateFormData = <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: boolean; data?: T; errors?: { field: string; message: string }[] } => {
  try {
    const validData = schema.parse(data);
    return { success: true, data: validData };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: formatValidationErrors(error) };
    }
    return { success: false, errors: [{ field: "form", message: "Invalid form data" }] };
  }
}; 