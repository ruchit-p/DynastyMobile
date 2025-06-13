import {onRequest, onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import {defineSecret} from "firebase-functions/params";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {createError, ErrorCode, withErrorHandling} from "./utils/errors";
import {createLogContext} from "./utils/sanitization";
import {getUnsubscribeService} from "./services/unsubscribeService";
import {getEmailSuppressionService} from "./services/emailSuppressionService";
import {withAuth, RateLimitType, checkRateLimitByIP} from "./middleware";

// Define Firebase secret for cleanup authentication
export const CLEANUP_SECRET = defineSecret("CLEANUP_SECRET");

/**
 * HTML escaping utility to prevent XSS attacks
 */
function escapeHtml(text: string): string {
  const htmlEscapes: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (match) => htmlEscapes[match] || match);
}

/**
 * JavaScript escaping utility to prevent XSS in script contexts
 */
function escapeJs(text: string): string {
  return text
    .replace(/[\\'"]/g, "\\$&")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/**
 * HTTP endpoint for processing unsubscribe requests
 * Supports both GET (preference center) and POST (unsubscribe actions)
 */
export const handleUnsubscribe = onRequest(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    cors: true,
  },
  withErrorHandling(async (request, response) => {
    // Apply rate limiting for DoS protection
    await checkRateLimitByIP(request, {
      type: RateLimitType.API,
      maxRequests: 30,
      windowSeconds: 300, // 30 requests per 5 minutes per IP
    });

    const unsubscribeService = getUnsubscribeService();

    // Handle OPTIONS for CORS
    if (request.method === "OPTIONS") {
      response.status(200).send();
      return;
    }

    // GET request - Show preference center
    if (request.method === "GET") {
      const token = request.query.token as string;

      if (!token) {
        response.status(400).send(`
            <!DOCTYPE html>
            <html>
              <head><title>Invalid Link</title></head>
              <body>
                <h1>Invalid Unsubscribe Link</h1>
                <p>The unsubscribe link is missing required parameters. Please use the link from your email.</p>
              </body>
            </html>
          `);
        return;
      }

      // Validate token
      const validation = await unsubscribeService.validateUnsubscribeToken(token);
      if (!validation.isValid) {
        response.status(400).send(`
            <!DOCTYPE html>
            <html>
              <head><title>Invalid Token</title></head>
              <body>
                <h1>Invalid or Expired Link</h1>
                <p>${validation.error || "The unsubscribe link is invalid or has expired."}</p>
                <p>Please use the most recent unsubscribe link from your email.</p>
              </body>
            </html>
          `);
        return;
      }

      // Render preference center
      const preferenceCenterHtml = generatePreferenceCenterHtml(token, validation.email!);
      response.setHeader("Content-Type", "text/html");
      response.status(200).send(preferenceCenterHtml);
      return;
    }

    // POST request - Process unsubscribe action
    if (request.method === "POST") {
      const {token, action, categories, preferences} = request.body;
      const ipAddress = request.ip || (request.headers["x-forwarded-for"] as string) || "unknown";
      const userAgent = request.headers["user-agent"] || "unknown";

      if (!token || !action) {
        response.status(400).json({
          error: "Missing required parameters",
          code: "INVALID_REQUEST",
        });
        return;
      }

      // Process the unsubscribe request
      const result = await unsubscribeService.processUnsubscribe(token, {
        action,
        categories,
        preferences,
        ipAddress,
        userAgent,
      });

      response.status(200).json(result);
      return;
    }

    // Unsupported method
    response.status(405).json({
      error: "Method not allowed",
      code: "METHOD_NOT_ALLOWED",
    });
  }, "handleUnsubscribe")
);

/**
 * One-click unsubscribe endpoint (RFC 8058 compliance)
 * Used for List-Unsubscribe-Post header
 */
export const oneClickUnsubscribe = onRequest(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    cors: false, // One-click unsubscribe doesn't need CORS
  },
  withErrorHandling(async (request, response) => {
    // Apply rate limiting for DoS protection
    await checkRateLimitByIP(request, {
      type: RateLimitType.SENSITIVE,
      maxRequests: 10,
      windowSeconds: 300, // 10 requests per 5 minutes per IP
    });

    // Only accept POST requests
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    // Get email from query parameters (as per RFC 8058)
    const email = request.query.email as string;
    const token = request.query.token as string;

    if (!email || !token) {
      response.status(400).send("Bad Request: Missing email or token");
      return;
    }

    logger.info(
      "Processing one-click unsubscribe",
      createLogContext({
        email: email.substring(0, 3) + "***",
      })
    );

    // Validate token and email match
    const unsubscribeService = getUnsubscribeService();
    const validation = await unsubscribeService.validateUnsubscribeToken(token);

    if (!validation.isValid || validation.email !== email.toLowerCase()) {
      response.status(400).send("Bad Request: Invalid token");
      return;
    }

    // Process immediate unsubscribe
    const ipAddress = request.ip || "unknown";
    await unsubscribeService.processUnsubscribe(token, {
      action: "unsubscribe-all",
      ipAddress,
    });

    // Return success response (as per RFC 8058)
    response.status(200).send("Unsubscribed successfully");
  }, "oneClickUnsubscribe")
);

/**
 * Cloud Function for managing email preferences (authenticated)
 */
export const manageEmailPreferences = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const {action, preferences} = request.data;
      const userId = request.auth!.uid;

      const unsubscribeService = getUnsubscribeService();

      switch (action) {
      case "get": {
        const currentPreferences = await unsubscribeService.getUserEmailPreferences(userId);
        return {success: true, preferences: currentPreferences};
      }

      case "update": {
        if (!preferences) {
          throw createError(ErrorCode.INVALID_ARGUMENT, "Preferences required for update");
        }

        // Get user email for token generation - we'll need to fetch from user document
        const userEmail = request.auth?.token?.email || null;

        if (!userEmail) {
          throw createError(ErrorCode.INVALID_ARGUMENT, "User email not found");
        }

        // Generate temporary token for preference update
        const token = await unsubscribeService.generateUnsubscribeToken(
          userEmail,
          userId,
          "manage-preferences"
        );

        const result = await unsubscribeService.processUnsubscribe(token, {
          action: "update-preferences",
          preferences,
          ipAddress: (request.rawRequest?.headers?.["x-forwarded-for"] as string) || "unknown",
        });

        return result;
      }

      default:
        throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid action");
      }
    },
    "manageEmailPreferences",
    {
      authLevel: "auth",
      rateLimitConfig: {
        type: RateLimitType.EMAIL_PREFERENCE_UPDATE,
        maxRequests: 10,
        windowSeconds: 3600, // 1 hour
      },
    }
  )
);

