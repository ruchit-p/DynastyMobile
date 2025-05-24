'use client';

import React, { useState } from 'react';
import { format, addDays } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import {
  Link,
  Copy,
  Calendar as CalendarIcon,
  Shield,
  Clock,
  Download,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { VaultItem } from '@/services/VaultService';
import { vaultService } from '@/services/VaultService';
import { Spinner } from '@/components/ui/spinner';

interface ShareLinkManagerProps {
  item: VaultItem;
  isOpen: boolean;
  onClose: () => void;
}

interface ShareOptions {
  expiresAt: Date;
  allowDownload: boolean;
  password?: string;
  userIds?: string[];
  requireAuth: boolean;
}

export function ShareLinkManager({ item, isOpen, onClose }: ShareLinkManagerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [options, setOptions] = useState<ShareOptions>({
    expiresAt: addDays(new Date(), 7),
    allowDownload: true,
    requireAuth: false,
  });

  const handleCreateShareLink = async () => {
    setLoading(true);
    try {
      const result = await vaultService.shareItem(item.id, {
        expiresAt: options.expiresAt,
        allowDownload: options.allowDownload,
        password: options.password,
        userIds: options.requireAuth ? options.userIds : undefined,
      });

      setShareLink(result.shareLink);
      setShareId(result.shareId);

      toast({
        title: 'Share link created',
        description: 'The share link has been created successfully',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create share link',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) return;

    try {
      await navigator.clipboard.writeText(shareLink);
      toast({
        title: 'Link copied',
        description: 'Share link copied to clipboard',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      });
    }
  };

  const handleRevokeShare = async () => {
    if (!shareId) return;

    setLoading(true);
    try {
      await vaultService.revokeShare(shareId);
      setShareLink(null);
      setShareId(null);
      
      toast({
        title: 'Share revoked',
        description: 'The share link has been revoked',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to revoke share',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share &quot;{item.name}&quot;</DialogTitle>
          <DialogDescription>
            Create a secure link to share this file
          </DialogDescription>
        </DialogHeader>

        {!shareLink ? (
          <div className="space-y-4">
            {/* Expiration Date */}
            <div className="space-y-2">
              <Label>Expires on</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !options.expiresAt && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(options.expiresAt, 'PPP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={options.expiresAt}
                    onSelect={(date) =>
                      setOptions({ ...options, expiresAt: date || new Date() })
                    }
                    disabled={(date) =>
                      date < new Date() || date > addDays(new Date(), 30)
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-gray-500">
                Link will expire in {Math.ceil((options.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days
              </p>
            </div>

            {/* Password Protection */}
            <div className="space-y-2">
              <Label htmlFor="password">Password protection (optional)</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={options.password || ''}
                  onChange={(e) =>
                    setOptions({ ...options, password: e.target.value })
                  }
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
            </div>

            {/* Permissions */}
            <div className="space-y-3">
              <Label>Permissions</Label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">Allow download</span>
                </div>
                <Switch
                  checked={options.allowDownload}
                  onCheckedChange={(checked) =>
                    setOptions({ ...options, allowDownload: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">Require authentication</span>
                </div>
                <Switch
                  checked={options.requireAuth}
                  onCheckedChange={(checked) =>
                    setOptions({ ...options, requireAuth: checked })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleCreateShareLink} disabled={loading}>
                {loading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Link className="mr-2 h-4 w-4" />
                    Create Link
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Share link created</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyLink}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  value={shareLink}
                  readOnly
                  className="font-mono text-xs"
                />
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Expires {format(options.expiresAt, 'PP')}
                  </div>
                  {options.password && (
                    <div className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Password protected
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <DialogFooter>
              <Button
                variant="destructive"
                onClick={handleRevokeShare}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Revoking...
                  </>
                ) : (
                  'Revoke Link'
                )}
              </Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}