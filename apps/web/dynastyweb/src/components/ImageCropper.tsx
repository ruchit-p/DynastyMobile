'use client';

import { useState, useRef, useCallback } from 'react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ZoomIn, ZoomOut, Check, X } from 'lucide-react';
import Image from 'next/image';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
  aspectRatio?: number;
  title?: string;
  circleOverlay?: boolean;
}

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
) {
  // Calculate the maximum possible crop size while maintaining aspect ratio
  let cropWidth, cropHeight;
  
  if (mediaWidth / mediaHeight > aspect) {
    // Image is wider than the aspect ratio
    cropHeight = 100;
    cropWidth = (cropHeight * aspect * mediaWidth) / mediaHeight;
  } else {
    // Image is taller than the aspect ratio
    cropWidth = 100;
    cropHeight = (cropWidth / aspect * mediaHeight) / mediaWidth;
  }
  
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: cropWidth,
        height: cropHeight,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

const ImageCropper = ({ 
  imageSrc, 
  onCropComplete, 
  onCancel, 
  aspectRatio = 1, // Default to square crop (1:1)
  title = 'Crop Image',
  circleOverlay = false
}: ImageCropperProps) => {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);

  // When the image loads, set up an initial centered crop
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    
    // This creates a centered crop with the specified aspect ratio
    const initialCrop = centerAspectCrop(width, height, aspectRatio);
    setCrop(initialCrop);
  }, [aspectRatio]);

  // Handle slider change for zoom
  const handleZoomChange = (value: number[]) => {
    setScale(value[0]);
  };

  // This function draws the cropped image to a canvas and returns a Blob
  const getCroppedImg = useCallback(async (): Promise<Blob> => {
    if (!imgRef.current || !completedCrop) {
      throw new Error('Crop is not complete');
    }

    return new Promise((resolve, reject) => {
      try {
        // Create a new image element to draw from
        const image = document.createElement('img') as HTMLImageElement;
        image.crossOrigin = "anonymous"; // Handle CORS if needed
        image.src = imageSrc;
        
        // When the image is loaded, draw it to the canvas
        image.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('No 2d context'));
            return;
          }
          
          // Calculate dimensions
          const scaleX = image.naturalWidth / imgRef.current!.width;
          const scaleY = image.naturalHeight / imgRef.current!.height;
          
          // Set canvas size to the cropped area
          const pixelRatio = window.devicePixelRatio;
          canvas.width = completedCrop.width * scaleX * pixelRatio;
          canvas.height = completedCrop.height * scaleY * pixelRatio;
          
          // Scale the context to handle device pixel ratio
          ctx.scale(pixelRatio, pixelRatio);
          ctx.imageSmoothingQuality = 'high';
          
          // Calculate source and destination values
          const sourceX = completedCrop.x * scaleX;
          const sourceY = completedCrop.y * scaleY;
          const sourceWidth = completedCrop.width * scaleX;
          const sourceHeight = completedCrop.height * scaleY;
          
          // Fill the canvas with white background
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw the cropped image to the canvas
          ctx.drawImage(
            image,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            canvas.width / pixelRatio,
            canvas.height / pixelRatio
          );
          
          // If using circle overlay, create circular crop
          if (circleOverlay) {
            const centerX = canvas.width / (2 * pixelRatio);
            const centerY = canvas.height / (2 * pixelRatio);
            const radius = Math.min(centerX, centerY);
            
            // Create a circular clipping path
            ctx.globalCompositeOperation = 'destination-in';
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI, true);
            ctx.fill();
          }
          
          // Convert to blob with high quality
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                console.error('Canvas is empty');
                reject(new Error('Canvas is empty'));
                return;
              }
              
              console.log('Blob created:', blob.size, 'bytes');
              resolve(blob);
            },
            'image/jpeg',
            0.95  // High quality
          );
        };
        
        image.onerror = (error: unknown) => {
          console.error('Error loading image for cropping:', error);
          reject(new Error('Failed to load image for cropping'));
        };
      } catch (error) {
        console.error('Error in getCroppedImg:', error);
        reject(error);
      }
    });
  }, [completedCrop, imageSrc, circleOverlay]);

  // Handle the crop completion
  const handleComplete = async () => {
    try {
      if (!completedCrop) {
        console.error('No crop data available');
        return;
      }
      
      const croppedBlob = await getCroppedImg();
      onCropComplete(croppedBlob);
    } catch (error) {
      console.error('Error creating cropped image:', error);
    }
  };

  // Custom styles for circular overlay
  const circleStyle = circleOverlay ? {
    '--ReactCrop-selection-border-color': '#0A5C36',
    '--ReactCrop-selection-background-color': 'rgba(10, 92, 54, 0.1)',
    '--ReactCrop-selection-border-width': '3px',
    '--ReactCrop-crop-selection': 'round'
  } as React.CSSProperties : {};

  return (
    <div className="flex flex-col items-center p-4 bg-white rounded-lg shadow-lg w-full">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">Drag to adjust or click Apply to use this crop</p>
      
      <div className="mb-4 relative flex justify-center items-center w-full" style={{ 
        height: 'auto',
        aspectRatio: '1',
        maxHeight: '60vh'
      }}>
        <ReactCrop
          crop={crop}
          onChange={(c) => setCrop(c)}
          onComplete={(c) => setCompletedCrop(c)}
          aspect={aspectRatio}
          className="max-h-full w-auto mx-auto"
          circularCrop={circleOverlay}
          style={circleStyle}
        >
          <Image
            ref={imgRef}
            src={imageSrc}
            alt="Crop me"
            width={400}
            height={400}
            style={{ 
              transform: `scale(${scale})`,
              maxHeight: '60vh',
              width: 'auto',
              objectFit: 'contain',
              display: 'block',
              margin: '0 auto'
            }}
            onLoad={onImageLoad}
            priority={true}
            unoptimized={true}
          />
        </ReactCrop>
      </div>

      <div className="w-full px-4 mb-4">
        <div className="flex items-center gap-2 max-w-xs mx-auto">
          <ZoomOut className="h-4 w-4 text-gray-500 flex-shrink-0" />
          <Slider
            defaultValue={[1]}
            min={0.5}
            max={3}
            step={0.1}
            value={[scale]}
            onValueChange={handleZoomChange}
            className="flex-1"
          />
          <ZoomIn className="h-4 w-4 text-gray-500 flex-shrink-0" />
        </div>
      </div>

      <div className="flex justify-center gap-4 w-full px-4">
        <Button
          variant="outline"
          onClick={onCancel}
          className="flex items-center gap-2 flex-1 max-w-[120px]"
        >
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button
          onClick={handleComplete}
          className="flex items-center gap-2 bg-[#0A5C36] hover:bg-[#084529] flex-1 max-w-[120px]"
        >
          <Check className="h-4 w-4" /> Apply
        </Button>
      </div>
    </div>
  );
};

export default ImageCropper; 