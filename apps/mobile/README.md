# Dynasty Mobile App

This is a React Native application built with Expo, designed for families to connect, share stories, organize events, and preserve their family history.

## Key Features

- **Authentication**: Multi-method authentication with email/password, Google Sign-In, and phone verification
- **Feed**: Timeline of family stories and events
- **Family History**: Record and preserve family stories
- **Family Tree**: Visual representation of family relationships
- **Events**: Calendar view and management of family events
- **Media Vault**: Secure storage for family photos, videos, and documents

## Getting Started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Project Structure

- **Root Directory**: `/Users/ruchitpatel/Documents/DynastyMobile/`
- **Mobile App**: `/Users/ruchitpatel/Documents/DynastyMobile/apps/mobile`
- **Web App**: `/Users/ruchitpatel/Documents/DynastyMobile/apps/web`
- **Firebase Functions**: `/Users/ruchitpatel/Documents/DynastyMobile/apps/firebase/functions/src`

## Documentation

- [Error Handling System](./docs/ERROR_HANDLING.md): Comprehensive guide to the app's error handling

## Features

### Error Handling System

The app includes a comprehensive error handling system with the following components:

- **ErrorHandlingService**: Core service for processing errors
- **ErrorBoundary**: React component for catching rendering errors
- **useErrorHandler**: Hook for handling errors in functional components
- **Integration with Crashlytics**: Automatic error reporting

To use the error handling system in a component:

```typescript
import useErrorHandler from '../../hooks/useErrorHandler';
import ErrorBoundary from '../../components/ui/ErrorBoundary';

function MyComponent() {
  const { handleError, withErrorHandling } = useErrorHandler();
  
  // Wrap an async function with error handling
  const fetchData = withErrorHandling(async () => {
    // Your code here
  });
  
  return (
    <ErrorBoundary screenName="MyComponent">
      {/* Component content */}
    </ErrorBoundary>
  );
}
```

For more details, see the [Error Handling documentation](./docs/ERROR_HANDLING.md).

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
