/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {initializeApp} from "firebase-admin/app";

// Initialize Firebase Admin
initializeApp();

// Export all functions
export * from "./familyTree";
export * from "./stories";
export * from "./auth";
export * from "./api"; // HTTP API endpoints
export * from "./events"; // Event management functions
export * from "./eventsApi";
export * from "./notifications"; // Notification functions
export * from "./vault";
