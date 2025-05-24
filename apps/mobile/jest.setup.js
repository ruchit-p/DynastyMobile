// Jest setup file
import '@testing-library/jest-native/extend-expect';

// Mock ErrorHandlingService first before any other imports might use it
jest.mock('./src/lib/ErrorHandlingService', () => ({
  errorHandler: {
    logError: jest.fn(),
    captureException: jest.fn(),
    setUser: jest.fn(),
    setContext: jest.fn(),
    clearContext: jest.fn(),
    setCurrentAction: jest.fn(),
    handleFirebaseError: jest.fn((error) => {
      throw error;
    }),
  },
  ErrorSeverity: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical',
  },
  errorHandlingService: {
    logError: jest.fn(),
    captureException: jest.fn(),
    setUser: jest.fn(),
    setContext: jest.fn(),
    clearContext: jest.fn(),
    setCurrentAction: jest.fn(),
    handleFirebaseError: jest.fn((error) => {
      throw error;
    }),
  },
}));

// Mock React Native modules
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');

// Mock expo modules
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: 'Link',
  Stack: {
    Screen: 'Screen',
  },
  Tabs: {
    Screen: 'Screen',
  },
}));

jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: 'test-project-id'
        }
      }
    }
  }
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: {
    Images: 'Images',
    Videos: 'Videos',
    All: 'All',
  },
  requestCameraPermissionsAsync: jest.fn(() => ({ status: 'granted' })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => ({ status: 'granted' })),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
    Heavy: 'Heavy',
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock expo-video
jest.mock('expo-video', () => ({
  VideoView: 'VideoView',
  useVideoPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
  })),
  VideoPlayerStatus: {},
}));

// Mock Google Sign-In
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({
      user: {
        id: 'google-123',
        email: 'test@gmail.com',
        name: 'Test User',
        photo: null,
      },
      idToken: 'mock-google-token',
    })),
    signOut: jest.fn(() => Promise.resolve()),
    isSignedIn: jest.fn(() => Promise.resolve(false)),
    getCurrentUser: jest.fn(() => null),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));


// Mock Firebase
jest.mock('@react-native-firebase/app', () => ({
  default: () => ({
    apps: [],
  }),
}));

jest.mock('@react-native-firebase/auth', () => {
  const mockAuth = {
    currentUser: null,
    onAuthStateChanged: jest.fn(() => jest.fn()), // Return unsubscribe function
    signInWithEmailAndPassword: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    signInWithCredential: jest.fn(),
    signInWithPhoneNumber: jest.fn(),
    signOut: jest.fn(),
    sendEmailVerification: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };
  
  // Create a function that returns the mock auth instance
  const authFunction = () => mockAuth;
  
  // Add static properties to the function
  authFunction.GoogleAuthProvider = {
    credential: jest.fn(),
  };
  authFunction.PhoneAuthProvider = {
    credential: jest.fn(),
  };
  authFunction.FirebaseAuthTypes = {
    User: {},
    Module: {},
  };
  
  return {
    default: authFunction,
    GoogleAuthProvider: {
      credential: jest.fn(),
    },
    PhoneAuthProvider: {
      credential: jest.fn(),
    },
    FirebaseAuthTypes: {
      User: {},
      Module: {},
    },
  };
});

jest.mock('@react-native-firebase/firestore', () => {
  const mockFirestore = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        onSnapshot: jest.fn(),
      })),
      where: jest.fn(() => ({
        get: jest.fn(),
        onSnapshot: jest.fn(),
      })),
      orderBy: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn(),
        })),
      })),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn(),
    })),
  };
  
  return {
    default: () => mockFirestore,
    FirebaseFirestoreTypes: {
      Timestamp: {
        now: jest.fn(() => ({ toDate: () => new Date() })),
        fromDate: jest.fn((date) => ({ toDate: () => date })),
      },
      FieldValue: {
        serverTimestamp: jest.fn(),
        arrayUnion: jest.fn(),
        arrayRemove: jest.fn(),
        increment: jest.fn(),
      },
    },
  };
});

jest.mock('@react-native-firebase/functions', () => {
  const mockFunctions = {
    httpsCallable: jest.fn(() => jest.fn()),
  };
  
  return {
    default: () => mockFunctions,
  };
});

