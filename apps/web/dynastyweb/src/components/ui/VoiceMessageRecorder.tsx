'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, Square, Send, X, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface VoiceMessageRecorderProps {
  onSend: (audioBlob: Blob, duration: number) => void;
  onCancel: () => void;
  className?: string;
}

export function VoiceMessageRecorder({
  onSend,
  onCancel,
  className,
}: VoiceMessageRecorderProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000) as unknown as NodeJS.Timeout;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: 'Microphone access denied',
        description: 'Please allow microphone access to record voice messages',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob, recordingTime);
      cleanup();
    }
  };

  const handleCancel = () => {
    if (isRecording) {
      stopRecording();
    }
    cleanup();
    onCancel();
  };

  const cleanup = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordingTime(0);
    setIsRecording(false);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (audioRef.current.paused) {
      audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
  };

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center gap-3">
        {!isRecording && !audioUrl ? (
          // Initial state - start recording
          <>
            <Button
              size="icon"
              variant="destructive"
              onClick={startRecording}
              className="h-12 w-12 rounded-full"
            >
              <Mic className="h-6 w-6" />
            </Button>
            <span className="text-sm text-gray-600">
              Tap to start recording
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCancel}
              className="ml-auto"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : isRecording ? (
          // Recording state
          <>
            <Button
              size="icon"
              variant="destructive"
              onClick={stopRecording}
              className="h-12 w-12 rounded-full animate-pulse"
            >
              <Square className="h-6 w-6" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-medium">Recording...</span>
                <span className="text-sm text-gray-600">
                  {formatTime(recordingTime)}
                </span>
              </div>
              <div className="mt-1 h-8 flex items-center">
                {/* Waveform animation */}
                <div className="flex items-center gap-1">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-red-500 rounded-full animate-pulse"
                      style={{
                        height: `${Math.random() * 24 + 8}px`,
                        animationDelay: `${i * 0.05}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCancel}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : audioUrl ? (
          // Playback state
          <>
            <Button
              size="icon"
              variant="outline"
              onClick={togglePlayback}
              className="h-12 w-12 rounded-full"
            >
              <Play className="h-6 w-6" />
            </Button>
            <div className="flex-1">
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => {
                  // Reset play button state
                }}
              />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Voice message</span>
                <span className="text-sm text-gray-600">
                  {formatTime(recordingTime)}
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                <div className="h-full w-0 rounded-full bg-blue-500 transition-all" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCancel}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                onClick={handleSend}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}