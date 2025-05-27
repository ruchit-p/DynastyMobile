#!/bin/bash

# Script to enable CSRF protection for state-changing operations in Firebase Functions

echo "Enabling CSRF protection for state-changing operations..."

# Function to update withAuth calls to enable CSRF
update_csrf() {
    local file=$1
    local function_name=$2
    
    echo "Updating $function_name in $file..."
    
    # Update withAuth calls to include enableCSRF: true
    # Pattern 1: withAuth(handler, "functionName", "authLevel", { rateLimitConfig })
    sed -i '' "s/withAuth(.*\"$function_name\".*{$/&\n      enableCSRF: true,/g" "$file"
    
    # Pattern 2: withAuth(handler, "functionName", { config })
    sed -i '' "s/withAuth(.*\"$function_name\".*, {$/&\n      enableCSRF: true,/g" "$file"
    
    # Pattern 3: Simple withAuth without config object - convert to config object
    sed -i '' "s/withAuth(\\(.*\\), \"$function_name\", \"\\([^\"]*\\)\")/withAuth(\\1, \"$function_name\", { authLevel: \"\\2\", enableCSRF: true })/g" "$file"
}

# Events service functions
EVENTS_FILE="../src/events-service.ts"
update_csrf "$EVENTS_FILE" "createEvent"
update_csrf "$EVENTS_FILE" "updateEvent"
update_csrf "$EVENTS_FILE" "deleteEvent"
update_csrf "$EVENTS_FILE" "rsvpToEvent"
update_csrf "$EVENTS_FILE" "addCommentToEvent"
update_csrf "$EVENTS_FILE" "deleteEventComment"
update_csrf "$EVENTS_FILE" "sendEventInvitations"
update_csrf "$EVENTS_FILE" "respondToInvitation"

# Vault functions
VAULT_FILE="../src/vault.ts"
update_csrf "$VAULT_FILE" "createVaultFolder"
update_csrf "$VAULT_FILE" "addVaultFile"
update_csrf "$VAULT_FILE" "renameVaultItem"
update_csrf "$VAULT_FILE" "moveVaultItem"
update_csrf "$VAULT_FILE" "deleteVaultItem"
update_csrf "$VAULT_FILE" "restoreVaultItem"
update_csrf "$VAULT_FILE" "shareVaultItem"
update_csrf "$VAULT_FILE" "revokeVaultItemAccess"
update_csrf "$VAULT_FILE" "updateVaultItemPermissions"

# Chat management functions
CHAT_FILE="../src/chatManagement.ts"
update_csrf "$CHAT_FILE" "createChat"
update_csrf "$CHAT_FILE" "updateChatSettings"
update_csrf "$CHAT_FILE" "addChatMembers"
update_csrf "$CHAT_FILE" "removeChatMember"
update_csrf "$CHAT_FILE" "updateMemberRole"
update_csrf "$CHAT_FILE" "deleteChat"

# User management functions
USER_FILE="../src/auth/modules/user-management.ts"
update_csrf "$USER_FILE" "handleAccountDeletion"
update_csrf "$USER_FILE" "updateUserProfile"
update_csrf "$USER_FILE" "updateDataRetention"

# Password management functions
PASSWORD_FILE="../src/auth/modules/password-management.ts"
update_csrf "$PASSWORD_FILE" "resetPassword"
update_csrf "$PASSWORD_FILE" "changePassword"
update_csrf "$PASSWORD_FILE" "sendPasswordResetEmail"

# Messaging functions
MESSAGING_FILE="../src/messaging.ts"
update_csrf "$MESSAGING_FILE" "sendMessage"
update_csrf "$MESSAGING_FILE" "updateNotificationSettings"
update_csrf "$MESSAGING_FILE" "registerFCMToken"
update_csrf "$MESSAGING_FILE" "removeFCMToken"

# Family tree functions
FAMILY_FILE="../src/familyTree.ts"
update_csrf "$FAMILY_FILE" "createFamilyMember"
update_csrf "$FAMILY_FILE" "updateFamilyMember"
update_csrf "$FAMILY_FILE" "deleteFamilyMember"
update_csrf "$FAMILY_FILE" "updateFamilyRelationships"

# Encryption functions
ENCRYPTION_FILE="../src/encryption.ts"
update_csrf "$ENCRYPTION_FILE" "generateUserKeys"
update_csrf "$ENCRYPTION_FILE" "uploadEncryptionKeys"
update_csrf "$ENCRYPTION_FILE" "storeClientGeneratedKeys"
update_csrf "$ENCRYPTION_FILE" "deleteEncryptionKeys"
update_csrf "$ENCRYPTION_FILE" "rotateEncryptionKeys"

echo "CSRF protection update complete!"
echo "Please review the changes and test thoroughly."