jest.mock('@react-native-firebase/storage', () => ({
  default: () => ({
    ref: jest.fn(() => ({
      putFile: jest.fn(),
      getDownloadURL: jest.fn(),
      delete: jest.fn(),
    })),
  }),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  default: () => ({
    getToken: jest.fn(),
    onMessage: jest.fn(),
    onNotificationOpenedApp: jest.fn(),
    getInitialNotification: jest.fn(),
    requestPermission: jest.fn(),
    hasPermission: jest.fn(),
  }),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: jest.fn(),
    fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
  },
}));

// Mock react-native-sqlite-storage
jest.mock('react-native-sqlite-storage', () => ({
  default: {
    enablePromise: jest.fn(),
    openDatabase: jest.fn(() => ({
      transaction: jest.fn((callback) => {
        callback({
          executeSql: jest.fn((sql, params, success, error) => {
            success({ rows: { raw: () => [] } });
          }),
        });
      }),
      close: jest.fn(),
    })),
  },
  enablePromise: jest.fn(),
  openDatabase: jest.fn(() => ({
    transaction: jest.fn((callback) => {
      callback({
        executeSql: jest.fn((sql, params, success, error) => {
          success({ rows: { raw: () => [] } });
        }),
      });
    }),
    close: jest.fn(),
  })),
}));

// Mock react-native-keychain
jest.mock('react-native-keychain', () => ({
  setInternetCredentials: jest.fn(),
  getInternetCredentials: jest.fn(),
  resetInternetCredentials: jest.fn(),
  getSupportedBiometryType: jest.fn(),
}));

// Mock react-native-device-info
jest.mock('react-native-device-info', () => {
  const deviceInfo = {
    getUniqueId: jest.fn(() => 'test-device-id'),
    getModel: jest.fn(() => 'Test Device'),
    getSystemName: jest.fn(() => 'Test OS'),
    getSystemVersion: jest.fn(() => '1.0'),
    getDeviceName: jest.fn(() => 'Test Device Name'),
    isTablet: jest.fn(() => false),
    getApplicationName: jest.fn(() => 'Dynasty'),
    getBundleId: jest.fn(() => 'com.dynasty.app'),
    getVersion: jest.fn(() => '1.0.0'),
    getBuildNumber: jest.fn(() => '1'),
  };
  
  return {
    default: deviceInfo,
    ...deviceInfo, // Export all methods directly as well
  };
});

// Mock Notifee
jest.mock('@notifee/react-native', () => ({
  default: {
    createChannel: jest.fn(),
    displayNotification: jest.fn(),
    onForegroundEvent: jest.fn(),
    onBackgroundEvent: jest.fn(),
    cancelNotification: jest.fn(),
    getBadgeCount: jest.fn(),
    setBadgeCount: jest.fn(),
  },
  AuthorizationStatus: {
    AUTHORIZED: 1,
    DENIED: 0,
  },
  EventType: {
    DISMISSED: 0,
    PRESS: 1,
  },
}));

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: View,
    Slider: View,
    Switch: View,
    TextInput: View,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    DrawerLayoutAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: jest.fn(),
    Directions: {},
  };
});

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => ({
  default: {
    createAnimatedComponent: (component) => component,
    Value: jest.fn(),
    event: jest.fn(),
    add: jest.fn(),
    eq: jest.fn(),
    set: jest.fn(),
    cond: jest.fn(),
    interpolate: jest.fn(),
    View: require('react-native').View,
    ScrollView: require('react-native').ScrollView,
    Extrapolate: { CLAMP: jest.fn() },
    Extrapolation: { CLAMP: jest.fn() },
    // Gesture Handler
    Gesture: {
      Simultaneous: jest.fn(() => ({ onUpdate: jest.fn().mockReturnThis(), onEnd: jest.fn().mockReturnThis() })),
      Pinch: jest.fn(() => ({ onUpdate: jest.fn().mockReturnThis(), onEnd: jest.fn().mockReturnThis() })),
      Pan: jest.fn(() => ({ onUpdate: jest.fn().mockReturnThis(), onEnd: jest.fn().mockReturnThis() })),
    },
    GestureDetector: ({ children }) => children,
    runOnJS: (fn) => fn,
    useSharedValue: (initialValue) => ({ value: initialValue }),
    useAnimatedStyle: (fn) => fn(),
    withSpring: (value) => value,
    withTiming: (value) => value,
    withSequence: (...args) => args[0],
    withDelay: (delay, value) => value,
    cancelAnimation: jest.fn(),
    measure: jest.fn(),
  },
  Easing: {
    linear: jest.fn(),
    ease: jest.fn(),
    quad: jest.fn(),
    cubic: jest.fn(),
    poly: jest.fn(),
    sin: jest.fn(),
    circle: jest.fn(),
    exp: jest.fn(),
    elastic: jest.fn(),
    back: jest.fn(),
    bounce: jest.fn(),
    bezier: jest.fn(),
    in: jest.fn(),
    out: jest.fn(),
    inOut: jest.fn(),
  },
  Extrapolate: {
    EXTEND: 'extend',
    CLAMP: 'clamp',
    IDENTITY: 'identity',
  },
  SharedValue: jest.fn(),
  makeMutable: jest.fn(),
  useSharedValue: (initialValue) => ({ value: initialValue }),
  useDerivedValue: jest.fn((fn) => ({ value: fn() })),
  useAnimatedScrollHandler: jest.fn(() => ({})),
  useAnimatedGestureHandler: jest.fn(() => ({})),
  useAnimatedStyle: jest.fn((fn) => fn()),
  useAnimatedProps: jest.fn((fn) => fn()),
  useAnimatedReaction: jest.fn(),
  useAnimatedRef: jest.fn(() => ({ current: null })),
  defineAnimation: jest.fn(),
  cancelAnimation: jest.fn(),
  measure: jest.fn(),
  runOnUI: jest.fn((fn) => fn),
  runOnJS: jest.fn((fn) => fn),
  Layout: {
    duration: jest.fn(),
    delay: jest.fn(),
    springify: jest.fn(),
  },
  FadeIn: {
    duration: jest.fn(),
    delay: jest.fn(),
  },
  FadeOut: {
    duration: jest.fn(),
    delay: jest.fn(),
  },
  FadeInUp: {
    duration: jest.fn(),
    delay: jest.fn(),
  },
  FadeOutDown: {
    duration: jest.fn(),
    delay: jest.fn(),
  },
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// Mock FlashList
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { FlatList } = require('react-native');
  return {
    FlashList: React.forwardRef((props, ref) => 
      React.createElement(FlatList, { ...props, ref })
    ),
  };
});

