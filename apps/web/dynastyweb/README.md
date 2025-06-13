# Dynasty - Your Family's Legacy, Beautifully Preserved

Dynasty is a comprehensive family history platform that allows users to create, share, and preserve their family legacy through digital family trees and history books.

## 🌟 Features

- **Family Tree Visualization**: Build and visualize your family connections across generations
- **Digital History Book**: Document stories, photos, and memories in a beautiful digital format
- **Collaborative Sharing**: Collaborate with family members and share your history securely
- **Time Machine**: Travel through your family's timeline and explore your heritage
- **User Authentication**: Secure login, registration, and account management
- **Responsive Design**: Beautiful UI that works on mobile, tablet, and desktop

## 🚀 Tech Stack

This application is built using modern web technologies:

- **Frontend**: [Next.js](https://nextjs.org) with TypeScript and React
- **Styling**: Tailwind CSS with custom theming
- **UI Components**: Shadcn UI components (Radix UI-based)
- **Authentication**: Firebase Authentication
- **Database**: Firebase Firestore
- **Storage**: Firebase Storage for media files
- **Serverless Functions**: Firebase Cloud Functions
- **Analytics**: Firebase Analytics
- **Map Integration**: Leaflet for geographical visualization
- **Deployment**: Vercel

## 🔧 Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn
- Firebase project (for development)
- Firebase CLI (for secret management)

### Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Create a `.env.local` file with your Firebase configuration:

```
# Firebase Configuration (Required)
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-firebase-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-firebase-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-firebase-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-firebase-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-firebase-measurement-id
```

### Secret Management

Dynasty uses Firebase Secret Manager for secure environment variables in Cloud Functions:

1. Set secrets using Firebase CLI:
```bash
firebase functions:secrets:set YOUR_SECRET_NAME
```

2. For local development, create a `.secret.local` file in your functions directory with your secrets in KEY=value format:
```
SECRET_NAME_1=secret_value_1
SECRET_NAME_2=secret_value_2
```

The Firebase Emulator Suite will automatically load these secrets when running locally.

### Development

Run the development server:

```bash
npm run dev
# or
yarn dev
```

For development with Firebase Emulators:

```bash
npm run dev:emulator
# or
yarn dev:emulator
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Building for Production

```bash
npm run build
# or
yarn build
```

## 📂 Project Structure

- `src/app`: Next.js 14+ App Router pages and layouts
- `src/components`: Reusable UI components
- `src/context`: React context providers
- `src/data`: Data models and types
- `src/hooks`: Custom React hooks
- `src/lib`: Utility libraries, including Firebase setup
- `src/utils`: Helper functions and utilities

## 📱 Main Application Routes

- `/`: Landing page
- `/login`: User login
- `/signup`: New user registration
- `/verify-email`: Email verification
- `/forgot-password`: Password recovery
- `/feed`: User's personal feed (protected)
- `/family-tree`: Interactive family tree visualization (protected)
- `/history-book`: Digital family history book (protected)
- `/create-story`: Create new family stories (protected)
- `/story/:id`: View individual stories (protected)
- `/account-settings`: User profile and settings (protected)

## 📄 License

Copyright © 2024 Dynasty. All rights reserved.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
