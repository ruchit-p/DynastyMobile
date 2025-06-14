// Vault Setup Component for Dynasty Web App
// Provides UI for setting up vault encryption
// SDK-aware for enhanced vault operations when enabled

import { useState } from 'react';
import { useWebVaultEncryption } from '@/hooks/useWebVaultEncryption';
import { useFeatureFlags } from '@/lib/feature-flags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Shield, Fingerprint, AlertCircle, Zap } from 'lucide-react';
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator';
import { useToast } from '@/hooks/use-toast';

interface VaultSetupProps {
  userId: string;
  onComplete: () => void;
}

export function VaultSetup({ userId, onComplete }: VaultSetupProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [enableBiometric, setEnableBiometric] = useState(false);
  const { toast } = useToast();
  const { useVaultSDK: useSDK } = useFeatureFlags();
  
  const { 
    setupVault, 
    biometricSupported, 
    isLoading,
    error,
    clearError
  } = useWebVaultEncryption(userId);
  
  const handleSetup = async () => {
    if (!password) {
      toast({
        title: "Password required",
        description: "Please enter a password for your vault",
        variant: "destructive"
      });
      return;
    }
    
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match",
        variant: "destructive"
      });
      return;
    }
    
    if (password.length < 12) {
      toast({
        title: "Password too short",
        description: "Password must be at least 12 characters long",
        variant: "destructive"
      });
      return;
    }
    
    const result = await setupVault(password, {
      enableBiometric,
      keyRotation: true
    });
    
    if (result.success) {
      toast({
        title: "Vault setup complete!",
        description: `Your files will now be encrypted for maximum security${useSDK ? ' with enhanced SDK performance' : ''}`
      });
      onComplete();
    } else {
      toast({
        title: "Setup failed",
        description: result.error || "Failed to setup vault encryption",
        variant: "destructive"
      });
    }
  };
  
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-dynastyGreen" />
          <CardTitle className="text-2xl">Setup Vault Encryption</CardTitle>
          {useSDK && (
            <div className="flex items-center gap-1 ml-auto">
              <Zap className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-blue-500 font-medium">SDK</span>
            </div>
          )}
        </div>
        <CardDescription>
          Protect your files with military-grade encryption. Your files will be encrypted before upload and only you will have the key.
          {useSDK && (
            <span className="text-blue-600 text-sm ml-1">• Enhanced with Vault SDK v2 for improved performance</span>
          )}
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
          <Label htmlFor="password">Vault Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              id="password"
              type="password"
              placeholder="Enter a strong password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              className="pl-10"
              disabled={isLoading}
            />
          </div>
          {password && <PasswordStrengthIndicator password={password} />}
          <p className="text-sm text-gray-500">
            This password encrypts your files. Store it safely - we cannot recover it.
          </p>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={confirmPassword && password !== confirmPassword ? 'border-red-500' : ''}
            disabled={isLoading}
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="text-sm text-red-500">Passwords do not match</p>
          )}
        </div>
        
        {biometricSupported && (
          <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-dynastyGreen" />
                <Label htmlFor="biometric" className="font-medium">
                  Enable Biometric Unlock
                </Label>
              </div>
              <p className="text-sm text-gray-500">
                Use Face ID or Touch ID to unlock your vault
              </p>
            </div>
            <Switch
              id="biometric"
              checked={enableBiometric}
              onCheckedChange={setEnableBiometric}
              disabled={isLoading}
            />
          </div>
        )}
        
        <div className="rounded-lg bg-yellow-50 p-4">
          <h4 className="text-sm font-medium text-yellow-800 mb-1">Important Security Notes:</h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• Your password is never sent to our servers</li>
            <li>• Files are encrypted on your device before upload</li>
            <li>• We cannot recover your password if forgotten</li>
            <li>• Consider using a password manager</li>
          </ul>
        </div>
        
        <Button 
          onClick={handleSetup} 
          className="w-full"
          disabled={isLoading || !password || !confirmPassword || password !== confirmPassword}
        >
          {isLoading ? 'Setting up...' : 'Setup Vault Encryption'}
        </Button>
      </CardContent>
    </Card>
  );
}