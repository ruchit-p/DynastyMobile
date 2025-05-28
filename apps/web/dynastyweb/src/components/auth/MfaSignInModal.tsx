'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/EnhancedAuthContext';
import { MultiFactorInfo, TotpMultiFactorGenerator, PhoneMultiFactorGenerator } from 'firebase/auth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Shield, Smartphone, Key, ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface MfaSignInModalProps {
  open?: boolean;
  onClose?: () => void;
}

export default function MfaSignInModal({ open, onClose }: MfaSignInModalProps) {
  const { 
    mfaSignInState, 
    completeMfaSignIn, 
    selectMfaFactor, 
    resetMfaSignIn 
  } = useAuth();
  const { toast } = useToast();

  // MARK: - State Management
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showFactorSelection, setShowFactorSelection] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // MARK: - Effects
  useEffect(() => {
    // Reset state when modal opens
    if (mfaSignInState.isRequired) {
      setVerificationCode('');
      setIsLoading(false);
      setShowFactorSelection(true);
      setError(null);
    }
  }, [mfaSignInState.isRequired]);

  useEffect(() => {
    // If a factor is already selected, go directly to code input
    if (mfaSignInState.selectedFactor) {
      setShowFactorSelection(false);
    }
  }, [mfaSignInState.selectedFactor]);

  // MARK: - Helper Functions
  const getFactorIcon = (factor: MultiFactorInfo) => {
    if (factor.factorId === TotpMultiFactorGenerator.FACTOR_ID) {
      return <Key className="h-5 w-5 text-green-600" />;
    } else if (factor.factorId === PhoneMultiFactorGenerator.FACTOR_ID) {
      return <Smartphone className="h-5 w-5 text-blue-600" />;
    }
    return <Shield className="h-5 w-5 text-gray-600" />;
  };

  const getFactorDescription = (factor: MultiFactorInfo) => {
    if (factor.factorId === TotpMultiFactorGenerator.FACTOR_ID) {
      return 'Authenticator App';
    } else if (factor.factorId === PhoneMultiFactorGenerator.FACTOR_ID) {
      return `SMS to ${(factor as any).phoneNumber || 'phone number'}`;
    }
    return 'Unknown method';
  };

  const getFactorInstructions = (factor: MultiFactorInfo) => {
    if (factor.factorId === TotpMultiFactorGenerator.FACTOR_ID) {
      return 'Open your authenticator app and enter the 6-digit code for Dynasty Family App.';
    } else if (factor.factorId === PhoneMultiFactorGenerator.FACTOR_ID) {
      return `We&apos;ll send a verification code to ${(factor as any).phoneNumber || 'your phone number'}.`;
    }
    return 'Follow the instructions for your security method.';
  };

  // MARK: - Event Handlers
  const handleFactorSelect = (factor: MultiFactorInfo) => {
    selectMfaFactor(factor);
    setShowFactorSelection(false);
    setError(null);
  };

  const handleBackToSelection = () => {
    setShowFactorSelection(true);
    setVerificationCode('');
    setError(null);
    selectMfaFactor(null as unknown as MultiFactorInfo); // Reset selected factor
  };

  const handleVerificationSubmit = async () => {
    if (!mfaSignInState.selectedFactor || !verificationCode.trim()) {
      setError('Please enter the verification code.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await completeMfaSignIn(mfaSignInState.selectedFactor.uid, verificationCode);
      
      // Success - the context will handle the state reset
      toast({
        title: "Sign-in Successful",
        description: "You have successfully completed multi-factor authentication.",
      });
      
      onClose?.();
    } catch (error) {
      console.error('MFA verification failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Verification failed. Please try again.';
      setError(errorMessage);
      
      toast({
        title: "Verification Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    resetMfaSignIn();
    onClose?.();
  };

  const handleCodeInputChange = (value: string) => {
    // Only allow digits and limit to 6 characters
    const cleanedValue = value.replace(/\D/g, '').slice(0, 6);
    setVerificationCode(cleanedValue);
    
    // Clear error when user starts typing
    if (error && cleanedValue.length > 0) {
      setError(null);
    }
  };

  // Don't render if MFA is not required
  const isOpen = open !== undefined ? open : mfaSignInState.isRequired;
  if (!isOpen || !mfaSignInState.isRequired) {
    return null;
  }

  return (
    <>
      {/* Recaptcha container for MFA operations */}
      <div id="mfa-recaptcha-container" style={{ display: 'none' }}></div>
      
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {showFactorSelection ? 'Verify Your Identity' : 'Enter Verification Code'}
            </DialogTitle>
            <DialogDescription>
              {showFactorSelection 
                ? 'Additional verification is required to complete your sign-in.'
                : 'Complete the verification to access your account.'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {showFactorSelection ? (
              // Factor Selection View
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Choose how you&apos;d like to verify your identity:
                </p>
                
                <div className="space-y-3">
                  {mfaSignInState.availableFactors.map((factor) => (
                    <Card 
                      key={factor.uid} 
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleFactorSelect(factor)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          {getFactorIcon(factor)}
                          <div className="flex-1">
                            <p className="font-medium">
                              {factor.displayName || getFactorDescription(factor)}
                            </p>
                            <p className="text-sm text-gray-600">
                              {getFactorDescription(factor)}
                            </p>
                          </div>
                          <Badge variant="outline">Available</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              // Code Input View
              <div className="space-y-4">
                {mfaSignInState.selectedFactor && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    {getFactorIcon(mfaSignInState.selectedFactor)}
                    <div>
                      <p className="font-medium">
                        {mfaSignInState.selectedFactor.displayName || getFactorDescription(mfaSignInState.selectedFactor)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {getFactorInstructions(mfaSignInState.selectedFactor)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="verification-code">Verification Code</Label>
                  <Input
                    id="verification-code"
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={verificationCode}
                    onChange={(e) => handleCodeInputChange(e.target.value)}
                    disabled={isLoading}
                    maxLength={6}
                    className={`text-center text-lg tracking-widest ${error ? 'border-red-300' : ''}`}
                    autoFocus
                  />
                  {error && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleBackToSelection}
                    disabled={isLoading}
                    className="flex items-center gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleVerificationSubmit}
                    disabled={isLoading || verificationCode.length !== 6}
                    className="flex-1"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Verifying...
                      </>
                    ) : (
                      'Verify & Sign In'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Cancel Button */}
            <div className="flex justify-center pt-4 border-t">
              <Button
                variant="ghost"
                onClick={handleCancel}
                disabled={isLoading}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel sign-in
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
} 