import {onCall} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {getAuth} from "firebase-admin/auth";
import {MailDataRequired} from "@sendgrid/mail";
import * as sgMail from "@sendgrid/mail";
import {isValidEmail} from "../../utils/validation";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../common";
import {createError, withErrorHandling, ErrorCode} from "../../utils/errors";
import {InvitationData, FamilyInvitation} from "../types/invitation";
import {UserDocument} from "../types/user";
import {initSendGrid} from "../config/sendgrid";
import {SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_INVITE, FRONTEND_URL} from "../config/secrets";
import {ERROR_MESSAGES, TOKEN_EXPIRY} from "../config/constants";
import {generateSecureToken, hashToken} from "../utils/tokens";

/**
 * Sends an invitation email to a newly added family member
 */
export const sendFamilyTreeInvitation = onCall({
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_INVITE, FRONTEND_URL],
}, async (request) => {
  const invitationData: InvitationData = request.data;
  logger.info(`Starting invitation process for ${invitationData.inviteeEmail} to family tree ${invitationData.familyTreeId}`);

  try {
    // Initialize SendGrid
    initSendGrid();

    // Input validation
    if (!invitationData.inviteeId || !invitationData.inviteeEmail || !invitationData.inviterId || !invitationData.familyTreeId) {
      throw new Error(ERROR_MESSAGES.INVALID_REQUEST);
    }

    // Verify that the inviter is the authenticated user
    const auth = request.auth;
    if (!auth) {
      throw new Error("Authentication required");
    }

    // Override inviterId with authenticated user's ID
    invitationData.inviterId = auth.uid;

    // Get the inviter's display name from Firestore
    const db = getFirestore();
    const inviterDoc = await db.collection("users").doc(auth.uid).get();
    if (inviterDoc.exists) {
      const inviterData = inviterDoc.data();
      if (inviterData && inviterData.displayName) {
        invitationData.inviterName = inviterData.displayName;
      } else {
        invitationData.inviterName = "A family member"; // Fallback
      }
    } else {
      invitationData.inviterName = "A family member"; // Fallback if user not found
    }

    // Generate invitation token
    const invitationToken = generateSecureToken();
    const hashedToken = hashToken(invitationToken);

    // Set expiry time to 7 days from now
    const now = new Date();
    const expiryTime = new Date(now.getTime() + TOKEN_EXPIRY.INVITATION);
    const firestoreExpiry = Timestamp.fromDate(expiryTime);

    // Store invitation data in Firestore
    const invitationRef = db.collection("familyInvitations").doc();
    await invitationRef.set({
      id: invitationRef.id,
      inviteeId: invitationData.inviteeId,
      inviteeEmail: invitationData.inviteeEmail,
      inviterId: invitationData.inviterId,
      familyTreeId: invitationData.familyTreeId,
      token: hashedToken,
      expires: firestoreExpiry,
      status: "pending",
      createdAt: now,
      // Store prefill data
      prefillData: {
        firstName: invitationData.firstName,
        lastName: invitationData.lastName,
        dateOfBirth: invitationData.dateOfBirth,
        gender: invitationData.gender,
        phoneNumber: invitationData.phoneNumber,
        relationshipToInviter: invitationData.relationship,
      },
    });

    // Create invitation link with token
    const invitationLink = `${FRONTEND_URL.value()}/signup/invited?token=${invitationToken}&id=${invitationRef.id}`;

    // Send invitation email using SendGrid template
    const msg: MailDataRequired = {
      to: invitationData.inviteeEmail,
      from: SENDGRID_FROMEMAIL.value(),
      templateId: SENDGRID_TEMPLATES_INVITE.value(),
      dynamicTemplateData: {
        name: invitationData.inviteeName,
        inviterName: invitationData.inviterName,
        familyTreeName: invitationData.familyTreeName,
        acceptLink: invitationLink,
        year: new Date().getFullYear(),
      },
    };

    await sgMail.send(msg);
    logger.info(`Successfully sent invitation email to ${invitationData.inviteeEmail}`);

    return {
      success: true,
      invitationId: invitationRef.id,
    };
  } catch (error) {
    logger.error("Error sending invitation email:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to send invitation");
  }
});

