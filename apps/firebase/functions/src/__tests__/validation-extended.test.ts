import {
  validateFirestoreId,
  validateArraySize,
  validateTextLength,
  validateDate,
  validateFileUpload,
  validateLocation,
  validateEnum,
} from "../utils/validation-extended";

describe("Extended Validation Functions", () => {
  describe("validateFirestoreId", () => {
    it("should accept valid Firestore IDs", () => {
      expect(() => validateFirestoreId("abc123")).not.toThrow();
      expect(() => validateFirestoreId("user_123-456")).not.toThrow();
      expect(() => validateFirestoreId("a1B2c3D4e5F6")).not.toThrow();
    });

    it("should reject invalid IDs", () => {
      expect(() => validateFirestoreId("")).toThrow();
      expect(() => validateFirestoreId(null as any)).toThrow();
      expect(() => validateFirestoreId("abc@123")).toThrow();
      expect(() => validateFirestoreId("user space")).toThrow();
      expect(() => validateFirestoreId("a".repeat(129))).toThrow();
    });
  });

  describe("validateArraySize", () => {
    it("should accept arrays within limits", () => {
      expect(() => validateArraySize([1, 2, 3], "test")).not.toThrow();
      expect(() => validateArraySize([], "test")).not.toThrow();
      expect(() => validateArraySize(["a", "b"], "test", 5)).not.toThrow();
    });

    it("should reject non-arrays", () => {
      expect(() => validateArraySize("not array" as any, "test")).toThrow();
      expect(() => validateArraySize({} as any, "test")).toThrow();
    });

    it("should reject arrays exceeding size limit", () => {
      const largeArray = new Array(101).fill("item");
      expect(() => validateArraySize(largeArray, "test", 100)).toThrow();
    });
  });

  describe("validateTextLength", () => {
    it("should accept strings within limits", () => {
      expect(() => validateTextLength("Hello", "test")).not.toThrow();
      expect(() => validateTextLength("", "test")).not.toThrow();
      expect(() => validateTextLength("a".repeat(100), "test", 100)).not.toThrow();
    });

    it("should reject non-strings", () => {
      expect(() => validateTextLength(123 as any, "test")).toThrow();
      expect(() => validateTextLength(null as any, "test")).toThrow();
    });

    it("should reject strings exceeding length", () => {
      expect(() => validateTextLength("a".repeat(101), "test", 100)).toThrow();
    });
  });

  describe("validateDate", () => {
    it("should accept valid dates", () => {
      const date1 = validateDate("2024-01-01", "test");
      expect(date1).toBeInstanceOf(Date);

      const date2 = validateDate(new Date("2024-01-01"), "test");
      expect(date2).toBeInstanceOf(Date);

      const date3 = validateDate(1704067200000, "test"); // Timestamp
      expect(date3).toBeInstanceOf(Date);
    });

    it("should reject invalid dates", () => {
      expect(() => validateDate("not-a-date", "test")).toThrow();
      expect(() => validateDate("2024-13-01", "test")).toThrow();
      expect(() => validateDate({} as any, "test")).toThrow();
    });

    it("should reject dates outside acceptable range", () => {
      expect(() => validateDate("1899-12-31", "test")).toThrow();
      expect(() => validateDate("2040-01-01", "test")).toThrow();
    });
  });

  describe("validateFileUpload", () => {
    it("should accept valid file uploads", () => {
      expect(() => validateFileUpload({
        name: "photo.jpg",
        size: 1024 * 1024, // 1MB
        mimeType: "image/jpeg",
        type: "image",
      })).not.toThrow();
    });

    it("should reject invalid MIME types", () => {
      expect(() => validateFileUpload({
        name: "script.exe",
        size: 1024,
        mimeType: "application/x-executable",
        type: "document",
      })).toThrow();
    });

    it("should reject files exceeding size limits", () => {
      expect(() => validateFileUpload({
        name: "huge.jpg",
        size: 11 * 1024 * 1024, // 11MB
        mimeType: "image/jpeg",
        type: "image",
      })).toThrow();
    });
  });

  describe("validateLocation", () => {
    it("should accept valid coordinates", () => {
      expect(() => validateLocation({lat: 40.7128, lng: -74.0060})).not.toThrow();
      expect(() => validateLocation({lat: -90, lng: 180})).not.toThrow();
      expect(() => validateLocation({lat: 90, lng: -180})).not.toThrow();
    });

    it("should reject invalid coordinates", () => {
      expect(() => validateLocation({lat: 91, lng: 0})).toThrow();
      expect(() => validateLocation({lat: 0, lng: 181})).toThrow();
      expect(() => validateLocation({lat: "not a number" as any, lng: 0})).toThrow();
    });
  });

  describe("validateEnum", () => {
    const colors = ["red", "green", "blue"] as const;

    it("should accept valid enum values", () => {
      expect(validateEnum("red", colors, "color")).toBe("red");
      expect(validateEnum("blue", colors, "color")).toBe("blue");
    });

    it("should reject invalid enum values", () => {
      expect(() => validateEnum("yellow", colors, "color")).toThrow();
      expect(() => validateEnum("", colors, "color")).toThrow();
      expect(() => validateEnum(null as any, colors, "color")).toThrow();
    });
  });
});
