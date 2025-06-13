import {Timestamp} from "firebase-admin/firestore";

export interface PasswordResetToken {
  userId: string;
  email: string;
  expiresAt: Timestamp;
}

export interface EmailVerificationData {
  token: string;
  hashedToken: string;
  expires: Timestamp;
}

export interface PhoneAuthData {
  phoneNumber: string;
  verificationId?: string;
  verificationCode?: string;
  recaptchaToken?: string;
}