/**
 * Accepts a family invitation.
 */
export const acceptFamilyInvitation = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
    secrets: [], // Accesses Firestore & Auth
  },
  withErrorHandling(async (request) => {
    const {auth, data} = request;
    const {invitationToken} = data;

    if (!auth) {
      throw createError(ErrorCode.UNAUTHENTICATED, "User must be authenticated to accept an invitation.");
    }
    if (!invitationToken || typeof invitationToken !== "string") {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invitation token is required.");
    }

    const db = getFirestore();
    const hashedToken = hashToken(invitationToken);
    const currentUserId = auth.uid;

    const invitationsRef = db.collection("familyInvitations");
    const query = invitationsRef.where("token", "==", hashedToken).limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid or expired invitation link.");
    }

    const invitationDoc = snapshot.docs[0];
    const invitationData = invitationDoc.data() as FamilyInvitation;

    if (invitationData.status !== "pending") {
      throw createError(ErrorCode.ALREADY_EXISTS, `Invitation has already been ${invitationData.status}.`);
    }

    if (invitationData.invitationExpires.toMillis() < Date.now()) {
      await invitationDoc.ref.update({status: "expired", updatedAt: FieldValue.serverTimestamp()});
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invitation link has expired.");
    }

    // Check if the authenticated user's email matches the inviteeEmail (after converting to lowercase)
    const userAuthRecord = await getAuth().getUser(currentUserId);
    if (userAuthRecord.email?.toLowerCase() !== invitationData.inviteeEmail.toLowerCase()) {
      logger.warn(
        `User ${currentUserId} (${userAuthRecord.email}) attempted to accept invitation for ${invitationData.inviteeEmail}`
      );
      throw createError(
        ErrorCode.PERMISSION_DENIED,
        "This invitation is intended for a different email address."
      );
    }

    // Update user's familyTreeId
    const userRef = db.collection("users").doc(currentUserId);
    await userRef.update({
      familyTreeId: invitationData.familyTreeId,
      updatedAt: FieldValue.serverTimestamp(),
      // Potentially update other fields based on prefillData from invitation
      ...(invitationData.prefillData?.firstName && {firstName: invitationData.prefillData.firstName}),
      ...(invitationData.prefillData?.lastName && {lastName: invitationData.prefillData.lastName}),
      ...(invitationData.prefillData?.gender && {gender: invitationData.prefillData.gender}),
      ...(invitationData.prefillData?.dateOfBirth && {dateOfBirth: Timestamp.fromDate(new Date(invitationData.prefillData.dateOfBirth))}), // Ensure date format is handled
      ...(invitationData.prefillData?.phoneNumber && {phoneNumber: invitationData.prefillData.phoneNumber}),
    });

    // Update invitation status
    await invitationDoc.ref.update({
      status: "accepted",
      acceptedByUserId: currentUserId,
      acceptedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // TODO: Add logic to establish relationships in the family tree based on `invitationData.prefillData.relationshipToInviter`
    // This might involve updating the inviter's and invitee's parentIds, childrenIds, spouseIds arrays.
    // Example: if relationshipToInviter is "child", add currentUserId to inviterData.childrenIds and inviterId to userData.parentIds.
    // This requires fetching the inviter's document and potentially using a transaction or batch write.
    logger.info(`User ${currentUserId} accepted invitation ${invitationDoc.id} to family tree ${invitationData.familyTreeId}.`);

    // Potentially trigger other actions, like creating a default history book entry or sending a welcome notification.

    return {
      success: true,
      message: "Invitation accepted successfully!",
      familyTreeId: invitationData.familyTreeId,
    };
  }, "acceptFamilyInvitation")
);

/**
 * Invites a user to a family tree.
 */
