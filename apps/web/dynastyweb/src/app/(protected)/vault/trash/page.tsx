'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { vaultService, formatFileSize, getFileIcon } from '@/services/VaultService';
import type { VaultItem } from '@/services/VaultService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Trash2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';

export default function VaultTrashPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [deletedItems, setDeletedItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEmptyDialog, setShowEmptyDialog] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);

  useEffect(() => {
    loadDeletedItems();
  }, [loadDeletedItems]);

  const loadDeletedItems = useCallback(async () => {
    setLoading(true);
    try {
      const items = await vaultService.getDeletedItems();
      setDeletedItems(items);
    } catch (error) {
      console.error('Error loading deleted items:', error);
      toast({
        title: 'Error',
        description: 'Failed to load deleted items',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleRestore = async (item: VaultItem) => {
    setProcessingAction(true);
    try {
      await vaultService.restoreFile(item.id);
      setDeletedItems((prev) => prev.filter((i) => i.id !== item.id));
      setSelectedItems((prev) => {
        const updated = new Set(prev);
        updated.delete(item.id);
        return updated;
      });
      
      toast({
        title: 'Item restored',
        description: `${item.name} has been restored`,
      });
    } catch (error) {
      console.error('Error restoring item:', error);
      toast({
        title: 'Error',
        description: 'Failed to restore item',
        variant: 'destructive',
      });
    } finally {
      setProcessingAction(false);
    }
  };

  const handlePermanentDelete = async () => {
    setProcessingAction(true);
    const itemsToDelete = Array.from(selectedItems);
    
    try {
      for (const itemId of itemsToDelete) {
        await vaultService.deleteFile(itemId, true);
      }
      
      setDeletedItems((prev) => 
        prev.filter((item) => !selectedItems.has(item.id))
      );
      setSelectedItems(new Set());
      setShowDeleteDialog(false);
      
      toast({
        title: 'Items deleted',
        description: `${itemsToDelete.length} item(s) permanently deleted`,
      });
    } catch (error) {
      console.error('Error deleting items:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete some items',
        variant: 'destructive',
      });
    } finally {
      setProcessingAction(false);
    }
  };

  const handleEmptyTrash = async () => {
    setProcessingAction(true);
    try {
      const { deletedCount } = await vaultService.cleanupDeletedItems(0);
      setDeletedItems([]);
      setShowEmptyDialog(false);
      
      toast({
        title: 'Trash emptied',
        description: `${deletedCount} item(s) permanently deleted`,
      });
    } catch (error) {
      console.error('Error emptying trash:', error);
      toast({
        title: 'Error',
        description: 'Failed to empty trash',
        variant: 'destructive',
      });
    } finally {
      setProcessingAction(false);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems((prev) => {
      const updated = new Set(prev);
      if (updated.has(itemId)) {
        updated.delete(itemId);
      } else {
        updated.add(itemId);
      }
      return updated;
    });
  };

  const selectAll = () => {
    if (selectedItems.size === deletedItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(deletedItems.map((item) => item.id)));
    }
  };

  const getDaysUntilPermanentDeletion = (deletedAt: Date) => {
    const deletedDate = new Date(deletedAt);
    const permanentDeletionDate = new Date(deletedDate);
    permanentDeletionDate.setDate(permanentDeletionDate.getDate() + 30);
    
    const daysLeft = Math.ceil(
      (permanentDeletionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    
    return Math.max(0, daysLeft);
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/vault')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Trash</h1>
          <p className="text-sm text-gray-600">
            Items in trash will be permanently deleted after 30 days
          </p>
        </div>
        {deletedItems.length > 0 && (
          <Button
            variant="destructive"
            onClick={() => setShowEmptyDialog(true)}
            disabled={processingAction}
          >
            Empty Trash
          </Button>
        )}
      </div>

      {/* Action Bar */}
      {selectedItems.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-gray-100 p-3">
          <span className="text-sm font-medium">
            {selectedItems.size} item(s) selected
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                selectedItems.forEach((itemId) => {
                  const item = deletedItems.find((i) => i.id === itemId);
                  if (item) handleRestore(item);
                });
              }}
              disabled={processingAction}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={processingAction}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Forever
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {deletedItems.length === 0 ? (
        <Card className="p-8 text-center">
          <Trash2 className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-semibold">Trash is empty</h3>
          <p className="mb-4 text-sm text-gray-600">
            Items you delete will appear here for 30 days
          </p>
          <Button variant="outline" onClick={() => router.push('/vault')}>
            Back to Vault
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Select All */}
          <div className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedItems.size === deletedItems.length}
              onChange={selectAll}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">Select all</span>
          </div>

          {/* Items */}
          {deletedItems.map((item) => {
            const daysLeft = getDaysUntilPermanentDeletion(item.updatedAt);
            
            return (
              <Card key={item.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => toggleItemSelection(item.id)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <div className="text-2xl">{getFileIcon(item.mimeType)}</div>
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(item.size || 0)} • Deleted{' '}
                        {format(item.updatedAt, 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {daysLeft <= 7 && (
                      <span className="flex items-center gap-1 text-sm text-orange-600">
                        <AlertTriangle className="h-4 w-4" />
                        {daysLeft} days left
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRestore(item)}
                      disabled={processingAction}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Forever Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete items permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedItems.size} item(s). This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processingAction}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePermanentDelete}
              disabled={processingAction}
              className="bg-red-600 hover:bg-red-700"
            >
              {processingAction ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Deleting...
                </>
              ) : (
                'Delete Forever'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Empty Trash Dialog */}
      <AlertDialog open={showEmptyDialog} onOpenChange={setShowEmptyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {deletedItems.length} item(s) in trash.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processingAction}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEmptyTrash}
              disabled={processingAction}
              className="bg-red-600 hover:bg-red-700"
            >
              {processingAction ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Emptying...
                </>
              ) : (
                'Empty Trash'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}