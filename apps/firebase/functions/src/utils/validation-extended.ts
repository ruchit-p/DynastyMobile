import {
  isValidEmail,
  isValidPassword,
  isValidPhone,
  isValidName,
  isValidDateOfBirth,
  validateRequiredFields,
} from "./validation";
import {createError, ErrorCode} from "./errors";

// Input length limits
export const INPUT_LIMITS = {
  // Text fields
  name: 100,
  title: 200,
  description: 5000,
  comment: 1000,
  message: 10000,
  url: 2000,

  // Arrays
  tags: 50,
  participants: 100,
  invitees: 100,
  files: 20,

  // File sizes (in bytes)
  image: 10 * 1024 * 1024, // 10MB
  video: 100 * 1024 * 1024, // 100MB
  document: 50 * 1024 * 1024, // 50MB
  avatar: 5 * 1024 * 1024, // 5MB
};

// Validate Firestore document ID
export function validateFirestoreId(id: string, fieldName = "id"): void {
  if (!id || typeof id !== "string") {
    throw createError(ErrorCode.INVALID_ARGUMENT, `Invalid ${fieldName}`);
  }

  // Firestore IDs are alphanumeric with some special chars
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 128) {
    throw createError(ErrorCode.INVALID_ARGUMENT, `Invalid ${fieldName} format`);
  }
}

// Validate array size
export function validateArraySize(
  array: any[],
  fieldName: string,
  maxSize?: number
): void {
  if (!Array.isArray(array)) {
    throw createError(ErrorCode.INVALID_ARGUMENT, `${fieldName} must be an array`);
  }

  const limit = maxSize || INPUT_LIMITS[fieldName as keyof typeof INPUT_LIMITS] || 100;
  if (array.length > limit) {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      `${fieldName} exceeds maximum size of ${limit} items`
    );
  }
}

// Validate text length
export function validateTextLength(
  text: string,
  fieldName: string,
  maxLength?: number
): void {
  if (typeof text !== "string") {
    throw createError(ErrorCode.INVALID_ARGUMENT, `${fieldName} must be a string`);
  }

  const limit = maxLength || INPUT_LIMITS[fieldName as keyof typeof INPUT_LIMITS] || 10000;
  if (text.length > limit) {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      `${fieldName} exceeds maximum length of ${limit} characters`
    );
  }
}

// Validate date/timestamp
export function validateDate(date: any, fieldName: string): Date {
  let parsed: Date;

  try {
    if (date instanceof Date) {
      parsed = date;
    } else if (typeof date === "string" || typeof date === "number") {
      parsed = new Date(date);
    } else {
      throw new Error("Invalid date format");
    }

    if (isNaN(parsed.getTime())) {
      throw new Error("Invalid date");
    }

    // Reasonable date range (1900 to 10 years future)
    const minDate = new Date("1900-01-01");
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 10);

    if (parsed < minDate || parsed > maxDate) {
      throw new Error("Date out of acceptable range");
    }

    return parsed;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Invalid date";
    throw createError(ErrorCode.INVALID_ARGUMENT, `Invalid ${fieldName}: ${errorMessage}`);
  }
}

// Validate file upload
export function validateFileUpload(file: {
  name: string;
  size: number;
  mimeType: string;
  type?: string;
}): void {
  const ALLOWED_MIME_TYPES = {
    image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    video: ["video/mp4", "video/quicktime", "video/x-msvideo"],
    audio: ["audio/mpeg", "audio/wav", "audio/ogg"],
    document: ["application/pdf", "text/plain", "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  };

  // Validate MIME type
  const fileCategory = file.type || "document";
  const allowedTypes = ALLOWED_MIME_TYPES[fileCategory as keyof typeof ALLOWED_MIME_TYPES] ||
                      Object.values(ALLOWED_MIME_TYPES).flat();

  if (!allowedTypes.includes(file.mimeType)) {
    throw createError(ErrorCode.INVALID_ARGUMENT,
      `File type ${file.mimeType} is not allowed`);
  }

  // Validate size
  const maxSize = INPUT_LIMITS[fileCategory as keyof typeof INPUT_LIMITS] ||
                  INPUT_LIMITS.document;
  if (file.size > maxSize) {
    throw createError(ErrorCode.INVALID_ARGUMENT,
      `File size exceeds maximum allowed (${maxSize / 1024 / 1024}MB)`);
  }
}

// Validate location coordinates
export function validateLocation(location: { lat: number; lng: number }): void {
  if (typeof location.lat !== "number" || typeof location.lng !== "number") {
    throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid location coordinates");
  }

  if (location.lat < -90 || location.lat > 90) {
    throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid latitude");
  }

  if (location.lng < -180 || location.lng > 180) {
    throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid longitude");
  }
}

// Validate enum value
export function validateEnum<T>(
  value: any,
  validValues: readonly T[],
  fieldName: string
): T {
  if (!validValues.includes(value)) {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      `Invalid ${fieldName}. Must be one of: ${validValues.join(", ")}`
    );
  }
  return value;
}

// Validate cryptographic key
export function validateCryptoKey(key: string, keyType: string): string {
  // Remove whitespace
  const trimmed = key.trim();

  // Check if it's base64 encoded
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(trimmed)) {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      `Invalid ${keyType} format - must be base64 encoded`
    );
  }

  // Validate length (Signal keys should be specific sizes)
  const minLength = 32; // Minimum for most crypto keys
  const maxLength = 10000; // Maximum reasonable size

  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      `Invalid ${keyType} length`
    );
  }

  return trimmed;
}

// Re-export from base validation for convenience
export {
  isValidEmail,
  isValidPassword,
  isValidPhone,
  isValidName,
  isValidDateOfBirth,
  validateRequiredFields,
};
