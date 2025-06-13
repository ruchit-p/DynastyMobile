'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Shield,
  Key,
  Smartphone,
  RefreshCw,
  Download,
  CheckCircle,
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { e2eeService } from '@/services/encryption/E2EEService';
import { keyBackupService } from '@/services/encryption/KeyBackupService';
import { checkEncryptionStatus, uploadEncryptionKeys, rotateEncryptionKeys } from '@/utils/functionUtils';

interface EncryptionStatus {
  keysGenerated: boolean;
  keysUploaded: boolean;
  backupExists: boolean;
  lastRotation?: Date;
  fingerprint?: string;
}

export default function EncryptionSettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<EncryptionStatus>({
    keysGenerated: false,
    keysUploaded: false,
    backupExists: false,
  });
  const [showRotateDialog, setShowRotateDialog] = useState(false);
  const [showFingerprint, setShowFingerprint] = useState(false);
  const [processing, setProcessing] = useState(false);

  const checkLocalEncryptionStatus = useCallback(async () => {
    setLoading(true);
    try {
      // Check if keys exist locally
      const keyPair = e2eeService.getCurrentKeyPair();
      const backupIds = keyBackupService.getStoredBackupIds();

      // Check server status
      const serverStatus = await checkEncryptionStatus();

      let fingerprint: string | undefined;
      if (keyPair) {
        fingerprint = await e2eeService.generateFingerprint(keyPair.publicKey);
      }

      setStatus({
        keysGenerated: !!keyPair,
        keysUploaded: serverStatus.publicKeyExists,
        backupExists: backupIds.length > 0 || serverStatus.backupExists,
        lastRotation: serverStatus.lastRotation ? new Date(serverStatus.lastRotation) : undefined,
        fingerprint,
      });
    } catch (error) {
      console.error('Error checking encryption status:', error);
      toast({
        title: 'Error',
        description: 'Failed to check encryption status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    checkLocalEncryptionStatus();
  }, [checkLocalEncryptionStatus]);

  const handleGenerateKeys = async () => {
    setProcessing(true);
    try {
      // Generate new key pair
      const keyPair = await e2eeService.generateKeyPair();
      const exportedKeyPair = await e2eeService.exportKeyPair(keyPair);

      // Upload public key to server
      await uploadEncryptionKeys({
        publicKey: exportedKeyPair.publicKey,
      });

      toast({
        title: 'Keys generated',
        description: 'Your encryption keys have been generated successfully',
      });

      await checkLocalEncryptionStatus();
    } catch (error) {
      console.error('Error generating keys:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate encryption keys',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRotateKeys = async () => {
    setProcessing(true);
    try {
      // Generate new key pair
      const newKeyPair = await e2eeService.generateKeyPair();
      const exportedKeyPair = await e2eeService.exportKeyPair(newKeyPair);

      // Rotate keys on server
      await rotateEncryptionKeys({
        newPublicKey: exportedKeyPair.publicKey,
      });

      toast({
        title: 'Keys rotated',
        description: 'Your encryption keys have been rotated successfully',
      });

      setShowRotateDialog(false);
      await checkLocalEncryptionStatus();
    } catch (error) {
      console.error('Error rotating keys:', error);
      toast({
        title: 'Error',
        description: 'Failed to rotate encryption keys',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const copyFingerprint = async () => {
    if (!status.fingerprint) return;

    try {
      await navigator.clipboard.writeText(status.fingerprint);
      toast({
        title: 'Copied',
        description: 'Fingerprint copied to clipboard',
      });
    } catch (error) {
      console.error('Error copying fingerprint:', error);
      toast({
        title: 'Error',
        description: 'Failed to copy fingerprint',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Encryption Settings</h1>
        <p className="text-sm text-gray-600">
          Manage your end-to-end encryption keys and security settings
        </p>
      </div>

      <div className="space-y-6">
        {/* Encryption Status */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Encryption Status</h2>
            <Badge variant={status.keysGenerated ? 'default' : 'secondary'}>
              {status.keysGenerated ? 'Active' : 'Not Set Up'}
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {status.keysGenerated ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              )}
              <span className="text-sm">
                Encryption keys {status.keysGenerated ? 'generated' : 'not generated'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {status.keysUploaded ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              )}
              <span className="text-sm">
                Public key {status.keysUploaded ? 'uploaded' : 'not uploaded'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {status.backupExists ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              )}
              <span className="text-sm">
                Key backup {status.backupExists ? 'exists' : 'not created'}
              </span>
            </div>

            {status.lastRotation && (
              <div className="mt-2 text-xs text-gray-500">
                Last key rotation: {status.lastRotation.toLocaleDateString()}
              </div>
            )}
          </div>

          {!status.keysGenerated && (
            <Button
              className="mt-4 w-full"
              onClick={handleGenerateKeys}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating...
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Generate Encryption Keys
                </>
              )}
            </Button>
          )}
        </Card>

        {/* Key Fingerprint */}
        {status.fingerprint && (
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Key Fingerprint</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowFingerprint(!showFingerprint)}
              >
                {showFingerprint ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>

            <p className="mb-3 text-sm text-gray-600">
              Compare this fingerprint when verifying secure communications
            </p>

            {showFingerprint && (
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-gray-100 p-2 text-xs">
                  {status.fingerprint}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={copyFingerprint}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Key Management */}
        {status.keysGenerated && (
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold">Key Management</h2>

            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push('/account-settings/privacy-security/encryption/backup')}
              >
                <Download className="mr-2 h-4 w-4" />
                Backup Keys
                {!status.backupExists && (
                  <Badge variant="destructive" className="ml-auto">
                    Recommended
                  </Badge>
                )}
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push('/account-settings/privacy-security/encryption/devices')}
              >
                <Smartphone className="mr-2 h-4 w-4" />
                Manage Devices
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setShowRotateDialog(true)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Rotate Keys
              </Button>
            </div>
          </Card>
        )}

        {/* Security Recommendations */}
        <Card className="border-yellow-200 bg-yellow-50 p-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 flex-shrink-0 text-yellow-600" />
            <div>
              <h3 className="font-semibold text-yellow-900">
                Security Recommendations
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-yellow-800">
                <li>• Always backup your encryption keys</li>
                <li>• Rotate your keys every 6 months</li>
                <li>• Verify key fingerprints when adding new devices</li>
                <li>• Never share your private keys or backup passwords</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>

      {/* Rotate Keys Dialog */}
      <AlertDialog open={showRotateDialog} onOpenChange={setShowRotateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate Encryption Keys?</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate new encryption keys and update all your devices. Make sure all
              your devices are online to receive the update.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotateKeys} disabled={processing}>
              {processing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Rotating...
                </>
              ) : (
                'Rotate Keys'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}