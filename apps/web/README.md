# Dynasty - Secure Family History Platform

Dynasty is a comprehensive web application that allows families to document, share, and preserve their history across generations. It features a secure, end-to-end encrypted messaging system, family tree builder, and story archiving capabilities.

## Core Features

- **End-to-End Encrypted Messaging**: Communicate securely with family members with no server access to message content
- **Family Tree Builder**: Document family relationships and history
- **Story Archive**: Preserve family stories, photos, and memories
- **Event Management**: Create and organize family gatherings and events
- **Multi-device Support**: Seamless experience across mobile and desktop

## Technologies

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Firebase (Authentication, Firestore, Storage, Functions)
- **Encryption**: Web Crypto API, Double Ratchet Algorithm
- **Deployment**: Vercel

## End-to-End Encrypted Messaging

The Dynasty messaging system provides secure, private communication between family members with the following security features:

- **Forward Secrecy**: Past messages remain secure even if keys are compromised
- **Post-Compromise Security**: Future messages remain secure after temporary compromise
- **Multi-Device Support**: Access your messages securely across all your devices
- **Verified Communications**: Only authorized family members can access messages

### Messaging Architecture

The messaging system combines client-side encryption with Firebase for a secure yet scalable solution:

1. **Local Encryption**: All message content is encrypted/decrypted locally on device
2. **Firebase Backend**: Handles message delivery without accessing plaintext
3. **Device Key Management**: Each device maintains its own encryption keys
4. **Secure Sessions**: Encrypted sessions between device pairs ensure message privacy

For technical details, see [Messaging Implementation](./dynastyweb/src/docs/MessagingFeature.md).

## Getting Started

### Prerequisites

- Node.js (v16+)
- Firebase account
- Git

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/dynasty.git
   ```

2. Install dependencies for both frontend and backend:
   ```
   # Install frontend dependencies
   cd dynastyweb
   npm install

   # Install backend dependencies
   cd ../dynastyfirebase
   npm install
   ```

3. Set up environment variables:
   - Create `.env.local` in the `dynastyweb` directory with your Firebase config:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-domain.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id
   ```

4. Start the development servers:
   ```
   # Start Firebase emulators
   cd dynastyfirebase
   npm run emulators

   # In another terminal, start the frontend
   cd dynastyweb
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000`

## Development Workflow

### File Structure

- `/dynastyweb` - Next.js frontend application
  - `/src/app` - Next.js app router pages and layouts
  - `/src/components` - Reusable React components
  - `/src/lib` - Utilities, API clients, and helpers
  - `/src/context` - React context providers
  - `/src/hooks` - Custom React hooks

- `/dynastyfirebase` - Firebase backend
  - `/functions` - Cloud Functions
  - `/firestore.rules` - Firestore security rules
  - `/storage.rules` - Firebase Storage security rules

### Setting Up Messaging

To use the end-to-end encrypted messaging feature:

1. Include the `EncryptionProvider` in your app:
   ```jsx
   import { EncryptionProvider } from '@/context/EncryptionContext';

   function MyApp({ Component, pageProps }) {
     return (
       <EncryptionProvider>
         <Component {...pageProps} />
       </EncryptionProvider>
     );
   }
   ```

2. Initialize encryption for a user after authentication:
   ```jsx
   import { useEncryption } from '@/context/EncryptionContext';

   function SetupEncryption() {
     const { initializeUserEncryption } = useEncryption();
     
     const handleSetup = async (password) => {
       const success = await initializeUserEncryption(password);
       if (success) {
         console.log('Encryption initialized!');
       }
     };
     
     return (
       <button onClick={() => handleSetup('secure-password')}>
         Set up encrypted messaging
       </button>
     );
   }
   ```

3. Send an encrypted message:
   ```jsx
   import { useEncryption } from '@/context/EncryptionContext';
   import { sendMessage, createChat } from '@/lib/api/messaging';

   function SendMessage() {
     const { encryptMessageForUser } = useEncryption();
     
     const handleSend = async (recipientId, message) => {
       // Create or get existing chat
       const chatResult = await createChat([recipientId], 'individual');
       if (!chatResult.success) return;
       
       // Encrypt message for recipient
       const encryptedContent = await encryptMessageForUser(recipientId, message);
       if (!encryptedContent) return;
       
       // Send the encrypted message
       await sendMessage(chatResult.chatId, encryptedContent);
     };
     
     return (
       <button onClick={() => handleSend('user123', 'Hello, encrypted world!')}>
         Send Encrypted Message
       </button>
     );
   }
   ```

## Connecting with UI Design

Once you've implemented the messaging backend, you can connect it with your UI design:

1. Create UI components for the chat interface
2. Integrate the encryption and messaging APIs with the UI
3. Test the end-to-end flow with multiple users and devices

## Deployment

### Frontend Deployment

The frontend can be deployed to Vercel:

```
cd dynastyweb
vercel
```

### Backend Deployment

To deploy Firebase functions:

```
cd dynastyfirebase
firebase deploy
```

## License

[MIT License](LICENSE)

## Contact

For questions or support, please reach out to [your-email@example.com](mailto:your-email@example.com). 