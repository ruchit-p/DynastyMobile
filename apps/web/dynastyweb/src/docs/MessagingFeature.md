# Dynasty Messaging: End-to-End Encrypted Multi-Device Messaging

This document outlines the implementation of end-to-end encrypted messaging in the Dynasty application. The messaging system leverages Firebase for message delivery while ensuring that message content is never exposed in plaintext on the server.

## Architecture Overview

The Dynasty messaging system implements the following key components:

1. **Double Ratchet Algorithm**: A cryptographic protocol that provides forward secrecy and post-compromise security.
2. **Device-specific Key Pairs**: Each device has its own public/private key pair for secure communication.
3. **Firebase Functions Backend**: Handles message routing and storage without accessing plaintext.
4. **Client-side Encryption**: All encryption and decryption occurs exclusively on the client side.
5. **Multi-device Support**: Allows users to access messages across multiple devices while maintaining end-to-end encryption.

## Security Features

- **Forward Secrecy**: Even if a long-term key is compromised, past messages remain secure.
- **Break-in Recovery**: Future messages remain secure even if a session is temporarily compromised.
- **Message Authentication**: Ensures messages cannot be tampered with in transit.
- **Encrypted Key Storage**: Private keys are encrypted with a user password before being stored locally.

## Component Breakdown

### Backend (Firebase Functions)

The backend consists of several Firebase Cloud Functions that handle message routing without accessing message content:

1. `registerPublicKey`: Stores a user's public key for a specific device.
2. `fetchPublicKeys`: Retrieves public keys for specified users.
3. `createChat`: Initializes a chat between users.
4. `sendMessage`: Routes encrypted messages to recipients.
5. `updateMessageStatus`: Updates delivery/read status for messages.
6. `addChatParticipant`: Adds a user to a group chat.
7. `removeChatParticipant`: Removes a user from a group chat.

### Client-side Encryption

The encryption system implements the Double Ratchet algorithm:

1. **Key Generation**: Each device generates an ECDH key pair.
2. **Session Establishment**: Secure sessions are established between device pairs.
3. **Message Encryption**: Messages are encrypted with unique keys for each device.
4. **Chain Keys**: Continuously evolving key chains provide forward secrecy.
5. **Message Keys**: One-time keys derived from chain keys encrypt individual messages.

## Data Models

### Firebase Collections

- **publicKeys**: Stores public keys for all user devices
- **chats**: Stores chat metadata (participants, chat type, etc.)
- **messages**: Stores encrypted message content

### Key Data Types

- **KeyPair**: Contains a public/private key pair for a device
- **SessionData**: Manages encryption state between two devices
- **EncryptedMessage**: Structure for encrypted message content

## Implementation Flow

### Setup Process

1. When a user first enables messaging:
   - A new ECDH key pair is generated for their device
   - The public key is registered with Firebase
   - The private key is encrypted with a user password and stored locally

2. When initiating a chat:
   - The sender creates a chat document in Firestore
   - Each participant is added to the chat

3. When sending a message:
   - The sender retrieves public keys for all recipient devices
   - The message is encrypted uniquely for each recipient device
   - The encrypted message is stored in Firestore

4. When receiving a message:
   - The recipient retrieves the encrypted message
   - The message is decrypted using the appropriate session keys
   - The message status is updated (delivered, read)

### Multi-device Synchronization

When a user has multiple devices:

1. Messages are encrypted separately for each device
2. Each device maintains its own encryption sessions
3. When a new device is added, it generates its own key pair
4. New devices can only decrypt messages sent after they were registered

## Security Considerations

- **No Server-side Decryption**: Firebase never has access to decryption keys or plaintext.
- **Secure Key Storage**: Private keys are stored encrypted with a user password.
- **Rate Limiting**: Functions have rate limiting to prevent abuse.
- **Authorization Checks**: All functions verify user identity and permissions.

## Future Enhancements

1. **Secure Key Backup**: Implement secure backup for encryption keys.
2. **Secure Device Linking**: Add QR code scanning for securely linking devices.
3. **Message Expiration**: Add self-destructing messages.
4. **Verification Badges**: Add visual indicators of verified contacts.

## Development and Integration

To connect the messaging feature with the UI:

1. The `EncryptionProvider` context must be included in the app's provider hierarchy
2. User must initialize encryption with a password before messaging
3. New UI components for message composition and display will need to use the encryption hooks
4. The provided APIs can be directly integrated with the UI

## Testing

While developing and testing the messaging feature:

1. Verify that messages are properly encrypted in Firestore
2. Check that messages can only be decrypted by intended recipients
3. Test multi-device scenarios extensively
4. Ensure messages cannot be decrypted if a third party obtains the ciphertext

## Resources

- [The Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)
- [Firebase Security Rules Documentation](https://firebase.google.com/docs/rules)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) 