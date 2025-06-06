'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { vaultService, formatFileSize } from '@/services/VaultService';
import type { VaultItem } from '@/services/VaultService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Search,
  Grid,
  List,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  File,
  Download,
} from 'lucide-react';
import { formatVaultDate } from '@/utils/dateUtils';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import Image from 'next/image';
import FilePreview from '@/components/FilePreview';

export default function VaultTrashPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [deletedItems, setDeletedItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEmptyDialog, setShowEmptyDialog] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [previewItem, setPreviewItem] = useState<VaultItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: VaultItem;
  } | null>(null);
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    loadDeletedItems();
  }, [loadDeletedItems]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

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
      const { deletedCount } = await vaultService.cleanupDeletedItems(0, true);
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

  // Handle item selection
  const handleItemClick = (itemId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (event.ctrlKey || event.metaKey) {
      // Multi-select with Ctrl/Cmd
      setSelectedItems((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(itemId)) {
          newSet.delete(itemId);
        } else {
          newSet.add(itemId);
        }
        return newSet;
      });
    } else if (event.shiftKey && selectedItems.size > 0) {
      // Range select with Shift
      setSelectedItems((prev) => {
        const newSet = new Set(prev);
        newSet.add(itemId);
        return newSet;
      });
    } else {
      // Single select
      setSelectedItems(new Set([itemId]));
    }
  };

  // Handle double-click to preview
  const handleItemDoubleClick = (item: VaultItem) => {
    setPreviewItem(item);
  };

  // Handle right-click context menu
  const handleContextMenu = (
    event: React.MouseEvent,
    item: VaultItem
  ) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Select the item if not already selected
    if (!selectedItems.has(item.id)) {
      setSelectedItems(new Set([item.id]));
    }
    
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      item,
    });
  };

  // Clear selection when clicking on empty space
  const handleContainerClick = () => {
    setSelectedItems(new Set());
  };

  // Helper function to get file icon component
  const getFileIconComponent = (mimeType?: string) => {
    if (!mimeType) return <File className="h-12 w-12 text-gray-400" />;
    
    if (mimeType.startsWith('image/')) return <FileImage className="h-12 w-12 text-blue-500" />;
    if (mimeType.startsWith('video/')) return <FileVideo className="h-12 w-12 text-purple-500" />;
    if (mimeType.startsWith('audio/')) return <FileAudio className="h-12 w-12 text-green-500" />;
    if (mimeType.includes('pdf') || mimeType.includes('document')) return <FileText className="h-12 w-12 text-red-500" />;
    
    return <File className="h-12 w-12 text-gray-400" />;
  };

  // Helper function to check if file has thumbnail
  const canShowThumbnail = (item: VaultItem) => {
    return item.mimeType?.startsWith('image/');
  };

  // Function to load thumbnail URL if not available
  const loadThumbnailUrl = async (item: VaultItem) => {
    if (item.url || item.thumbnailUrl || loadingThumbnails.has(item.id)) {
      return;
    }

    setLoadingThumbnails(prev => new Set(prev).add(item.id));
    
    try {
      await vaultService.getDownloadUrl(item);
      // Force re-render by updating items
      setDeletedItems(prev => [...prev]);
    } catch (error) {
      console.error('Failed to load thumbnail URL:', error);
    } finally {
      setLoadingThumbnails(prev => {
        const newSet = new Set(prev);
        newSet.delete(item.id);
        return newSet;
      });
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

  const selectAll = () => {
    if (selectedItems.size === deletedItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(deletedItems.map((item) => item.id)));
    }
  };

  const filteredItems = deletedItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle download (even for deleted items)
  const handleDownload = async (item: VaultItem) => {
    try {
      const blob = await vaultService.downloadFile(item);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Error',
        description: 'Failed to download file',
        variant: 'destructive',
      });
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
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex items-center gap-4 mt-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/vault')}
              className="flex items-center justify-center"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl mt-2 font-bold text-gray-900 leading-none">Trash</h1>
          </div>
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 w-full sm:w-auto mt-4 md:mt-6">
            {deletedItems.length > 0 && (
              <Button
                variant="destructive"
                onClick={() => setShowEmptyDialog(true)}
                disabled={processingAction}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Empty Trash
              </Button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Search deleted files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            >
              {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Content Container */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
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

          {/* Select All */}
          {filteredItems.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                onChange={selectAll}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">Select all</span>
            </div>
          )}

          {/* Content */}
          {filteredItems.length === 0 ? (
            <Card className="p-8 text-center">
              <Trash2 className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <h3 className="mb-2 text-lg font-semibold">
                {searchQuery ? 'No results found' : 'Trash is empty'}
              </h3>
              <p className="mb-4 text-sm text-gray-600">
                {searchQuery
                  ? 'Try adjusting your search'
                  : 'Items you delete will appear here for 30 days'}
              </p>
              <Button variant="outline" onClick={() => router.push('/vault')}>
                Back to Vault
              </Button>
            </Card>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" onClick={handleContainerClick}>
              {filteredItems.map((item) => {
                const daysLeft = getDaysUntilPermanentDeletion(item.updatedAt);
                return (
                  <div
                    key={item.id}
                    className="group cursor-pointer relative"
                    onClick={(e) => handleItemClick(item.id, e)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                  >
                    <Card className={`p-4 text-center transition-all hover:bg-gray-50 ${
                      selectedItems.has(item.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                    }`}>
                      <div className="mb-2 relative h-20 flex items-center justify-center">
                        {canShowThumbnail(item) ? (
                          item.url || item.thumbnailUrl ? (
                            <div className="relative w-full h-full">
                              <Image
                                src={item.thumbnailUrl || item.url || ''}
                                alt={item.name}
                                fill
                                className="object-contain rounded opacity-60"
                                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
                                onError={() => {
                                  const imgElement = event?.target as HTMLImageElement;
                                  if (imgElement) {
                                    imgElement.style.display = 'none';
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <div 
                              className="relative w-full h-full bg-gray-100 rounded flex items-center justify-center cursor-pointer"
                              onMouseEnter={() => loadThumbnailUrl(item)}
                            >
                              {loadingThumbnails.has(item.id) ? (
                                <Spinner className="h-6 w-6" />
                              ) : (
                                <FileImage className="h-8 w-8 text-gray-400" />
                              )}
                            </div>
                          )
                        ) : (
                          getFileIconComponent(item.mimeType)
                        )}
                      </div>
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(item.size || 0)}
                      </p>
                      {daysLeft <= 7 && (
                        <p className="text-xs text-orange-600 mt-1">
                          {daysLeft} days left
                        </p>
                      )}
                    </Card>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2" onClick={handleContainerClick}>
              {filteredItems.map((item) => {
                const daysLeft = getDaysUntilPermanentDeletion(item.updatedAt);
                
                return (
                  <Card 
                    key={item.id} 
                    className={`p-4 cursor-pointer transition-all hover:bg-gray-50 ${
                      selectedItems.has(item.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                    }`}
                    onClick={(e) => handleItemClick(item.id, e)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 relative flex-shrink-0">
                          {canShowThumbnail(item) ? (
                            item.url || item.thumbnailUrl ? (
                              <Image
                                src={item.thumbnailUrl || item.url || ''}
                                alt={item.name}
                                fill
                                className="object-cover rounded opacity-60"
                                sizes="48px"
                                onError={() => {
                                  const imgElement = event?.target as HTMLImageElement;
                                  if (imgElement) {
                                    imgElement.style.display = 'none';
                                  }
                                }}
                              />
                            ) : (
                              <div 
                                className="h-full w-full bg-gray-100 rounded flex items-center justify-center cursor-pointer"
                                onMouseEnter={() => loadThumbnailUrl(item)}
                              >
                                {loadingThumbnails.has(item.id) ? (
                                  <Spinner className="h-4 w-4" />
                                ) : (
                                  <FileImage className="h-6 w-6 text-gray-400" />
                                )}
                              </div>
                            )
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              {getFileIconComponent(item.mimeType)}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-gray-500">
                            {formatFileSize(item.size || 0)} • Deleted{' '}
                            {formatVaultDate(item.updatedAt, 'MMM d, yyyy')}
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
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
        >
          <Card className="w-48 p-1 shadow-lg">
            <div className="py-1">
              <button
                className="flex w-full items-center px-3 py-2 text-sm hover:bg-gray-100"
                onClick={() => {
                  setPreviewItem(contextMenu.item);
                  setContextMenu(null);
                }}
              >
                <FileImage className="mr-2 h-4 w-4" />
                Preview
              </button>
              <button
                className="flex w-full items-center px-3 py-2 text-sm hover:bg-gray-100"
                onClick={() => {
                  handleRestore(contextMenu.item);
                  setContextMenu(null);
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore
              </button>
              <button
                className="flex w-full items-center px-3 py-2 text-sm hover:bg-gray-100"
                onClick={() => {
                  handleDownload(contextMenu.item);
                  setContextMenu(null);
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </button>
              <div className="my-1 border-t" />
              <button
                className="flex w-full items-center px-3 py-2 text-sm text-red-600 hover:bg-gray-100"
                onClick={() => {
                  setSelectedItems(new Set([contextMenu.item.id]));
                  setShowDeleteDialog(true);
                  setContextMenu(null);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Forever
              </button>
            </div>
          </Card>
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

      {/* File Preview Modal */}
      <FilePreview
        item={previewItem}
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
        onDownload={handleDownload}
        onShare={() => {
          // Share is not available for deleted items
          toast({
            title: 'Not available',
            description: 'Cannot share deleted items',
            variant: 'destructive',
          });
        }}
      />
    </div>
  );
}