/**
 * Admin function for managing email suppression lists
 */
export const manageEmailSuppression = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withAuth(
    async (request) => {
      const {action, email, reason, type, metadata} = request.data;

      // TODO: Add admin role check
      // if (!request.auth?.admin) {
      //   throw createError(ErrorCode.PERMISSION_DENIED, "Admin access required");
      // }

      const suppressionService = getEmailSuppressionService();

      switch (action) {
      case "check": {
        if (!email) {
          throw createError(ErrorCode.INVALID_ARGUMENT, "Email required");
        }
        const suppressionStatus = await suppressionService.isEmailSuppressed(email);
        return {success: true, suppression: suppressionStatus};
      }

      case "add": {
        if (!email || !reason || !type) {
          throw createError(ErrorCode.INVALID_ARGUMENT, "Email, reason, and type required");
        }
        await suppressionService.addToSuppressionList(email, reason, type, metadata || {});
        return {success: true, message: "Email added to suppression list"};
      }

      case "remove": {
        if (!email) {
          throw createError(ErrorCode.INVALID_ARGUMENT, "Email required");
        }
        await suppressionService.removeFromSuppressionList(email);
        return {success: true, message: "Email removed from suppression list"};
      }

      case "stats": {
        const stats = await suppressionService.getSuppressionStats();
        return {success: true, stats};
      }

      case "export": {
        const {startDate, endDate, suppressionReason} = request.data;
        const exportData = await suppressionService.exportSuppressionList(
          suppressionReason,
          startDate ? new Date(startDate) : undefined,
          endDate ? new Date(endDate) : undefined
        );
        return {success: true, data: exportData};
      }

      default:
        throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid action");
      }
    },
    "manageEmailSuppression",
    {
      authLevel: "verified", // Require verified admin user
      rateLimitConfig: {
        type: RateLimitType.ADMIN_EMAIL_MANAGEMENT,
        maxRequests: 100,
        windowSeconds: 3600, // 1 hour
      },
    }
  )
);

