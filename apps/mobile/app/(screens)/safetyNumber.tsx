import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import Clipboard from '@react-native-clipboard/clipboard';

// UI Components
import { Screen } from '../../components/ui/Screen';
import Button from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import SafetyNumberView from '../../components/ui/SafetyNumberView';
import VerificationIndicator from '../../components/ui/VerificationIndicator';

// Services and utilities
import { SafetyNumberService } from '../../src/services/SafetyNumberService';
import { useAuth } from '../../src/contexts/AuthContext';
import { callFirebaseFunction } from '../../src/lib/errorUtils';
import { useErrorHandler } from '../../hooks/useErrorHandler';

// Design system
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { Typography } from '../../constants/Typography';
import { useColorScheme } from '../../hooks/useColorScheme';

export default function SafetyNumberScreen() {
  const { userId, userName } = useLocalSearchParams<{
    userId: string;
    userName: string;
  }>();
  const { user } = useAuth();
  const { handleError, withErrorHandling } = useErrorHandler({
    title: 'Safety Number Error',
  });
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];

  const [safetyNumber, setSafetyNumber] = useState<SafetyNumberData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [verified, setVerified] = useState(false);
  const [remoteUser, setRemoteUser] = useState<any>(null);
  
  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions();

  const safetyNumberService = SafetyNumberService.getInstance();

  useEffect(() => {
    loadSafetyNumber();
    loadRemoteUser();
    loadVerificationStatus();
  }, [userId]);

  const loadRemoteUser = withErrorHandling(async () => {
    const response = await callFirebaseFunction('getUserProfile', { userId });
    setRemoteUser(response.data);
  });

  const loadVerificationStatus = withErrorHandling(async () => {
    if (!userId) return;
    const status = await safetyNumberService.getVerificationStatus(userId);
    setVerified(status?.verified || false);
  });

  const loadSafetyNumber = withErrorHandling(async () => {
    if (!userId || !userName) return;

    setLoading(true);
    try {
      const safetyNumberData = await safetyNumberService.generateSafetyNumber(
        userId,
        userName as string
      );
      setSafetyNumber(safetyNumberData);
    } finally {
      setLoading(false);
    }
  });

  const handleScan = async () => {
    if (!permission) {
      // Permission not loaded yet
      return;
    }

    if (!permission.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          'Camera Permission',
          'Camera permission is required to scan QR codes.'
        );
        return;
      }
    }

    setScanning(true);
  };

  const handleBarCodeScanned = withErrorHandling(
    async ({ data }: { data: string }) => {
      setScanning(false);

      if (!userId || !userName) return;

      const isValid = await safetyNumberService.verifySafetyNumber(
        userId,
        userName as string,
        data
      );

      if (isValid) {
        setVerified(true);
        Alert.alert('Verified!', 'Safety numbers match. Your conversation is secure.');
      } else {
        Alert.alert(
          'Verification Failed',
          'Safety numbers do not match. This could indicate a security issue.'
        );
      }
    }
  );

  const copyToClipboard = useCallback(() => {
    if (safetyNumber) {
      Clipboard.setString(safetyNumber.numberString);
      Alert.alert('Copied', 'Safety number copied to clipboard');
    }
  }, [safetyNumber]);

  const handleVerificationChange = useCallback(async (newVerified: boolean) => {
    if (!userId) return;
    
    try {
      await safetyNumberService.markUserAsVerified(userId, newVerified);
      setVerified(newVerified);
      
      if (newVerified) {
        Alert.alert('Verified', `${userName} has been marked as verified.`);
      }
    } catch (error) {
      handleError(error);
    }
  }, [userId, userName, safetyNumberService, handleError]);

  const renderScanner = () => {
    if (!scanning) return null;

    return (
      <View style={StyleSheet.absoluteFillObject}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={handleBarCodeScanned}
        >
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setScanning(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  };

  if (loading) {
    return (
      <Screen style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Verify Safety Number"
      backButton
      onBack={() => router.back()}
    >
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Avatar
            uri={remoteUser?.profilePictureUrl}
            name={userName}
            size={80}
          />
          <View style={styles.headerInfo}>
            <Text style={[styles.userName, { color: colors.text.primary }]}>
              {userName}
            </Text>
            <VerificationIndicator
              level={verified ? 'verified' : 'unverified'}
              size="medium"
              showLabel
            />
          </View>
        </View>

        {safetyNumber && (
          <SafetyNumberView
            numberString={safetyNumber.numberString}
            qrCodeData={safetyNumber.qrCodeData}
            userName={userName || ''}
            verified={verified}
            onCopyNumber={copyToClipboard}
            onVerificationChange={handleVerificationChange}
            style={styles.safetyNumberView}
          />
        )}

        <View style={styles.actions}>
          <Button
            title="Scan QR Code"
            onPress={handleScan}
            variant="secondary"
            leftIcon="scan"
            fullWidth
          />
        </View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.text.secondary }]}>
            Safety numbers change when you or {userName} reinstall Dynasty,
            change devices, or reset encryption keys.
          </Text>
        </View>
      </ScrollView>

      {renderScanner()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  headerInfo: {
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  userName: {
    ...Typography.styles.heading3,
    marginBottom: Spacing.sm,
  },
  safetyNumberView: {
    marginBottom: Spacing.lg,
  },
  actions: {
    marginBottom: Spacing.xl,
  },
  footer: {
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
  },
  footerText: {
    ...Typography.styles.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: BorderRadius.lg,
  },
  cancelButton: {
    position: 'absolute',
    bottom: 50,
    backgroundColor: 'white',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  cancelButtonText: {
    ...Typography.styles.bodyMedium,
    fontWeight: '600',
    color: 'black',
  },
});