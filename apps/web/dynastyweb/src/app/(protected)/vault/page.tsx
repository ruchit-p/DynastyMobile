'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { vaultService, formatFileSize } from '@/services/VaultService';
import type { VaultItem, VaultFolder, UploadProgress } from '@/services/VaultService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Folder,
  Upload,
  Download,
  Trash2,
  Share2,
  Search,
  Grid,
  List,
  ChevronRight,
  Home,
  FolderPlus,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  File,
} from 'lucide-react';
import { formatVaultDate } from '@/utils/dateUtils';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import { useOffline } from '@/context/OfflineContext';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { FixedSizeList as VirtualizedList, ListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

const FilePreview = dynamic(() => import('@/components/FilePreview'), { ssr: false });

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
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: VaultItem | VaultFolder;
    type: 'file' | 'folder';
  } | null>(null);
  const [previewItem, setPreviewItem] = useState<VaultItem | null>(null);

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

  useEffect(() => {
    loadVaultItems();
  }, [loadVaultItems]);

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
    setSelectedItems(new Set());
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
      // This is a simplified version - you might want to implement proper range selection
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

  // Handle double-click to open
  const handleItemDoubleClick = (item: VaultItem) => {
    if (item.type === 'file') {
      // Open file preview
      setPreviewItem(item);
    }
  };

  // Handle folder double-click
  const handleFolderDoubleClick = (folder: VaultFolder) => {
    navigateToFolder(folder);
  };

  // Handle right-click context menu
  const handleContextMenu = (
    event: React.MouseEvent,
    item: VaultItem | VaultFolder,
    type: 'file' | 'folder'
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
      type,
    });
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Clear selection when clicking on empty space
  const handleContainerClick = () => {
    setSelectedItems(new Set());
  };

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFolders = folders.filter((folder) =>
    folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const listData = [
    ...filteredFolders.map((folder) => ({ type: 'folder' as const, folder })),
    ...filteredItems.map((item) => ({ type: 'file' as const, item })),
  ];

  const Row = ({ index, style }: ListChildComponentProps<{ index: number }>) => {
    const entry = listData[index];
    if (entry.type === 'folder') {
      const folder = entry.folder;
      return (
        <div style={style}>
          <Card
            className={`cursor-pointer p-4 transition-all hover:bg-gray-50 ${
              selectedItems.has(folder.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
            }`}
            onClick={(e) => handleItemClick(folder.id, e)}
            onDoubleClick={() => handleFolderDoubleClick(folder)}
            onContextMenu={(e) => handleContextMenu(e, folder, 'folder')}
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
                {formatVaultDate(folder.updatedAt, 'MMM d, yyyy')}
              </span>
            </div>
          </Card>
        </div>
      );
    }
    const item = entry.item as VaultItem;
    return (
      <div style={style}>
        <Card
          className={`p-4 cursor-pointer transition-all hover:bg-gray-50 ${
            selectedItems.has(item.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
          }`}
          onClick={(e) => handleItemClick(item.id, e)}
          onDoubleClick={() => handleItemDoubleClick(item)}
          onContextMenu={(e) => handleContextMenu(e, item, 'file')}
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
                      className="object-cover rounded"
                      sizes="48px"
                      unoptimized={true}
                      onError={(e) => {
                        const imgElement = e.target as HTMLImageElement;
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
                  {formatFileSize(item.size || 0)}
                </p>
              </div>
            </div>
            <span className="text-sm text-gray-500">
              {formatVaultDate(item.updatedAt, 'MMM d, yyyy')}
            </span>
          </div>
        </Card>
      </div>
    );
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

  // State to track loading thumbnails
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());

  // Function to load thumbnail URL if not available
  const loadThumbnailUrl = async (item: VaultItem) => {
    // Skip if URL already exists or is being loaded
    if (item.url || item.thumbnailUrl || loadingThumbnails.has(item.id)) {
      return;
    }

    setLoadingThumbnails(prev => new Set(prev).add(item.id));
    
    try {
      const url = await vaultService.getDownloadUrl(item);
      // Update the item with the new URL
      setItems(prev => prev.map(i => 
        i.id === item.id ? { ...i, url, thumbnailUrl: url } : i
      ));
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
          <div className="mt-6">
            <h1 className="text-2xl font-bold text-gray-900">Family Vault</h1>
          </div>
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 w-full sm:w-auto mt-4 md:mt-6">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={!isOnline}
              className="bg-[#0A5C36] hover:bg-[#0A5C36]/90 text-white"
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
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
          </div>

          <div className="flex items-center gap-2">
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

        {/* Content Container */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
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

          {/* Divider */}
          <div className="border-b border-gray-200 mb-4"></div>

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
                <Button 
                  onClick={() => fileInputRef.current?.click()} 
                  disabled={!isOnline}
                  className="bg-[#0A5C36] hover:bg-[#0A5C36]/90 text-white"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Files
                </Button>
              )}
            </Card>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" onClick={handleContainerClick}>
              {/* Folders */}
              {filteredFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="group cursor-pointer relative"
                  onClick={(e) => handleItemClick(folder.id, e)}
                  onDoubleClick={() => handleFolderDoubleClick(folder)}
                  onContextMenu={(e) => handleContextMenu(e, folder, 'folder')}
                >
                  <Card className={`p-4 text-center transition-all hover:bg-gray-50 ${
                    selectedItems.has(folder.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                  }`}>
                    <Folder className="mx-auto mb-2 h-12 w-12 text-blue-500" />
                    <p className="truncate text-sm font-medium">{folder.name}</p>
                    <p className="text-xs text-gray-500">{folder.itemCount} items</p>
                  </Card>
                </div>
              ))}

              {/* Files */}
              {filteredItems.map((item) => (
                <div 
                  key={item.id} 
                  className="group relative cursor-pointer"
                  onClick={(e) => handleItemClick(item.id, e)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item, 'file')}
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
                              className="object-contain rounded"
                              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
                              unoptimized={true}
                              onError={(e) => {
                                // Fall back to icon if image fails to load
                                const imgElement = e.target as HTMLImageElement;
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
                    <p className="text-xs text-gray-500">{formatFileSize(item.size || 0)}</p>
                  </Card>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-96" onClick={handleContainerClick}>
              <AutoSizer>
                {({ height, width }) => (
                  <VirtualizedList
                    height={height}
                    width={width}
                    itemCount={listData.length}
                    itemSize={80}
                  >
                    {Row}
                  </VirtualizedList>
                )}
              </AutoSizer>
            </div>
          )}
        </div>

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

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed z-50"
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          >
            <Card className="w-48 p-1 shadow-lg">
              <div className="py-1">
                {contextMenu.type === 'file' && (
                  <>
                    <button
                      className="flex w-full items-center px-3 py-2 text-sm hover:bg-gray-100"
                      onClick={() => {
                        setPreviewItem(contextMenu.item as VaultItem);
                        setContextMenu(null);
                      }}
                    >
                      <FileImage className="mr-2 h-4 w-4" />
                      Preview
                    </button>
                    <button
                      className="flex w-full items-center px-3 py-2 text-sm hover:bg-gray-100"
                      onClick={() => {
                        handleDownload(contextMenu.item as VaultItem);
                        setContextMenu(null);
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </button>
                    <button
                      className="flex w-full items-center px-3 py-2 text-sm hover:bg-gray-100"
                      onClick={() => {
                        handleShare(contextMenu.item as VaultItem);
                        setContextMenu(null);
                      }}
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </button>
                    <div className="my-1 border-t" />
                    <button
                      className="flex w-full items-center px-3 py-2 text-sm text-red-600 hover:bg-gray-100"
                      onClick={() => {
                        handleDelete(contextMenu.item as VaultItem);
                        setContextMenu(null);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </button>
                  </>
                )}
                {contextMenu.type === 'folder' && (
                  <>
                    <button
                      className="flex w-full items-center px-3 py-2 text-sm hover:bg-gray-100"
                      onClick={() => {
                        handleFolderDoubleClick(contextMenu.item as VaultFolder);
                        setContextMenu(null);
                      }}
                    >
                      <Folder className="mr-2 h-4 w-4" />
                      Open
                    </button>
                    <div className="my-1 border-t" />
                    <button
                      className="flex w-full items-center px-3 py-2 text-sm text-red-600 hover:bg-gray-100"
                      onClick={() => {
                        // Add folder delete functionality here
                        setContextMenu(null);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </button>
                  </>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* File Preview Modal */}
        <FilePreview
          item={previewItem}
          isOpen={!!previewItem}
          onClose={() => setPreviewItem(null)}
          onDownload={handleDownload}
          onShare={handleShare}
        />
      </div>
    </div>
  );
}