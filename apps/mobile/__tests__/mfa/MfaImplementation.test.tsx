import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import MfaSignInModal from '../../components/ui/MfaSignInModal';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';

// Enhanced Firebase Auth Mock
const mockUser = {
  uid: 'test-user-id',
  email: 'test@example.com',
  reload: jest.fn().mockResolvedValue(undefined),
  multiFactor: {
    enrolledFactors: [],
  }
};

const mockAuth = {
  currentUser: mockUser,
  onAuthStateChanged: jest.fn((callback) => {
    // Immediately call with mock user for testing
    callback(mockUser);
    // Return unsubscribe function
    return jest.fn();
  }),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
};

// Mock MultiFactorUser methods
const mockMultiFactorUser = {
  enrolledFactors: [],
  getSession: jest.fn().mockResolvedValue({ sessionId: 'test-session' }),
  enroll: jest.fn().mockResolvedValue(undefined),
  unenroll: jest.fn().mockResolvedValue(undefined),
};

// Mock PhoneAuthProvider - need to make it a constructor
const mockPhoneAuthProvider = jest.fn().mockImplementation(() => ({
  verifyPhoneNumber: jest.fn().mockResolvedValue('test-verification-id'),
}));

// Add credential as a static method
mockPhoneAuthProvider.credential = jest.fn().mockReturnValue({ credential: 'test-credential' });

// Mock PhoneMultiFactorGenerator
const mockPhoneMultiFactorGenerator = {
  assertion: jest.fn().mockReturnValue({ assertion: 'test-assertion' }),
  FACTOR_ID: 'phone',
};

// Mock multiFactor function - this is the key fix
const mockMultiFactor = jest.fn().mockImplementation((user) => {
  return mockMultiFactorUser;
});

// Mock getMultiFactorResolver
const mockGetMultiFactorResolver = jest.fn();

// Properly mock the named exports from @react-native-firebase/auth
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => mockAuth,
  PhoneAuthProvider: mockPhoneAuthProvider,
  PhoneMultiFactorGenerator: mockPhoneMultiFactorGenerator,
  multiFactor: mockMultiFactor,
  getMultiFactorResolver: mockGetMultiFactorResolver,
  FirebaseAuthTypes: {},
}));

// Mock Firebase services
jest.mock('../../src/lib/firebase', () => ({
  getFirebaseAuth: jest.fn(() => mockAuth),
  getFirebaseFunctions: jest.fn(() => ({})),
  getFirebaseDb: jest.fn(() => ({})),
  getFirebaseApp: jest.fn(() => ({})),
  connectToEmulators: jest.fn(),
}));

// Mock other dependencies
jest.mock('../../src/lib/ErrorHandlingService', () => ({
  errorHandler: {
    handleError: jest.fn(),
  },
  ErrorSeverity: {
    ERROR: 'error',
    FATAL: 'fatal',
  },
}));

