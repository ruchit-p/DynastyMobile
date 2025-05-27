import * as Linking from 'expo-linking';
import { logger } from '../services/LoggingService';

export const prefix = Linking.createURL('/');

export const linking = {
  prefixes: [prefix, 'dynasty://', 'https://mydynastyapp.com', 'https://www.mydynastyapp.com'],
  config: {
    screens: {
      index: '',
      '(auth)': {
        screens: {
          signIn: 'signin',
          signUp: 'signup',
          forgotPassword: 'forgot-password',
          phoneSignIn: 'phone-signin',
          verifyOtp: 'verify-otp',
          verifyEmail: 'verify-email',
          confirmEmailVerification: 'confirm-email'
        }
      },
      '(tabs)': {
        screens: {
          feed: 'feed',
          familyTree: 'family',
          events: 'events',
          history: 'history',
          profile: 'profile',
          vault: 'vault'
        }
      },
      '(screens)': {
        screens: {
          // Story related
          storyDetail: 'story/:id',
          createStory: 'story/new',
          
          // Event related
          eventDetail: 'event/:id',
          createEvent: 'event/new',
          
          // Profile related
          memberProfile: 'profile/:userId',
          editProfile: 'profile/edit',
          
          // Family related
          familyManagement: 'family/:familyId',
          addFamilyMember: 'family/:familyId/add-member',
          
          // Chat related
          chat: 'chat',
          chatDetail: 'chat/:chatId',
          newChat: 'chat/new',
          
          // Invitations
          selectMembersScreen: 'invite/:type/:id',
          
          // Settings
          accountSettings: 'settings',
          notificationPreferences: 'settings/notifications',
          privacySettings: 'settings/privacy',
          encryptionSettings: 'settings/encryption'
        }
      }
    }
  }
};

// Helper function to handle incoming deep links
export const handleDeepLink = (url: string) => {
  const { hostname, path, queryParams } = Linking.parse(url);
  
  // Log for debugging
  logger.debug('Deep link received:', { url, hostname, path, queryParams });
  
  // You can add custom logic here to handle specific deep links
  // For example, authentication checks, data preloading, etc.
  
  return { hostname, path, queryParams };
};

// Get the initial URL on app launch
export const getInitialURL = async () => {
  const url = await Linking.getInitialURL();
  if (url) {
    handleDeepLink(url);
  }
  return url;
};