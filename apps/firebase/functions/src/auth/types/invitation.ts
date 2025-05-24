import {Timestamp} from "firebase-admin/firestore";

export interface InvitationData {
  inviteeId: string;
  inviteeName: string;
  inviteeEmail: string;
  inviterId: string;
  inviterName: string;
  familyTreeId: string;
  familyTreeName: string;
  invitationToken?: string;
  invitationExpires?: Timestamp;
  // Additional prefill data
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  gender?: string;
  phoneNumber?: string;
  relationship?: string;
}

export interface FamilyInvitation {
  id: string;
  inviteeEmail: string;
  inviteeName?: string | null;
  inviterId: string;
  inviterName: string;
  familyTreeId: string;
  familyTreeName: string;
  status: "pending" | "accepted" | "declined" | "expired";
  invitationToken: string;
  invitationTokenPlain?: string;
  invitationExpires: Timestamp;
  createdAt: any;
  updatedAt: any;
  acceptedAt?: Timestamp;
  acceptedByUserId?: string;
  prefillData: {
    firstName?: string | null;
    lastName?: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
    phoneNumber?: string | null;
    relationshipToInviter?: string | null;
  };
}
