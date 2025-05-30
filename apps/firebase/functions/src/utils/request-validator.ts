import {sanitizeObject, detectXSSPatterns, logXSSAttempt} from "./xssSanitization";
import {createError, ErrorCode} from "./errors";
import * as validations from "./validation-extended";

export interface ValidationRule {
  field: string;
  type: "string" | "number" | "boolean" | "array" | "object" | "date" | "email" |
        "phone" | "name" | "id" | "location" | "file" | "enum";
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  maxSize?: number;
  enumValues?: readonly any[];
  sanitize?: boolean;
  custom?: (value: any) => void;
}

export interface ValidationSchema {
  rules: ValidationRule[];
  allowExtraFields?: boolean;
  xssCheck?: boolean;
}

export function validateRequest(
  data: any,
  schema: ValidationSchema,
  userId?: string
): any {
  const validated: any = {};
  const errors: string[] = [];

  // Check required fields
  for (const rule of schema.rules) {
    const value = data[rule.field];

    if (rule.required && (value === undefined || value === null || value === "")) {
      errors.push(`${rule.field} is required`);
      continue;
    }

    if (value === undefined || value === null) {
      continue; // Skip optional fields
    }

    try {
      // Type-specific validation
      switch (rule.type) {
      case "string":
        if (typeof value !== "string") {
          throw new Error("must be a string");
        }
        if (rule.minLength && value.length < rule.minLength) {
          throw new Error(`must be at least ${rule.minLength} characters long`);
        }
        if (rule.maxLength) {
          validations.validateTextLength(value, rule.field, rule.maxLength);
        }
        break;

      case "email":
        if (!validations.isValidEmail(value)) {
          throw new Error("invalid email format");
        }
        break;

      case "phone":
        if (!validations.isValidPhone(value)) {
          throw new Error("invalid phone format");
        }
        break;

      case "name":
        if (!validations.isValidName(value)) {
          throw new Error("invalid name format");
        }
        break;

      case "id":
        validations.validateFirestoreId(value, rule.field);
        break;

      case "array":
        validations.validateArraySize(value, rule.field, rule.maxSize);
        break;

      case "date":
        validated[rule.field] = validations.validateDate(value, rule.field);
        continue;

      case "location":
        validations.validateLocation(value);
        break;

      case "file":
        validations.validateFileUpload(value);
        break;

      case "enum":
        validated[rule.field] = validations.validateEnum(
          value,
          rule.enumValues || [],
          rule.field
        );
        continue;

      case "number":
        if (typeof value !== "number" || isNaN(value)) {
          throw new Error("must be a number");
        }
        break;

      case "boolean":
        if (typeof value !== "boolean") {
          throw new Error("must be a boolean");
        }
        break;

      case "object":
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          throw new Error("must be an object");
        }
        break;
      }

      // Custom validation
      if (rule.custom) {
        rule.custom(value);
      }

      validated[rule.field] = value;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Validation failed";
      errors.push(`${rule.field}: ${errorMessage}`);
    }
  }

  // Check for extra fields
  if (!schema.allowExtraFields) {
    const allowedFields = schema.rules.map((r) => r.field);
    const extraFields = Object.keys(data).filter((f) => !allowedFields.includes(f));
    if (extraFields.length > 0) {
      errors.push(`Unexpected fields: ${extraFields.join(", ")}`);
    }
  }

  // XSS check before sanitization
  if (schema.xssCheck !== false) {
    const fieldsToCheck = schema.rules
      .filter((r) => r.sanitize !== false && ["string", "name"].includes(r.type))
      .map((r) => r.field);

    for (const field of fieldsToCheck) {
      if (validated[field] && detectXSSPatterns(validated[field])) {
        logXSSAttempt(validated[field], {userId, field});
        throw createError(ErrorCode.INVALID_ARGUMENT, "XSS attempt detected");
      }
    }
  }

  if (errors.length > 0) {
    throw createError(ErrorCode.INVALID_ARGUMENT, errors.join("; "));
  }

  // Sanitize if needed
  const fieldsToSanitize = schema.rules
    .filter((r) => r.sanitize !== false && ["string", "name"].includes(r.type))
    .map((r) => r.field);

  const sanitized = sanitizeObject(validated, {
    allowHtml: false,
    maxLength: 10000,
    excludeKeys: Object.keys(validated).filter((k) => !fieldsToSanitize.includes(k)),
  });

  return sanitized;
}
