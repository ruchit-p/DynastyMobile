import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {getAuth} from "firebase-admin/auth";
import {MailDataRequired} from "@sendgrid/mail";
import * as sgMail from "@sendgrid/mail";
import {
  isValidEmail,
  isValidPassword,
} from "../../utils/validation";
import {FUNCTION_TIMEOUT} from "../../common";
import type {SignupData} from "../../utils/validation";
import {createError, withErrorHandling, ErrorCode} from "../../utils/errors";
import {withAuth} from "../../middleware/auth";
import {UserDocument} from "../types/user";
import {initSendGrid} from "../config/sendgrid";
import {SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_VERIFICATION, FRONTEND_URL} from "../config/secrets";
import {generateSecureToken, hashToken} from "../utils/tokens";

/**
 * Handles the signup process, which now only:
 * - Creates Firebase Auth account
 * - Sends verification email
 *
 * Firestore document creation is now handled in completeOnboarding
 */
export const handleSignUp = onCall({
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_VERIFICATION, FRONTEND_URL],
}, async (request) => {
  const signupData: SignupData = request.data;
  logger.info(`Starting simplified signup process for email: ${signupData.email}`);

  try {
    // Initialize SendGrid
    initSendGrid();

    // Validate email and password
    if (!isValidEmail(signupData.email)) {
      throw new Error("Invalid email address");
    }

    const passwordValidation = isValidPassword(signupData.password);
    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.message);
    }

    const auth = getAuth();
    const db = getFirestore();

    // Check if email already exists
    try {
      await auth.getUserByEmail(signupData.email);
      throw new HttpsError(
        "already-exists",
        "An account with this email already exists"
      );
    } catch (error: any) {
      // Proceed only if error code is auth/user-not-found
      if (error.code !== "auth/user-not-found") {
        if (error instanceof HttpsError) {
          throw error;
        }
        throw new HttpsError(
          "already-exists",
          "An account with this email already exists"
        );
      }
    }

    // Create the Firebase Auth account
    const userRecord = await auth.createUser({
      email: signupData.email,
      password: signupData.password,
      emailVerified: false,
    });

    const userId = userRecord.uid;

    // Create a minimal user document in Firestore
    // This is needed so that we can later update it with onboarding data
    const userRef = db.collection("users").doc(userId);
    await userRef.set({
      id: userId,
      email: signupData.email,
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: false,
      onboardingCompleted: false,
      dataRetentionPeriod: "forever",
      dataRetentionLastUpdated: new Date(),
    });

    // Generate verification token and send verification email
    const verificationToken = generateSecureToken();
    const hashedToken = hashToken(verificationToken);
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 30); // Token expires in 30 minutes

    // Update user document with verification token
    await userRef.update({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: expiryTime,
    });

    // Send verification email
    const verificationLink = `${FRONTEND_URL.value()}/verify-email/confirm?uid=${userId}&token=${verificationToken}`;
    const msg: MailDataRequired = {
      to: signupData.email,
      from: SENDGRID_FROMEMAIL.value(),
      templateId: SENDGRID_TEMPLATES_VERIFICATION.value(),
      dynamicTemplateData: {
        username: signupData.email.split("@")[0], // Use email username as fallback since we don't have names yet
        verificationLink: verificationLink,
      },
    };

    await sgMail.send(msg);
    logger.info(`Successfully completed simplified signup process for user ${userId}`);

    return {
      success: true,
      userId,
    };
  } catch (error: any) {
    logger.error("Error in handleSignUp:", error);
    if (error instanceof HttpsError) {
      throw error; // Re-throw HttpsError instances as is
    }
    // For other types of errors, throw a generic HttpsError
    const message = error?.message || "Failed to complete signup process";
    throw new HttpsError("internal", message, error);
  }
});

/**
 * Handles the onboarding process, which:
 * - Updates the user document with profile information
 * - Creates family tree document (for new users) or links to existing tree (for invited users)
 * - Creates history book document
 * - Sets up necessary relationships
 * - Handles migration of data for invited users
 */
