import {logger} from "firebase-functions/v2";

/**
 * Validate if a string is a valid URL origin
 * @param origin The origin to validate
 * @returns true if valid, false otherwise
 */
function isValidOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    // Ensure it's a valid HTTP/HTTPS origin
    return (url.protocol === "http:" || url.protocol === "https:") &&
           url.hostname !== "" &&
           url.pathname === "/" && // Origins should not have paths
           url.search === "" && // Origins should not have query strings
           url.hash === ""; // Origins should not have hashes
  } catch {
    return false;
  }
}

/**
 * CORS configuration for Firebase Functions
 */
export function getCorsConfig() {
  // In production, use specific allowed origins
  if (process.env.NODE_ENV === "production") {
    const envOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) || [];

    // Default production origins
    const defaultOrigins = [
      "https://mydynastyapp.com",
      "https://www.mydynastyapp.com",
    ];

    // Combine and deduplicate origins
    const allOrigins = [...new Set([...envOrigins, ...defaultOrigins])];

    // Filter out invalid origins
    const validOrigins = allOrigins.filter(isValidOrigin);

    if (validOrigins.length === 0) {
      logger.error("No valid CORS origins configured, falling back to defaults");
      return defaultOrigins;
    }

    // Log any invalid origins that were filtered out
    const invalidOrigins = allOrigins.filter((origin) => !isValidOrigin(origin));
    if (invalidOrigins.length > 0) {
      logger.warn("Invalid CORS origins filtered out", {invalidOrigins});
    }

    logger.info("CORS configured for production origins", {validOrigins});
    return validOrigins;
  }

  // In staging, use specific allowed origins
  if (process.env.NODE_ENV === "staging") {
    const envOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) || [];

    // Default staging origins
    const defaultOrigins = [
      "https://dynastytest.com",
      "https://www.dynastytest.com",
    ];

    // Combine and deduplicate origins
    const allOrigins = [...new Set([...envOrigins, ...defaultOrigins])];

    // Filter out invalid origins
    const validOrigins = allOrigins.filter(isValidOrigin);

    if (validOrigins.length === 0) {
      logger.error("No valid CORS origins configured for staging, falling back to defaults");
      return defaultOrigins;
    }

    logger.info("CORS configured for staging origins", {validOrigins});
    return validOrigins;
  }

  // In development, allow all origins
  logger.debug("CORS configured for development (all origins)");
  return true;
}

/**
 * Get CORS options for Firebase Functions
 */
export function getCorsOptions() {
  const cors = getCorsConfig();
  return {cors};
}
