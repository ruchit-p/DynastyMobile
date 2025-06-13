"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Upload, X } from "lucide-react"
import Image from "next/image"

interface MediaUploadProps {
  type: "image" | "video" | "audio" | "media"
  onFileSelect: (file: File) => void
  onMultipleFilesSelect?: (files: File[]) => void
  value?: string | string[] | File[]
  onRemove?: () => void
  showMultiple?: boolean
  allowMultiple?: boolean
}

export default function MediaUpload({
  type,
  onFileSelect,
  onMultipleFilesSelect,
  value,
  onRemove,
  showMultiple = false,
  allowMultiple = false
}: MediaUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [preview, setPreview] = useState<string | string[] | File[] | null>(value || null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Set up effect to update preview when value changes
  useEffect(() => {
    setPreview(value || null)
  }, [value])

  // Determine file type based on preview value
  const getFileType = (): "image" | "video" | "audio" | "unknown" => {
    if (!preview) return type as "image" | "video" | "audio" | "unknown";
    
    if (typeof preview === 'string') {
      if (preview.startsWith('data:image') || preview.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return 'image';
      if (preview.match(/\.(mp4|webm|mov|avi)$/i)) return 'video';
      if (preview.match(/\.(mp3|wav|m4a|aac)$/i)) return 'audio';
      return 'unknown';
    }
    
    if (Array.isArray(preview) && preview.length > 0) {
      const firstItem = preview[0];
      
      if (typeof firstItem === 'string') {
        if (firstItem.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return 'image';
        if (firstItem.match(/\.(mp4|webm|mov|avi)$/i)) return 'video';
        if (firstItem.match(/\.(mp3|wav|m4a|aac)$/i)) return 'audio';
      } else if (firstItem instanceof File) {
        if (firstItem.type.startsWith('image/')) return 'image';
        if (firstItem.type.startsWith('video/')) return 'video';
        if (firstItem.type.startsWith('audio/')) return 'audio';
      }
    }
    
    return 'unknown';
  };

  const fileType = getFileType();

  const acceptedTypes = {
    image: ".png,.jpg,.jpeg,.gif,.webp",
    video: ".mp4,.webm,.mov,.avi",
    audio: ".mp3,.wav,.m4a,.aac",
    media: ".png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mov,.avi,.mp3,.wav,.m4a,.aac"
  }

  const maxSizes = {
    image: "10MB",
    video: "100MB",
    audio: "50MB",
    media: "100MB"
  }

  // Check if a file is valid based on its type
  const isValidFile = (file: File): boolean => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    
    if (type === "media") {
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension);
      const isVideo = ['mp4', 'webm', 'mov', 'avi'].includes(fileExtension);
      const isAudio = ['mp3', 'wav', 'm4a', 'aac'].includes(fileExtension);
      return isImage || isVideo || isAudio;
    } else if (type === "image") {
      return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension);
    } else if (type === "video") {
      return ['mp4', 'webm', 'mov', 'avi'].includes(fileExtension);
    } else if (type === "audio") {
      return ['mp3', 'wav', 'm4a', 'aac'].includes(fileExtension);
    }
    
    return false;
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true)
    } else if (e.type === "dragleave") {
      setIsDragging(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    
    if (files.length === 0) return;
    
    if (allowMultiple && files.length > 1) {
      // Filter valid files
      const validFiles = files.filter(isValidFile);
      
      if (validFiles.length > 0) {
        if (onMultipleFilesSelect) {
          onMultipleFilesSelect(validFiles);
        } else {
          // Fallback to handling just the first file
          handleFile(validFiles[0]);
        }
      }
    } else {
      // Single file handling
      const file = files[0];
      if (isValidFile(file)) {
        handleFile(file);
      }
    }
  }

  const handleFile = (file: File) => {
    onFileSelect(file)
    
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension);
    
    if (isImage) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      setPreview(URL.createObjectURL(file))
    }
  }

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const filesArray = Array.from(e.target.files);
    
    if (allowMultiple && filesArray.length > 1) {
      // Handle multiple files
      if (onMultipleFilesSelect) {
        onMultipleFilesSelect(filesArray);
      } else {
        // Fallback to handling just the first file
        handleFile(filesArray[0]);
      }
    } else {
      // Handle single file
      handleFile(filesArray[0]);
    }
  }

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleRemove = () => {
    setPreview(null)
    if (onRemove) onRemove()
  }

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-4 transition-colors ${
        isDragging ? "border-[#0A5C36] bg-[#0A5C36]/5" : "border-gray-300"
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes[type]}
        multiple={allowMultiple}
        className="hidden"
        onChange={handleFilesChange}
      />

      {preview ? (
        <div className="relative">
          {fileType === "image" && (
            <>
              {typeof preview === 'string' ? (
                <Image
                  src={preview}
                  alt="Preview"
                  width={400}
                  height={300}
                  className="rounded-lg object-cover"
                />
              ) : Array.isArray(preview) && preview.length > 0 && typeof preview[0] === 'string' ? (
                <Image
                  src={preview[0]}
                  alt="Preview"
                  width={400}
                  height={300}
                  className="rounded-lg object-cover"
                />
              ) : Array.isArray(preview) && preview.length > 0 && preview[0] instanceof File ? (
                <div className="text-sm text-gray-500 text-center">
                  Multiple files selected ({preview.length})
                </div>
              ) : null}
            </>
          )}
          {fileType === "video" && (
            <>
              {typeof preview === 'string' ? (
                <video src={preview} controls className="w-full rounded-lg" />
              ) : Array.isArray(preview) && preview.length > 0 && typeof preview[0] === 'string' ? (
                <video src={preview[0]} controls className="w-full rounded-lg" />
              ) : null}
            </>
          )}
          {fileType === "audio" && (
            <>
              {typeof preview === 'string' ? (
                <audio src={preview} controls className="w-full" />
              ) : Array.isArray(preview) && preview.length > 0 && typeof preview[0] === 'string' ? (
                <audio src={preview[0]} controls className="w-full" />
              ) : null}
            </>
          )}
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center py-8 cursor-pointer"
          onClick={handleClick}
        >
          <Upload className="h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            {allowMultiple ? "Click to upload multiple files or drag and drop" : "Click to upload or drag and drop"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {type === "image" && `PNG, JPG up to ${maxSizes.image}`}
            {type === "video" && `MP4, WebM, MOV, AVI up to ${maxSizes.video}`}
            {type === "audio" && `MP3, WAV up to ${maxSizes.audio}`}
            {type === "media" && `Images, Videos, Audio up to ${maxSizes.media}`}
          </p>
          {showMultiple && (
            <p className="text-xs text-gray-500 mt-1">
              {allowMultiple 
                ? "Select multiple files at once to create a carousel" 
                : "Upload multiple files to create a carousel"
              }
            </p>
          )}
        </div>
      )}
    </div>
  )
} 