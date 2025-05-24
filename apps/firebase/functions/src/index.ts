/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {initializeApp} from "firebase-admin/app";
import {setGlobalOptions} from "firebase-functions/v2";
import {DEFAULT_REGION} from "./common";

// Set global options for ALL Firebase Functions
setGlobalOptions({region: DEFAULT_REGION});

// Initialize Firebase Admin
initializeApp();

// Export all functions
export * from "./familyTree";
export * from "./stories";
export * from "./auth/index"; // Modular auth functions (user management, authentication, passwords, etc.)
export * from "./api"; // HTTP API endpoints
export * from "./events-service"; // Consolidated event management functions
export * from "./notifications"; // Notification functions
export * from "./vault";
export * from "./placesApi";
export * from "./encryption"; // End-to-end encryption functions
export * from "./sync"; // Offline sync functions
export * from "./messaging"; // Chat messaging and notifications
export * from "./chatManagement"; // Chat management APIs
