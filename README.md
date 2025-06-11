# Dynasty Mobile

> A secure, cross-platform family history application for preserving memories and connecting generations.

![Dynasty Logo](./apps/mobile/assets/images/dynasty.png)

## 🏛️ Overview

Dynasty is a comprehensive family history platform that allows families to securely store, share, and preserve their memories across generations. Built with privacy and security at its core, Dynasty provides end-to-end encryption, zero-knowledge architecture, and intuitive family tree visualization.

### Key Features

- 🔐 **End-to-End Encryption** - Signal Protocol implementation for secure messaging
- 🌳 **Interactive Family Tree** - High-performance visualization with 1000+ member support
- 📸 **Secure Vault** - Zero-knowledge encrypted file storage with Backblaze B2
- 💬 **Encrypted Messaging** - Private family conversations with message reactions and voice notes
- 📅 **Family Events** - Shared calendar with RSVP management
- 📖 **Family Stories** - Preserve and share family history with rich media
- 🌐 **Cross-Platform** - iOS, Android, and Web support
- 📱 **Offline Support** - Full functionality even without internet connection

## 🏗️ Architecture

Dynasty uses a monorepo architecture with three main applications:

```
DynastyMobile/
├── apps/
│   ├── mobile/          # React Native (Expo) app
│   ├── web/dynastyweb/  # Next.js web application
│   └── firebase/        # Firebase Functions backend
├── docs/                # Documentation
└── scripts/            # Automation scripts
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
- **Functions**: Firebase Functions (TypeScript)
- **Database**: Firebase Firestore
- **Storage**: Backblaze B2 (S3-compatible)
- **Email**: AWS SES
- **Authentication**: Firebase Auth with custom security rules

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x or higher
- Yarn or npm
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
   # Install root dependencies
   yarn install

   # Install app-specific dependencies
   cd apps/mobile && yarn install
   cd ../web/dynastyweb && yarn install
   cd ../firebase/functions && npm install
   ```

3. **Environment Setup**
   
   Create environment files based on the examples:
   ```bash
   # Mobile app
   cp apps/mobile/.env.example apps/mobile/.env
   
   # Web app
   cp apps/web/dynastyweb/.env.example apps/web/dynastyweb/.env.local
   
   # Firebase functions
   cp apps/firebase/functions/.env.example apps/firebase/functions/.env
   ```

4. **Configure Firebase**
   - Create a Firebase project
   - Download service account credentials
   - Place `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) in the mobile app
   - Update Firebase configuration in environment files

### Development

#### Mobile App
```bash
cd apps/mobile
yarn start                # Start Expo development server
yarn ios                  # Run on iOS simulator
yarn android              # Run on Android emulator
yarn test                 # Run tests
```

#### Web App
```bash
cd apps/web/dynastyweb
yarn dev                  # Start Next.js development server
yarn build                # Build for production
yarn test                 # Run tests
```

#### Firebase Functions
```bash
cd apps/firebase/functions
npm run serve             # Start Firebase emulators
npm run deploy            # Deploy to Firebase
npm test                  # Run tests
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
# Run all tests
yarn test

# Run tests with coverage
yarn test:coverage

# Run specific platform tests
cd apps/mobile && yarn test
cd apps/web/dynastyweb && yarn test
cd apps/firebase/functions && npm test
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
npm run deploy                 # Deploy all functions
npm run deploy:production      # Deploy with production config
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Workflow

1. Create a feature branch from `dev`
2. Make your changes
3. Write/update tests
4. Submit a pull request to `dev`

Use our automated workflow:
```bash
yarn feature "feature-name" "feat: your commit message"
```

## 📄 License

Dynasty is proprietary software. All rights reserved.

## 🙏 Acknowledgments

- Signal Protocol for encryption implementation
- Expo team for the amazing React Native framework
- Firebase team for the backend infrastructure
- Our beta testers for invaluable feedback

---

For more information, visit [mydynastyapp.com](https://mydynastyapp.com)