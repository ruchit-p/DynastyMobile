import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { E2EEService } from '../../src/services/encryption';
import { createHash } from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';

interface KeyVerificationScreenProps {
  userId: string;
  remoteUserId: string;
  remoteUserName: string;
  onVerified?: () => void;
  onCancel?: () => void;
}

const KeyVerificationScreen: React.FC<KeyVerificationScreenProps> = ({
  userId,
  remoteUserId,
  remoteUserName,
  onVerified,
  onCancel,
}) => {
  const [mode, setMode] = useState<'display' | 'scan'>('display');
  const [fingerprint, setFingerprint] = useState<string>('');
  const [remoteFingerprint, setRemoteFingerprint] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    generateFingerprint();
  }, []);

  useEffect(() => {
    if (mode === 'scan') {
      requestCameraPermission();
    }
  }, [mode]);

  const requestCameraPermission = async () => {
    await requestPermission();
  };

  const generateFingerprint = async () => {
    try {
      setIsLoading(true);
      
      // Get own identity key
      const ownIdentity = await E2EEService.getIdentityKeyPair();
      if (!ownIdentity) {
        throw new Error('Own identity key not found');
      }

      // Get remote user's identity key (from Firebase)
      // This is a simplified example - you'd need to fetch from Firebase
      const remoteIdentity = await fetchRemoteIdentityKey(remoteUserId);
      if (!remoteIdentity) {
        throw new Error('Remote identity key not found');
      }

      // Generate fingerprints
      const ownFingerprint = generateKeyFingerprint(userId, ownIdentity.publicKey);
      const remoteFp = generateKeyFingerprint(remoteUserId, remoteIdentity);
      
      // Combine for QR code (simplified - in production, use a more sophisticated format)
      const combinedFingerprint = `${ownFingerprint}:${remoteFp}`;
      
      setFingerprint(combinedFingerprint);
      setRemoteFingerprint(remoteFp);
    } catch (error) {
      console.error('Failed to generate fingerprint:', error);
      Alert.alert('Error', 'Failed to generate security code');
    } finally {
      setIsLoading(false);
    }
  };

  const generateKeyFingerprint = (userId: string, publicKey: string): string => {
    // Create a hash of userId + publicKey
    const data = `${userId}:${publicKey}`;
    const hash = createHash('sha256');
    hash.update(Buffer.from(data, 'utf8'));
    const digest = hash.digest('hex');
    
    // Format as groups of 4 characters for readability
    return digest
      .substring(0, 32)
      .match(/.{1,4}/g)
      ?.join(' ')
      .toUpperCase() || '';
  };

  const fetchRemoteIdentityKey = async (remoteUserId: string): Promise<string | null> => {
    // TODO: Implement fetching from Firebase
    // This is a placeholder
    return 'remote_public_key_base64';
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setScanned(true);
    
    try {
      // Parse QR code data
      const [scannedOwnFp, scannedRemoteFp] = data.split(':');
      
      // Verify the fingerprints match
      if (scannedRemoteFp === remoteFingerprint) {
        Alert.alert(
          'Verification Successful',
          `You have successfully verified ${remoteUserName}'s encryption keys.`,
          [
            {
              text: 'OK',
              onPress: () => {
                markAsVerified();
                onVerified?.();
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Verification Failed',
          'The security codes do not match. This could indicate a security issue.',
          [
            { text: 'Try Again', onPress: () => setScanned(false) },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Invalid QR code format');
      setScanned(false);
    }
  };

  const markAsVerified = async () => {
    try {
      // TODO: Call Firebase function to mark as verified
      console.log('Marking as verified:', remoteUserId);
    } catch (error) {
      console.error('Failed to mark as verified:', error);
    }
  };

  const renderSecurityNumber = () => {
    const groups = remoteFingerprint.split(' ');
    
    return (
      <View style={styles.securityNumberContainer}>
        <Text style={styles.securityNumberTitle}>Security Number</Text>
        <Text style={styles.securityNumberSubtitle}>
          Compare this with {remoteUserName}'s screen
        </Text>
        
        <View style={styles.fingerprintContainer}>
          {groups.map((group, index) => (
            <Text key={index} style={styles.fingerprintGroup}>
              {group}
            </Text>
          ))}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1A4B44" />
        <Text style={styles.loadingText}>Generating security code...</Text>
      </View>
    );
  }

  if (mode === 'scan') {
    if (!permission) {
      return (
        <View style={styles.centerContainer}>
          <Text>Requesting camera permission...</Text>
        </View>
      );
    }
    
    if (!permission.granted) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Camera permission denied</Text>
          <TouchableOpacity style={styles.button} onPress={() => setMode('display')}>
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setMode('display')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#1A4B44" />
          </TouchableOpacity>
          <Text style={styles.title}>Scan QR Code</Text>
          <View style={{ width: 28 }} />
        </View>

        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />

        <View style={styles.scanOverlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.scanInstructions}>
            Scan {remoteUserName}'s QR code
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.backButton}>
          <Ionicons name="close" size={28} color="#1A4B44" />
        </TouchableOpacity>
        <Text style={styles.title}>Verify Encryption</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <MaterialIcons name="verified-user" size={80} color="#1A4B44" />
        
        <Text style={styles.description}>
          Verify {remoteUserName}'s identity by comparing the security number or scanning their QR code.
        </Text>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, mode === 'display' && styles.activeTab]}
            onPress={() => setMode('display')}
          >
            <Text style={[styles.tabText, mode === 'display' && styles.activeTabText]}>
              QR Code
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'scan' && styles.activeTab]}
            onPress={() => setMode('scan')}
          >
            <Text style={[styles.tabText, mode === 'scan' && styles.activeTabText]}>
              Scan
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'display' && (
          <>
            <View style={styles.qrContainer}>
              <QRCode
                value={fingerprint}
                size={200}
                color="#1A4B44"
                backgroundColor="white"
              />
            </View>

            {renderSecurityNumber()}

            <TouchableOpacity
              style={styles.verifyButton}
              onPress={() => {
                Alert.alert(
                  'Mark as Verified?',
                  `Have you confirmed that the security number matches ${remoteUserName}'s?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Yes, Mark as Verified',
                      onPress: () => {
                        markAsVerified();
                        onVerified?.();
                      },
                    },
                  ]
                );
              }}
            >
              <MaterialIcons name="check-circle" size={24} color="white" />
              <Text style={styles.verifyButtonText}>Mark as Verified</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A4B44',
  },
  content: {
    alignItems: 'center',
    padding: 20,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginVertical: 20,
    paddingHorizontal: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    padding: 4,
    marginVertical: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    textAlign: 'center',
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#1A4B44',
  },
  qrContainer: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginVertical: 20,
  },
  securityNumberContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  securityNumberTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  securityNumberSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  fingerprintContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 280,
  },
  fingerprintGroup: {
    fontFamily: 'monospace',
    fontSize: 16,
    color: '#1A4B44',
    margin: 4,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A4B44',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 30,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  button: {
    backgroundColor: '#1A4B44',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#FF0000',
    marginBottom: 20,
  },
  scanOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 12,
  },
  scanInstructions: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 20,
  },
});

export default KeyVerificationScreen;