export const inviteUserToFamily = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
    secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_INVITE, FRONTEND_URL],
  },
  withErrorHandling(async (request) => {
    const {auth, data} = request;
    const {
      inviteeEmail,
      inviteeName, // Optional: for a more personal email
      familyTreeId,
      familyTreeName, // Optional: for email context
      // Optional prefill data for the new user if they don't exist
      firstName,
      lastName,
      gender,
      dateOfBirth,
      phoneNumber,
      relationshipToInviter, // e.g., "child", "spouse", "parent"
    } = data;

    if (!auth) {
      throw createError(ErrorCode.UNAUTHENTICATED, "User must be authenticated to send invitations.");
    }
    if (!inviteeEmail || !isValidEmail(inviteeEmail)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "A valid invitee email address is required.");
    }
    if (!familyTreeId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Family Tree ID is required.");
    }

    initSendGrid();
    const db = getFirestore();
    const inviterId = auth.uid;

    const inviterDoc = await db.collection("users").doc(inviterId).get();
    if (!inviterDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Inviter user profile not found.");
    }
    const inviterData = inviterDoc.data() as UserDocument;
    const inviterName = inviterData.displayName || inviterData.firstName || "A family member";

    // Check if inviter has permission to invite to this family tree (e.g., is part of it)
    if (inviterData.familyTreeId !== familyTreeId /* && !inviterData.isAdmin */) {
      // Could also check if inviter is an admin of that specific tree if such a role exists
      throw createError(ErrorCode.PERMISSION_DENIED, "You do not have permission to invite users to this family tree.");
    }

    const invitationToken = generateSecureToken();
    const hashedInvitationToken = hashToken(invitationToken);
    const invitationExpires = Timestamp.fromMillis(Date.now() + TOKEN_EXPIRY.INVITATION);

    const invitationRef = db.collection("familyInvitations").doc(); // Auto-generate ID
    const newInvitation: FamilyInvitation = {
      id: invitationRef.id,
      inviteeEmail: inviteeEmail.toLowerCase(),
      inviteeName: inviteeName || null,
      inviterId,
      inviterName,
      familyTreeId,
      familyTreeName: familyTreeName || "Your Family Tree",
      status: "pending", // pending, accepted, declined, expired
      invitationToken: hashedInvitationToken,
      invitationTokenPlain: invitationToken, // Store plain for link, hash for lookup - consider security implications
      invitationExpires,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      // Prefill data
      prefillData: {
        firstName: firstName || null,
        lastName: lastName || null,
        gender: gender || null,
        dateOfBirth: dateOfBirth || null,
        phoneNumber: phoneNumber || null,
        relationshipToInviter: relationshipToInviter || null,
      },
    };

    await invitationRef.set(newInvitation);

    const fromEmail = SENDGRID_FROMEMAIL.value();
    const inviteTemplateId = SENDGRID_TEMPLATES_INVITE.value();
    const frontendUrlValue = FRONTEND_URL.value();

    if (!fromEmail || !inviteTemplateId || !frontendUrlValue) {
      logger.error("SendGrid configuration secrets are missing for family invitation.");
      await invitationRef.update({status: "failed_config_error"}); // Mark invite as failed
      throw createError(ErrorCode.INTERNAL, "Email service configuration error prevents sending invitation.");
    }

    // Link could go to signup with prefill, or a dedicated accept invite page
    const acceptLink = `${frontendUrlValue}/accept-invitation?token=${invitationToken}`;

    const msg: MailDataRequired = {
      to: inviteeEmail,
      from: {
        email: fromEmail,
        name: "Dynasty App",
      },
      templateId: inviteTemplateId,
      dynamicTemplateData: {
        inviterName: inviterName,
        inviteeName: inviteeName || "Friend",
        familyName: familyTreeName || "their family tree",
        acceptLink: acceptLink,
        // Any other data your template needs
      },
    };

    await sgMail.send(msg);
    logger.info(`Successfully sent invitation email to ${inviteeEmail}`);

    return {
      success: true,
      invitationId: invitationRef.id,
    };
  }, "inviteUserToFamily")
);