/**
 * Scheduled function to cleanup expired tokens and suppressions
 */
export const emailComplianceCleanup = onRequest(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
    cors: false,
  },
  withErrorHandling(async (request, response) => {
    // Authenticate using Firebase secret
    const authHeader = request.headers.authorization;
    const secretValue = CLEANUP_SECRET.value();
    const envValue = process.env.CLEANUP_SECRET;

    let expectedSecret: string;
    if (secretValue) {
      expectedSecret = secretValue;
    } else if (envValue && process.env.FUNCTIONS_EMULATOR === "true") {
      // Only allow env var in emulator for local development
      expectedSecret = envValue;
    } else {
      throw createError(ErrorCode.INTERNAL, "CLEANUP_SECRET is not configured");
    }

    const expectedAuth = `Bearer ${expectedSecret}`;
    if (authHeader !== expectedAuth) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Invalid cleanup authentication");
    }

    logger.info("Starting email compliance cleanup");

    const unsubscribeService = getUnsubscribeService();
    const suppressionService = getEmailSuppressionService();

    // Cleanup expired tokens
    const expiredTokens = await unsubscribeService.cleanupExpiredTokens();

    // Cleanup expired transient suppressions
    const expiredSuppressions = await suppressionService.cleanupExpiredSuppressions();

    const results = {
      expiredTokensRemoved: expiredTokens,
      expiredSuppressionsRemoved: expiredSuppressions,
      timestamp: new Date().toISOString(),
    };

    logger.info("Email compliance cleanup completed", createLogContext(results));

    response.status(200).json({
      success: true,
      results,
    });
  }, "emailComplianceCleanup")
);

/**
 * Generate HTML for the preference center
 */
