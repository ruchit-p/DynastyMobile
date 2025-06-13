'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  ArrowLeft,
  Key,
  Download,
  Upload,
  Shield,
  Clock,
  Smartphone,
  Trash2,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { e2eeService } from '@/services/encryption/E2EEService';
import { keyBackupService } from '@/services/encryption/KeyBackupService';
import type { KeyBackup } from '@/services/encryption/KeyBackupService';

export default function KeyBackupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [backups, setBackups] = useState<KeyBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRecoverDialog, setShowRecoverDialog] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<KeyBackup | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoverPassword, setShowRecoverPassword] = useState(false);
  
  const [backupForm, setBackupForm] = useState({
    password: '',
    confirmPassword: '',
    hint: '',
  });
  
  const [recoverForm, setRecoverForm] = useState({
    backupId: '',
    password: '',
  });

  const [passwordValidation, setPasswordValidation] = useState({
    isValid: false,
    errors: [] as string[],
  });

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const backupList = await keyBackupService.listBackups();
      setBackups(backupList);
    } catch (error) {
      console.error('Error loading backups:', error);
      toast({
        title: 'Error',
        description: 'Failed to load key backups',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  useEffect(() => {
    if (backupForm.password) {
      const validation = keyBackupService.validateBackupPassword(backupForm.password);
      setPasswordValidation(validation);
    } else {
      setPasswordValidation({ isValid: false, errors: [] });
    }
  }, [backupForm.password]);

  const handleCreateBackup = async () => {
    if (!passwordValidation.isValid) {
      toast({
        title: 'Invalid password',
        description: 'Please fix the password errors',
        variant: 'destructive',
      });
      return;
    }

    if (backupForm.password !== backupForm.confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure both passwords are the same',
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);
    try {
      // Get current key pair
      const keyPair = e2eeService.getCurrentKeyPair();
      if (!keyPair) {
        toast({
          title: 'No keys found',
          description: 'Please generate encryption keys first',
          variant: 'destructive',
        });
        return;
      }

      const exportedKeyPair = await e2eeService.exportKeyPair(keyPair);
      
      // Create backup
      await keyBackupService.createBackup(exportedKeyPair, {
        password: backupForm.password,
        hint: backupForm.hint,
      });

      toast({
        title: 'Backup created',
        description: 'Your encryption keys have been backed up securely',
      });

      setShowCreateDialog(false);
      setBackupForm({ password: '', confirmPassword: '', hint: '' });
      await loadBackups();
    } catch (error) {
      console.error('Error creating backup:', error);
      toast({
        title: 'Backup failed',
        description: 'Failed to create key backup',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRecoverBackup = async () => {
    if (!selectedBackup || !recoverForm.password) return;

    setProcessing(true);
    try {
      const recoveredKeys = await keyBackupService.recoverFromBackup({
        backupId: selectedBackup.id,
        password: recoverForm.password,
      });

      // Import recovered keys
      await e2eeService.importKeyPair(recoveredKeys);

      toast({
        title: 'Keys recovered',
        description: 'Your encryption keys have been recovered successfully',
      });

      setShowRecoverDialog(false);
      setRecoverForm({ backupId: '', password: '' });
      router.push('/account-settings/privacy-security/encryption');
    } catch (error) {
      console.error('Error recovering backup:', error);
      toast({
        title: 'Recovery failed',
        description: 'Incorrect password or corrupted backup',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteBackup = async () => {
    if (!selectedBackup) return;

    setProcessing(true);
    try {
      await keyBackupService.deleteBackup(selectedBackup.id);
      
      toast({
        title: 'Backup deleted',
        description: 'The key backup has been deleted',
      });

      setShowDeleteDialog(false);
      await loadBackups();
    } catch (error) {
      console.error('Error deleting backup:', error);
      toast({
        title: 'Delete failed',
        description: 'Failed to delete key backup',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
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
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/account-settings/privacy-security/encryption')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Key Backups</h1>
          <p className="text-sm text-gray-600">
            Securely backup and recover your encryption keys
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Create Backup
        </Button>
      </div>

      {/* Backups List */}
      {backups.length === 0 ? (
        <Card className="p-8 text-center">
          <Key className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-semibold">No backups found</h3>
          <p className="mb-4 text-sm text-gray-600">
            Create a backup to secure your encryption keys
          </p>
          <Button onClick={() => setShowCreateDialog(true)}>
            Create Your First Backup
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {backups.map((backup) => (
            <Card key={backup.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-100 p-2">
                    <Key className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {backup.deviceName || 'Unknown Device'}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Created {format(backup.createdAt, 'MMM d, yyyy')}
                      </span>
                      {backup.lastAccessedAt && (
                        <span className="flex items-center gap-1">
                          <Smartphone className="h-3 w-3" />
                          Last used {format(backup.lastAccessedAt, 'MMM d')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedBackup(backup);
                      setShowRecoverDialog(true);
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Recover
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedBackup(backup);
                      setShowDeleteDialog(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Security Info */}
      <Card className="mt-6 border-blue-200 bg-blue-50 p-6">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 flex-shrink-0 text-blue-600" />
          <div>
            <h3 className="font-semibold text-blue-900">About Key Backups</h3>
            <ul className="mt-2 space-y-1 text-sm text-blue-800">
              <li>• Backups are encrypted with your password</li>
              <li>• Only you can decrypt your backup with the password</li>
              <li>• Store your backup password securely</li>
              <li>• Create multiple backups for redundancy</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Create Backup Dialog */}
      <AlertDialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Create Key Backup</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a strong password to encrypt your key backup
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backup-password">Backup Password</Label>
              <div className="relative">
                <Input
                  id="backup-password"
                  type={showPassword ? 'text' : 'password'}
                  value={backupForm.password}
                  onChange={(e) =>
                    setBackupForm({ ...backupForm, password: e.target.value })
                  }
                  placeholder="Enter a strong password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              
              {backupForm.password && (
                <div className="space-y-1">
                  {passwordValidation.errors.map((error, index) => (
                    <p key={index} className="flex items-center gap-1 text-xs text-red-600">
                      <XCircle className="h-3 w-3" />
                      {error}
                    </p>
                  ))}
                  {passwordValidation.isValid && (
                    <p className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle className="h-3 w-3" />
                      Password is strong
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={backupForm.confirmPassword}
                onChange={(e) =>
                  setBackupForm({ ...backupForm, confirmPassword: e.target.value })
                }
                placeholder="Confirm your password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password-hint">Password Hint (Optional)</Label>
              <Input
                id="password-hint"
                type="text"
                value={backupForm.hint}
                onChange={(e) =>
                  setBackupForm({ ...backupForm, hint: e.target.value })
                }
                placeholder="e.g., My favorite book + birth year"
              />
              <p className="text-xs text-gray-500">
                This hint will be visible to help you remember your password
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreateBackup}
              disabled={!passwordValidation.isValid || processing}
            >
              {processing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Creating...
                </>
              ) : (
                'Create Backup'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recover Backup Dialog */}
      <AlertDialog open={showRecoverDialog} onOpenChange={setShowRecoverDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recover from Backup</AlertDialogTitle>
            <AlertDialogDescription>
              Enter your backup password to recover your encryption keys
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recover-password">Backup Password</Label>
              <div className="relative">
                <Input
                  id="recover-password"
                  type={showRecoverPassword ? 'text' : 'password'}
                  value={recoverForm.password}
                  onChange={(e) =>
                    setRecoverForm({ ...recoverForm, password: e.target.value })
                  }
                  placeholder="Enter your backup password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() => setShowRecoverPassword(!showRecoverPassword)}
                >
                  {showRecoverPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRecoverBackup}
              disabled={!recoverForm.password || processing}
            >
              {processing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Recovering...
                </>
              ) : (
                'Recover Keys'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Backup Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this key backup. Make sure you have other backups
              before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBackup}
              disabled={processing}
              className="bg-red-600 hover:bg-red-700"
            >
              {processing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Deleting...
                </>
              ) : (
                'Delete Backup'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}