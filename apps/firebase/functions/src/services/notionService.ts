// MARK: - Notion Support Service

import {Client} from "@notionhq/client";
import {createError, ErrorCode} from "../utils/errors";
import {logger} from "firebase-functions/v2";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";

const db = getFirestore();

// MARK: - Types

export interface SupportTicketData {
  name: string;
  email?: string;
  phone?: string;
  category?: string;
  message: string;
  userId?: string;
}

export interface SupportTicketLog {
  id?: string;
  notionPageId?: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  category: string;
  message: string;
  status: "submitted" | "failed";
  error?: string;
  createdAt: Timestamp | FieldValue;
}

// MARK: - Configuration

interface NotionConfig {
  apiKey: string;
  databaseId: string;
  testMode?: boolean;
}

// MARK: - Helper Functions

/**
 * Get Notion configuration from environment
 */
function getNotionConfig(): NotionConfig {
  const config = {
    apiKey: process.env.NOTION_API_KEY || "",
    databaseId: process.env.NOTION_DB_ID || "",
    testMode: process.env.NODE_ENV === "development",
  };

  if (!config.apiKey || !config.databaseId) {
    throw createError(
      ErrorCode.INTERNAL,
      "Notion configuration is incomplete. Please set NOTION_API_KEY and NOTION_DB_ID."
    );
  }

  return config;
}

/**
 * Map category to Notion select option
 */
function mapCategoryToNotion(category?: string): string {
  const categoryMap: Record<string, string> = {
    "technical": "Technical Support",
    "billing": "Billing Question",
    "privacy": "Privacy Concern",
    "feature": "Feature Request",
    "other": "Other",
  };

  return categoryMap[category || "other"] || "Other";
}

/**
 * Format the current date for Notion
 */
function getCurrentDateForNotion(): string {
  return new Date().toISOString().split("T")[0];
}

// MARK: - Notion Service Class

export class NotionService {
  private client: Client;
  private config: NotionConfig;

  constructor() {
    this.config = getNotionConfig();
    // Initialize Notion client
    this.client = new Client({
      auth: this.config.apiKey,
    });
  }

  /**
   * Create a support ticket in Notion
   */
  async createSupportTicket(data: SupportTicketData): Promise<string> {
    try {
      // Create support ticket log entry
      const logRef = db.collection("supportTicketLogs").doc();
      const ticketLog: SupportTicketLog = {
        id: logRef.id,
        ...(data.userId && {userId: data.userId}),
        name: data.name,
        ...(data.email && {email: data.email}),
        ...(data.phone && {phone: data.phone}),
        category: data.category || "other",
        message: data.message,
        status: "submitted",
        createdAt: FieldValue.serverTimestamp(),
      };

      await logRef.set(ticketLog);

      // In test mode, skip actual Notion API call
      if (this.config.testMode) {
        logger.info("Test mode: Support ticket would be created", data);
        await logRef.update({
          notionPageId: "TEST_" + Date.now(),
        });
        return logRef.id;
      }

      // Create the Notion page
      const response = await this.client.pages.create({
        parent: {
          type: "database_id",
          database_id: this.config.databaseId,
        },
        properties: {
          "Name": {
            title: [
              {
                text: {
                  content: data.name,
                },
              },
            ],
          },
          "Email": {
            email: data.email || null,
          },
          "Phone": {
            phone_number: data.phone || null,
          },
          "Category": {
            rich_text: [
              {
                text: {
                  content: mapCategoryToNotion(data.category),
                },
              },
            ],
          },
          "Date Received": {
            date: {
              start: getCurrentDateForNotion(),
            },
          },
          "Status": {
            status: {
              name: "New",
            },
          },
        },
        children: [
          {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: "Support Message",
                  },
                },
              ],
            },
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: data.message,
                  },
                },
              ],
            },
          },
          {
            object: "block",
            type: "divider",
            divider: {},
          },
          {
            object: "block",
            type: "heading_3",
            heading_3: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: "User Information",
                  },
                },
              ],
            },
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: `User ID: ${data.userId || "Not provided"}`,
                  },
                },
              ],
            },
          },
        ],
      });

      // Update log with success
      await logRef.update({
        notionPageId: response.id,
      });

      logger.info("Support ticket created successfully", {
        logId: logRef.id,
        notionPageId: response.id,
        category: data.category,
      });

      return logRef.id;
    } catch (error) {
      logger.error("Failed to create support ticket", {error, data});

      // Update log with failure if we have a log ID
      if (error instanceof Error) {
        // Check if it's a Notion API error
        if ("code" in error && "status" in error) {
          throw createError(
            ErrorCode.INTERNAL,
            `Failed to create support ticket: Notion API error - ${error.message}`
          );
        }
        throw createError(
          ErrorCode.INTERNAL,
          `Failed to create support ticket: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Validate Notion connection by attempting to retrieve database info
   */
  async validateNotionConnection(): Promise<boolean> {
    try {
      const database = await this.client.databases.retrieve({
        database_id: this.config.databaseId,
      });

      logger.info("Notion connection validated", {
        databaseId: database.id,
      });

      return true;
    } catch (error) {
      logger.error("Failed to validate Notion connection", {error});
      return false;
    }
  }

  /**
   * Get support ticket statistics (for admin dashboard)
   */
  async getSupportTicketStats(timeRange: "day" | "week" | "month" = "week"): Promise<{
    total: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
  }> {
    try {
      const now = new Date();
      let startDate: Date;

      switch (timeRange) {
      case "day":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      }

      const snapshot = await db.collection("supportTicketLogs")
        .where("createdAt", ">=", startDate)
        .where("status", "==", "submitted")
        .get();

      const byCategory: Record<string, number> = {};
      const byStatus: Record<string, number> = {
        submitted: snapshot.size,
      };

      snapshot.forEach((doc) => {
        const data = doc.data();
        const category = data.category || "other";
        byCategory[category] = (byCategory[category] || 0) + 1;
      });

      return {
        total: snapshot.size,
        byCategory,
        byStatus,
      };
    } catch (error) {
      logger.error("Failed to get support ticket stats", {error});
      throw error;
    }
  }
}

// MARK: - Singleton Instance

let notionService: NotionService | null = null;

export function getNotionService(): NotionService {
  if (!notionService) {
    notionService = new NotionService();
  }
  return notionService;
}

// MARK: - Validation Functions

/**
 * Validate support message data
 */
export function validateSupportMessage(data: Partial<SupportTicketData>): void {
  if (!data.message || data.message.trim().length === 0) {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      "Message is required"
    );
  }

  if (data.message.length > 2000) {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      "Message must be less than 2000 characters"
    );
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      "Invalid email format"
    );
  }

  if (data.phone && !/^\+?[\d\s-()]+$/.test(data.phone)) {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      "Invalid phone number format"
    );
  }

  const validCategories = ["technical", "billing", "privacy", "feature", "other"];
  if (data.category && !validCategories.includes(data.category)) {
    throw createError(
      ErrorCode.INVALID_ARGUMENT,
      `Invalid category. Must be one of: ${validCategories.join(", ")}`
    );
  }
}
