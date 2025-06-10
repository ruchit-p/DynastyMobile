// Vault Unlock Component for Dynasty Web App
// Provides UI for unlocking an existing vault

import { useState } from 'react';
import { useWebVaultEncryption } from '@/hooks/useWebVaultEncryption';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Fingerprint, AlertCircle, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VaultUnlockProps {
  userId: string;
  onUnlock: () => void;
  onSetup?: () => void;
}

export function VaultUnlock({ userId, onUnlock, onSetup }: VaultUnlockProps) {
  const [password, setPassword] = useState('');
  const { toast } = useToast();
  
  const { 
    unlockVault,
    unlockVaultWithBiometric,
    biometricSupported,
    biometricEnabled,
    isLoading,
    error,
    clearError,
    checkVaultStatus
  } = useWebVaultEncryption(userId);
  
  const handlePasswordUnlock = async () => {
    if (!password) {
      toast({
        title: "Password required",
        description: "Please enter your vault password",
        variant: "destructive"
      });
      return;
    }
    
    const result = await unlockVault(password);
    
    if (result.success) {
      toast({
        title: "Vault unlocked",
        description: "You can now access your encrypted files"
      });
      onUnlock();
    } else {
      toast({
        title: "Unlock failed",
        description: result.error || "Invalid password",
        variant: "destructive"
      });
    }
  };
  
  const handleBiometricUnlock = async () => {
    const result = await unlockVaultWithBiometric();
    
    if (result.success) {
      toast({
        title: "Vault unlocked",
        description: "Biometric authentication successful"
      });
      onUnlock();
    } else {
      toast({
        title: "Biometric unlock failed",
        description: result.error || "Please try with your password",
        variant: "destructive"
      });
    }
  };
  
  // Check if vault exists
  const handleCheckVault = async () => {
    const status = await checkVaultStatus();
    if (!status.hasVault && onSetup) {
      onSetup();
    }
  };
  
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <Lock className="h-6 w-6 text-dynastyGreen" />
          <CardTitle className="text-2xl">Unlock Your Vault</CardTitle>
        </div>
        <CardDescription>
          Enter your password to access your encrypted files
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="space-y-2">
          <div className="relative">
            <KeyRound className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              type="password"
              placeholder="Enter vault password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePasswordUnlock();
                }
              }}
              className="pl-10"
              disabled={isLoading}
              autoFocus
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Button 
            onClick={handlePasswordUnlock}
            className="w-full"
            disabled={isLoading || !password}
          >
            {isLoading ? 'Unlocking...' : 'Unlock with Password'}
          </Button>
          
          {biometricSupported && biometricEnabled && (
            <Button
              onClick={handleBiometricUnlock}
              variant="outline"
              className="w-full"
              disabled={isLoading}
            >
              <Fingerprint className="mr-2 h-4 w-4" />
              Unlock with Biometrics
            </Button>
          )}
        </div>
        
        <div className="pt-2 text-center">
          <button
            onClick={handleCheckVault}
            className="text-sm text-dynastyGreen hover:underline"
          >
            Don&apos;t have a vault? Set one up
          </button>
        </div>
      </CardContent>
    </Card>
  );
}