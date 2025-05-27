import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {getAuth} from "firebase-admin/auth";
import {FUNCTION_TIMEOUT} from "../../common";
import type {SignupData} from "../../utils/validation";
import {createError, withErrorHandling, ErrorCode} from "../../utils/errors";
import {createLogContext} from "../../utils";
import {UserDocument} from "../types/user";
import {initSendGrid} from "../config/sendgrid";
import {SENDGRID_CONFIG, FRONTEND_URL} from "../config/secrets";
import {generateSecureToken, hashToken} from "../utils/tokens";
import {validateRequest} from "../../utils/request-validator";
import {VALIDATION_SCHEMAS} from "../../config/validation-schemas";
import {checkRateLimitByIP, RateLimitType} from "../../middleware/auth";

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
  secrets: [SENDGRID_CONFIG, FRONTEND_URL],
}, async (request) => {
  // Apply rate limiting for signup attempts
  await checkRateLimitByIP(request, {
    type: RateLimitType.AUTH,
    maxRequests: 5, // Max 5 signup attempts per IP
    windowSeconds: 900, // 15 minutes
  });

  // Validate and sanitize input using centralized validator
  const validatedData = validateRequest(
    request.data,
    VALIDATION_SCHEMAS.signup,
    undefined // No userId yet since it's signup
  );

  const signupData: SignupData = validatedData;
  logger.info("Starting simplified signup process", createLogContext({
    email: signupData.email,
  }));

  try {
    // Initialize SendGrid
    initSendGrid();

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

    // Create a complete user document with all required fields initialized
    const userRef = db.collection("users").doc(userId);
    const newUserDoc: Partial<UserDocument> = {
      // Identity fields
      id: userId,
      email: signupData.email,

      // Profile fields (undefined until onboarding)
      displayName: undefined,
      firstName: undefined,
      lastName: undefined,
      phoneNumber: undefined,
      phoneNumberVerified: false,
      profilePicture: undefined,

      // Relationship fields (empty arrays)
      parentIds: [],
      childrenIds: [],
      spouseIds: [],

      // Organization fields (undefined until onboarding)
      familyTreeId: undefined,
      historyBookId: undefined,

      // Personal fields
      gender: undefined,
      dateOfBirth: undefined,

      // Permission fields (defaults)
      isAdmin: false,
      canAddMembers: false,
      canEdit: false,

      // Status fields
      emailVerified: false,
      isPendingSignUp: false,
      onboardingCompleted: false,

      // System fields
      createdAt: new Date(),
      updatedAt: new Date(),
      dataRetentionPeriod: "forever",
      dataRetentionLastUpdated: new Date(),

      // Optional fields
      invitationId: undefined,
    };

    await userRef.set(newUserDoc);

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

    // Send verification email using helper
    const verificationLink = `${FRONTEND_URL.value()}/verify-email/confirm?uid=${userId}&token=${verificationToken}`;
    const {sendEmail} = await import("../utils/sendgridHelper");
    await sendEmail({
      to: signupData.email,
      templateType: "verification",
      dynamicTemplateData: {
        username: signupData.email.split("@")[0], // Use email username as fallback since we don't have names yet
        verificationLink: verificationLink,
      },
    });
    logger.info("Successfully completed simplified signup process", createLogContext({
      userId: userId,
    }));

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
  const userId = request.data.userId;

  if (!userId) {
    throw createError(ErrorCode.INVALID_ARGUMENT, "User ID is required");
  }

  // Validate and sanitize input using centralized validator
  const validatedData = validateRequest(
    request.data,
    VALIDATION_SCHEMAS.completeOnboarding,
    userId
  );

  const {phone, dateOfBirth, gender} = validatedData;

  // Extract firstName and lastName from the data for compatibility
  const firstName = request.data.firstName;
  const lastName = request.data.lastName;
  const phoneNumber = phone;
  const displayName = request.data.displayName || `${firstName} ${lastName}`.trim();

  logger.info("Starting onboarding process", createLogContext({
    userId: userId,
  }));

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
      logger.error("Auth user not found", createLogContext({
        userId: userId,
        error: error instanceof Error ? error.message : String(error),
      }));
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
      logger.warn("Could not update Auth displayName", createLogContext({
        userId: userId,
        error: error instanceof Error ? error.message : String(error),
      }));
      // Continue with the process even if Auth update fails
    }

    // If user exists in Auth but not in Firestore, create the Firestore document
    if (!userDoc.exists && authUser) {
      logger.info("Creating Firestore document", createLogContext({
        userId: userId,
      }));

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

      logger.info("Successfully created Firestore documents", createLogContext({
        userId: userId,
      }));

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
        logger.info("Processing invited user onboarding", createLogContext({
          invitationId: invitationId,
        }));
        const invitationDoc = await db.collection("invitations").doc(invitationId).get();

        if (invitationDoc.exists) {
          invitation = invitationDoc.data();
          if (invitation) {
            oldUserId = invitation.inviteeId;
            familyTreeId = invitation.familyTreeId;
            prefillData = invitation.prefillData;

            logger.info("Found invitation with prefill data", createLogContext({
              invitationId: invitationId,
              hasPrefillData: !!prefillData,
            }));

            // Get the old user document if it exists
            if (oldUserId) {
              const oldUserDoc = await db.collection("users").doc(oldUserId).get();
              if (oldUserDoc.exists) {
                logger.info("Found old user document, will migrate relationships", createLogContext({
                  oldUserId: oldUserId,
                }));
                // Extract relationship data from old user document
                const oldUserData = oldUserDoc.data();
                oldUserParentIds = oldUserData?.parentIds || [];
                oldUserChildrenIds = oldUserData?.childrenIds || [];
                oldUserSpouseIds = oldUserData?.spouseIds || [];
                logger.info("Retrieved relationship data from old user", createLogContext({
                  oldUserId: oldUserId,
                  parentCount: oldUserParentIds.length,
                  childrenCount: oldUserChildrenIds.length,
                  spouseCount: oldUserSpouseIds.length,
                }));
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
        logger.info("Migrating relationships for invited user", createLogContext({
          oldUserId: oldUserId,
          newUserId: userId,
        }));

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

      logger.info("Successfully completed onboarding process", createLogContext({
        userId: userId,
      }));

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

// Placeholder for signInWithPhoneNumber - Requires more complex setup with Recaptcha or other verification
export const signInWithPhoneNumber = onCall(
  {
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    // secrets: [RECAPTCHA_SECRET_KEY] // If using reCAPTCHA Enterprise
  },
  withErrorHandling(async (request) => {
    // Apply rate limiting for phone sign-in attempts
    await checkRateLimitByIP(request, {
      type: RateLimitType.AUTH,
      maxRequests: 5, // Max 5 attempts per IP
      windowSeconds: 900, // 15 minutes
    });
    
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
    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.handlePhoneSignIn,
      undefined // No auth context required for this function
    );

    const {uid, phoneNumber} = validatedData;

    logger.info("handlePhoneSignIn: Processing request", createLogContext({
      uid: uid,
      phoneNumber: phoneNumber,
    }));

    try {
      const userRecord = await getAuth().getUser(uid); // Use getAuth() from firebase-admin/auth
      logger.info("handlePhoneSignIn: Successfully fetched user record", createLogContext({
        uid: uid,
        email: userRecord.email,
        phoneNumber: userRecord.phoneNumber,
      }));

      const db = getFirestore(); // Use getFirestore() from firebase-admin/firestore
      const userDocRef = db.collection("users").doc(uid);
      const userDoc = await userDocRef.get();

      if (!userDoc.exists) {
        logger.info("handlePhoneSignIn: User document does not exist. Creating new document", createLogContext({
          uid: uid,
        }));

        // Create a complete user document with all required fields (same as handleSignUp)
        const newUserDoc: Partial<UserDocument> = {
          // Identity fields
          id: uid, // Use 'id' not 'uid' for consistency
          email: userRecord.email || "",

          // Profile fields
          displayName: userRecord.displayName || undefined,
          firstName: undefined,
          lastName: undefined,
          phoneNumber: phoneNumber,
          phoneNumberVerified: true, // Phone is verified if they got this far
          profilePicture: userRecord.photoURL ? {url: userRecord.photoURL, path: ""} : undefined,

          // Relationship fields (empty arrays)
          parentIds: [],
          childrenIds: [],
          spouseIds: [],

          // Organization fields (undefined until onboarding)
          familyTreeId: undefined,
          historyBookId: undefined,

          // Personal fields
          gender: undefined,
          dateOfBirth: undefined,

          // Permission fields (defaults)
          isAdmin: false,
          canAddMembers: false,
          canEdit: false,

          // Status fields
          emailVerified: userRecord.emailVerified || false,
          isPendingSignUp: false,
          onboardingCompleted: false,

          // System fields
          createdAt: new Date(),
          updatedAt: new Date(),
          dataRetentionPeriod: "forever",
          dataRetentionLastUpdated: new Date(),

          // Optional fields
          invitationId: undefined,
        };

        await userDocRef.set(newUserDoc);
        logger.info("handlePhoneSignIn: Successfully created user document", createLogContext({
          uid: uid,
        }));
      } else {
        logger.info("handlePhoneSignIn: User document already exists. Updating phone number", createLogContext({
          uid: uid,
        }));
        await userDocRef.update({
          phoneNumber: phoneNumber,
          phoneNumberVerified: true, // Mark as verified since they completed phone auth
          updatedAt: new Date(),
        });
        logger.info("handlePhoneSignIn: Successfully updated user document", createLogContext({
          uid: uid,
        }));
      }

      return {
        success: true,
        message: `User ${uid} processed successfully with phone number ${phoneNumber}.`,
        userId: uid,
      };
    } catch (error: any) {
      logger.error("handlePhoneSignIn: Error processing request", createLogContext({
        uid: uid,
        error: error.message,
      }));
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