function generatePreferenceCenterHtml(token: string, email: string): string {
  const maskedEmail = email.substring(0, 3) + "***@" + email.split("@")[1];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dynasty - Email Preferences</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            border: 1px solid #e5e5e5;
        }
        .logo {
            text-align: center;
            margin-bottom: 24px;
        }
        .logo img {
            width: 60px;
            height: 60px;
        }
        h1 {
            color: #0A5C36;
            text-align: center;
            margin-bottom: 16px;
        }
        .email-info {
            text-align: center;
            color: #666;
            margin-bottom: 32px;
            padding: 16px;
            background-color: #f9f9f9;
            border-radius: 8px;
        }
        .preference-group {
            margin-bottom: 24px;
        }
        .preference-group h3 {
            color: #0A5C36;
            margin-bottom: 12px;
            border-bottom: 1px solid #e5e5e5;
            padding-bottom: 8px;
        }
        .preference-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        .preference-item:last-child {
            border-bottom: none;
        }
        .preference-label {
            flex: 1;
        }
        .preference-description {
            font-size: 14px;
            color: #666;
            margin-top: 4px;
        }
        .switch {
            position: relative;
            width: 50px;
            height: 24px;
            background-color: #ccc;
            border-radius: 24px;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        .switch.active {
            background-color: #0A5C36;
        }
        .switch-handle {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 20px;
            height: 20px;
            background-color: white;
            border-radius: 50%;
            transition: transform 0.3s;
        }
        .switch.active .switch-handle {
            transform: translateX(26px);
        }
        .buttons {
            text-align: center;
            margin-top: 32px;
        }
        .button {
            display: inline-block;
            padding: 12px 24px;
            margin: 0 8px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            cursor: pointer;
            border: none;
            font-size: 16px;
        }
        .button-primary {
            background-color: #0A5C36;
            color: white;
        }
        .button-secondary {
            background-color: #f0f0f0;
            color: #333;
        }
        .button:hover {
            opacity: 0.9;
        }
        .unsubscribe-all {
            text-align: center;
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid #e5e5e5;
        }
        .unsubscribe-all a {
            color: #666;
            font-size: 14px;
        }
        .success-message {
            background-color: #d4edda;
            color: #155724;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 24px;
            text-align: center;
            display: none;
        }
        .error-message {
            background-color: #f8d7da;
            color: #721c24;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 24px;
            text-align: center;
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/dynasty-2ljPnVpyFmloKaKIzGb8I8NepTmZ0F.png" alt="Dynasty Logo">
        </div>
        
        <h1>Email Preferences</h1>
        
        <div class="email-info">
            Managing email preferences for: <strong>${escapeHtml(maskedEmail)}</strong>
        </div>

        <div class="success-message" id="successMessage"></div>
        <div class="error-message" id="errorMessage"></div>

        <form id="preferencesForm">
            <div class="preference-group">
                <h3>Email Categories</h3>
                
                <div class="preference-item">
                    <div class="preference-label">
                        <strong>Marketing Emails</strong>
                        <div class="preference-description">Product updates, newsletters, and promotional content</div>
                    </div>
                    <div class="switch" data-category="marketing">
                        <div class="switch-handle"></div>
                    </div>
                </div>

                <div class="preference-item">
                    <div class="preference-label">
                        <strong>Family Updates</strong>
                        <div class="preference-description">New family members, family tree changes, and family notifications</div>
                    </div>
                    <div class="switch active" data-category="familyUpdates">
                        <div class="switch-handle"></div>
                    </div>
                </div>

                <div class="preference-item">
                    <div class="preference-label">
                        <strong>Event Invitations</strong>
                        <div class="preference-description">Family event invitations and reminders</div>
                    </div>
                    <div class="switch active" data-category="eventInvitations">
                        <div class="switch-handle"></div>
                    </div>
                </div>

                <div class="preference-item">
                    <div class="preference-label">
                        <strong>Billing & Account</strong>
                        <div class="preference-description">Payment receipts, account security, and important account notifications</div>
                    </div>
                    <div class="switch active" data-category="billing" disabled>
                        <div class="switch-handle"></div>
                    </div>
                    <small style="color: #666; font-size: 12px;">Required for account security</small>
                </div>
            </div>

            <div class="buttons">
                <button type="submit" class="button button-primary">Save Preferences</button>
                <button type="button" class="button button-secondary" onclick="window.close()">Cancel</button>
            </div>
        </form>

        <div class="unsubscribe-all">
            <a href="#" onclick="unsubscribeAll()">Unsubscribe from all marketing emails</a>
        </div>
    </div>

    <script>
        const token = '${escapeJs(token)}';
        
        // Initialize switches
        document.querySelectorAll('.switch').forEach(switchEl => {
            if (!switchEl.hasAttribute('disabled')) {
                switchEl.addEventListener('click', function() {
                    this.classList.toggle('active');
                });
            }
        });

        // Handle form submission
        document.getElementById('preferencesForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const preferences = {};
            document.querySelectorAll('.switch').forEach(switchEl => {
                const category = switchEl.dataset.category;
                const isActive = switchEl.classList.contains('active');
                preferences[category] = isActive;
            });

            try {
                const response = await fetch('/handleUnsubscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        token: token,
                        action: 'update-preferences',
                        preferences: preferences
                    })
                });

                const result = await response.json();
                
                if (result.success) {
                    showMessage('success', 'Your email preferences have been updated successfully!');
                } else {
                    showMessage('error', result.message || 'Failed to update preferences. Please try again.');
                }
            } catch (error) {
                showMessage('error', 'An error occurred. Please try again.');
            }
        });

        async function unsubscribeAll() {
            if (!confirm('Are you sure you want to unsubscribe from all marketing emails? You can still receive important account and security notifications.')) {
                return;
            }

            try {
                const response = await fetch('/handleUnsubscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        token: token,
                        action: 'unsubscribe-all'
                    })
                });

                const result = await response.json();
                
                if (result.success) {
                    showMessage('success', result.message);
                    // Disable all marketing switches
                    document.querySelectorAll('.switch[data-category="marketing"], .switch[data-category="familyUpdates"], .switch[data-category="eventInvitations"]').forEach(switchEl => {
                        switchEl.classList.remove('active');
                    });
                } else {
                    showMessage('error', result.message || 'Failed to unsubscribe. Please try again.');
                }
            } catch (error) {
                showMessage('error', 'An error occurred. Please try again.');
            }
        }

        function showMessage(type, message) {
            const successEl = document.getElementById('successMessage');
            const errorEl = document.getElementById('errorMessage');
            
            // Hide both messages first
            successEl.style.display = 'none';
            errorEl.style.display = 'none';
            
            if (type === 'success') {
                successEl.textContent = message;
                successEl.style.display = 'block';
            } else {
                errorEl.textContent = message;
                errorEl.style.display = 'block';
            }
            
            // Scroll to top to show message
            window.scrollTo(0, 0);
        }
    </script>
</body>
</html>
  `;
}
