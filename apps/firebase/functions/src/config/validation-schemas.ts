import {ValidationSchema} from "../utils/request-validator";

export const VALIDATION_SCHEMAS: Record<string, ValidationSchema> = {
  createEvent: {
    rules: [
      {field: "title", type: "string", required: true, maxLength: 200},
      {field: "description", type: "string", maxLength: 5000},
      {field: "eventDate", type: "string", required: true},
      {field: "endDate", type: "string"},
      {field: "startTime", type: "string"},
      {field: "endTime", type: "string"},
      {field: "timezone", type: "string"},
      {field: "location", type: "object"},
      {field: "isVirtual", type: "boolean", required: true},
      {field: "virtualLink", type: "string", maxLength: 500},
      {field: "privacy", type: "enum", required: true,
        enumValues: ["public", "family_tree", "invite_only"]},
      {field: "allowGuestPlusOne", type: "boolean"},
      {field: "showGuestList", type: "boolean"},
      {field: "requireRsvp", type: "boolean"},
      {field: "rsvpDeadline", type: "string"},
      {field: "dressCode", type: "string", maxLength: 100},
      {field: "whatToBring", type: "string", maxLength: 500},
      {field: "additionalInfo", type: "string", maxLength: 1000},
      {field: "invitedMemberIds", type: "array", maxSize: 100},
      {field: "capacity", type: "number"},
      {field: "shareEventLink", type: "boolean"},
      {field: "coverPhotoId", type: "string"},
    ],
    xssCheck: true,
  },

  updateEvent: {
    rules: [
      {field: "eventId", type: "id", required: true},
      {field: "title", type: "string", maxLength: 200},
      {field: "description", type: "string", maxLength: 5000},
      {field: "eventDate", type: "string"},
      {field: "endDate", type: "string"},
      {field: "startTime", type: "string"},
      {field: "endTime", type: "string"},
      {field: "timezone", type: "string"},
      {field: "location", type: "object"},
      {field: "isVirtual", type: "boolean"},
      {field: "virtualLink", type: "string", maxLength: 500},
      {field: "privacy", type: "enum",
        enumValues: ["public", "family_tree", "invite_only"]},
      {field: "allowGuestPlusOne", type: "boolean"},
      {field: "showGuestList", type: "boolean"},
      {field: "requireRsvp", type: "boolean"},
      {field: "rsvpDeadline", type: "string"},
      {field: "dressCode", type: "string", maxLength: 100},
      {field: "whatToBring", type: "string", maxLength: 500},
      {field: "additionalInfo", type: "string", maxLength: 1000},
      {field: "invitedMemberIds", type: "array", maxSize: 100},
      {field: "capacity", type: "number"},
      {field: "shareEventLink", type: "boolean"},
      {field: "coverPhotoId", type: "string"},
    ],
    xssCheck: true,
  },

  createStory: {
    rules: [
      {field: "story", type: "object", required: true},
    ],
    allowExtraFields: true,
    xssCheck: true,
  },

  updateStory: {
    rules: [
      {field: "storyId", type: "id", required: true},
      {field: "story", type: "object", required: true},
    ],
    allowExtraFields: true,
    xssCheck: true,
  },

  createFamilyMember: {
    rules: [
      {field: "userData", type: "object", required: true},
      {field: "relationType", type: "enum", required: true,
        enumValues: ["parent", "child", "spouse"]},
      {field: "selectedNodeId", type: "id", required: true},
      {field: "options", type: "object"},
    ],
    xssCheck: true,
  },

  updateFamilyMember: {
    rules: [
      {field: "memberId", type: "id", required: true},
      {field: "updatedData", type: "object", required: true},
    ],
    allowExtraFields: true,
    xssCheck: true,
  },

  createChat: {
    rules: [
      {field: "name", type: "string", maxLength: 100},
      {field: "participants", type: "array", maxSize: 50},
      {field: "participantIds", type: "array", required: true, maxSize: 50},
      {field: "type", type: "enum", enumValues: ["direct", "group"]},
      {field: "metadata", type: "object"},
      {field: "isGroup", type: "boolean"},
      {field: "groupName", type: "string", maxLength: 100},
      {field: "encryptionEnabled", type: "boolean"},
    ],
    xssCheck: true,
    allowExtraFields: true,
  },

  sendMessage: {
    rules: [
      {field: "chatId", type: "id", required: true},
      {field: "text", type: "string", maxLength: 10000},
      {field: "type", type: "enum", enumValues: ["text", "image", "video", "audio", "voice", "file"]},
      {field: "attachments", type: "array", maxSize: 10},
      {field: "mediaIds", type: "array", maxSize: 10},
      {field: "replyToId", type: "id"},
      {field: "encryptedContent", type: "object"},
      {field: "ephemeralKey", type: "string"},
    ],
    xssCheck: true,
  },

  createVaultFolder: {
    rules: [
      {field: "name", type: "string", required: true, maxLength: 100},
      {field: "description", type: "string", maxLength: 500},
      {field: "parentFolderId", type: "id"},
    ],
    xssCheck: true,
  },

  addVaultFile: {
    rules: [
      {field: "itemId", type: "id", required: true},
      {field: "name", type: "string", required: true, maxLength: 255},
      {field: "storagePath", type: "string", required: true, maxLength: 500},
      {field: "fileType", type: "enum", required: true, enumValues: ["image", "video", "audio", "document", "other"]},
      {field: "size", type: "number", required: true},
      {field: "mimeType", type: "string", required: true, maxLength: 100},
      {field: "parentId", type: "id"},
      {field: "isEncrypted", type: "boolean"},
      {field: "encryptionKeyId", type: "id"},
    ],
    xssCheck: true,
  },

  createInvitation: {
    rules: [
      {field: "familyTreeId", type: "id", required: true},
      {field: "email", type: "email", required: true},
      {field: "role", type: "enum", enumValues: ["admin", "member", "viewer"]},
      {field: "message", type: "string", maxLength: 500},
      {field: "expiresInDays", type: "number"},
    ],
    xssCheck: true,
  },

  updateRsvp: {
    rules: [
      {field: "eventId", type: "id", required: true},
      {field: "status", type: "enum", required: true,
        enumValues: ["yes", "no", "maybe"]},
      {field: "guestCount", type: "number"},
      {field: "note", type: "string", maxLength: 500},
    ],
    xssCheck: true,
  },

  completeOnboarding: {
    rules: [
      {field: "userId", type: "id", required: true},
      {field: "firstName", type: "string", maxLength: 50},
      {field: "lastName", type: "string", maxLength: 50},
      {field: "displayName", type: "string", maxLength: 100},
      {field: "phone", type: "phone"},
      {field: "dateOfBirth", type: "date"},
      {field: "gender", type: "enum", enumValues: ["male", "female", "other", "unspecified"]},
      {field: "profilePicture", type: "string", maxLength: 2000},
      {field: "about", type: "string", maxLength: 1000},
      {field: "location", type: "string", maxLength: 200},
      {field: "invitationCode", type: "string", maxLength: 50},
      {field: "acceptedInvitationId", type: "id"},
    ],
    xssCheck: true,
  },

  updateProfile: {
    rules: [
      {field: "displayName", type: "string", maxLength: 100},
      {field: "phone", type: "phone"},
      {field: "dateOfBirth", type: "date"},
      {field: "gender", type: "enum", enumValues: ["male", "female", "other", "unspecified"]},
      {field: "profilePicture", type: "string", maxLength: 2000},
      {field: "about", type: "string", maxLength: 1000},
      {field: "location", type: "string", maxLength: 200},
    ],
    xssCheck: true,
  },

  searchMessages: {
    rules: [
      {field: "chatId", type: "id"},
      {field: "query", type: "string", required: true, maxLength: 100},
      {field: "limit", type: "number"},
      {field: "before", type: "date"},
      {field: "after", type: "date"},
    ],
    xssCheck: true,
  },

  getSharedLink: {
    rules: [
      {field: "resourceType", type: "enum", required: true,
        enumValues: ["event", "story", "vault"]},
      {field: "resourceId", type: "id", required: true},
      {field: "expiresInDays", type: "number"},
      {field: "permissions", type: "array", maxSize: 10},
    ],
    xssCheck: true,
  },

  addComment: {
    rules: [
      {field: "resourceType", type: "enum", required: true,
        enumValues: ["story", "event"]},
      {field: "resourceId", type: "id", required: true},
      {field: "text", type: "string", required: true, maxLength: 1000},
      {field: "parentCommentId", type: "id"},
    ],
    xssCheck: true,
  },

  reportContent: {
    rules: [
      {field: "contentType", type: "enum", required: true,
        enumValues: ["message", "story", "comment", "user"]},
      {field: "contentId", type: "id", required: true},
      {field: "reason", type: "enum", required: true,
        enumValues: ["spam", "harassment", "inappropriate", "fake", "other"]},
      {field: "details", type: "string", maxLength: 500},
    ],
    xssCheck: true,
  },

  updateNotificationPreferences: {
    rules: [
      {field: "email", type: "object"},
      {field: "push", type: "object"},
      {field: "inApp", type: "object"},
      {field: "frequency", type: "enum", enumValues: ["immediate", "daily", "weekly", "never"]},
    ],
    xssCheck: true,
  },

  // Family Tree Management
  updateFamilyRelationships: {
    rules: [
      {field: "userId", type: "id", required: true},
      {field: "updates", type: "object", required: true},
    ],
    allowExtraFields: true,
    xssCheck: false,
  },

  deleteFamilyMember: {
    rules: [
      {field: "memberId", type: "id", required: true},
      {field: "removeRelationships", type: "boolean"},
    ],
    xssCheck: false,
  },

  promoteToAdmin: {
    rules: [
      {field: "userId", type: "id", required: true},
      {field: "familyTreeId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  demoteToMember: {
    rules: [
      {field: "userId", type: "id", required: true},
      {field: "familyTreeId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  // Vault Management

  renameVaultItem: {
    rules: [
      {field: "itemId", type: "id", required: true},
      {field: "newName", type: "string", required: true, maxLength: 255},
    ],
    xssCheck: true,
  },

  uploadFile: {
    rules: [
      {field: "fileName", type: "string", required: true, maxLength: 255},
      {field: "fileSize", type: "number", required: true},
      {field: "mimeType", type: "string", required: true, maxLength: 100},
      {field: "folderId", type: "id"},
      {field: "metadata", type: "object"},
      {field: "tags", type: "array", maxSize: 20},
      {field: "description", type: "string", maxLength: 1000},
    ],
    xssCheck: true,
  },

  moveVaultItem: {
    rules: [
      {field: "itemId", type: "id", required: true},
      {field: "newParentId", type: "id"},
    ],
    xssCheck: false,
  },

  deleteVaultItem: {
    rules: [
      {field: "itemId", type: "id", required: true},
      {field: "permanent", type: "boolean"},
    ],
    xssCheck: false,
  },

  restoreVaultItem: {
    rules: [
      {field: "itemId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  shareVaultItem: {
    rules: [
      {field: "itemId", type: "id", required: true},
      {field: "userIds", type: "array", required: true, maxSize: 50},
      {field: "permissions", type: "enum", required: true,
        enumValues: ["read", "write", "admin"]},
    ],
    xssCheck: false,
  },

  revokeVaultItemAccess: {
    rules: [
      {field: "itemId", type: "id", required: true},
      {field: "userId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  updateVaultItemPermissions: {
    rules: [
      {field: "itemId", type: "id", required: true},
      {field: "userId", type: "id", required: true},
      {field: "permissions", type: "enum", required: true, enumValues: ["read", "write", "admin"]},
    ],
    xssCheck: false,
  },

  searchVaultItems: {
    rules: [
      {field: "query", type: "string", maxLength: 100},
      {field: "fileTypes", type: "array", maxSize: 10},
      {field: "parentId", type: "id"},
      {field: "includeDeleted", type: "boolean"},
      {field: "sortBy", type: "enum", enumValues: ["name", "date", "size", "type"]},
      {field: "sortOrder", type: "enum", enumValues: ["asc", "desc"]},
      {field: "limit", type: "number"},
      {field: "filters", type: "object"},
    ],
    xssCheck: true,
  },

  getVaultUploadSignedUrl: {
    rules: [
      {field: "fileName", type: "string", required: true, maxLength: 255},
      {field: "mimeType", type: "string", required: true, maxLength: 100},
      {field: "fileSize", type: "number", required: true},
      {field: "parentId", type: "id"},
      {field: "isEncrypted", type: "boolean"},
    ],
    xssCheck: true,
  },

  getVaultItems: {
    rules: [
      {field: "parentId", type: "id"},
      {field: "includeDeleted", type: "boolean"},
    ],
    xssCheck: false,
  },

  getDeletedVaultItems: {
    rules: [],
    xssCheck: false,
  },

  getVaultStorageInfo: {
    rules: [],
    xssCheck: false,
  },

  cleanupDeletedVaultItems: {
    rules: [
      {field: "olderThanDays", type: "number"},
    ],
    xssCheck: false,
  },

  revokeVaultShare: {
    rules: [
      {field: "shareId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  // Messaging

  sendMessageNotification: {
    rules: [
      {field: "chatId", type: "id", required: true},
      {field: "messageId", type: "id", required: true},
      {field: "text", type: "string", required: true, maxLength: 1000},
      {field: "senderName", type: "string", required: true, maxLength: 100},
    ],
    xssCheck: true,
  },

  updateNotificationSettings: {
    rules: [
      {field: "settings", type: "object", required: true},
    ],
    allowExtraFields: true,
    xssCheck: false,
  },

  registerFCMToken: {
    rules: [
      {field: "token", type: "string", required: true, maxLength: 500},
      {field: "deviceId", type: "string", maxLength: 100},
      {field: "platform", type: "enum", enumValues: ["ios", "android", "web"]},
    ],
    xssCheck: false,
  },

  removeFCMToken: {
    rules: [
      {field: "token", type: "string", required: true, maxLength: 500},
    ],
    xssCheck: false,
  },

  sendTypingNotification: {
    rules: [
      {field: "chatId", type: "id", required: true},
      {field: "isTyping", type: "boolean", required: true},
    ],
    xssCheck: false,
  },

  // Notifications
  markNotificationAsRead: {
    rules: [
      {field: "notificationId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  markAllNotificationsAsRead: {
    rules: [],
    xssCheck: false,
  },

  deleteNotification: {
    rules: [
      {field: "notificationId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  registerDeviceToken: {
    rules: [
      {field: "token", type: "string", required: true, maxLength: 500},
      {field: "platform", type: "enum", enumValues: ["ios", "android", "web"]},
      {field: "deleteDuplicates", type: "boolean"},
      {field: "deviceId", type: "string", maxLength: 200},
    ],
    xssCheck: false,
  },

  // Chat Management

  updateChatSettings: {
    rules: [
      {field: "chatId", type: "id", required: true},
      {field: "settings", type: "object", required: true},
    ],
    allowExtraFields: true,
    xssCheck: true,
  },

  leaveChat: {
    rules: [
      {field: "chatId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  addChatParticipants: {
    rules: [
      {field: "chatId", type: "id", required: true},
      {field: "userIds", type: "array", required: true, maxSize: 50},
    ],
    xssCheck: false,
  },

  removeChatParticipant: {
    rules: [
      {field: "chatId", type: "id", required: true},
      {field: "userId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  muteChat: {
    rules: [
      {field: "chatId", type: "id", required: true},
      {field: "muteDuration", type: "number"},
    ],
    xssCheck: false,
  },

  unmuteChat: {
    rules: [
      {field: "chatId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  searchChatMessages: {
    rules: [
      {field: "chatId", type: "id", required: true},
      {field: "query", type: "string", required: true, maxLength: 100},
      {field: "limit", type: "number"},
    ],
    xssCheck: true,
  },

  // Authentication schemas
  signup: {
    rules: [
      {field: "email", type: "email", required: true},
      {field: "password", type: "string", required: true},
    ],
    xssCheck: false, // No user content to check for XSS
  },

  handlePhoneSignIn: {
    rules: [
      {field: "uid", type: "id", required: true},
      {field: "phoneNumber", type: "phone", required: true},
    ],
    xssCheck: false, // No user content to check for XSS
  },

  sendVerificationEmail: {
    rules: [
      {field: "userId", type: "id", required: true},
      {field: "email", type: "email", required: true},
      {field: "displayName", type: "string", maxLength: 100},
    ],
    xssCheck: true,
  },

  verifyEmail: {
    rules: [
      {field: "token", type: "string", required: true, maxLength: 200},
    ],
    xssCheck: false, // Token is system-generated, no user content
  },

  sendFamilyTreeInvitation: {
    rules: [
      {field: "inviteeId", type: "id", required: true},
      {field: "inviteeEmail", type: "email", required: true},
      {field: "inviterId", type: "id", required: true},
      {field: "familyTreeId", type: "id", required: true},
      {field: "inviterName", type: "string", maxLength: 100},
      {field: "inviteeName", type: "string", maxLength: 100},
      {field: "familyTreeName", type: "string", maxLength: 100},
      {field: "firstName", type: "string", maxLength: 50},
      {field: "lastName", type: "string", maxLength: 50},
      {field: "dateOfBirth", type: "date"},
      {field: "gender", type: "enum", enumValues: ["male", "female", "other", "unspecified"]},
      {field: "phoneNumber", type: "phone"},
      {field: "relationship", type: "string", maxLength: 50},
    ],
    xssCheck: true,
  },

  acceptFamilyInvitation: {
    rules: [
      {field: "invitationToken", type: "string", required: true, maxLength: 200},
    ],
    xssCheck: false, // Token is system-generated
  },

  inviteUserToFamily: {
    rules: [
      {field: "inviteeEmail", type: "email", required: true},
      {field: "inviteeName", type: "string", maxLength: 100},
      {field: "familyTreeId", type: "id", required: true},
      {field: "familyTreeName", type: "string", maxLength: 100},
      {field: "firstName", type: "string", maxLength: 50},
      {field: "lastName", type: "string", maxLength: 50},
      {field: "gender", type: "enum", enumValues: ["male", "female", "other", "unspecified"]},
      {field: "dateOfBirth", type: "date"},
      {field: "phoneNumber", type: "phone"},
      {field: "relationshipToInviter", type: "string", maxLength: 50},
    ],
    xssCheck: true,
  },

  updateUserPassword: {
    rules: [
      {field: "userId", type: "id", required: true},
    ],
    xssCheck: false, // No user content
  },

  initiatePasswordReset: {
    rules: [
      {field: "email", type: "email", required: true},
    ],
    xssCheck: false, // Email address only
  },

  handleAccountDeletion: {
    rules: [
      {field: "userId", type: "id", required: true},
    ],
    xssCheck: false, // No user content
  },

  updateUserProfile: {
    rules: [
      {field: "uid", type: "id", required: true},
      {field: "displayName", type: "string", maxLength: 100},
      {field: "firstName", type: "string", maxLength: 50},
      {field: "lastName", type: "string", maxLength: 50},
      {field: "gender", type: "enum", enumValues: ["male", "female", "other", "unspecified"]},
      {field: "dateOfBirth", type: "date"},
      {field: "phoneNumber", type: "phone"},
      {field: "profilePicture", type: "string", maxLength: 2000},
      {field: "photoURL", type: "string", maxLength: 2000},
      {field: "onboardingCompleted", type: "boolean"},
      {field: "dataRetentionPeriod", type: "enum", enumValues: ["1year", "2years", "5years", "forever"]},
    ],
    xssCheck: true,
  },

  updateDataRetention: {
    rules: [
      {field: "userId", type: "id", required: true},
      {field: "retentionPeriod", type: "enum", required: true,
        enumValues: ["1year", "2years", "5years", "forever"]},
    ],
    xssCheck: false, // No user content
  },

  getFamilyMembers: {
    rules: [
      {field: "familyTreeId", type: "id", required: true},
    ],
    xssCheck: false, // No user content
  },

  getFamilyTreeData: {
    rules: [
      {field: "userId", type: "id", required: true},
    ],
    xssCheck: false, // No user content
  },

  // Device fingerprint schemas
  verifyDeviceFingerprint: {
    rules: [
      {field: "requestId", type: "string", required: true, maxLength: 200},
      {field: "visitorId", type: "string", required: true, maxLength: 200},
      {field: "deviceInfo", type: "object"},
    ],
    xssCheck: false, // System-generated IDs
  },

  getTrustedDevices: {
    rules: [
      {field: "currentVisitorId", type: "string", maxLength: 200},
    ],
    xssCheck: false, // System-generated ID
  },

  removeTrustedDevice: {
    rules: [
      {field: "visitorId", type: "string", required: true, maxLength: 200},
      {field: "currentVisitorId", type: "string", maxLength: 200},
    ],
    xssCheck: false, // System-generated IDs
  },

  checkDeviceTrust: {
    rules: [
      {field: "visitorId", type: "string", required: true, maxLength: 200},
      {field: "userId", type: "id"},
    ],
    xssCheck: false, // System-generated IDs
  },

  // Encryption schemas
  generateUserKeys: {
    rules: [
      {field: "password", type: "string"},
      {field: "returnFormat", type: "enum", enumValues: ["pem", "der"]},
    ],
    xssCheck: false, // No user content
  },

  getUserPublicKey: {
    rules: [
      {field: "userId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  getUserPrivateKeys: {
    rules: [
      {field: "password", type: "string", required: true},
    ],
    xssCheck: false,
  },

  uploadEncryptionKeys: {
    rules: [
      {field: "password", type: "string", required: true},
      {field: "publicKey", type: "string", required: true, maxLength: 5000},
      {field: "signingPublicKey", type: "string", required: true, maxLength: 5000},
      {field: "encryptedPrivateKeys", type: "object", required: true},
    ],
    xssCheck: false, // Keys are system-generated
  },

  storeClientGeneratedKeys: {
    rules: [
      {field: "identityKey", type: "string", required: true, maxLength: 5000},
      {field: "signingKey", type: "string", required: true, maxLength: 5000},
      {field: "keyFormat", type: "enum", enumValues: ["pem", "der"]},
    ],
    xssCheck: false, // Keys are system-generated
  },

  getUserEncryptionKeys: {
    rules: [
      {field: "userId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  initializeEncryptedChat: {
    rules: [
      {field: "participantIds", type: "array", required: true, maxSize: 50},
      {field: "groupName", type: "string", maxLength: 100},
    ],
    xssCheck: true,
  },

  verifyKeyFingerprint: {
    rules: [
      {field: "targetUserId", type: "id", required: true},
      {field: "fingerprint", type: "string", required: true, maxLength: 200},
    ],
    xssCheck: false, // Fingerprint is system-generated
  },

  getKeyVerificationStatus: {
    rules: [
      {field: "targetUserId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  updateMessageDelivery: {
    rules: [
      {field: "chatId", type: "id", required: true},
      {field: "messageId", type: "id", required: true},
      {field: "status", type: "enum", required: true, enumValues: ["delivered", "read"]},
    ],
    xssCheck: false,
  },

  getChatEncryptionStatus: {
    rules: [
      {field: "chatId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  registerDevice: {
    rules: [
      {field: "deviceId", type: "string", required: true, maxLength: 200},
      {field: "deviceName", type: "string", required: true, maxLength: 100},
      {field: "devicePublicKey", type: "string", required: true, maxLength: 5000},
      {field: "deviceInfo", type: "object"},
    ],
    xssCheck: true,
  },

  syncDeviceMessages: {
    rules: [
      {field: "deviceId", type: "string", required: true, maxLength: 200},
      {field: "lastSyncTimestamp", type: "date"},
    ],
    xssCheck: false,
  },

  rotateEncryptionKeys: {
    rules: [
      {field: "newPublicKey", type: "string", required: true, maxLength: 5000},
      {field: "oldKeyId", type: "string", required: true, maxLength: 200},
      {field: "rotationProof", type: "string", maxLength: 1000},
    ],
    xssCheck: false, // Keys are system-generated
  },

  createKeyBackup: {
    rules: [
      {field: "encryptedPrivateKey", type: "string", required: true, maxLength: 10000},
      {field: "publicKey", type: "string", required: true, maxLength: 5000},
      {field: "salt", type: "string", required: true, maxLength: 200},
      {field: "iterations", type: "number"},
      {field: "hint", type: "string", maxLength: 200},
    ],
    xssCheck: true, // Hint is user content
  },

  initializeGroupEncryption: {
    rules: [
      {field: "groupId", type: "id", required: true},
      {field: "memberIds", type: "array", required: true, maxSize: 100},
      {field: "senderKeyPublic", type: "string", required: true, maxLength: 5000},
    ],
    xssCheck: false,
  },

  initializeDoubleRatchet: {
    rules: [
      {field: "sessionId", type: "string", required: true, maxLength: 200},
      {field: "recipientId", type: "id", required: true},
      {field: "ephemeralPublicKey", type: "string", required: true, maxLength: 5000},
    ],
    xssCheck: false,
  },

  checkDeviceRegistration: {
    rules: [
      {field: "deviceId", type: "string", required: true, maxLength: 200},
    ],
    xssCheck: false,
  },

  updateDeviceLastSeen: {
    rules: [
      {field: "deviceId", type: "string", required: true, maxLength: 200},
    ],
    xssCheck: false,
  },

  removeDevice: {
    rules: [
      {field: "deviceId", type: "string", required: true, maxLength: 200},
    ],
    xssCheck: false,
  },

  consumeOneTimePreKey: {
    rules: [
      {field: "targetUserId", type: "id", required: true},
    ],
    xssCheck: false,
  },

  uploadRotatedEncryptionKey: {
    rules: [
      {field: "keyId", type: "string", required: true, maxLength: 200},
      {field: "publicKey", type: "string", required: true, maxLength: 5000},
      {field: "keyType", type: "enum", required: true, enumValues: ["identity", "prekey", "vault_master"]},
      {field: "version", type: "number", required: true},
      {field: "expiresAt", type: "number", required: true},
      {field: "rotationReason", type: "enum", enumValues: ["scheduled", "compromise", "manual"]},
      {field: "deviceId", type: "string", maxLength: 200},
    ],
    xssCheck: false,
  },

  logSecureShareEvent: {
    rules: [
      {field: "shareId", type: "string", required: true, maxLength: 200},
      {field: "eventType", type: "string", required: true, maxLength: 50},
      {field: "metadata", type: "object"},
      {field: "timestamp", type: "number"},
    ],
    xssCheck: false,
  },

  getShareLinkStats: {
    rules: [
      {field: "shareId", type: "string", required: true, maxLength: 200},
    ],
    xssCheck: false,
  },

  exportAuditLogs: {
    rules: [
      {field: "startDate", type: "number"},
      {field: "endDate", type: "number"},
      {field: "eventTypes", type: "array", maxSize: 50},
      {field: "format", type: "enum", enumValues: ["json", "csv"]},
      {field: "ownLogsOnly", type: "boolean"},
    ],
    xssCheck: false,
  },

  logAuditEvent: {
    rules: [
      {field: "eventType", type: "string", required: true, maxLength: 50},
      {field: "description", type: "string", required: true, maxLength: 500},
      {field: "resourceId", type: "string", maxLength: 200},
      {field: "metadata", type: "object"},
      {field: "timestamp", type: "number"},
    ],
    xssCheck: true, // Description is user content
  },

  // Sync schemas
  enqueueSyncOperation: {
    rules: [
      {field: "operationType", type: "string", required: true, maxLength: 50},
      {field: "collection", type: "string", required: true, maxLength: 100},
      {field: "documentId", type: "id"},
      {field: "operationData", type: "object"},
      {field: "conflictResolution", type: "string", maxLength: 50},
      {field: "clientVersion", type: "number"},
      {field: "serverVersion", type: "number"},
    ],
    xssCheck: false, // System data
  },

  detectConflicts: {
    rules: [
      {field: "collection", type: "string", required: true, maxLength: 100},
      {field: "documentId", type: "id", required: true},
      {field: "clientVersion", type: "number", required: true},
      {field: "clientData", type: "object"},
      {field: "operationId", type: "string", maxLength: 200},
    ],
    xssCheck: false, // System data
  },

  resolveConflicts: {
    rules: [
      {field: "conflictId", type: "id", required: true},
      {field: "strategy", type: "string", required: true, maxLength: 50},
      {field: "resolvedData", type: "object"},
    ],
    xssCheck: false, // System data
  },

  batchSyncOperations: {
    rules: [
      {field: "operations", type: "array", required: true, maxSize: 50},
      {field: "deviceId", type: "string", required: true, maxLength: 200},
    ],
    xssCheck: false, // System data
  },

  // Add more schemas as needed...

  // SMS Validation Schemas
  updateSmsPreferences: {
    rules: [
      {field: "preferences", type: "object", required: true},
      {field: "phoneNumber", type: "phone"},
    ],
    allowExtraFields: true,
    xssCheck: false,
  },

  sendPhoneVerification: {
    rules: [
      {field: "phoneNumber", type: "phone", required: true},
    ],
    xssCheck: false,
  },

  verifyPhoneNumber: {
    rules: [
      {field: "phoneNumber", type: "phone", required: true},
      {field: "code", type: "string", required: true, maxLength: 6},
    ],
    xssCheck: false,
  },

  verifySmsCode: {
    rules: [
      {field: "phoneNumber", type: "phone", required: true},
      {field: "code", type: "string", required: true, maxLength: 6},
    ],
    xssCheck: false,
  },

  sendEventSms: {
    rules: [
      {field: "eventId", type: "id", required: true},
      {field: "recipientIds", type: "array", required: true, maxSize: 100},
      {field: "template", type: "enum", required: true, enumValues: ["invite", "reminder", "update"]},
    ],
    xssCheck: false,
  },

  sendTestSms: {
    rules: [
      {field: "phoneNumber", type: "phone", required: true},
    ],
    xssCheck: false,
  },

  // Biometric Authentication Schemas
  registerBiometricCredential: {
    rules: [
      {field: "credentialId", type: "string", required: true, maxLength: 500},
      {field: "publicKey", type: "string", required: true, maxLength: 5000},
      {field: "attestationObject", type: "string", required: true, maxLength: 10000},
      {field: "clientDataJSON", type: "string", required: true, maxLength: 2000},
      {field: "deviceInfo", type: "object"},
    ],
    xssCheck: false,
  },

  verifyBiometricAuthentication: {
    rules: [
      {field: "challengeId", type: "string", required: true, maxLength: 200},
      {field: "credentialId", type: "string", required: true, maxLength: 500},
      {field: "authenticatorData", type: "string", required: true, maxLength: 2000},
      {field: "clientDataJSON", type: "string", required: true, maxLength: 2000},
      {field: "signature", type: "string", required: true, maxLength: 1000},
    ],
    xssCheck: false,
  },

  revokeBiometricCredential: {
    rules: [
      {field: "credentialId", type: "string", required: true, maxLength: 500},
    ],
    xssCheck: false,
  },

  // Key Rotation Schemas
  setupKeyRotationSchedule: {
    rules: [
      {field: "intervalDays", type: "number"},
      {field: "enabledKeyTypes", type: "array", maxSize: 10},
      {field: "warningDays", type: "number"},
    ],
    xssCheck: false,
  },

  forceKeyRotation: {
    rules: [
      {field: "keyTypes", type: "array", maxSize: 10},
      {field: "reason", type: "enum", enumValues: ["manual", "compromise", "scheduled"]},
    ],
    xssCheck: false,
  },

  // Vault Bulk Operations Schemas
  executeBulkVaultOperation: {
    rules: [
      {field: "operation", type: "enum", required: true,
        enumValues: ["encrypt", "decrypt", "share", "unshare", "delete", "restore", "move"]},
      {field: "itemIds", type: "array", required: true, maxSize: 100},
      {field: "metadata", type: "object"},
    ],
    xssCheck: false,
  },

  updateVaultFile: {
    rules: [
      {field: "itemId", type: "string", required: true, maxLength: 100},
      {field: "fileData", type: "string", required: true, maxLength: 50 * 1024 * 1024}, // 50MB base64
      {field: "fileName", type: "string", required: true, maxLength: 255},
    ],
    xssCheck: true,
  },

  completeVaultFileUpload: {
    rules: [
      {field: "uploadId", type: "string", required: true, maxLength: 100},
      {field: "itemId", type: "string", required: true, maxLength: 100},
      {field: "parts", type: "array", required: true, maxSize: 10000},
    ],
    xssCheck: false,
  },

  permanentlyDeleteVaultItem: {
    rules: [
      {field: "itemId", type: "string", required: true, maxLength: 100},
      {field: "confirmDelete", type: "boolean", required: true},
    ],
    xssCheck: false,
  },

  rotateEncryptionKey: {
    rules: [
      {field: "keyType", type: "enum", required: true, enumValues: ["user", "vault", "message"]},
      {field: "oldKeyId", type: "string", required: true, maxLength: 100},
      {field: "newKeyId", type: "string", required: true, maxLength: 100},
      {field: "encryptedKey", type: "string", required: true, maxLength: 5000},
      {field: "metadata", type: "object"},
    ],
    xssCheck: false,
  },

  // Authentication schemas
  handleSignUp: {
    rules: [
      {field: "email", type: "email", required: true},
      {field: "password", type: "string", required: true},
      {field: "displayName", type: "string", maxLength: 100},
      {field: "firstName", type: "string", maxLength: 50},
      {field: "lastName", type: "string", maxLength: 50},
      {field: "phoneNumber", type: "phone"},
      {field: "dateOfBirth", type: "date"},
      {field: "gender", type: "enum", enumValues: ["male", "female", "other", "unspecified"]},
      {field: "invitationId", type: "string", maxLength: 200},
      {field: "familyTreeId", type: "id"},
    ],
    xssCheck: true,
  },

  handlePhoneSignInComplete: {
    rules: [
      {field: "uid", type: "id", required: true},
      {field: "phoneNumber", type: "phone", required: true},
    ],
    xssCheck: false,
  },

  handleGoogleSignIn: {
    rules: [
      {field: "userId", type: "id", required: true},
      {field: "email", type: "email"},
      {field: "displayName", type: "string", maxLength: 100},
      {field: "photoURL", type: "string", maxLength: 2000},
    ],
    xssCheck: true,
  },

  handleAppleSignIn: {
    rules: [
      {field: "userId", type: "id", required: true},
      {field: "email", type: "email"},
      {field: "fullName", type: "object"},
    ],
    xssCheck: true,
  },

  handleSignIn: {
    rules: [
      {field: "email", type: "email", required: true},
      {field: "password", type: "string", required: true},
    ],
    xssCheck: false,
  },

  confirmPhoneSignIn: {
    rules: [
      {field: "verificationId", type: "string", required: true, maxLength: 200},
      {field: "verificationCode", type: "string", required: true, maxLength: 10},
    ],
    xssCheck: false,
  },
};
