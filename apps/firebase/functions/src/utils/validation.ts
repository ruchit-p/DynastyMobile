// Email validation using RFC 5322 standard
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
};

// Validate required fields in an object
export const validateRequiredFields = (data: any, requiredFields: string[]): void => {
  const missingFields = requiredFields.filter((field) =>
    data[field] === undefined || data[field] === null || data[field] === ""
  );

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }
};

// Password validation
export const isValidPassword = (password: string): { isValid: boolean; message: string } => {
  if (password.length < 8) {
    return {isValid: false, message: "Password must be at least 8 characters long"};
  }
  if (!/[A-Z]/.test(password)) {
    return {isValid: false, message: "Password must contain at least one uppercase letter"};
  }
  if (!/[a-z]/.test(password)) {
    return {isValid: false, message: "Password must contain at least one lowercase letter"};
  }
  if (!/[0-9]/.test(password)) {
    return {isValid: false, message: "Password must contain at least one number"};
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return {isValid: false, message: "Password must contain at least one special character"};
  }
  return {isValid: true, message: ""};
};

// Phone number validation (basic format)
export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/[\s()-]/g, ""));
};

// Name validation
export const isValidName = (name: string): boolean => {
  return name.length >= 2 && /^[a-zA-Z\s-']+$/.test(name);
};

// Date of birth validation (must be at least 13 years old)
export const isValidDateOfBirth = (dateOfBirth: Date | string): boolean => {
  const today = new Date();
  const minAge = 13;

  // Convert input to Date object if it's a string
  const birthDateObj = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);

  // Check if the date is valid
  if (isNaN(birthDateObj.getTime())) {
    return false;
  }

  // Convert both dates to UTC to ensure consistent comparison
  const birthDate = new Date(Date.UTC(
    birthDateObj.getFullYear(),
    birthDateObj.getMonth(),
    birthDateObj.getDate()
  ));

  const minDate = new Date(Date.UTC(
    today.getFullYear() - minAge,
    today.getMonth(),
    today.getDate()
  ));

  return birthDate <= minDate;
};

// Gender validation
export const isValidGender = (gender: string): boolean => {
  return ["male", "female", "other"].includes(gender.toLowerCase());
};

// Validation error messages
export const ERROR_MESSAGES = {
  INVALID_EMAIL: "Please enter a valid email address",
  INVALID_PHONE: "Please enter a valid phone number",
  INVALID_FIRST_NAME: "First name must be at least 2 characters long and contain only letters",
  INVALID_LAST_NAME: "Last name must be at least 2 characters long and contain only letters",
  INVALID_DATE_OF_BIRTH: "You must be at least 13 years old to sign up",
  INVALID_GENDER: "Please select a valid gender option",
  PASSWORDS_DO_NOT_MATCH: "Passwords do not match",
} as const;

// Signup data validation
export interface SignupData {
  email: string;
  password: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  dateOfBirth?: Date;
  gender?: "male" | "female" | "other" | "unspecified";
  invitationId?: string;
  familyTreeId?: string;
}

export function validateSignupData(data: any): { isValid: boolean; errors: { field: string; message: string }[] } {
  const errors: { field: string; message: string }[] = [];

  // Validate email
  if (!data.email || !isValidEmail(data.email)) {
    errors.push({field: "email", message: "Please enter a valid email address"});
  }

  // Validate password
  const passwordValidation = isValidPassword(data.password);
  if (!passwordValidation.isValid) {
    errors.push({field: "password", message: passwordValidation.message});
  }

  // Set default values if fields are missing
  if (!data.firstName) {
    data.firstName = "User";
  } else if (data.firstName.trim().length < 2) {
    errors.push({field: "firstName", message: "First name must be at least 2 characters long"});
  }

  if (!data.lastName) {
    data.lastName = "";
  } else if (data.lastName.trim().length < 2) {
    errors.push({field: "lastName", message: "Last name must be at least 2 characters long"});
  }

  // Validate phone (optional)
  if (data.phone && !/^\+?[\d\s-]{10,}$/.test(data.phone)) {
    errors.push({field: "phone", message: "Please enter a valid phone number"});
  }

  // Validate date of birth or set default
  if (!data.dateOfBirth) {
    data.dateOfBirth = new Date("1900-01-01");
  } else {
    try {
      if (!(data.dateOfBirth instanceof Date)) {
        data.dateOfBirth = new Date(data.dateOfBirth);
        if (isNaN(data.dateOfBirth.getTime())) {
          throw new Error();
        }
      }
    } catch (error) {
      errors.push({field: "dateOfBirth", message: "Please enter a valid date of birth"});
    }
  }

  // Validate gender or set default
  if (!data.gender) {
    data.gender = "unspecified";
  } else if (!["male", "female", "other", "unspecified"].includes(data.gender)) {
    errors.push({field: "gender", message: "Please select a valid gender"});
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
