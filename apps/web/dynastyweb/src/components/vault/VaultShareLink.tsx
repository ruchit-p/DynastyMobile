// Vault Share Link Component for Dynasty Web App
// Provides UI for creating secure share links for vault items

import { useState } from 'react';
import { vaultService } from '@/services/VaultService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Share2, Link, Calendar as CalendarIcon, Lock, Copy, CheckCircle2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { VaultItem } from '@/services/VaultService';

interface VaultShareLinkProps {
  item: VaultItem;
  onClose: () => void;
}

export function VaultShareLink({ item, onClose }: VaultShareLinkProps) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareId, setShareId] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Share options
  const [expiresAt, setExpiresAt] = useState<Date | undefined>();
  const [allowDownload, setAllowDownload] = useState(true);
  const [password, setPassword] = useState('');
  const [selectedUsers] = useState<string[]>([]);
  const [shareMode, setShareMode] = useState<'link' | 'users'>('link');
  
  const handleCreateShareLink = async () => {
    setIsCreating(true);
    
    try {
      const result = await vaultService.shareItem(item.id, {
        expiresAt,
        allowDownload,
        password: password || undefined,
        userIds: shareMode === 'users' ? selectedUsers : undefined
      });
      
      setShareLink(result.shareLink);
      setShareId(result.shareId);
      
      toast({
        title: "Share link created",
        description: "Your secure share link has been generated"
      });
    } catch (error) {
      toast({
        title: "Failed to create share link",
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      toast({
        title: "Link copied",
        description: "Share link copied to clipboard"
      });
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually",
        variant: "destructive"
      });
    }
  };
  
  const handleRevokeShare = async () => {
    try {
      await vaultService.revokeShare(shareId);
      setShareLink('');
      setShareId('');
      
      toast({
        title: "Share link revoked",
        description: "The share link has been disabled"
      });
      
      onClose();
    } catch (error) {
      toast({
        title: "Failed to revoke",
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: "destructive"
      });
    }
  };
  
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share &quot;{item.name}&quot;
          </DialogTitle>
          <DialogDescription>
            Create a secure link to share this {item.isEncrypted ? 'encrypted' : ''} file
          </DialogDescription>
        </DialogHeader>
        
        {!shareLink ? (
          <Tabs value={shareMode} onValueChange={(v) => setShareMode(v as 'link' | 'users')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="link">
                <Link className="h-4 w-4 mr-2" />
                Share Link
              </TabsTrigger>
              <TabsTrigger value="users">
                <Users className="h-4 w-4 mr-2" />
                Share with Users
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="link" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Expiration Date (Optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !expiresAt && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {expiresAt ? format(expiresAt, "PPP") : "No expiration"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={expiresAt}
                      onSelect={setExpiresAt}
                      initialFocus
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password Protection (Optional)</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password for extra security"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <p className="text-sm text-gray-500">
                  Recipients will need this password to access the file
                </p>
              </div>
              
              <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="download">Allow Download</Label>
                  <p className="text-sm text-gray-500">
                    Recipients can download the file
                  </p>
                </div>
                <Switch
                  id="download"
                  checked={allowDownload}
                  onCheckedChange={setAllowDownload}
                />
              </div>
            </TabsContent>
            
            <TabsContent value="users" className="space-y-4 mt-4">
              <Alert>
                <Users className="h-4 w-4" />
                <AlertDescription>
                  Share directly with Dynasty family members. They&apos;ll receive a notification.
                </AlertDescription>
              </Alert>
              
              <div className="space-y-2">
                <Label>Select Family Members</Label>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-gray-500 text-center">
                    User selection UI would go here
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Share link created successfully!
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Label>Share Link</Label>
              <div className="flex gap-2">
                <Input
                  value={shareLink}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            
            {password && (
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  Password: <code className="font-mono">{password}</code>
                  <br />
                  Share this password separately for security
                </AlertDescription>
              </Alert>
            )}
            
            {expiresAt && (
              <p className="text-sm text-gray-500">
                Expires on {format(expiresAt, "PPP 'at' p")}
              </p>
            )}
            
            <Button
              variant="destructive"
              onClick={handleRevokeShare}
              className="w-full"
            >
              Revoke Share Link
            </Button>
          </div>
        )}
        
        <DialogFooter>
          {!shareLink && (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleCreateShareLink} disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create Share Link'}
              </Button>
            </>
          )}
          {shareLink && (
            <Button onClick={onClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}