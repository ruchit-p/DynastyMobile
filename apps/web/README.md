# Dynasty Web Application

The Next.js web application for Dynasty - a secure family history platform for documenting, sharing, and preserving family memories across generations.

## Features

- 🔐 **End-to-End Encrypted Messaging** - Secure family communications
- 🌳 **Interactive Family Tree** - Visual family relationship mapping
- 📖 **Digital History Book** - Rich media stories and memories
- 📅 **Event Management** - Family gatherings with RSVP tracking
- 📁 **Secure Vault** - Encrypted file storage and sharing
- 💳 **Subscriptions** - Premium features with Stripe integration

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: React Context API
- **Backend**: Firebase (Auth, Firestore, Functions)
- **Deployment**: Vercel


## Getting Started

### Prerequisites

- Node.js 20.19.2+
- Yarn 1.22.22
- Firebase project

### Setup

1. Clone the repository and install dependencies:
   ```bash
   # From project root
   yarn install
   ```

2. Configure environment:
   ```bash
   cd apps/web/dynastyweb
   cp .env.example .env.local
   # Edit .env.local with your Firebase config
   ```

3. Start development:
   ```bash
   # From project root
   yarn web
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
dynastyweb/
├── src/
│   ├── app/          # Next.js app router pages
│   ├── components/   # React components
│   ├── context/      # Context providers
│   ├── hooks/        # Custom hooks
│   ├── lib/          # Utilities & Firebase setup
│   ├── services/     # API services
│   └── utils/        # Helper functions
├── public/           # Static assets
└── __tests__/        # Test files
```

## Key Routes

- `/` - Landing page
- `/login` - User authentication
- `/signup` - New user registration
- `/feed` - User dashboard (protected)
- `/family-tree` - Interactive family tree (protected)
- `/history-book` - Digital family stories (protected)
- `/messages` - Encrypted messaging (protected)
- `/vault` - Secure file storage (protected)
- `/account-settings` - Profile management (protected)

## Development

```bash
# Run development server
yarn dev

# Run tests
yarn test
yarn test:coverage

# Lint code
yarn lint

# Build for production
yarn build

# Start production server
yarn start
```

## Deployment

The app is configured for automatic deployment via Vercel:

```bash
# Manual deployment
vercel --prod
```

## Environment Variables

Required environment variables:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# Optional
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
NEXT_PUBLIC_USE_FIREBASE_EMULATOR
NEXT_PUBLIC_ENVIRONMENT
```

## Security

- Content Security Policy (CSP) configured
- Input validation and XSS protection
- Secure authentication flows
- Environment-specific configurations

For more details, see the [main project README](../../../README.md). 