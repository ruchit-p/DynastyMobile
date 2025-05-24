// This file exports CORS configuration that can be used by other HTTP endpoints

import cors from "cors";
import {logger} from "firebase-functions/v2";
import {CORS_ORIGINS} from "./common";

/**
 * Returns a configured CORS middleware for use with HTTP functions
 */
export const corsOptions = () => {
  const isDevelopment = process.env.NODE_ENV === "development";
  const allowedOrigins = [
    CORS_ORIGINS.PRODUCTION, // Production domain
    CORS_ORIGINS.PRODUCTION_WWW, // www subdomain
    CORS_ORIGINS.DEVELOPMENT, // Local development
    CORS_ORIGINS.FIREBASE_AUTH, // Firebase Auth domain
  ];

  return cors({
    origin: (origin: string | undefined, callback: (err: Error | null, origin?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps, curl, etc)
      if (!origin) {
        logger.debug("CORS: allowing request with no origin");
        callback(null, true);
        return;
      }

      if (isDevelopment && origin.startsWith("http://localhost")) {
        logger.debug(`CORS: allowing localhost origin in development: ${origin}`);
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        logger.debug(`CORS: allowing whitelisted origin: ${origin}`);
        callback(null, true);
        return;
      }

      logger.warn(`CORS: rejecting disallowed origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  });
};
