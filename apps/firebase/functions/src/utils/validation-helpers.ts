import {CallableRequest} from "firebase-functions/v2/https";
import {validateRequest} from "./request-validator";
import {VALIDATION_SCHEMAS} from "../config/validation-schemas";
import {withAuth} from "../middleware/auth";
import {logger} from "firebase-functions/v2";

export function createValidatedFunction<T>(
  functionName: string,
  schemaName: string,
  handler: (request: CallableRequest, validatedData: T) => Promise<any>,
  authConfig?: any
) {
  return withAuth(async (request) => {
    const uid = request.auth!.uid;

    try {
      // Log validation attempt
      logger.info(`Validating request for ${functionName}`, {
        userId: uid,
        schemaName,
        dataKeys: Object.keys(request.data || {}),
      });

      // Validate request
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS[schemaName],
        uid
      ) as T;

      // Call handler with validated data
      return await handler(request, validatedData);
    } catch (error) {
      // Log validation error
      logger.error(`Validation failed for ${functionName}`, {
        userId: uid,
        schemaName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }, functionName, authConfig);
}

// Helper to validate nested objects with specific schemas
export function validateNestedObject(
  obj: any,
  schema: Record<string, any>,
  fieldName: string
): any {
  if (!obj || typeof obj !== "object") {
    throw new Error(`${fieldName} must be an object`);
  }

  const validated: any = {};

  for (const [key, validator] of Object.entries(schema)) {
    if (typeof validator === "function") {
      validated[key] = validator(obj[key], `${fieldName}.${key}`);
    } else {
      validated[key] = obj[key];
    }
  }

  return validated;
}

// Helper to validate array of objects
export function validateArrayOfObjects<T>(
  array: any[],
  itemValidator: (item: any, index: number) => T,
  fieldName: string,
  maxSize?: number
): T[] {
  if (!Array.isArray(array)) {
    throw new Error(`${fieldName} must be an array`);
  }

  if (maxSize && array.length > maxSize) {
    throw new Error(`${fieldName} exceeds maximum size of ${maxSize} items`);
  }

  return array.map((item, index) => itemValidator(item, index));
}

// Helper to create partial update validator
export function createUpdateValidator(
  baseSchema: string,
  requiredFields: string[] = []
): any {
  const baseRules = VALIDATION_SCHEMAS[baseSchema]?.rules || [];

  // Make all fields optional except specified required fields
  const updateRules = baseRules.map((rule) => ({
    ...rule,
    required: requiredFields.includes(rule.field),
  }));

  return {
    rules: updateRules,
    allowExtraFields: false,
    xssCheck: true,
  };
}

// Helper to batch validate multiple items
export function batchValidate<T>(
  items: any[],
  schemaName: string,
  userId?: string
): T[] {
  const schema = VALIDATION_SCHEMAS[schemaName];
  if (!schema) {
    throw new Error(`Unknown validation schema: ${schemaName}`);
  }

  return items.map((item, index) => {
    try {
      return validateRequest(item, schema, userId) as T;
    } catch (error) {
      throw new Error(`Validation failed for item ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