export const completeOnboarding = onCall({
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
}, async (request) => {
  const {userId, firstName, lastName, dateOfBirth, gender, phoneNumber, displayName} = request.data;

  logger.info(`Starting onboarding process for user: ${userId}`);

  try {
    const db = getFirestore();
    const auth = getAuth();

    // Validate inputs
    if (!userId || !firstName || !lastName) {
      throw new Error("Required fields missing. Please provide userId, firstName, and lastName.");
    }

    // Get the Auth user
    let authUser;
    try {
      authUser = await auth.getUser(userId);
    } catch (error) {
      logger.error(`Auth user not found for ID: ${userId}`, error);
      throw new Error("Auth user not found. Please sign up first.");
    }

    // Get the user document
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    const batch = db.batch();

    // Use the provided displayName or create one from firstName and lastName
    const finalDisplayName = displayName || `${firstName} ${lastName}`.trim();

    // Update Firebase Auth profile with displayName
    try {
      await auth.updateUser(userId, {
        displayName: finalDisplayName,
      });
    } catch (error) {
      logger.warn(`Could not update Auth displayName for user ${userId}`, error);
      // Continue with the process even if Auth update fails
    }

    // If user exists in Auth but not in Firestore, create the Firestore document
    if (!userDoc.exists && authUser) {
      logger.info(`Creating Firestore document for user ${userId}`);

      // Create a new family tree for the user
      const familyTreeRef = db.collection("familyTrees").doc();
      const familyTreeId = familyTreeRef.id;

      // Create a new history book for the user
      const historyBookRef = db.collection("historyBooks").doc();
      const historyBookId = historyBookRef.id;

      // Create family tree document
      batch.set(familyTreeRef, {
        id: familyTreeId,
        ownerUserId: userId,
        memberUserIds: [userId],
        adminUserIds: [userId],
        treeName: `${firstName}'s Family Tree`,
        memberCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        isPrivate: true,
      });

      // Create history book document
      batch.set(historyBookRef, {
        id: historyBookId,
        ownerUserId: userId,
        familyTreeId: familyTreeId,
        title: `${firstName}'s History Book`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create user document
      const userData: UserDocument = {
        id: userId,
        displayName: finalDisplayName,
        email: authUser.email || "",
        firstName: firstName,
        lastName: lastName,
        phoneNumber: phoneNumber || authUser.phoneNumber || null,
        parentIds: [],
        childrenIds: [],
        spouseIds: [],
        familyTreeId,
        historyBookId,
        gender: gender || "other",
        isAdmin: true,
        canAddMembers: true,
        canEdit: true,
        isPendingSignUp: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        dataRetentionPeriod: "forever",
        dataRetentionLastUpdated: new Date(),
        onboardingCompleted: true,
      };

      batch.set(userRef, userData);

      // Update Firebase Auth user to ensure email is verified
      await auth.updateUser(userId, {
        emailVerified: true,
      });

      // Commit the batch and return success
      await batch.commit();

      logger.info(`Successfully created Firestore documents for user ${userId}`);

      return {
        success: true,
        userId,
        familyTreeId,
        historyBookId,
      };
    }

    // For users that already have a Firestore document
    if (userDoc.exists) {
      const userData = userDoc.data() as Partial<UserDocument>;

      // Check if this is an invited user
      const invitationId = userData.invitationId;
      let invitation: any = null;
      let oldUserId: string | null = null;
      let familyTreeId: string | null = null;
      let prefillData: any = null;
      let oldUserParentIds: string[] = [];
      let oldUserChildrenIds: string[] = [];
      let oldUserSpouseIds: string[] = [];

      if (invitationId) {
        logger.info(`Processing invited user onboarding for invitation: ${invitationId}`);
        const invitationDoc = await db.collection("invitations").doc(invitationId).get();

        if (invitationDoc.exists) {
          invitation = invitationDoc.data();
          if (invitation) {
            oldUserId = invitation.inviteeId;
            familyTreeId = invitation.familyTreeId;
            prefillData = invitation.prefillData;

            logger.info(`Found invitation with prefill data: ${JSON.stringify(prefillData || {})}`);

            // Get the old user document if it exists
            if (oldUserId) {
              const oldUserDoc = await db.collection("users").doc(oldUserId).get();
              if (oldUserDoc.exists) {
                logger.info(`Found old user document for ${oldUserId}, will migrate relationships`);
                // Extract relationship data from old user document
                const oldUserData = oldUserDoc.data();
                oldUserParentIds = oldUserData?.parentIds || [];
                oldUserChildrenIds = oldUserData?.childrenIds || [];
                oldUserSpouseIds = oldUserData?.spouseIds || [];
                logger.info(`Retrieved relationship data from old user: parentIds(${oldUserParentIds.length}), childrenIds(${oldUserChildrenIds.length}), spouseIds(${oldUserSpouseIds.length})`);
              }
            }
          }
        }
      }

      // For non-invited users, create a new family tree
      if (!familyTreeId) {
        const familyTreeRef = db.collection("familyTrees").doc();
        familyTreeId = familyTreeRef.id;

        batch.set(familyTreeRef, {
          id: familyTreeId,
          ownerUserId: userId,
          memberUserIds: [userId],
          adminUserIds: [userId],
          treeName: `${firstName}'s Family Tree`,
          memberCount: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          isPrivate: true,
        });
      } else {
        // For invited users, add them to the existing family tree
        const familyTreeRef = db.collection("familyTrees").doc(familyTreeId);
        const familyTreeDoc = await familyTreeRef.get();

        if (familyTreeDoc.exists) {
          const treeData = familyTreeDoc.data();
          if (treeData) {
            const memberUserIds = treeData.memberUserIds || [];

            if (!memberUserIds.includes(userId)) {
              batch.update(familyTreeRef, {
                memberUserIds: [...memberUserIds, userId],
                memberCount: (treeData.memberCount || 0) + 1,
                updatedAt: new Date(),
              });
            }
          }
        }
      }

      // Create history book document
      const historyBookRef = db.collection("historyBooks").doc();
      const historyBookId = historyBookRef.id;
      batch.set(historyBookRef, {
        id: historyBookId,
        ownerUserId: userId,
        familyTreeId: familyTreeId,
        title: `${firstName}'s History Book`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Use prefilled data from invitation if available and not overridden by user input
      const finalFirstName = firstName || (prefillData?.firstName) || "";
      const finalLastName = lastName || (prefillData?.lastName) || "";
      const finalDateOfBirth = dateOfBirth || (prefillData?.dateOfBirth) || null;
      const finalGender = gender || (prefillData?.gender) || "other";
      const finalPhoneNumber = phoneNumber || (prefillData?.phoneNumber) || null;

      // Update user document with onboarding information
      batch.update(userRef, {
        displayName: finalDisplayName,
        firstName: finalFirstName,
        lastName: finalLastName,
        dateOfBirth: finalDateOfBirth instanceof Date ? finalDateOfBirth : finalDateOfBirth ? new Date(finalDateOfBirth) : null,
        gender: finalGender,
        phoneNumber: finalPhoneNumber,
        familyTreeId,
        historyBookId,
        parentIds: oldUserParentIds,
        childrenIds: oldUserChildrenIds,
        spouseIds: oldUserSpouseIds,
        isAdmin: true,
        canAddMembers: true,
        canEdit: true,
        isPendingSignUp: false,
        updatedAt: new Date(),
        onboardingCompleted: true,
        // Remove the invitation ID as it's no longer needed
        invitationId: null,
      });

      // If this is an invited user, handle relationship migrations
      if (oldUserId && invitation) {
        logger.info(`Migrating relationships for invited user from ${oldUserId} to ${userId}`);

        // Update all family trees where the old user is a member
        const familyTreesQuery = await db.collection("familyTrees")
          .where("memberUserIds", "array-contains", oldUserId)
          .get();

        familyTreesQuery.forEach((doc) => {
          const treeData = doc.data();
          batch.update(doc.ref, {
            memberUserIds: (treeData.memberUserIds || []).map((id: string) => id === oldUserId ? userId : id),
            adminUserIds: (treeData.adminUserIds || []).map((id: string) => id === oldUserId ? userId : id),
            updatedAt: new Date(),
          });
        });

        // Update history books
        const historyBooksQuery = await db.collection("historyBooks")
          .where("ownerUserId", "==", oldUserId)
          .get();

        historyBooksQuery.forEach((doc) => {
          batch.update(doc.ref, {
            ownerUserId: userId,
            updatedAt: new Date(),
          });
        });

        // Update stories
        const storiesQuery = await db.collection("stories")
          .where("authorId", "==", oldUserId)
          .get();

        storiesQuery.forEach((doc) => {
          batch.update(doc.ref, {
            authorId: userId,
            updatedAt: new Date(),
          });
        });

        // Update all relationship references in other user documents
        const [parentRefs, childRefs, spouseRefs] = await Promise.all([
          db.collection("users").where("parentIds", "array-contains", oldUserId).get(),
          db.collection("users").where("childrenIds", "array-contains", oldUserId).get(),
          db.collection("users").where("spouseIds", "array-contains", oldUserId).get(),
        ]);

        const updateDoc = (doc: any, field: string) => {
          const data = doc.data();
          if (data[field]?.includes(oldUserId)) {
            batch.update(doc.ref, {
              [field]: data[field].map((id: string) => id === oldUserId ? userId : id),
              updatedAt: new Date(),
            });
          }
        };

        parentRefs.forEach((doc) => updateDoc(doc, "parentIds"));
        childRefs.forEach((doc) => updateDoc(doc, "childrenIds"));
        spouseRefs.forEach((doc) => updateDoc(doc, "spouseIds"));

        // Update any comments or reactions that reference the old user ID
        const commentsQuery = await db.collection("comments")
          .where("authorId", "==", oldUserId)
          .get();

        commentsQuery.forEach((doc) => {
          batch.update(doc.ref, {
            authorId: userId,
            updatedAt: new Date(),
          });
        });

        const reactionsQuery = await db.collection("reactions")
          .where("userId", "==", oldUserId)
          .get();

        reactionsQuery.forEach((doc) => {
          batch.update(doc.ref, {
            userId: userId,
            updatedAt: new Date(),
          });
        });

        // Delete the old user document
        const oldUserDoc = await db.collection("users").doc(oldUserId).get();
        if (oldUserDoc.exists) {
          batch.delete(oldUserDoc.ref);
        }
      }

      // Commit all Firestore operations
      await batch.commit();

      logger.info(`Successfully completed onboarding process for user ${userId}`);

      return {
        success: true,
        userId,
        familyTreeId,
        historyBookId,
      };
    }

    throw new Error("Unexpected user document state. Please contact support.");
  } catch (error) {
    logger.error("Error in completeOnboarding:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to complete onboarding process");
  }
});

/**
 * Signs up a new user with email and password.
 */
export const signUpWithEmail = onCall(
  {
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM, // Increased for Auth + DB operations
    secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_VERIFICATION, FRONTEND_URL],
  },
  withErrorHandling(async (request) => {
    const {email, password, displayName, firstName, lastName, invitationId, familyTreeId: initialFamilyTreeId, gender, dateOfBirth, phoneNumber} = request.data as SignupData;

    if (!email || !isValidEmail(email)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "A valid invitee email address is required.");
    }

    const passwordValidation = isValidPassword(password);
    if (!password || !passwordValidation.isValid) {
      throw createError(ErrorCode.INVALID_ARGUMENT, passwordValidation.message || "Password is required.");
    }

    const auth = getAuth();
    let newUserRecord;
    try {
      newUserRecord = await auth.createUser({
        email,
        password,
        displayName: displayName || `${firstName || ""} ${lastName || ""}`.trim(),
        emailVerified: false, // Email will be verified via separate step
        phoneNumber: phoneNumber || undefined,
      });
      logger.info(`User created in Firebase Auth with UID: ${newUserRecord.uid}`);
    } catch (error: any) {
      logger.error("Error creating user in Firebase Auth:", error);
      if (error.code === "auth/email-already-exists") {
        throw createError(ErrorCode.ALREADY_EXISTS, "An account with this email already exists.");
      }
      throw createError(ErrorCode.INTERNAL, "Failed to create user account.", {originalError: error.message});
    }

    // Create user document in Firestore
    try {
      // Construct the request object as expected by a callable function
      const createUserDocumentRequest = {
        data: {
          uid: newUserRecord.uid,
          email,
          displayName: newUserRecord.displayName,
          phoneNumber: newUserRecord.phoneNumber,
          photoURL: newUserRecord.photoURL,
          invitationId,
          familyTreeId: initialFamilyTreeId,
          firstName,
          lastName,
          gender,
          dateOfBirth,
        },
        auth: {uid: newUserRecord.uid, token: {} as any}, // Mock auth context
      };
      await (createUserDocument as any)(createUserDocumentRequest as any);
    } catch (dbError: any) {
      logger.error(`Error creating Firestore document for user ${newUserRecord.uid} after signup:`, dbError);
      // Potentially try to delete the Auth user if DB creation fails critically, or mark for cleanup
      // For now, log and let admin handle inconsistencies if they arise.
      // Throwing an error here will roll back the createUserDocument if it also uses withErrorHandling effectively.
      throw createError(ErrorCode.INTERNAL, "Failed to finalize user setup. Please contact support.", {originalError: dbError.message});
    }

    // Note: Verification email should be sent by the client after successful signup
    // to avoid circular dependencies between modules

    return {
      success: true,
      userId: newUserRecord.uid,
      message: "Signup successful. Please check your email to verify your account.",
    };
  }, "signUpWithEmail")
);

/**
 * Creates a user document in Firestore.
 * This is typically called after a user is created in Firebase Auth.
 */
export const createUserDocument = onCall(
  {
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [], // Accesses Firestore
  },
  withAuth(
    async (request) => {
      const {uid, email, displayName, phoneNumber, photoURL, invitationId, familyTreeId: initialFamilyTreeId, firstName, lastName, gender, dateOfBirth} = request.data;

      if (!uid || !email) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "User ID and email are required.");
      }

      const db = getFirestore();
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        logger.info(`User document for ${uid} already exists.`);
        // Optionally update if it exists but is missing some info from Auth, or return error/success
        return {success: true, message: "User document already exists.", userId: uid};
      }

      const now = Timestamp.now();
      // Fetch Auth user record to get the latest emailVerified status
      let authUserRecord;
      try {
        authUserRecord = await getAuth().getUser(uid);
      } catch (e) {
        logger.error(`Failed to fetch auth record for user ${uid} during document creation:`, e);
        throw createError(ErrorCode.INTERNAL, "Failed to verify user auth status for document creation.");
      }

      const newUser: UserDocument = {
        id: uid,
        email: email,
        firstName: firstName || displayName?.split(" ")[0] || "",
        lastName: lastName || displayName?.split(" ").slice(1).join(" ") || "",
        displayName: displayName || `${firstName || ""} ${lastName || ""}`.trim(),
        phoneNumber: phoneNumber || null,
        phoneNumberVerified: false, // Assuming phone not verified at this stage
        profilePicture: photoURL ? {url: photoURL, path: ""} : undefined, // Store as profilePicture if structure matches
        parentIds: [],
        childrenIds: [],
        spouseIds: [],
        familyTreeId: initialFamilyTreeId || undefined, // Set if provided during signup (e.g. from invite)
        historyBookId: undefined, // Or generate one
        gender: gender || "unspecified",
        isAdmin: false, // Default to not admin
        canAddMembers: true, // Default permissions
        canEdit: true,
        createdAt: now.toDate(), // Store as Date
        updatedAt: now.toDate(), // Store as Date
        emailVerified: authUserRecord.emailVerified, // Get from Auth record
        isPendingSignUp: false, // User creation implies signup is no longer pending
        dataRetentionPeriod: "forever",
        dataRetentionLastUpdated: now.toDate(),
        onboardingCompleted: false,
        invitationId: invitationId || undefined,
      };
      if (dateOfBirth) {
        try {
          (newUser as any).dateOfBirth = Timestamp.fromDate(new Date(dateOfBirth));
        } catch (e) {
          logger.warn(`Invalid dateOfBirth format for user ${uid}: ${dateOfBirth}`);
        }
      }

      await userRef.set(newUser);
      logger.info(`User document created for ${uid}`);

      // If an invitationId is present, mark the invitation as accepted/used
      if (invitationId) {
        try {
          const invitationRef = db.collection("familyInvitations").doc(invitationId);
          const invitationDoc = await invitationRef.get();
          if (invitationDoc.exists) {
            await invitationRef.update({
              status: "accepted",
              acceptedAt: now,
              acceptedByUserId: uid,
            });
            logger.info(`Invitation ${invitationId} marked as accepted by user ${uid}.`);
          }
        } catch (invError) {
          logger.error(`Error updating invitation ${invitationId} after user creation:`, invError);
        }
      }

      return {success: true, userId: uid, message: "User document created successfully."};
    },
    "createUserDocument",
    "auth"
  )
);

