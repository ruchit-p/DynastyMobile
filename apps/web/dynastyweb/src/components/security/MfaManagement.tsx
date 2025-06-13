'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/EnhancedAuthContext';
import type { MfaEnrollmentInfo, TotpSetupInfo } from '@/context/EnhancedAuthContext';
import { TotpSecret } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// Dialog components removed as they're not used in this implementation
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Trash2, Shield, Smartphone, Key, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface MfaManagementProps {
  className?: string;
}

export default function MfaManagement({ className }: MfaManagementProps) {
  const { getMfaEnrollmentInfo, setupTotpMfa, enrollTotpMfa, setupPhoneMfa, enrollPhoneMfa, unenrollMfa } = useAuth();
  const { toast } = useToast();
  
  // MARK: - State Management
  const [enrolledFactors, setEnrolledFactors] = useState<MfaEnrollmentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // TOTP Setup State
  const [totpSetupInfo, setTotpSetupInfo] = useState<TotpSetupInfo | null>(null);
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpDisplayName, setTotpDisplayName] = useState('');
  // TOTP session state removed as it's not used in current implementation
  
  // Phone Setup State
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneDisplayName, setPhoneDisplayName] = useState('');
  const [phoneVerificationId, setPhoneVerificationId] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [isPhoneCodeSent, setIsPhoneCodeSent] = useState(false);

  // MARK: - Helper Functions
  const loadEnrolledFactors = useCallback(() => {
    try {
      const factors = getMfaEnrollmentInfo();
      setEnrolledFactors(factors);
    } catch (error) {
      console.error('Failed to load MFA factors:', error);
      toast({
        title: "Error",
        description: "Failed to load MFA factors. Please refresh the page.",
        variant: "destructive",
      });
    }
  }, [getMfaEnrollmentInfo, toast]);

  // MARK: - Effects
  useEffect(() => {
    loadEnrolledFactors();
  }, [loadEnrolledFactors]);

  const resetTotpSetup = () => {
    setTotpSetupInfo(null);
    setTotpSecret(null);
    setTotpCode('');
    setTotpDisplayName('');
    // Reset TOTP session if needed
  };

  const resetPhoneSetup = () => {
    setPhoneNumber('');
    setPhoneDisplayName('');
    setPhoneVerificationId('');
    setPhoneCode('');
    setIsPhoneCodeSent(false);
    // Reset phone setup state
  };

  // MARK: - TOTP Methods
  const startTotpSetup = async () => {
    if (!totpDisplayName.trim()) {
      toast({
        title: "Display Name Required",
        description: "Please enter a display name for this authenticator.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const setupInfo = await setupTotpMfa(totpDisplayName);
      setTotpSetupInfo(setupInfo);
      setTotpSecret(setupInfo.totpSecret);
    } catch (error) {
      console.error('Failed to setup TOTP:', error);
      toast({
        title: "Setup Failed",
        description: error instanceof Error ? error.message : "Failed to setup authenticator app.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const completeTotpEnrollment = async () => {
    if (!totpCode.trim() || !totpSecret) {
      toast({
        title: "Code Required",
        description: "Please enter the 6-digit code from your authenticator app.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await enrollTotpMfa(totpSecret, totpCode);
      toast({
        title: "Success",
        description: "Authenticator app has been successfully enrolled!",
      });
      loadEnrolledFactors();
      resetTotpSetup();
    } catch (error) {
      console.error('Failed to enroll TOTP:', error);
      toast({
        title: "Enrollment Failed",
        description: error instanceof Error ? error.message : "Failed to verify code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // MARK: - Phone Methods
  const startPhoneSetup = async () => {
    if (!phoneNumber.trim() || !phoneDisplayName.trim()) {
      toast({
        title: "Information Required",
        description: "Please enter both phone number and display name.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const verificationId = await setupPhoneMfa(phoneNumber);
      setPhoneVerificationId(verificationId);
      setIsPhoneCodeSent(true);
      toast({
        title: "Code Sent",
        description: "Verification code has been sent to your phone.",
      });
    } catch (error) {
      console.error('Failed to setup phone MFA:', error);
      toast({
        title: "Setup Failed",
        description: error instanceof Error ? error.message : "Failed to send verification code.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const completePhoneEnrollment = async () => {
    if (!phoneCode.trim() || !phoneVerificationId) {
      toast({
        title: "Code Required",
        description: "Please enter the verification code sent to your phone.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await enrollPhoneMfa(phoneVerificationId, phoneCode);
      toast({
        title: "Success",
        description: "Phone number has been successfully enrolled for MFA!",
      });
      loadEnrolledFactors();
      resetPhoneSetup();
    } catch (error) {
      console.error('Failed to enroll phone MFA:', error);
      toast({
        title: "Enrollment Failed",
        description: error instanceof Error ? error.message : "Failed to verify code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // MARK: - Remove MFA Factor
  const handleRemoveFactor = async (factorId: string, displayName: string) => {
    if (!confirm(`Are you sure you want to remove "${displayName}" from your account? This will reduce your account security.`)) {
      return;
    }

    setIsLoading(true);
    try {
      await unenrollMfa(factorId);
      toast({
        title: "Success",
        description: `${displayName} has been removed from your account.`,
      });
      loadEnrolledFactors();
    } catch (error) {
      console.error('Failed to remove MFA factor:', error);
      toast({
        title: "Removal Failed",
        description: error instanceof Error ? error.message : "Failed to remove MFA factor.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      {/* Recaptcha containers for MFA operations */}
      <div id="mfa-recaptcha-container" style={{ display: 'none' }}></div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Multi-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account with multi-factor authentication.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current MFA Factors */}
          <div>
            <h3 className="text-lg font-medium mb-4">Active Security Methods</h3>
            {enrolledFactors.length > 0 ? (
              <div className="space-y-3">
                {enrolledFactors.map((factor) => (
                  <div key={factor.factorId} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {factor.phoneNumber ? (
                        <Smartphone className="h-5 w-5 text-blue-600" />
                      ) : (
                        <Key className="h-5 w-5 text-green-600" />
                      )}
                      <div>
                        <p className="font-medium">{factor.displayName}</p>
                        <p className="text-sm text-gray-600">
                          {factor.phoneNumber ? `Phone: ${factor.phoneNumber}` : 'Authenticator App'}
                        </p>
                        <p className="text-xs text-gray-500">
                          Enrolled: {new Date(factor.enrollmentTime).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Active</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveFactor(factor.factorId, factor.displayName)}
                        disabled={isLoading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No multi-factor authentication methods are currently enabled. We recommend adding at least one for better security.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          {/* Add New MFA Factor */}
          <div>
            <h3 className="text-lg font-medium mb-4">Add Security Method</h3>
            <Tabs defaultValue="totp" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="totp" className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Authenticator App
                </TabsTrigger>
                <TabsTrigger value="phone" className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Phone Number
                </TabsTrigger>
              </TabsList>

              {/* TOTP Setup */}
              <TabsContent value="totp" className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Use an authenticator app like Google Authenticator, Authy, or 1Password to generate codes.
                  </p>
                  
                  {!totpSetupInfo ? (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="totp-name">Display Name</Label>
                        <Input
                          id="totp-name"
                          type="text"
                          placeholder="e.g., My Phone, Work Phone"
                          value={totpDisplayName}
                          onChange={(e) => setTotpDisplayName(e.target.value)}
                          disabled={isLoading}
                        />
                      </div>
                      <Button onClick={startTotpSetup} disabled={isLoading}>
                        {isLoading ? 'Setting up...' : 'Setup Authenticator App'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>
                          Scan the QR code below with your authenticator app, then enter the 6-digit code to complete setup.
                        </AlertDescription>
                      </Alert>
                      
                      <div className="bg-white p-4 rounded-lg border text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={totpSetupInfo.qrCodeUrl} 
                          alt="QR Code for TOTP setup"
                          className="mx-auto mb-4"
                        />
                        <p className="text-sm text-gray-600 mb-2">Or enter this key manually:</p>
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm break-all">
                          {totpSetupInfo.secretKey}
                        </code>
                      </div>
                      
                      <div>
                        <Label htmlFor="totp-code">Verification Code</Label>
                        <Input
                          id="totp-code"
                          type="text"
                          placeholder="Enter 6-digit code"
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          disabled={isLoading}
                          maxLength={6}
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        <Button onClick={completeTotpEnrollment} disabled={isLoading || totpCode.length !== 6}>
                          {isLoading ? 'Verifying...' : 'Complete Setup'}
                        </Button>
                        <Button variant="outline" onClick={resetTotpSetup} disabled={isLoading}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Phone Setup */}
              <TabsContent value="phone" className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Receive verification codes via SMS to your phone number.
                  </p>
                  
                  {!isPhoneCodeSent ? (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="phone-number">Phone Number</Label>
                        <Input
                          id="phone-number"
                          type="tel"
                          placeholder="+1234567890"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          disabled={isLoading}
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone-name">Display Name</Label>
                        <Input
                          id="phone-name"
                          type="text"
                          placeholder="e.g., My Phone, Work Phone"
                          value={phoneDisplayName}
                          onChange={(e) => setPhoneDisplayName(e.target.value)}
                          disabled={isLoading}
                        />
                      </div>
                      <Button onClick={startPhoneSetup} disabled={isLoading}>
                        {isLoading ? 'Sending...' : 'Send Verification Code'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>
                          A verification code has been sent to {phoneNumber}. Enter it below to complete setup.
                        </AlertDescription>
                      </Alert>
                      
                      <div>
                        <Label htmlFor="phone-code">Verification Code</Label>
                        <Input
                          id="phone-code"
                          type="text"
                          placeholder="Enter 6-digit code"
                          value={phoneCode}
                          onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          disabled={isLoading}
                          maxLength={6}
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        <Button onClick={completePhoneEnrollment} disabled={isLoading || phoneCode.length !== 6}>
                          {isLoading ? 'Verifying...' : 'Complete Setup'}
                        </Button>
                        <Button variant="outline" onClick={resetPhoneSetup} disabled={isLoading}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 