// Mock ErrorHandlingService
jest.mock('./src/lib/ErrorHandlingService', () => ({
  ErrorSeverity: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    FATAL: 'fatal'
  },
  errorHandler: {
    setCurrentScreen: jest.fn(),
    handleError: jest.fn((error, config) => ({
      ...error,
      severity: config?.severity || 'error',
      timestamp: new Date().toISOString(),
      metadata: config?.metadata || {}
    })),
    clearAction: jest.fn(),
    setAction: jest.fn(),
    setUserId: jest.fn(),
    setCurrentAction: jest.fn(),
    clearCurrentAction: jest.fn(),
    handleFirebaseError: jest.fn((error) => {
      // Simulate Firebase error handling
      const errorMessage = error.message || 'An error occurred';
      return errorMessage;
    }),
  }
}));

// Mock errorUtils
jest.mock('./src/lib/errorUtils', () => ({
  normalizeError: jest.fn((error) => ({
    message: error?.message || 'Unknown error',
    code: error?.code || 'UNKNOWN',
    originalError: error
  })),
  showErrorAlert: jest.fn(),
  callFirebaseFunction: jest.fn(),
  AppError: class AppError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }
}));

// Silence console warnings in tests
const originalConsoleError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Warning: ReactTestRenderer') ||
     args[0].includes('Warning: An update to') ||
     args[0].includes('act()') ||
     args[0].includes('inside a test was not wrapped in act'))
  ) {
    return;
  }
  originalConsoleError.call(console, ...args);
};

// Global test utilities
global.mockFirebaseUser = {
  uid: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
  phoneNumber: '+1234567890',
  photoURL: null,
  reload: jest.fn(() => Promise.resolve()),
  sendEmailVerification: jest.fn(() => Promise.resolve()),
};

global.mockFamily = {
  id: 'test-family-id',
  name: 'Test Family',
  createdBy: 'test-user-id',
  members: ['test-user-id'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

global.mockEvent = {
  id: 'test-event-id',
  title: 'Test Event',
  description: 'Test event description',
  date: new Date(),
  location: 'Test Location',
  organizerId: 'test-user-id',
  familyId: 'test-family-id',
  attendees: ['test-user-id'],
  createdAt: new Date(),
  updatedAt: new Date(),
};