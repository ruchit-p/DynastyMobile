'use client';

import { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { landingImageOptimizer } from '@/utils/landingImageOptimizer';
import { useAuth } from '@/context/AuthContext';

interface UploadedImage {
  name: string;
  status: 'uploading' | 'success' | 'error';
  urls?: Record<string, string>;
  error?: string;
}

export default function LandingImageManager() {
  const { currentUser } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [generatedConfig, setGeneratedConfig] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Check admin access (you should implement proper role checking)
  const isAdmin = currentUser?.email?.includes('@mydynastyapp.com');

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>You don't have permission to access this page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate files
    const validFiles = files.filter(file => {
      const isValid = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type);
      const isValidSize = file.size <= 50 * 1024 * 1024; // 50MB

      if (!isValid) {
        toast({
          title: 'Invalid file type',
          description: `${file.name} is not a supported image format`,
          variant: 'destructive',
        });
      } else if (!isValidSize) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds 50MB limit`,
          variant: 'destructive',
        });
      }

      return isValid && isValidSize;
    });

    if (validFiles.length === 0) return;

    setUploading(true);
    setProgress(0);
    setUploadedImages(
      validFiles.map(f => ({
        name: f.name,
        status: 'uploading' as const,
      }))
    );

    try {
      const results = await landingImageOptimizer.optimizeLandingImages(
        validFiles,
        {
          basePath: 'landing/slideshow',
          quality: 0.85,
        },
        {
          onProgress: (current, total) => {
            setProgress((current / total) * 100);
          },
          onError: (error, fileName) => {
            setUploadedImages(prev =>
              prev.map(img =>
                img.name === fileName
                  ? { ...img, status: 'error' as const, error: error.message }
                  : img
              )
            );
          },
        }
      );

      // Update status for successful uploads
      setUploadedImages(prev =>
        prev.map(img => {
          const result = Array.from(results.entries()).find(([name]) => img.name.includes(name));

          if (result) {
            return {
              ...img,
              status: 'success' as const,
              urls: result[1].optimized,
            };
          }

          return img.status === 'uploading'
            ? { ...img, status: 'error' as const, error: 'Upload failed' }
            : img;
        })
      );

      // Generate configuration
      const config = landingImageOptimizer.generateExportConfig(results);
      setGeneratedConfig(config);

      toast({
        title: 'Upload complete',
        description: `Successfully processed ${results.size} images`,
      });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const copyConfig = () => {
    navigator.clipboard.writeText(generatedConfig);
    toast({
      title: 'Copied to clipboard',
      description: 'Configuration has been copied to your clipboard',
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Landing Page Image Manager</h1>
        <p className="text-dynasty-neutral-dark">
          Upload and optimize images for the landing page slideshow
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Upload Images</CardTitle>
          <CardDescription>
            Select multiple images to optimize and upload to cloud storage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
              id="image-upload"
            />

            <div className="flex items-center gap-4">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Select Images
              </Button>

              {uploading && (
                <div className="flex items-center gap-2 text-sm text-dynasty-neutral-dark">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </div>
              )}
            </div>

            {uploading && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-dynasty-neutral-dark">
                  {Math.round(progress)}% complete
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {uploadedImages.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Upload Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadedImages.map((image, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <ImageIcon className="h-5 w-5 text-dynasty-neutral-dark" />
                    <span className="text-sm font-medium">{image.name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {image.status === 'uploading' && (
                      <Loader2 className="h-4 w-4 animate-spin text-dynasty-neutral-dark" />
                    )}
                    {image.status === 'success' && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    {image.status === 'error' && (
                      <>
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-xs text-red-600">{image.error}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {generatedConfig && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Configuration</CardTitle>
            <CardDescription>
              Copy this configuration to update your landing page images
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <pre className="p-4 bg-gray-100 rounded-lg overflow-x-auto text-sm">
                  <code>{generatedConfig}</code>
                </pre>
              </div>

              <Button onClick={copyConfig} variant="outline">
                Copy Configuration
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
