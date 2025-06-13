'use client';

import React, { useState, useCallback, useRef } from 'react';
import {
  Upload,
  X,
  FileIcon,
  Image,
  Video,
  Music,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { b2MediaService } from '@/services/B2MediaService';
import StorageUtils, { StorageProvider, StorageConfig } from '@/utils/storageUtils';
import { useToast } from '@/hooks/use-toast';

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  url?: string;
  provider?: StorageProvider;
}

interface EnhancedMediaUploadProps {
  onUploadComplete?: (files: Array<{ file: File; url: string; provider: StorageProvider }>) => void;
  onUploadError?: (file: File, error: string) => void;
  maxFiles?: number;
  maxFileSize?: number;
  acceptedFileTypes?: string[];
  uploadType?: 'media' | 'vault' | 'profile' | 'story' | 'event';
  userId?: string;
  storyId?: string;
  eventId?: string;
  parentId?: string | null;
  preferredProvider?: StorageProvider;
  className?: string;
}

export function EnhancedMediaUpload({
  onUploadComplete,
  onUploadError,
  maxFiles = 10,
  maxFileSize,
  acceptedFileTypes,
  uploadType = 'media',
  userId,
  storyId,
  eventId,
  parentId: _parentId, // eslint-disable-line @typescript-eslint/no-unused-vars
  preferredProvider,
  className,
}: EnhancedMediaUploadProps) {
  // Note: parentId is part of the interface but not currently used in this implementation
  // It may be used for hierarchical organization in future versions
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Get recommended provider for file type
  const getRecommendedProvider = useCallback(
    (file: File): StorageProvider => {
      if (preferredProvider) return preferredProvider;
      return StorageConfig.getRecommendedProvider(file);
    },
    [preferredProvider]
  );

  // Validate file before upload
  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file size
      const provider = getRecommendedProvider(file);
      const maxSize = maxFileSize || StorageUtils.getMaxFileSize(provider);

      if (file.size > maxSize) {
        return `File size exceeds ${StorageUtils.formatFileSize(
          maxSize
        )} limit for ${provider.toUpperCase()}`;
      }

      // Check file type
      if (acceptedFileTypes && !StorageUtils.isValidFileType(file, acceptedFileTypes)) {
        return `File type ${file.type} is not allowed`;
      }

      // Basic security check
      if (!StorageUtils.isValidFileType(file)) {
        return 'File type is not supported for security reasons';
      }

      return null;
    },
    [maxFileSize, acceptedFileTypes, getRecommendedProvider]
  );

  // Handle file selection
  const handleFileSelect = useCallback(
    (selectedFiles: FileList) => {
      const newFiles: UploadFile[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        // Check if we're at max files limit
        if (files.length + newFiles.length >= maxFiles) {
          toast({
            title: 'Upload Limit Reached',
            description: `Maximum ${maxFiles} files allowed`,
            variant: 'destructive',
          });
          break;
        }

        // Validate file
        const error = validateFile(file);
        if (error) {
          toast({
            title: 'Invalid File',
            description: error,
            variant: 'destructive',
          });
          continue;
        }

        const uploadFile: UploadFile = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          progress: 0,
          status: 'pending',
          provider: getRecommendedProvider(file),
        };

        newFiles.push(uploadFile);
      }

      setFiles(prev => [...prev, ...newFiles]);
    },
    [files.length, maxFiles, validateFile, getRecommendedProvider, toast]
  );

  // Upload a single file
  const uploadFile = useCallback(
    async (uploadFile: UploadFile) => {
      const { id, file, provider } = uploadFile;

      // Update status to uploading
      setFiles(prev => prev.map(f => (f.id === id ? { ...f, status: 'uploading' as const } : f)));

      try {
        let url: string;

        // Progress callback
        const onProgress = (progress: number) => {
          setFiles(prev => prev.map(f => (f.id === id ? { ...f, progress } : f)));
        };

        const callbacks = {
          onProgress,
          onError: (error: Error) => {
            console.error('Upload error:', error);
          },
        };

        // Upload based on type and provider
        switch (uploadType) {
          case 'vault':
            if (!userId) throw new Error('User ID required for vault uploads');
            // For vault uploads, we use the VaultService which handles encryption
            throw new Error('Use VaultService directly for vault uploads with encryption support');

          case 'profile':
            if (!userId) throw new Error('User ID required for profile uploads');
            url = await b2MediaService.uploadProfilePicture(file, userId, callbacks);
            break;

          case 'story':
            if (!storyId) throw new Error('Story ID required for story uploads');
            const storyType = file.type.startsWith('image/')
              ? 'image'
              : file.type.startsWith('video/')
              ? 'video'
              : 'audio';

            url = await b2MediaService.uploadStoryMedia(file, storyId, storyType, callbacks);
            break;

          case 'event':
            if (!eventId) throw new Error('Event ID required for event uploads');
            url = await b2MediaService.uploadEventCoverPhoto(file, eventId, callbacks);
            break;

          default:
            // Generic upload
            const path = `uploads/${userId || 'anonymous'}/${Date.now()}_${file.name}`;
            url = await b2MediaService.uploadGenericFile(
              file,
              path,
              { compress: true },
              callbacks
            );
        }

        // Update status to completed
        setFiles(prev =>
          prev.map(f =>
            f.id === id ? { ...f, status: 'completed' as const, url, progress: 100 } : f
          )
        );

        // Notify parent component
        if (onUploadComplete) {
          onUploadComplete([{ file, url, provider: provider! }]);
        }

        toast({
          title: 'Upload Successful',
          description: `${file.name} uploaded successfully to ${provider?.toUpperCase()}`,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';

        // Update status to error
        setFiles(prev =>
          prev.map(f => (f.id === id ? { ...f, status: 'error' as const, error: errorMessage } : f))
        );

        // Notify parent component
        if (onUploadError) {
          onUploadError(file, errorMessage);
        }

        toast({
          title: 'Upload Failed',
          description: `${file.name}: ${errorMessage}`,
          variant: 'destructive',
        });
      }
    },
    [uploadType, userId, storyId, eventId, onUploadComplete, onUploadError, toast]
  );

  // Upload all pending files
  const uploadAllFiles = useCallback(async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');

    // Upload files concurrently (but limit concurrency)
    const concurrencyLimit = 3;
    for (let i = 0; i < pendingFiles.length; i += concurrencyLimit) {
      const batch = pendingFiles.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map(uploadFile));
    }
  }, [files, uploadFile]);

  // Remove file from list
  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        handleFileSelect(droppedFiles);
      }
    },
    [handleFileSelect]
  );

  // File input change handler
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelect(e.target.files);
        e.target.value = ''; // Reset input
      }
    },
    [handleFileSelect]
  );

  // Get file icon
  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="h-4 w-4" />; // eslint-disable-line jsx-a11y/alt-text
    if (file.type.startsWith('video/')) return <Video className="h-4 w-4" />;
    if (file.type.startsWith('audio/')) return <Music className="h-4 w-4" />;
    return <FileIcon className="h-4 w-4" />;
  };

  // Get status icon
  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const hasUploadableFiles = files.some(f => f.status === 'pending');
  const allCompleted = files.length > 0 && files.every(f => f.status === 'completed');

  return (
    <div className={className}>
      {/* Upload Area */}
      <Card
        className={`border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Drop files here or click to browse</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Supports multiple storage providers (B2, R2, Firebase)
          <br />
          Max {maxFiles} files, up to{' '}
          {maxFileSize ? StorageUtils.formatFileSize(maxFileSize) : '5GB'} each
        </p>

        <Button onClick={() => fileInputRef.current?.click()} variant="outline">
          Browse Files
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={acceptedFileTypes?.join(',')}
          onChange={handleFileInputChange}
        />
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Files ({files.length})</h4>

            {hasUploadableFiles && (
              <Button onClick={uploadAllFiles} size="sm">
                Upload All
              </Button>
            )}
          </div>

          {files.map(uploadFile => (
            <Card key={uploadFile.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {getFileIcon(uploadFile.file)}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{uploadFile.file.name}</p>
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      <span>{StorageUtils.formatFileSize(uploadFile.file.size)}</span>
                      {uploadFile.provider && (
                        <Badge variant="outline" className="text-xs">
                          {uploadFile.provider.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {getStatusIcon(uploadFile.status)}

                  {uploadFile.status !== 'completed' && (
                    <Button size="sm" variant="ghost" onClick={() => removeFile(uploadFile.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {uploadFile.status === 'uploading' && (
                <div className="mt-3">
                  <Progress value={uploadFile.progress} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {Math.round(uploadFile.progress)}% uploaded
                  </p>
                </div>
              )}

              {/* Error Message */}
              {uploadFile.status === 'error' && uploadFile.error && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                  {uploadFile.error}
                </div>
              )}

              {/* Success Message */}
              {uploadFile.status === 'completed' && uploadFile.url && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-600">
                  Successfully uploaded to {uploadFile.provider?.toUpperCase()}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      {allCompleted && (
        <Card className="mt-6 p-4 bg-green-50 border-green-200">
          <div className="flex items-center space-x-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">All files uploaded successfully!</span>
          </div>
        </Card>
      )}
    </div>
  );
}

export default EnhancedMediaUpload;
