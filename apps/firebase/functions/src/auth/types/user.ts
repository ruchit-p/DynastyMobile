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
