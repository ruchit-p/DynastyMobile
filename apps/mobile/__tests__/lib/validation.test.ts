import { z } from 'zod';
import {
  emailSchema,
  passwordSchema,
  phoneSchema,
  nameSchema,
  dateOfBirthSchema,
  genderSchema,
  loginFormSchema,
  signupFormSchema,
  profileSetupSchema,
  // Unused but imported for completeness
  forgotPasswordSchema as _forgotPasswordSchema,
  phoneSignInSchema as _phoneSignInSchema,
  verifyOtpSchema as _verifyOtpSchema,
  eventTitleSchema,
  eventDateSchema,
  eventTimeSchema,
  // Unused but imported for completeness
  eventLocationSchema as _eventLocationSchema,
  virtualLinkSchema as _virtualLinkSchema,
  createEventSchema,
  // Unused but imported for completeness
  storyTitleSchema as _storyTitleSchema,
  createStorySchema as _createStorySchema,
  addFamilyMemberSchema as _addFamilyMemberSchema,
  validateFormData,
  formatValidationErrors,
  calculatePasswordStrength,
} from '../../src/lib/validation';

describe('Validation Schemas', () => {
  describe('emailSchema', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co',
        'user+tag@example.org',
        'test123@sub.domain.com',
      ];

      validEmails.forEach(email => {
        expect(() => emailSchema.parse(email)).not.toThrow();
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        '',
        'notanemail',
        '@example.com',
        'user@',
        'user@.com',
        'user@domain',
        'user space@example.com',
      ];

      invalidEmails.forEach(email => {
        expect(() => emailSchema.parse(email)).toThrow(z.ZodError);
      });
    });

    it('should convert email to lowercase and trim', () => {
      expect(emailSchema.parse('  TEST@EXAMPLE.COM  ')).toBe('test@example.com');
    });
  });

  describe('passwordSchema', () => {
    it('should validate strong passwords', () => {
      const validPasswords = [
        'Password1!',
        'Str0ng@Pass',
        'MyP@ssw0rd',
        'Test123$Word',
      ];

      validPasswords.forEach(password => {
        expect(() => passwordSchema.parse(password)).not.toThrow();
      });
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        'short',           // Too short
        'password123',     // No uppercase
        'PASSWORD123',     // No lowercase
        'Password',        // No number
        'Password123',     // No special character
        '',                // Empty
      ];

      weakPasswords.forEach(password => {
        expect(() => passwordSchema.parse(password)).toThrow(z.ZodError);
      });
    });
  });

  describe('phoneSchema', () => {
    it('should validate international phone numbers', () => {
      const validPhones = [
        '+14155552671',
        '+442071838750',
        '+861069929988',
        '14155552671',     // Without +
      ];

      validPhones.forEach(phone => {
        expect(() => phoneSchema.parse(phone)).not.toThrow();
      });
    });

    it('should reject invalid phone numbers', () => {
      const invalidPhones = [
        '123',
        'notaphone',
        '+1',
        '00000000000',
      ];

      invalidPhones.forEach(phone => {
        expect(() => phoneSchema.parse(phone)).toThrow(z.ZodError);
      });
      
      // Test empty string separately as it throws for minimum length
      expect(() => phoneSchema.parse('')).toThrow(z.ZodError);
    });
  });

  describe('nameSchema', () => {
    it('should validate valid names', () => {
      const validNames = [
        'John',
        'Mary Jane',
        "O'Connor",
        'Jean-Pierre',
      ];

      validNames.forEach(name => {
        expect(() => nameSchema.parse(name)).not.toThrow();
      });
    });

    it('should reject invalid names', () => {
      const invalidNames = [
        'J',               // Too short
        '',                // Empty
        '123',             // Numbers
        'John@Doe',        // Special characters
        'Name_With_Under', // Underscores
      ];

      invalidNames.forEach(name => {
        expect(() => nameSchema.parse(name)).toThrow(z.ZodError);
      });
    });

    it('should trim names', () => {
      expect(nameSchema.parse('  John  ')).toBe('John');
    });
  });

  describe('dateOfBirthSchema', () => {
    it('should validate valid birth dates', () => {
      const fifteenYearsAgo = new Date();
      fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15);

      const fiftyYearsAgo = new Date();
      fiftyYearsAgo.setFullYear(fiftyYearsAgo.getFullYear() - 50);

      expect(() => dateOfBirthSchema.parse(fifteenYearsAgo)).not.toThrow();
      expect(() => dateOfBirthSchema.parse(fiftyYearsAgo)).not.toThrow();
    });

    it('should reject users under 13', () => {
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

      expect(() => dateOfBirthSchema.parse(tenYearsAgo)).toThrow(z.ZodError);
    });

    it('should reject unrealistic ages', () => {
      const twoHundredYearsAgo = new Date();
      twoHundredYearsAgo.setFullYear(twoHundredYearsAgo.getFullYear() - 200);

      expect(() => dateOfBirthSchema.parse(twoHundredYearsAgo)).toThrow(z.ZodError);
    });
  });

  describe('genderSchema', () => {
    it('should validate valid genders', () => {
      expect(() => genderSchema.parse('male')).not.toThrow();
      expect(() => genderSchema.parse('female')).not.toThrow();
      expect(() => genderSchema.parse('other')).not.toThrow();
    });

    it('should reject invalid genders', () => {
      expect(() => genderSchema.parse('invalid')).toThrow(z.ZodError);
      expect(() => genderSchema.parse('')).toThrow(z.ZodError);
    });
  });

  describe('Form Schemas', () => {
    describe('loginFormSchema', () => {
      it('should validate valid login data', () => {
        const validData = {
          email: 'test@example.com',
          password: 'anypassword',
        };

        expect(() => loginFormSchema.parse(validData)).not.toThrow();
      });

      it('should require email and password', () => {
        expect(() => loginFormSchema.parse({ email: '', password: '' })).toThrow(z.ZodError);
        expect(() => loginFormSchema.parse({ email: 'test@example.com', password: '' })).toThrow(z.ZodError);
        expect(() => loginFormSchema.parse({ email: '', password: 'password' })).toThrow(z.ZodError);
      });
    });

    describe('signupFormSchema', () => {
      it('should validate matching passwords', () => {
        const validData = {
          email: 'test@example.com',
          password: 'Password1!',
          confirmPassword: 'Password1!',
        };

        expect(() => signupFormSchema.parse(validData)).not.toThrow();
      });

      it('should reject mismatched passwords', () => {
        const invalidData = {
          email: 'test@example.com',
          password: 'Password1!',
          confirmPassword: 'Password2!',
        };

        expect(() => signupFormSchema.parse(invalidData)).toThrow(z.ZodError);
      });
    });

    describe('profileSetupSchema', () => {
      it('should validate complete profile data', () => {
        const validData = {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-01'),
          gender: 'male' as const,
          phoneNumber: '+1234567890',
        };

        expect(() => profileSetupSchema.parse(validData)).not.toThrow();
      });

      it('should allow optional fields', () => {
        const minimalData = {
          firstName: 'John',
          lastName: 'Doe',
        };

        expect(() => profileSetupSchema.parse(minimalData)).not.toThrow();
      });
    });
  });

  describe('Event Validation', () => {
    describe('eventTitleSchema', () => {
      it('should validate valid titles', () => {
        expect(() => eventTitleSchema.parse('Family Reunion')).not.toThrow();
        expect(() => eventTitleSchema.parse('Birthday Party 2024')).not.toThrow();
      });

      it('should reject invalid titles', () => {
        expect(() => eventTitleSchema.parse('ab')).toThrow(z.ZodError); // Too short
        expect(() => eventTitleSchema.parse('a'.repeat(101))).toThrow(z.ZodError); // Too long
        expect(() => eventTitleSchema.parse('   ')).toThrow(z.ZodError); // Only spaces
      });
    });

    describe('eventDateSchema', () => {
      it('should validate valid date formats', () => {
        expect(() => eventDateSchema.parse('2024-01-01')).not.toThrow();
        expect(() => eventDateSchema.parse('2024-12-31')).not.toThrow();
      });

      it('should reject invalid date formats', () => {
        expect(() => eventDateSchema.parse('01-01-2024')).toThrow(z.ZodError);
        expect(() => eventDateSchema.parse('2024/01/01')).toThrow(z.ZodError);
        expect(() => eventDateSchema.parse('invalid')).toThrow(z.ZodError);
      });
    });

    describe('eventTimeSchema', () => {
      it('should validate valid time formats', () => {
        expect(() => eventTimeSchema.parse('00:00')).not.toThrow();
        expect(() => eventTimeSchema.parse('23:59')).not.toThrow();
        expect(() => eventTimeSchema.parse('12:30')).not.toThrow();
      });

      it('should reject invalid time formats', () => {
        expect(() => eventTimeSchema.parse('25:00')).toThrow(z.ZodError);
        expect(() => eventTimeSchema.parse('12:60')).toThrow(z.ZodError);
        expect(() => eventTimeSchema.parse('12')).toThrow(z.ZodError);
      });
    });

    describe('createEventSchema', () => {
      it('should validate complete event data', () => {
        const validEvent = {
          title: 'Family Reunion',
          eventDate: '2024-12-25',
          privacy: 'family_tree' as const,
          requireRsvp: true,
          allowGuestPlusOne: false,
          isVirtual: false,
          location: {
            lat: 40.7128,
            lng: -74.0060,
            address: 'New York, NY',
          },
        };

        expect(() => createEventSchema.parse(validEvent)).not.toThrow();
      });

      it('should require virtual link for virtual events', () => {
        const virtualEvent = {
          title: 'Virtual Meeting',
          eventDate: '2024-12-25',
          privacy: 'family_tree' as const,
          requireRsvp: true,
          allowGuestPlusOne: false,
          isVirtual: true,
          // Missing virtualLink
        };

        expect(() => createEventSchema.parse(virtualEvent)).toThrow(z.ZodError);
      });

      it('should require location for in-person events', () => {
        const inPersonEvent = {
          title: 'Family Reunion',
          eventDate: '2024-12-25',
          privacy: 'family_tree' as const,
          requireRsvp: true,
          allowGuestPlusOne: false,
          isVirtual: false,
          // Missing location
        };

        expect(() => createEventSchema.parse(inPersonEvent)).toThrow(z.ZodError);
      });

      it('should validate end date is after start date', () => {
        const invalidDateRange = {
          title: 'Multi-day Event',
          eventDate: '2024-12-25',
          endDate: '2024-12-24', // Before start date
          privacy: 'family_tree' as const,
          requireRsvp: true,
          allowGuestPlusOne: false,
          isVirtual: false,
          location: {
            lat: 40.7128,
            lng: -74.0060,
            address: 'New York, NY',
          },
        };

        expect(() => createEventSchema.parse(invalidDateRange)).toThrow(z.ZodError);
      });
    });
  });

  describe('Helper Functions', () => {
    describe('validateFormData', () => {
      it('should return success with valid data', () => {
        const result = validateFormData(emailSchema, 'test@example.com');
        expect(result.success).toBe(true);
        expect(result.data).toBe('test@example.com');
        expect(result.errors).toBeUndefined();
      });

      it('should return errors with invalid data', () => {
        const result = validateFormData(emailSchema, 'invalid-email');
        expect(result.success).toBe(false);
        expect(result.data).toBeUndefined();
        expect(result.errors).toBeDefined();
        expect(result.errors?.length).toBeGreaterThan(0);
      });
    });

    describe('formatValidationErrors', () => {
      it('should format Zod errors correctly', () => {
        try {
          signupFormSchema.parse({
            email: 'invalid',
            password: 'weak',
            confirmPassword: 'different',
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            const formatted = formatValidationErrors(error.errors);
            expect(formatted).toHaveProperty('email');
            expect(formatted).toHaveProperty('password');
            expect(typeof formatted.email).toBe('string');
          }
        }
      });
    });

    describe('calculatePasswordStrength', () => {
      it('should calculate strength correctly', () => {
        expect(calculatePasswordStrength('').score).toBe(0);
        expect(calculatePasswordStrength('password').score).toBeLessThan(2);
        expect(calculatePasswordStrength('Password1').score).toBeLessThan(4);
        expect(calculatePasswordStrength('Password1!').score).toBeGreaterThanOrEqual(4);
        expect(calculatePasswordStrength('MyStr0ng!P@ssw0rd').score).toBe(4);
      });

      it('should provide appropriate feedback', () => {
        const weak = calculatePasswordStrength('weak');
        expect(weak.feedback.length).toBeGreaterThan(0);
        expect(weak.label).toBe('Weak');

        const strong = calculatePasswordStrength('MyStr0ng!P@ssw0rd');
        expect(strong.feedback.length).toBe(0);
        expect(strong.label).toBe('Strong');
      });

      it('should return correct colors', () => {
        expect(calculatePasswordStrength('').color).toBe('#FF0000'); // Red
        expect(calculatePasswordStrength('Password1!').color).toBe('#00AA00'); // Green
      });
    });
  });
});