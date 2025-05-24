'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { vaultService, formatFileSize, getFileIcon } from '@/services/VaultService';
import type { VaultItem, VaultFolder, UploadProgress } from '@/services/VaultService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Folder,
  Upload,
  Download,
  Trash2,
  Share2,
  MoreVertical,
  Search,
  Grid,
  List,
  ChevronRight,
  Home,
  FolderPlus,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import { useOffline } from '@/context/OfflineContext';

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export default function VaultPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isOnline } = useOffline();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<VaultItem[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: null, name: 'My Vault' }
  ]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, UploadProgress>>(
    new Map()
  );
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    loadVaultItems();
  }, [currentFolderId, loadVaultItems]);

  const loadVaultItems = useCallback(async () => {
    setLoading(true);
    try {
      const { items: vaultItems, folders: vaultFolders } = await vaultService.getItems(
        currentFolderId
      );
      setItems(vaultItems);
      setFolders(vaultFolders);
    } catch (error) {
      console.error('Error loading vault items:', error);
      toast({
        title: 'Error',
        description: 'Failed to load vault items',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, toast]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!isOnline) {
      toast({
        title: 'Offline',
        description: 'File uploads require an internet connection',
        variant: 'destructive',
      });
      return;
    }

    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      const uploadId = `${file.name}-${Date.now()}`;
      
      try {
        const uploadItem = await vaultService.uploadFile(
          file,
          currentFolderId,
          (progress) => {
            setUploadingFiles((prev) => {
              const updated = new Map(prev);
              updated.set(uploadId, progress);
              return updated;
            });
          }
        );

        // Remove from uploading and add to items
        setUploadingFiles((prev) => {
          const updated = new Map(prev);
          updated.delete(uploadId);
          return updated;
        });
        
        setItems((prev) => [...prev, uploadItem]);
        
        toast({
          title: 'Upload complete',
          description: `${file.name} uploaded successfully`,
        });
      } catch (error) {
        setUploadingFiles((prev) => {
          const updated = new Map(prev);
          updated.delete(uploadId);
          return updated;
        });
        
        const errorMessage = error instanceof Error ? error.message : 'Failed to upload file';
        toast({
          title: 'Upload failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const folder = await vaultService.createFolder(newFolderName, currentFolderId);
      setFolders((prev) => [...prev, folder]);
      setShowNewFolderDialog(false);
      setNewFolderName('');
      
      toast({
        title: 'Folder created',
        description: `${folder.name} created successfully`,
      });
    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: 'Error',
        description: 'Failed to create folder',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (item: VaultItem) => {
    try {
      await vaultService.deleteFile(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      
      toast({
        title: 'Item deleted',
        description: `${item.name} moved to trash`,
      });
    } catch (error) {
      console.error('Error deleting file:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete item',
        variant: 'destructive',
      });
    }
  };

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

  const handleShare = async (item: VaultItem) => {
    try {
      const { shareLink } = await vaultService.shareItem(item.id, {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });
      
      await navigator.clipboard.writeText(shareLink);
      
      toast({
        title: 'Link copied',
        description: 'Share link copied to clipboard',
      });
    } catch (error) {
      console.error('Error sharing item:', error);
      toast({
        title: 'Error',
        description: 'Failed to create share link',
        variant: 'destructive',
      });
    }
  };

  const navigateToFolder = (folder: VaultFolder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const navigateToBreadcrumb = (index: number) => {
    const breadcrumb = breadcrumbs[index];
    setCurrentFolderId(breadcrumb.id);
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFolders = folders.filter((folder) =>
    folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Vault</h1>
        <p className="text-sm text-gray-600">
          Secure storage for your family documents and memories
        </p>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isOnline}
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowNewFolderDialog(true)}
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            New Folder
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          >
            {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/vault/trash')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.id || 'root'} className="flex items-center gap-2">
            {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}
            <button
              onClick={() => navigateToBreadcrumb(index)}
              className="hover:text-blue-600"
            >
              {index === 0 ? <Home className="h-4 w-4" /> : crumb.name}
            </button>
          </div>
        ))}
      </div>

      {/* Upload Progress */}
      {uploadingFiles.size > 0 && (
        <div className="mb-4 space-y-2">
          {Array.from(uploadingFiles.entries()).map(([id, progress]) => (
            <Card key={id} className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{id.split('-')[0]}</span>
                <span className="text-sm text-gray-500">{progress.percentage.toFixed(0)}%</span>
              </div>
              <Progress value={progress.percentage} className="mt-2" />
            </Card>
          ))}
        </div>
      )}

      {/* Content */}
      {filteredFolders.length === 0 && filteredItems.length === 0 ? (
        <Card className="p-8 text-center">
          <Folder className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-semibold">
            {searchQuery ? 'No results found' : 'This folder is empty'}
          </h3>
          <p className="mb-4 text-sm text-gray-600">
            {searchQuery
              ? 'Try adjusting your search'
              : 'Upload files or create folders to get started'}
          </p>
          {!searchQuery && (
            <Button onClick={() => fileInputRef.current?.click()} disabled={!isOnline}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Files
            </Button>
          )}
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {/* Folders */}
          {filteredFolders.map((folder) => (
            <div
              key={folder.id}
              className="group cursor-pointer"
              onClick={() => navigateToFolder(folder)}
            >
              <Card className="p-4 text-center transition-colors hover:bg-gray-50">
                <Folder className="mx-auto mb-2 h-12 w-12 text-blue-500" />
                <p className="truncate text-sm font-medium">{folder.name}</p>
                <p className="text-xs text-gray-500">{folder.itemCount} items</p>
              </Card>
            </div>
          ))}

          {/* Files */}
          {filteredItems.map((item) => (
            <div key={item.id} className="group relative">
              <Card className="p-4 text-center">
                <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDownload(item)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShare(item)}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDelete(item)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mb-2 text-3xl">{getFileIcon(item.mimeType)}</div>
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(item.size || 0)}</p>
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {/* List view folders */}
          {filteredFolders.map((folder) => (
            <Card
              key={folder.id}
              className="cursor-pointer p-4 transition-colors hover:bg-gray-50"
              onClick={() => navigateToFolder(folder)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Folder className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="font-medium">{folder.name}</p>
                    <p className="text-sm text-gray-500">
                      {folder.itemCount} items • {formatFileSize(folder.totalSize)}
                    </p>
                  </div>
                </div>
                <span className="text-sm text-gray-500">
                  {format(folder.updatedAt, 'MMM d, yyyy')}
                </span>
              </div>
            </Card>
          ))}

          {/* List view files */}
          {filteredItems.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{getFileIcon(item.mimeType)}</div>
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-500">
                      {formatFileSize(item.size || 0)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {format(item.updatedAt, 'MMM d, yyyy')}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDownload(item)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShare(item)}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDelete(item)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        multiple
      />

      {/* New Folder Dialog */}
      {showNewFolderDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-semibold">Create New Folder</h3>
            <Input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateFolder();
                }
              }}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowNewFolderDialog(false);
                  setNewFolderName('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                Create
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}