// Placeholder for signInWithPhoneNumber - Requires more complex setup with Recaptcha or other verification
export const signInWithPhoneNumber = onCall(
  {
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    // secrets: [RECAPTCHA_SECRET_KEY] // If using reCAPTCHA Enterprise
  },
  withErrorHandling(async (/* request */) => { // request is unused
    // const {phoneNumber, recaptchaToken} = request.data;
    // Implementation depends on chosen verification method (e.g., reCAPTCHA, custom OTP service)
    // This is a complex flow involving client-side steps as well.
    logger.warn("signInWithPhoneNumber is not fully implemented yet.");
    throw createError(ErrorCode.UNIMPLEMENTED, "Phone number sign-in is not available at this moment.");
  }, "signInWithPhoneNumber")
);

// Placeholder for verifyPhoneNumber
export const verifyPhoneNumber = onCall(
  {
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async () => { // Removed unused request
    // const {verificationId, verificationCode} = request.data;
    logger.warn("verifyPhoneNumber is not fully implemented yet.");
    throw createError(ErrorCode.UNIMPLEMENTED, "Phone number verification is not available at this moment.");
  }, "verifyPhoneNumber")
);

// Placeholder for resendPhoneNumberVerification
export const resendPhoneNumberVerification = onCall(
  {
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async () => { // Removed unused request
    // const {phoneNumber, recaptchaToken} = request.data;
    logger.warn("resendPhoneNumberVerification is not fully implemented yet.");
    throw createError(ErrorCode.UNIMPLEMENTED, "Resending phone number verification is not available at this moment.");
  }, "resendPhoneNumberVerification")
);

