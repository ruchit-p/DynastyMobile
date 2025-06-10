'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Share2,
  ExternalLink,
  FileAudio,
  File,
} from 'lucide-react';
import { VaultItem, vaultService, formatFileSize } from '@/services/VaultService';
import { formatVaultDate } from '@/utils/dateUtils';
import { useToast } from '@/hooks/use-toast';

interface FilePreviewProps {
  item: VaultItem | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (item: VaultItem) => void;
  onShare: (item: VaultItem) => void;
}

export default function FilePreview({ item, isOpen, onClose, onDownload, onShare }: FilePreviewProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (item && isOpen) {
      loadPreview();
    } else {
      // Clean up when closing
      setPreviewContent(null);
      if (previewUrl && !item?.url && !item?.thumbnailUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setZoom(1);
      setRotation(0);
    }
    return () => {
      if (previewUrl && !item?.url && !item?.thumbnailUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, isOpen]);

  const loadPreview = async () => {
    if (!item) return;

    // For images, check if we have a URL or need to fetch one
    if (item.mimeType?.startsWith('image/')) {
      if (item.url || item.thumbnailUrl) {
        setPreviewUrl(item.url || item.thumbnailUrl || null);
        return;
      } else {
        // Need to fetch the URL
        setLoading(true);
        try {
          const url = await vaultService.getDownloadUrl(item);
          setPreviewUrl(url);
        } catch (error) {
          console.error('Error loading image URL:', error);
          toast({
            title: 'Preview Error',
            description: 'Failed to load image preview',
            variant: 'destructive',
          });
        } finally {
          setLoading(false);
        }
        return;
      }
    }

    // For text and JSON files, load content as text
    if (item.mimeType?.startsWith('text/') || 
        item.mimeType === 'application/json' || 
        item.name.endsWith('.json') ||
        item.name.endsWith('.txt') ||
        item.name.endsWith('.md') ||
        item.name.endsWith('.js') ||
        item.name.endsWith('.ts') ||
        item.name.endsWith('.jsx') ||
        item.name.endsWith('.tsx') ||
        item.name.endsWith('.css') ||
        item.name.endsWith('.html') ||
        item.name.endsWith('.xml') ||
        item.name.endsWith('.yaml') ||
        item.name.endsWith('.yml')) {
      setLoading(true);
      try {
        const blob = await vaultService.downloadFile(item);
        const text = await blob.text();
        setPreviewContent(text);
      } catch (error) {
        console.error('Error loading preview:', error);
        toast({
          title: 'Preview Error',
          description: 'Failed to load file preview',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    // For other files, we might need to download and create object URL
    if (canPreviewInBrowser(item)) {
      setLoading(true);
      try {
        const blob = await vaultService.downloadFile(item);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } catch (error) {
        console.error('Error loading preview:', error);
        toast({
          title: 'Preview Error',
          description: 'Failed to load file preview',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const canPreviewInBrowser = (item: VaultItem) => {
    if (!item.mimeType) return false;
    return (
      item.mimeType.startsWith('image/') ||
      item.mimeType.startsWith('video/') ||
      item.mimeType.startsWith('audio/') ||
      item.mimeType === 'application/pdf' ||
      item.mimeType.startsWith('text/')
    );
  };

  const handleZoomIn = () => setZoom(Math.min(zoom + 0.25, 3));
  const handleZoomOut = () => setZoom(Math.max(zoom - 0.25, 0.5));
  const handleRotate = () => setRotation((rotation + 90) % 360);

  const renderPreview = () => {
    if (!item) return null;

    if (loading) {
      return (
        <div className="flex h-96 items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      );
    }

    // Image preview
    if (item.mimeType?.startsWith('image/')) {
      return (
        <div className="relative flex h-96 items-center justify-center overflow-hidden bg-gray-100">
          {previewUrl && (
            <div
              className="relative transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
            >
              <Image
                src={previewUrl}
                alt={item.name}
                width={800}
                height={600}
                className="max-h-96 w-auto object-contain"
                priority
                unoptimized={true}
              />
            </div>
          )}
        </div>
      );
    }

    // Video preview
    if (item.mimeType?.startsWith('video/')) {
      return (
        <div className="relative flex h-96 items-center justify-center bg-black">
          {previewUrl && (
            <video
              controls
              className="max-h-96 w-full"
              src={previewUrl}
            >
              Your browser does not support the video tag.
            </video>
          )}
        </div>
      );
    }

    // Audio preview
    if (item.mimeType?.startsWith('audio/')) {
      return (
        <div className="flex h-48 flex-col items-center justify-center space-y-4 bg-gray-100">
          <FileAudio className="h-16 w-16 text-green-500" />
          {previewUrl && (
            <audio controls className="w-full max-w-md" src={previewUrl}>
              Your browser does not support the audio tag.
            </audio>
          )}
        </div>
      );
    }

    // PDF preview
    if (item.mimeType === 'application/pdf') {
      return (
        <div className="h-96">
          {previewUrl && (
            <iframe
              src={previewUrl}
              className="h-full w-full"
              title={item.name}
            />
          )}
        </div>
      );
    }

    // Text/Code file preview
    if (previewContent !== null) {
      let formattedContent = previewContent;
      let language = 'plaintext';

      // Determine language based on file extension
      if (item.mimeType === 'application/json' || item.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(previewContent);
          formattedContent = JSON.stringify(parsed, null, 2);
          language = 'json';
        } catch {
          // Not valid JSON, show as plain text
        }
      } else if (item.name.endsWith('.js') || item.name.endsWith('.jsx')) {
        language = 'javascript';
      } else if (item.name.endsWith('.ts') || item.name.endsWith('.tsx')) {
        language = 'typescript';
      } else if (item.name.endsWith('.css')) {
        language = 'css';
      } else if (item.name.endsWith('.html')) {
        language = 'html';
      } else if (item.name.endsWith('.xml')) {
        language = 'xml';
      } else if (item.name.endsWith('.yaml') || item.name.endsWith('.yml')) {
        language = 'yaml';
      } else if (item.name.endsWith('.md')) {
        language = 'markdown';
      }

      // Apply basic syntax highlighting colors
      const getTextColor = () => {
        switch (language) {
          case 'json':
            return 'text-green-300';
          case 'javascript':
          case 'typescript':
            return 'text-blue-300';
          case 'css':
            return 'text-purple-300';
          case 'html':
          case 'xml':
            return 'text-orange-300';
          case 'yaml':
            return 'text-yellow-300';
          case 'markdown':
            return 'text-gray-200';
          default:
            return 'text-gray-300';
        }
      };

      return (
        <div className="relative h-96">
          <div className="absolute right-2 top-2 rounded bg-gray-800 px-2 py-1 text-xs text-gray-400">
            {language}
          </div>
          <div className="h-full overflow-auto bg-gray-900 p-4">
            <pre className={`text-sm ${getTextColor()} font-mono`}>
              <code style={{ whiteSpace: 'pre', wordWrap: 'normal' }}>{formattedContent}</code>
            </pre>
          </div>
        </div>
      );
    }

    // No preview available
    return (
      <div className="flex h-48 flex-col items-center justify-center space-y-4 text-gray-500">
        <File className="h-16 w-16" />
        <p>Preview not available for this file type</p>
        <Button onClick={() => onDownload(item)}>
          <Download className="mr-2 h-4 w-4" />
          Download to view
        </Button>
      </div>
    );
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="pr-8">{item.name}</DialogTitle>
            <div className="flex items-center space-x-2">
              {/* Zoom controls for images */}
              {item.mimeType?.startsWith('image/') && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomOut}
                    disabled={zoom <= 0.5}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-500">{Math.round(zoom * 100)}%</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomIn}
                    disabled={zoom >= 3}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleRotate}>
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <div className="mx-2 h-6 w-px bg-gray-300" />
                </>
              )}
              
              {/* Action buttons */}
              <Button variant="ghost" size="icon" onClick={() => onShare(item)}>
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDownload(item)}>
                <Download className="h-4 w-4" />
              </Button>
              {item.url && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.open(item.url, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* File info */}
        <div className="mb-4 flex items-center space-x-4 text-sm text-gray-500">
          <span>{formatFileSize(item.size || 0)}</span>
          <span>•</span>
          <span>{item.mimeType || 'Unknown type'}</span>
          <span>•</span>
          <span>Modified {formatVaultDate(item.updatedAt, 'MMM d, yyyy h:mm a')}</span>
        </div>

        {/* Preview content */}
        <div className="overflow-hidden rounded-lg border">
          {renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
}