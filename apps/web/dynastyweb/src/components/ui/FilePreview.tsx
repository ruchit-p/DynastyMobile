'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Download, Share2, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { vaultService, formatFileSize, getFileIcon } from '@/services/VaultService';
import type { VaultItem } from '@/services/VaultService';

interface FilePreviewProps {
  item: VaultItem;
  onClose: () => void;
  onDownload?: () => void;
  onShare?: () => void;
}

export function FilePreview({ item, onClose, onDownload, onShare }: FilePreviewProps) {
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (canPreview(item.mimeType)) {
        const blob = await vaultService.downloadFile(item);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } else {
        setError('Preview not available for this file type');
      }
    } catch (error) {
      console.error('Error loading preview:', error);
      setError('Failed to load preview');
    } finally {
      setLoading(false);
    }
  }, [item]);

  useEffect(() => {
    loadPreview();
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [item.id, loadPreview, previewUrl]);

  const canPreview = (mimeType?: string): boolean => {
    if (!mimeType) return false;
    
    const previewableTypes = [
      'image/',
      'video/',
      'audio/',
      'application/pdf',
      'text/',
    ];
    
    return previewableTypes.some(type => mimeType.startsWith(type));
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      );
    }

    if (error || !previewUrl) {
      return (
        <div className="flex h-full flex-col items-center justify-center">
          <div className="text-6xl mb-4">{getFileIcon(item.mimeType)}</div>
          <h3 className="text-lg font-semibold mb-2">{item.name}</h3>
          <p className="text-sm text-gray-600 mb-4">
            {error || 'Preview not available'}
          </p>
          <div className="flex gap-2">
            {onDownload && (
              <Button onClick={onDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            )}
            {onShare && (
              <Button variant="outline" onClick={onShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            )}
          </div>
        </div>
      );
    }

    const mimeType = item.mimeType || '';

    if (mimeType.startsWith('image/')) {
      return (
        <div className="relative h-full overflow-auto bg-gray-100">
          <div className="flex h-full items-center justify-center p-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={item.name}
              className="max-h-full max-w-full object-contain transition-transform"
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
              }}
            />
          </div>
        </div>
      );
    }

    if (mimeType.startsWith('video/')) {
      return (
        <div className="flex h-full items-center justify-center bg-black">
          <video
            src={previewUrl}
            controls
            className="max-h-full max-w-full"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (mimeType.startsWith('audio/')) {
      return (
        <div className="flex h-full flex-col items-center justify-center">
          <div className="text-6xl mb-4">🎵</div>
          <h3 className="text-lg font-semibold mb-4">{item.name}</h3>
          <audio src={previewUrl} controls className="w-full max-w-md">
            Your browser does not support the audio tag.
          </audio>
        </div>
      );
    }

    if (mimeType === 'application/pdf') {
      return (
        <iframe
          src={`${previewUrl}#toolbar=0`}
          className="h-full w-full"
          title={item.name}
        />
      );
    }

    if (mimeType.startsWith('text/')) {
      return (
        <iframe
          src={previewUrl}
          className="h-full w-full bg-white"
          title={item.name}
        />
      );
    }

    return null;
  };

  const showZoomControls = item.mimeType?.startsWith('image/') && previewUrl && !error;

  return (
    <div className="fixed inset-0 z-50 bg-black/80">
      <div className="relative h-full">
        {/* Header */}
        <div className="absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/50 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="text-white">
              <h3 className="text-lg font-semibold">{item.name}</h3>
              <p className="text-sm opacity-80">
                {formatFileSize(item.size || 0)} • {item.mimeType}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {showZoomControls && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomOut}
                    className="text-white hover:bg-white/20"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomIn}
                    className="text-white hover:bg-white/20"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRotate}
                    className="text-white hover:bg-white/20"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </>
              )}
              {onDownload && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDownload}
                  className="text-white hover:bg-white/20"
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
              {onShare && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onShare}
                  className="text-white hover:bg-white/20"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="h-full pt-16">
          {renderPreview()}
        </div>
      </div>
    </div>
  );
}