/**
 * Handles post-phone number sign-in logic.
 * This function is typically called after a user successfully verifies their phone number.
 *
 * @param request Contains `data` ({ uid: string; phoneNumber: string }) and `auth` (auth context).
 * @returns A promise that resolves with a success or error object.
 */
export const handlePhoneSignIn = onCall(
  {
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  async (request) => {
    // For v2 onCall, data is in request.data
    // Auth context (if user is authenticated when calling) is in request.auth
    const {uid, phoneNumber} = request.data;

    if (!uid) {
      logger.error("handlePhoneSignIn: UID is missing in the request data.");
      throw createError(ErrorCode.INVALID_ARGUMENT, "The function must be called with a 'uid' argument.");
    }
    if (!phoneNumber) {
      logger.error("handlePhoneSignIn: phoneNumber is missing in the request data.");
      throw createError(ErrorCode.INVALID_ARGUMENT, "The function must be called with a 'phoneNumber' argument.");
    }

    logger.info(`handlePhoneSignIn: Processing request for UID: ${uid}, Phone: ${phoneNumber}`);

    try {
      const userRecord = await getAuth().getUser(uid); // Use getAuth() from firebase-admin/auth
      logger.info(`handlePhoneSignIn: Successfully fetched user record for UID: ${uid}`, userRecord.toJSON());

      const db = getFirestore(); // Use getFirestore() from firebase-admin/firestore
      const userDocRef = db.collection("users").doc(uid);
      const userDoc = await userDocRef.get();

      if (!userDoc.exists) {
        logger.info(`handlePhoneSignIn: User document does not exist for UID: ${uid}. Creating new document.`);
        await userDocRef.set({
          uid: uid,
          phoneNumber: phoneNumber,
          email: userRecord.email,
          displayName: userRecord.displayName,
          photoURL: userRecord.photoURL,
          createdAt: FieldValue.serverTimestamp(), // Use FieldValue from firebase-admin/firestore
          onboardingCompleted: false,
        }, {merge: true});
        logger.info(`handlePhoneSignIn: Successfully created user document for UID: ${uid}`);
      } else {
        logger.info(`handlePhoneSignIn: User document already exists for UID: ${uid}. Updating phone number.`);
        await userDocRef.update({
          phoneNumber: phoneNumber,
        });
        logger.info(`handlePhoneSignIn: Successfully updated user document for UID: ${uid}`);
      }

      return {
        success: true,
        message: `User ${uid} processed successfully with phone number ${phoneNumber}.`,
        userId: uid,
      };
    } catch (error: any) {
      logger.error(`handlePhoneSignIn: Error processing UID: ${uid}`, error);
      if (error.code && error.message) {
        throw error; // Re-throw if it's already a properly formatted error
      }
      throw createError(
        ErrorCode.INTERNAL,
        error.message || "An internal error occurred while processing the phone sign-in."
      );
    }
  }
);
