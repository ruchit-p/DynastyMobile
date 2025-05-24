'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { GitBranch, Cloud, Smartphone, Check } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export interface ConflictItem {
  id: string;
  type: 'story' | 'event' | 'message' | 'profile';
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  localTimestamp: Date;
  remoteTimestamp: Date;
  description?: string;
}

interface ConflictResolverProps {
  conflicts: ConflictItem[];
  onResolve: (resolutions: Record<string, 'local' | 'remote'>) => void;
  onCancel: () => void;
  className?: string;
}

export function ConflictResolver({
  conflicts,
  onResolve,
  onCancel,
  className,
}: ConflictResolverProps) {
  const [resolutions, setResolutions] = useState<Record<string, 'local' | 'remote'>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleResolutionChange = (conflictId: string, resolution: 'local' | 'remote') => {
    setResolutions(prev => ({
      ...prev,
      [conflictId]: resolution,
    }));
  };

  const handleResolveAll = (resolution: 'local' | 'remote') => {
    const newResolutions: Record<string, 'local' | 'remote'> = {};
    conflicts.forEach(conflict => {
      newResolutions[conflict.id] = resolution;
    });
    setResolutions(newResolutions);
  };

  const handleSubmit = () => {
    // Check if all conflicts have resolutions
    const unresolvedCount = conflicts.filter(c => !resolutions[c.id]).length;
    
    if (unresolvedCount > 0) {
      alert(`Please resolve all ${unresolvedCount} conflict(s) before proceeding.`);
      return;
    }

    setShowConfirmDialog(true);
  };

  const handleConfirmResolve = () => {
    onResolve(resolutions);
    setShowConfirmDialog(false);
  };

  const getValueDisplay = (value: unknown): string => {
    if (value === null || value === undefined) return 'Empty';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const resolvedCount = Object.keys(resolutions).length;
  const allResolved = resolvedCount === conflicts.length;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Resolve Sync Conflicts</h3>
            <p className="text-sm text-gray-600">
              Choose which version to keep for each conflicting item
            </p>
          </div>
          <Badge variant={allResolved ? 'default' : 'secondary'}>
            {resolvedCount} / {conflicts.length} resolved
          </Badge>
        </div>

        {conflicts.length > 1 && (
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleResolveAll('local')}
            >
              <Smartphone className="mr-2 h-4 w-4" />
              Keep All Local
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleResolveAll('remote')}
            >
              <Cloud className="mr-2 h-4 w-4" />
              Keep All Remote
            </Button>
          </div>
        )}
      </Card>

      {/* Conflicts */}
      <div className="space-y-3">
        {conflicts.map((conflict) => (
          <Card key={conflict.id} className="p-4">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h4 className="font-medium capitalize">
                  {conflict.type} - {conflict.field}
                </h4>
                {conflict.description && (
                  <p className="text-sm text-gray-600">{conflict.description}</p>
                )}
              </div>
              {resolutions[conflict.id] && (
                <Badge variant="outline">
                  <Check className="mr-1 h-3 w-3" />
                  Resolved
                </Badge>
              )}
            </div>

            <RadioGroup
              value={resolutions[conflict.id]}
              onValueChange={(value: 'local' | 'remote') =>
                handleResolutionChange(conflict.id, value)
              }
            >
              {/* Local Version */}
              <div className="mb-3">
                <div className="flex items-center space-x-2 mb-2">
                  <RadioGroupItem value="local" id={`${conflict.id}-local`} />
                  <Label
                    htmlFor={`${conflict.id}-local`}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Smartphone className="h-4 w-4" />
                    Local Version
                    <span className="text-xs text-gray-500">
                      ({format(conflict.localTimestamp, 'MMM d, h:mm a')})
                    </span>
                  </Label>
                </div>
                <div className="ml-6 rounded-lg bg-gray-50 p-3">
                  <pre className="whitespace-pre-wrap text-sm">
                    {getValueDisplay(conflict.localValue)}
                  </pre>
                </div>
              </div>

              {/* Remote Version */}
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <RadioGroupItem value="remote" id={`${conflict.id}-remote`} />
                  <Label
                    htmlFor={`${conflict.id}-remote`}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Cloud className="h-4 w-4" />
                    Server Version
                    <span className="text-xs text-gray-500">
                      ({format(conflict.remoteTimestamp, 'MMM d, h:mm a')})
                    </span>
                  </Label>
                </div>
                <div className="ml-6 rounded-lg bg-gray-50 p-3">
                  <pre className="whitespace-pre-wrap text-sm">
                    {getValueDisplay(conflict.remoteValue)}
                  </pre>
                </div>
              </div>
            </RadioGroup>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 sticky bottom-0 bg-white p-4 border-t">
        <Button
          variant="outline"
          onClick={onCancel}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!allResolved}
          className="flex-1"
        >
          <GitBranch className="mr-2 h-4 w-4" />
          Apply Resolutions
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Conflict Resolutions?</AlertDialogTitle>
            <AlertDialogDescription>
              You have chosen to resolve {conflicts.length} conflict(s). This action
              cannot be undone. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmResolve}>
              Apply Resolutions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}