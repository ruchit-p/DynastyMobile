// Example component demonstrating vault encryption usage
// Shows how to integrate VaultService with encryption hooks

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useWebVaultEncryption } from '@/hooks/useWebVaultEncryption';
import { vaultService, VaultItem } from '@/services/VaultService';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Download, Lock, Shield, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { VaultSetup } from './VaultSetup';
import { VaultUnlock } from './VaultUnlock';

export function VaultUploadExample() {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [showSetup, setShowSetup] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);

  const {
    isUnlocked,
    encryptFile,
    decryptFile,
    getCurrentKeyId,
    checkVaultStatus,
    progress: encryptionProgress
  } = useWebVaultEncryption(currentUser?.uid || '');

  // Set user ID in vault service
  useEffect(() => {
    if (currentUser?.uid) {
      vaultService.setUserId(currentUser.uid);
    }
  }, [currentUser?.uid]);

  // Check vault status on mount
  useEffect(() => {
    const checkStatus = async () => {
      if (currentUser?.uid) {
        const status = await checkVaultStatus();
        if (!status.hasVault) {
          setShowSetup(true);
        } else if (!status.isUnlocked) {
          setShowUnlock(true);
        }
      }
    };
    checkStatus();
  }, [currentUser?.uid, checkVaultStatus]);

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    setFiles(selectedFiles);
  };

  // Upload files with encryption
  const handleUpload = async () => {
    if (!files.length || !isUnlocked) return;

    setIsUploading(true);
    
    try {
      for (const file of files) {
        await vaultService.uploadFile(
          file,
          null, // parentId
          (progress) => {
            setUploadProgress(progress.percentage);
          },
          {
            encrypt: encryptFile,
            getCurrentKeyId
          }
        );
        
        toast({
          title: "Upload successful",
          description: `${file.name} uploaded and encrypted`
        });
      }
      
      // Refresh vault items
      await loadVaultItems();
      setFiles([]);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Load vault items
  const loadVaultItems = async () => {
    try {
      const { items } = await vaultService.getItems();
      setVaultItems(items);
    } catch (error) {
      console.error('Failed to load vault items:', error);
    }
  };

  // Download and decrypt file
  const handleDownload = async (item: VaultItem) => {
    if (!isUnlocked) {
      setShowUnlock(true);
      return;
    }

    try {
      const blob = await vaultService.downloadFile(item, {
        decrypt: decryptFile
      });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download complete",
        description: `${item.name} decrypted and downloaded`
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: "destructive"
      });
    }
  };

  // Show setup if needed
  if (showSetup) {
    return (
      <VaultSetup
        userId={currentUser?.uid || ''}
        onComplete={() => {
          setShowSetup(false);
          loadVaultItems();
        }}
      />
    );
  }

  // Show unlock if needed
  if (showUnlock) {
    return (
      <VaultUnlock
        userId={currentUser?.uid || ''}
        onUnlock={() => {
          setShowUnlock(false);
          loadVaultItems();
        }}
        onSetup={() => {
          setShowUnlock(false);
          setShowSetup(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Encryption Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-dynastyGreen" />
            Vault Encryption Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {isUnlocked ? (
              <>
                <Lock className="h-4 w-4 text-green-500" />
                <span className="text-green-500">Vault Unlocked - Encryption Active</span>
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 text-red-500" />
                <span className="text-red-500">Vault Locked</span>
                <Button size="sm" onClick={() => setShowUnlock(true)}>
                  Unlock
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Encrypted Files
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="file"
            multiple
            onChange={handleFileSelect}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-dynastyGreen file:text-white
              hover:file:bg-dynastyGreenDark"
            disabled={!isUnlocked || isUploading}
          />
          
          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Selected files: {files.map(f => f.name).join(', ')}
              </p>
              <Button 
                onClick={handleUpload} 
                disabled={!isUnlocked || isUploading}
                className="w-full"
              >
                {isUploading ? 'Encrypting and Uploading...' : 'Upload with Encryption'}
              </Button>
            </div>
          )}
          
          {(uploadProgress > 0 || encryptionProgress) && (
            <div className="space-y-2">
              {encryptionProgress && (
                <div>
                  <p className="text-sm text-gray-600">
                    {encryptionProgress.status}: {encryptionProgress.currentFile}
                  </p>
                  <Progress value={encryptionProgress.progress} />
                </div>
              )}
              {uploadProgress > 0 && (
                <div>
                  <p className="text-sm text-gray-600">Upload Progress</p>
                  <Progress value={uploadProgress} />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Files List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Encrypted Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vaultItems.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No files uploaded yet</p>
          ) : (
            <div className="space-y-2">
              {vaultItems.map((item) => (
                <div 
                  key={item.id} 
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    {item.isEncrypted && (
                      <Lock className="h-4 w-4 text-dynastyGreen" />
                    )}
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-gray-500">
                        {item.size ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown size'}
                        {item.isEncrypted && ' • Encrypted'}
                      </p>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleDownload(item)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          All files are encrypted on your device before upload. Only you have the decryption key.
          We use military-grade XChaCha20-Poly1305 encryption to protect your files.
        </AlertDescription>
      </Alert>
    </div>
  );
}