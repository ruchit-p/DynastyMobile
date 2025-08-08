# Dynasty

> A secure, cross-platform family history application for preserving memories and connecting generations.

## 🏛️ Overview

Dynasty is a comprehensive family history platform that allows families to securely store, share, and preserve their memories across generations. Built with privacy and security at its core, Dynasty provides end-to-end encryption, zero-knowledge architecture, and intuitive family tree visualization.

### Key Features

- 🔐 **End-to-End Encryption** - Signal Protocol implementation for secure messaging
- 🌳 **Interactive Family Tree** - High-performance visualization with 1000+ member support
- 📸 **Secure Vault** - Zero-knowledge encrypted file storage with Cloudflare R2
- 💬 **Encrypted Messaging** - Private family conversations with message reactions
- 📅 **Family Events** - Shared calendar with RSVP management
- 📖 **Family Stories** - Preserve and share family history with rich media
- 🌐 **Cross-Platform** - iOS, Android, and Web support
- 📱 **Offline Support** - Full functionality even without internet connection

## 🏗️ Architecture

Dynasty uses a monorepo architecture managed with Yarn workspaces:

```
DynastyMobile/
├── apps/
│   ├── mobile/              # React Native (Expo) app
│   ├── web/dynastyweb/      # Next.js web application
│   └── firebase/functions/  # Firebase Functions backend
├── packages/
│   └── vault-sdk/          # Shared encryption SDK
├── docs/                   # Documentation
└── scripts/               # Automation scripts
```

### Technology Stack

#### Mobile App

- **Framework**: React Native with Expo
- **Navigation**: Expo Router (file-based routing)
- **State Management**: React Context API
- **Database**: SQLite for offline support
- **UI Components**: Custom design system with accessibility support

#### Web App

- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS + shadcn/ui
- **Authentication**: Firebase Auth with MFA support
- **Real-time**: Firebase Firestore subscriptions

#### Backend

- **Functions**: Firebase Functions v2 (TypeScript)
- **Database**: Firebase Firestore
- **Storage**: Cloudflare R2 (S3-compatible)
- **Email**: AWS SES
- **SMS**: AWS End User Messaging (Pinpoint SMS Voice v2)
- **Authentication**: Firebase Auth with custom security rules

## 🚀 Getting Started

### Prerequisites

- Node.js 20.19.2 or higher
- Yarn 1.22.22 (required package manager)
- iOS Simulator (for iOS development)
- Android Studio (for Android development)
- Firebase CLI

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/DynastyMobile.git
   cd DynastyMobile
   ```

2. **Install dependencies**

   ```bash
   # Install all workspace dependencies
   yarn
   ```

3. **Environment Setup**

   Create environment files based on the examples:

   ```bash
   # Mobile app environment
   cp apps/mobile/.env.example apps/mobile/.env
   # Mobile Firebase configs (place your own real files; examples provided)
   cp apps/mobile/GoogleService-Info.example.plist apps/mobile/GoogleService-Info.plist
   cp apps/mobile/google-services.example.json apps/mobile/google-services.json

   # Web app environment
   cp apps/web/dynastyweb/.env.example apps/web/dynastyweb/.env.local

   # Firebase functions environment
   cp apps/firebase/functions/.env.example apps/firebase/functions/.env
   ```

4. **Configure Firebase**
   - Create a Firebase project
   - Download service account credentials
   - Place `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) in the mobile app (see example files)
   
   - Stripe config: use examples `stripe-config.example.json` and `stripe-production-config.example.env` as templates. Do not commit real keys.
   - Update Firebase configuration in environment files

### Development

##### Start Development

```bash
# From root directory:
yarn web         # Start Next.js web app
yarn mobile      # Start React Native mobile app

# Firebase functions with emulators:
cd apps/firebase/functions
yarn emulators   # Start Firebase emulators
```

#### Build & Deploy

```bash
# Web app
yarn build:web        # Build Next.js for production

# Firebase functions
yarn build:functions  # Build functions
yarn deploy           # Deploy to Firebase
```

## 🔒 Security

Dynasty implements multiple layers of security:

- **Zero-Knowledge Architecture**: Server never has access to unencrypted data
- **End-to-End Encryption**: Signal Protocol for messaging
- **Client-Side Encryption**: All files encrypted before upload
- **Biometric Authentication**: Touch ID/Face ID support
- **Multi-Factor Authentication**: SMS and authenticator app support
- **Secure Key Storage**: iOS Keychain and Android Keystore
- **Regular Security Audits**: Automated vulnerability scanning

For detailed security documentation, see [docs/security/README.md](./docs/security/README.md).

## 📚 Documentation

- [Architecture Overview](./docs/architecture/README.md)
- [API Reference](./docs/api-reference/README.md)
- [Development Guide](./docs/guides/getting-started.md)
- [Security Documentation](./docs/security/README.md)
- [Feature Documentation](./docs/features/)

## 🧪 Testing

Dynasty maintains high test coverage across all platforms:

```bash
# Run specific platform tests from root:
yarn test:firebase    # Test Firebase functions
yarn test:web        # Test web app
yarn test:mobile     # Test mobile app

# Run tests with coverage
cd apps/web/dynastyweb && yarn test:coverage
```

## 🚢 Deployment

### Mobile Apps

Dynasty uses Expo Application Services (EAS) for building and deploying:

```bash
cd apps/mobile
eas build --platform ios      # Build for iOS
eas build --platform android  # Build for Android
eas submit                     # Submit to app stores
```

### Web App

The web app is deployed to Vercel:

```bash
cd apps/web/dynastyweb
vercel --prod                  # Deploy to production
```

### Firebase Functions

```bash
cd apps/firebase/functions
yarn deploy                    # Deploy all functions
./scripts/deploy-production.sh # Deploy with production secrets
```

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Write/update tests
4. Run linting: `yarn lint`
5. Submit a pull request to `main`

### Code Quality

- TypeScript for all new code
- ESLint for code quality
- Prettier for formatting
- Jest for testing

## 📄 License

This project is licensed under the MIT License - see the `LICENSE` file for details.

## 🙏 Acknowledgments

- Signal Protocol for encryption implementation
- Expo team for the amazing React Native framework
- Firebase team for the backend infrastructure
- Our beta testers for invaluable feedback

---

For more information, visit [mydynastyapp.com](https://mydynastyapp.com)
