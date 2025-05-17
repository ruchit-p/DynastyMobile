import * as functions from "firebase-functions";
import {onCall} from "firebase-functions/v2/https";
import {Client} from "@googlemaps/google-maps-services-js";
import {defineString} from "firebase-functions/params"; // Import defineString
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common"; // Assuming common config file
import {logger} from "firebase-functions";

// Initialize Google Maps Client
const mapsClient = new Client({});

// Define Google Places API Key as a secret environment variable
const GOOGLE_PLACES_API_KEY_SECRET = defineString("GOOGLE_PLACES_API_KEY");

/**
 * Google Places Autocomplete (Callable Function)
 *
 * Expects: { input: string, sessionToken?: string, location?: string, radius?: number, language?: string, components?: string }
 * Returns: { predictions: any[] } or throws HttpsError
 */
export const googlePlacesAutocomplete = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT, // Adjust as needed
    // memory: "256MiB", // Adjust as needed
  },
  async (request) => {
    const {auth, data} = request;
    const apiKey = GOOGLE_PLACES_API_KEY_SECRET.value(); // Access the secret value

    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to use this function."
      );
    }

    if (!apiKey) {
      // This check is important if the secret might not be set despite defineString
      // (e.g. local emulation without .env file correctly sourced by emulator)
      logger.error(
        "GOOGLE_PLACES_API_KEY is not available. " +
        "Ensure it is set in your function's environment variables or secrets configuration. " +
        "For deployed functions, use `firebase functions:secrets:set GOOGLE_PLACES_API_KEY`. "
      );
      throw new functions.https.HttpsError(
        "internal",
        "Google API key is not configured for the server."
      );
    }

    const {
      input,
      sessiontoken, // sessiontoken from Google Places SDK for billing
      location, // Optional: "latitude,longitude" string
      radius, // Optional: radius in meters, works with location
      language, // Optional: language code
      components, // Optional: "country:us|country:ca"
      types, // Optional: types of establishments
    } = data;

    if (!input) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The function must be called with a 'input' argument."
      );
    }

    try {
      logger.info(`Places Autocomplete request for input: ${input}`, {userId: auth.uid});
      const params: any = {
        input,
        key: apiKey, // Use the accessed secret value
      };
      if (sessiontoken) params.sessiontoken = sessiontoken;
      if (location) params.location = location;
      if (radius) params.radius = radius;
      if (language) params.language = language;
      if (components) params.components = components;
      if (types) params.types = types;

      const response = await mapsClient.placeAutocomplete({params});

      if (response.data.status === "OK" || response.data.status === "ZERO_RESULTS") {
        return {predictions: response.data.predictions};
      } else {
        logger.error("Google Places Autocomplete API Error:", response.data);
        throw new functions.https.HttpsError(
          "internal",
          response.data.error_message || "Failed to fetch place predictions.",
          {status: response.data.status}
        );
      }
    } catch (error: any) {
      logger.error("Error calling Google Places Autocomplete API:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "An unexpected error occurred while fetching place predictions.",
        error.message
      );
    }
  }
);

/**
 * Get Google Place Details (Callable Function)
 *
 * Expects: { placeId: string, sessionToken?: string, fields?: string[], language?: string }
 * Returns: { result: any } or throws HttpsError
 */
export const getGooglePlaceDetails = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT, // Adjust as needed
    // memory: "256MiB", // Adjust as needed
  },
  async (request) => {
    const {auth, data} = request;
    const apiKey = GOOGLE_PLACES_API_KEY_SECRET.value(); // Access the secret value

    if (!auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to use this function."
      );
    }

    if (!apiKey) {
      // This check is important if the secret might not be set
      logger.error(
        "GOOGLE_PLACES_API_KEY is not available. " +
        "Ensure it is set in your function's environment variables or secrets configuration. " +
        "For deployed functions, use `firebase functions:secrets:set GOOGLE_PLACES_API_KEY`. "
      );
      throw new functions.https.HttpsError(
        "internal",
        "Google API key is not configured for the server."
      );
    }

    const {
      placeId, // place_id from Google
      sessiontoken, // sessiontoken from Google Places SDK for billing
      fields, // Optional: array of fields like ["name", "rating", "geometry"]
      language, // Optional: language code
    } = data;

    if (!placeId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The function must be called with a 'placeId' argument."
      );
    }

    try {
      logger.info(`Place Details request for placeId: ${placeId}`, {userId: auth.uid});
      const params: any = {
        place_id: placeId,
        key: apiKey, // Use the accessed secret value
      };
      if (sessiontoken) params.sessiontoken = sessiontoken;
      if (fields && Array.isArray(fields) && fields.length > 0) {
        params.fields = fields.join(",");
      } else {
        // Default fields if not specified, geometry and formatted_address are often needed
        params.fields = ["place_id", "name", "formatted_address", "geometry", "address_components", "types", "url", "vicinity"];
      }
      if (language) params.language = language;

      const response = await mapsClient.placeDetails({params});

      if (response.data.status === "OK") {
        return {result: response.data.result};
      } else {
        logger.error("Google Place Details API Error:", response.data);
        throw new functions.https.HttpsError(
          "internal",
          response.data.error_message || "Failed to fetch place details.",
          {status: response.data.status}
        );
      }
    } catch (error: any) {
      logger.error("Error calling Google Place Details API:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "An unexpected error occurred while fetching place details.",
        error.message
      );
    }
  }
);
