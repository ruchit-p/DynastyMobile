// Signal Protocol Service
export { SignalProtocolService, signalProtocol } from './SignalProtocolService';

// Types
export type {
  SignalAddress,
  PreKeyBundle,
  SignalMessage,
  IdentityKeyPair,
  PreKey,
  SignedPreKey,
  DecryptedMessage,
  SafetyNumber,
  SenderKeyDistributionMessage,
  GroupMessage,
  DecryptedGroupMessage
} from '../../specs/NativeLibsignal';

// Example usage (remove in production)
export * from './example';
