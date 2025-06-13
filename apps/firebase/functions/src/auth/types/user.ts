export interface UserDocument {
  id: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean;
  profilePicture?: { path: string; url?: string };
  parentIds: string[];
  childrenIds: string[];
  spouseIds: string[];
  familyTreeId?: string;
  historyBookId?: string;
  gender?: "male" | "female" | "other" | "unspecified";
  dateOfBirth?: Date | null;
  isAdmin: boolean;
  canAddMembers: boolean;
  canEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
  emailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date | any;
  isPendingSignUp: boolean;
  dataRetentionPeriod: "forever" | "year" | "month" | "week";
  dataRetentionLastUpdated: Date;
  onboardingCompleted: boolean;
  isTreeOwner?: boolean;
  invitationId?: string;
  status?: "active" | "pending" | "inactive";
  fontSettings?: {
    fontScale: number;
    useDeviceSettings: boolean;
  };
  notificationSettings?: any;
  privacySettings?: any;

  // Subscription related fields
  subscriptionId?: string; // Reference to subscription document
  stripeCustomerId?: string; // Stripe customer ID for easy lookup
  subscriptionPlan?: "free" | "individual" | "family"; // Quick reference
  subscriptionStatus?: "active" | "past_due" | "canceled" | "incomplete"; // Quick reference
  storageUsedBytes?: number; // Current storage usage
  storageQuotaBytes?: number; // Total storage quota
  referralCode?: string; // User's unique referral code
  referredBy?: string; // Who referred this user
  familyPlanOwnerId?: string; // If member of family plan, the owner's ID
}

export interface UserProfileUpdate {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  gender?: "male" | "female" | "other" | "unspecified";
  dateOfBirth?: string;
  phoneNumber?: string;
  onboardingCompleted?: boolean;
  dataRetentionPeriod?: "forever" | "year" | "month" | "week";
}
