import {validateRequest, ValidationSchema} from "../utils/request-validator";

// Mock the XSS sanitization functions
jest.mock("../utils/xssSanitization", () => ({
  sanitizeObject: jest.fn((obj) => obj),
  detectXSSPatterns: jest.fn(() => false),
  logXSSAttempt: jest.fn(),
}));

describe("Request Validator", () => {
  describe("validateRequest", () => {
    it("should validate required fields", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "name", type: "string", required: true},
          {field: "age", type: "number", required: true},
        ],
      };

      expect(() => validateRequest({}, schema)).toThrow("name is required");
      expect(() => validateRequest({name: "John"}, schema)).toThrow("age is required");
      expect(() => validateRequest({name: "John", age: 25}, schema)).not.toThrow();
    });

    it("should validate field types", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "name", type: "string"},
          {field: "age", type: "number"},
          {field: "active", type: "boolean"},
          {field: "tags", type: "array"},
          {field: "data", type: "object"},
        ],
      };

      const data = {
        name: 123, // Wrong type
        age: "twenty", // Wrong type
        active: "yes", // Wrong type
        tags: "tag1,tag2", // Wrong type
        data: [], // Wrong type
      };

      expect(() => validateRequest(data, schema)).toThrow();
    });

    it("should validate email format", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "email", type: "email", required: true},
        ],
      };

      expect(() => validateRequest({email: "invalid"}, schema)).toThrow();
      expect(() => validateRequest({email: "test@example.com"}, schema)).not.toThrow();
    });

    it("should validate phone format", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "phone", type: "phone", required: true},
        ],
      };

      expect(() => validateRequest({phone: "1"}, schema)).toThrow(); // Too short
      expect(() => validateRequest({phone: "+1234567890"}, schema)).not.toThrow();
    });

    it("should validate text length", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "title", type: "string", maxLength: 10},
        ],
      };

      expect(() => validateRequest({title: "a".repeat(11)}, schema)).toThrow();
      expect(() => validateRequest({title: "a".repeat(10)}, schema)).not.toThrow();
    });

    it("should validate array size", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "items", type: "array", maxSize: 3},
        ],
      };

      expect(() => validateRequest({items: [1, 2, 3, 4]}, schema)).toThrow();
      expect(() => validateRequest({items: [1, 2, 3]}, schema)).not.toThrow();
    });

    it("should validate enum values", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "status", type: "enum", enumValues: ["active", "inactive", "pending"]},
        ],
      };

      expect(() => validateRequest({status: "unknown"}, schema)).toThrow();
      expect(() => validateRequest({status: "active"}, schema)).not.toThrow();
    });

    it("should validate firestore IDs", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "userId", type: "id", required: true},
        ],
      };

      expect(() => validateRequest({userId: "user@123"}, schema)).toThrow();
      expect(() => validateRequest({userId: "user_123"}, schema)).not.toThrow();
    });

    it("should validate dates", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "birthDate", type: "date"},
        ],
      };

      const result = validateRequest({birthDate: "2024-01-01"}, schema);
      expect(result.birthDate).toBeInstanceOf(Date);
    });

    it("should validate location coordinates", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "location", type: "location"},
        ],
      };

      expect(() => validateRequest({
        location: {lat: 91, lng: 0},
      }, schema)).toThrow();

      expect(() => validateRequest({
        location: {lat: 40.7128, lng: -74.0060},
      }, schema)).not.toThrow();
    });

    it("should handle custom validation", () => {
      const schema: ValidationSchema = {
        rules: [
          {
            field: "password",
            type: "string",
            custom: (value) => {
              if (value.length < 8) {
                throw new Error("Password must be at least 8 characters");
              }
            },
          },
        ],
      };

      expect(() => validateRequest({password: "short"}, schema)).toThrow();
      expect(() => validateRequest({password: "longpassword"}, schema)).not.toThrow();
    });

    it("should reject extra fields when not allowed", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "name", type: "string"},
        ],
        allowExtraFields: false,
      };

      expect(() => validateRequest({
        name: "John",
        extra: "field",
      }, schema)).toThrow("Unexpected fields: extra");
    });

    it("should allow extra fields when specified", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "name", type: "string"},
        ],
        allowExtraFields: true,
      };

      expect(() => validateRequest({
        name: "John",
        extra: "field",
      }, schema)).not.toThrow();
    });

    it("should skip optional fields with null/undefined", () => {
      const schema: ValidationSchema = {
        rules: [
          {field: "optional", type: "string"},
        ],
      };

      const result1 = validateRequest({optional: undefined}, schema);
      expect(result1.optional).toBeUndefined();

      const result2 = validateRequest({optional: null}, schema);
      expect(result2.optional).toBeUndefined();
    });
  });
});