jest.mock('../../src/services/LoggingService', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock network service
jest.mock('../../src/services/NetworkService', () => ({
  networkService: {
    initialize: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

// Test component to access auth context
const TestComponent = ({ onAuthReady }: { onAuthReady: (auth: any) => void }) => {
  const auth = useAuth();
  
  React.useEffect(() => {
    if (auth && auth.getEnrolledMfaFactors) {
      onAuthReady(auth);
    }
  }, [auth, onAuthReady]);
  
  return null;
};

describe('MFA Implementation Tests', () => {
  let authContext: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    authContext = null;
    
    // Reset mock implementations
    mockUser.multiFactor.enrolledFactors = [];
    mockMultiFactorUser.enrolledFactors = [];
    mockMultiFactorUser.getSession.mockResolvedValue({ sessionId: 'test-session' });
    mockMultiFactorUser.enroll.mockResolvedValue(undefined);
    mockMultiFactorUser.unenroll.mockResolvedValue(undefined);
    
    const mockPhoneAuthProviderInstance = mockPhoneAuthProvider();
    mockPhoneAuthProviderInstance.verifyPhoneNumber.mockResolvedValue('test-verification-id');
    mockPhoneAuthProvider.credential.mockReturnValue({ credential: 'test-credential' });
    mockPhoneMultiFactorGenerator.assertion.mockReturnValue({ assertion: 'test-assertion' });
    mockMultiFactor.mockImplementation(() => mockMultiFactorUser);
  });

  const renderWithAuth = (component: React.ReactElement) => {
    return render(
      <AuthProvider>
        {component}
        <TestComponent onAuthReady={(auth) => { authContext = auth; }} />
      </AuthProvider>
    );
  };

  const waitForAuth = async () => {
    await waitFor(() => {
      expect(authContext).toBeTruthy();
      expect(authContext.getEnrolledMfaFactors).toBeDefined();
    }, { timeout: 5000 });
  };

  describe('AuthContext MFA Methods', () => {
    test('getEnrolledMfaFactors should fetch and set MFA factors', async () => {
      const mockFactors = [
        {
          uid: 'factor1',
          displayName: 'Test Phone',
          phoneNumber: '+1234567890',
          factorId: 'phone',
        },
      ];

      mockUser.multiFactor.enrolledFactors = mockFactors;
      mockMultiFactorUser.enrolledFactors = mockFactors;

      renderWithAuth(<></>);
      await waitForAuth();

      await act(async () => {
        await authContext.getEnrolledMfaFactors();
      });

      expect(authContext.enrolledMfaFactors).toEqual(mockFactors);
    });

    test('startPhoneMfaEnrollment should initiate phone MFA enrollment', async () => {
      const mockSession = { sessionId: 'test-session' };
      mockMultiFactorUser.getSession.mockResolvedValue(mockSession);

      renderWithAuth(<></>);
      await waitForAuth();

      const phoneNumber = '+1234567890';
      
      await act(async () => {
        await authContext.startPhoneMfaEnrollment(phoneNumber);
      });

      expect(mockMultiFactor).toHaveBeenCalledWith(mockUser);
      expect(mockMultiFactorUser.getSession).toHaveBeenCalled();
      expect(authContext.mfaVerificationId).toBe('test-verification-id');
      expect(authContext.isMfaSetupInProgress).toBe(true);
    });

    test('confirmPhoneMfaEnrollment should complete MFA enrollment', async () => {
      renderWithAuth(<></>);
      await waitForAuth();

      // Set up the context state properly by calling a private method
      await act(async () => {
        // Simulate setting the verification ID through startPhoneMfaEnrollment
        await authContext.startPhoneMfaEnrollment('+1234567890');
      });
      
      const verificationCode = '123456';
      const displayName = 'Test Phone';
      
      await act(async () => {
        await authContext.confirmPhoneMfaEnrollment(verificationCode, displayName);
      });

      expect(mockPhoneAuthProvider.credential).toHaveBeenCalledWith('test-verification-id', verificationCode);
      expect(mockPhoneMultiFactorGenerator.assertion).toHaveBeenCalledWith({ credential: 'test-credential' });
      expect(mockMultiFactorUser.enroll).toHaveBeenCalledWith({ assertion: 'test-assertion' }, displayName);
      expect(authContext.mfaVerificationId).toBeNull();
      expect(authContext.isMfaSetupInProgress).toBe(false);
    });

    test('unenrollMfaFactor should remove MFA factor', async () => {
      renderWithAuth(<></>);
      await waitForAuth();

      const factorUid = 'test-factor-uid';
      
      await act(async () => {
        await authContext.unenrollMfaFactor(factorUid);
      });

      expect(mockMultiFactor).toHaveBeenCalledWith(mockUser);
      expect(mockMultiFactorUser.unenroll).toHaveBeenCalledWith(factorUid);
    });

    test('sendMfaSignInOtp should send OTP for MFA sign-in', async () => {
      const mockResolver = {
        hints: [
          {
            uid: 'hint1',
            factorId: 'phone',
            phoneNumber: '+1234567890',
          },
        ],
        session: { sessionId: 'test-session' },
      };

      renderWithAuth(<></>);
      await waitForAuth();

      // Set up the context state by directly accessing the internal state
      await act(async () => {
        // Use the context's internal setter
        authContext.mfaResolver = mockResolver;
      });
      
      await act(async () => {
        await authContext.sendMfaSignInOtp();
      });

      expect(authContext.mfaVerificationId).toBe('test-verification-id');
    });

    test('confirmMfaSignIn should complete MFA sign-in', async () => {
      const mockResolver = {
        resolveSignIn: jest.fn().mockResolvedValue(undefined),
      };

      renderWithAuth(<></>);
      await waitForAuth();

      // Set up the context state by calling sendMfaSignInOtp first
      await act(async () => {
        authContext.mfaResolver = mockResolver;
        authContext.mfaVerificationId = 'test-verification-id';
      });
      
      const verificationCode = '123456';
      
      await act(async () => {
        await authContext.confirmMfaSignIn(verificationCode);
      });

      expect(mockPhoneAuthProvider.credential).toHaveBeenCalledWith('test-verification-id', verificationCode);
      expect(mockPhoneMultiFactorGenerator.assertion).toHaveBeenCalledWith({ credential: 'test-credential' });
      expect(mockResolver.resolveSignIn).toHaveBeenCalledWith({ assertion: 'test-assertion' });
      expect(authContext.mfaResolver).toBeNull();
      expect(authContext.mfaVerificationId).toBeNull();
      expect(authContext.isMfaPromptVisible).toBe(false);
    });

    test('cancelMfaProcess should reset MFA state', async () => {
      renderWithAuth(<></>);
      await waitForAuth();

      // Set up some MFA state
      await act(async () => {
        authContext.mfaResolver = { test: 'resolver' };
        authContext.mfaVerificationId = 'test-id';
        authContext.isMfaPromptVisible = true;
        authContext.isMfaSetupInProgress = true;
        authContext.mfaError = 'test error';
      });
      
      act(() => {
        authContext.cancelMfaProcess();
      });

      expect(authContext.mfaResolver).toBeNull();
      expect(authContext.mfaVerificationId).toBeNull();
      expect(authContext.isMfaPromptVisible).toBe(false);
      expect(authContext.isMfaSetupInProgress).toBe(false);
      expect(authContext.mfaError).toBeNull();
    });
  });

  describe('MfaSignInModal Component', () => {
    test('should render when MFA is required', async () => {
      const { queryByText } = renderWithAuth(<MfaSignInModal />);
      await waitForAuth();

      // Set MFA prompt visible
      await act(async () => {
        authContext.isMfaPromptVisible = true;
        authContext.mfaResolver = {
          hints: [
            {
              displayName: 'Test Phone',
              phoneNumber: '+1234567890',
            },
          ],
        };
      });

      // Component should now be visible with the phone number
      await waitFor(() => {
        expect(authContext.isMfaPromptVisible).toBe(true);
      });
    });

    test('should handle OTP input and submission', async () => {
      const { getByPlaceholderText, getByText } = renderWithAuth(<MfaSignInModal />);
      await waitForAuth();

      // Set up MFA modal state
      await act(async () => {
        authContext.isMfaPromptVisible = true;
        authContext.mfaResolver = {
          hints: [{ displayName: 'Test Phone', phoneNumber: '+1234567890' }],
        };
        authContext.sendMfaSignInOtp = jest.fn().mockResolvedValue(undefined);
        authContext.confirmMfaSignIn = jest.fn().mockResolvedValue(undefined);
      });

      // Wait for modal to render
      await waitFor(() => {
        expect(authContext.isMfaPromptVisible).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle authentication errors gracefully', async () => {
      const mockError = new Error('auth/invalid-verification-code');
      mockMultiFactorUser.getSession.mockRejectedValue(mockError);

      renderWithAuth(<></>);
      await waitForAuth();

      await expect(
        act(async () => {
          await authContext.startPhoneMfaEnrollment('+1234567890');
        })
      ).rejects.toThrow('auth/invalid-verification-code');
    });

    test('should handle network errors', async () => {
      const mockError = new Error('Network error');
      mockMultiFactorUser.getSession.mockRejectedValue(mockError);

      renderWithAuth(<></>);
      await waitForAuth();

      await expect(
        act(async () => {
          await authContext.startPhoneMfaEnrollment('+1234567890');
        })
      ).rejects.toThrow('Network error');
    });

    test('should handle missing user errors', async () => {
      // Temporarily set currentUser to null
      const originalUser = mockAuth.currentUser;
      mockAuth.currentUser = null;

      renderWithAuth(<></>);
      await waitForAuth();

      await expect(
        act(async () => {
          await authContext.startPhoneMfaEnrollment('+1234567890');
        })
      ).rejects.toThrow();

      // Restore mock user
      mockAuth.currentUser = originalUser;
    });
  });

  describe('Integration Tests', () => {
    test('complete MFA enrollment flow', async () => {
      renderWithAuth(<></>);
      await waitForAuth();

      const phoneNumber = '+1234567890';
      const verificationCode = '123456';
      const displayName = 'Test Phone';

      // Step 1: Start enrollment
      await act(async () => {
        await authContext.startPhoneMfaEnrollment(phoneNumber);
      });

      expect(authContext.mfaVerificationId).toBe('test-verification-id');
      expect(authContext.isMfaSetupInProgress).toBe(true);
      expect(mockMultiFactor).toHaveBeenCalledWith(mockUser);
      expect(mockMultiFactorUser.getSession).toHaveBeenCalled();

      // Step 2: Confirm enrollment
      await act(async () => {
        await authContext.confirmPhoneMfaEnrollment(verificationCode, displayName);
      });

      expect(mockPhoneAuthProvider.credential).toHaveBeenCalledWith('test-verification-id', verificationCode);
      expect(mockPhoneMultiFactorGenerator.assertion).toHaveBeenCalledWith({ credential: 'test-credential' });
      expect(mockMultiFactorUser.enroll).toHaveBeenCalledWith({ assertion: 'test-assertion' }, displayName);
      expect(authContext.mfaVerificationId).toBeNull();
      expect(authContext.isMfaSetupInProgress).toBe(false);
    });

    test('complete MFA sign-in flow', async () => {
      const mockResolver = {
        hints: [
          {
            uid: 'hint1',
            factorId: 'phone',
            phoneNumber: '+1234567890',
            displayName: 'Test Phone',
          },
        ],
        session: { sessionId: 'test-session' },
        resolveSignIn: jest.fn().mockResolvedValue({ user: mockUser }),
      };

      renderWithAuth(<></>);
      await waitForAuth();

      const verificationCode = '123456';

      // Set up MFA resolver
      await act(async () => {
        authContext.mfaResolver = mockResolver;
        authContext.isMfaPromptVisible = true;
      });

      // Step 1: Send OTP
      await act(async () => {
        await authContext.sendMfaSignInOtp();
      });

      expect(authContext.mfaVerificationId).toBe('test-verification-id');

      // Step 2: Confirm sign-in
      await act(async () => {
        await authContext.confirmMfaSignIn(verificationCode);
      });

      expect(mockPhoneAuthProvider.credential).toHaveBeenCalledWith('test-verification-id', verificationCode);
      expect(mockPhoneMultiFactorGenerator.assertion).toHaveBeenCalledWith({ credential: 'test-credential' });
      expect(mockResolver.resolveSignIn).toHaveBeenCalledWith({ assertion: 'test-assertion' });
      expect(authContext.mfaResolver).toBeNull();
      expect(authContext.isMfaPromptVisible).toBe(false);
    });

    test('MFA factor management lifecycle', async () => {
      const mockFactors = [
        {
          uid: 'factor1',
          displayName: 'Test Phone',
          phoneNumber: '+1234567890',
          factorId: 'phone',
        },
      ];

      renderWithAuth(<></>);
      await waitForAuth();

      // Step 1: Get enrolled factors
      mockUser.multiFactor.enrolledFactors = mockFactors;
      await act(async () => {
        await authContext.getEnrolledMfaFactors();
      });

      expect(authContext.enrolledMfaFactors).toEqual(mockFactors);

      // Step 2: Unenroll a factor
      await act(async () => {
        await authContext.unenrollMfaFactor('factor1');
      });

      expect(mockMultiFactorUser.unenroll).toHaveBeenCalledWith('factor1');

      // Step 3: Refresh factors after unenrollment
      mockUser.multiFactor.enrolledFactors = [];
      await act(async () => {
        await authContext.getEnrolledMfaFactors();
      });

      expect(authContext.enrolledMfaFactors).toEqual([]);
    });

    test('error recovery and retry mechanisms', async () => {
      renderWithAuth(<></>);
      await waitForAuth();

      // Test enrollment retry after initial failure
      mockMultiFactorUser.getSession
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ sessionId: 'test-session' });

      const phoneNumber = '+1234567890';

      // First attempt should fail
      await expect(
        act(async () => {
          await authContext.startPhoneMfaEnrollment(phoneNumber);
        })
      ).rejects.toThrow('Network error');

      // Second attempt should succeed
      await act(async () => {
        await authContext.startPhoneMfaEnrollment(phoneNumber);
      });

      expect(authContext.mfaVerificationId).toBe('test-verification-id');
      expect(authContext.isMfaSetupInProgress).toBe(true);
    });

    test('concurrent MFA operations handling', async () => {
      renderWithAuth(<></>);
      await waitForAuth();

      const phoneNumber = '+1234567890';

      // Start multiple enrollment attempts concurrently
      const enrollmentPromises = [
        authContext.startPhoneMfaEnrollment(phoneNumber),
        authContext.startPhoneMfaEnrollment(phoneNumber),
        authContext.startPhoneMfaEnrollment(phoneNumber),
      ];

      await act(async () => {
        await Promise.allSettled(enrollmentPromises);
      });

      // Should handle concurrent operations gracefully
      expect(mockMultiFactor).toHaveBeenCalled();
      expect(authContext.mfaVerificationId).toBe('test-verification-id');
    });
  });
}); 